"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserForAction, type AppContext } from "@/lib/auth";
import { dbError, fail, formToObject, ok, optionalText, optionalUuid, safeAction, zodFail, type ActionResult } from "@/lib/actions";
import { reverseGeocode } from "@/lib/geo/geocoder";
import { countRepeatVisits, matchJobSite } from "@/lib/geo/distance";
import { rateLimit } from "@/lib/rate-limit";
import { localInputToIso, sessionWorkedMinutes } from "@/lib/time/calc";
import type { Break } from "@/lib/types";

/* --------------------------------- shared --------------------------------- */

const locationSchema = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracy: z.number().min(0).max(100_000).nullable(),
    capturedAt: z.iso.datetime(),
  })
  .nullable();

type LocationInput = z.infer<typeof locationSchema>;

export interface LocationOutcome {
  address: string | null;
  source: "gps" | "manual" | "none";
  accuracy: number | null;
  capturedAt: string | null;
  geocoderConfigured: boolean;
  suggestedJobSite: { id: string; name: string; distance: number } | null;
  repeatVisits: number;
}

/** Use the client's press time if it's plausible (GPS can take a few seconds), else server time. */
function resolvePressTime(clientIso: string | undefined): string {
  const now = Date.now();
  if (clientIso) {
    const t = new Date(clientIso).getTime();
    if (Number.isFinite(t) && t <= now + 5_000 && now - t <= 120_000) return new Date(Math.min(t, now)).toISOString();
  }
  return new Date(now).toISOString();
}

async function resolveLocation(ctx: AppContext, loc: LocationInput, manualAddress: string | null): Promise<LocationOutcome> {
  const geocoderConfigured = Boolean(process.env.GEOCODER_PROVIDER && process.env.GEOCODER_PROVIDER !== "none");
  if (!loc) {
    return {
      address: manualAddress,
      source: manualAddress ? "manual" : "none",
      accuracy: null,
      capturedAt: manualAddress ? new Date().toISOString() : null,
      geocoderConfigured,
      suggestedJobSite: null,
      repeatVisits: 0,
    };
  }
  let address = manualAddress;
  if (!address && rateLimit(`geo:${ctx.userId}`, 30, 60_000)) {
    try {
      address = (await reverseGeocode(loc.latitude, loc.longitude))?.label ?? null;
    } catch {
      address = null; // Lookup failure never blocks clocking in.
    }
  }

  const [{ data: sites }, { data: past }] = await Promise.all([
    ctx.supabase
      .from("job_sites")
      .select("id, name, latitude, longitude, match_radius_m")
      .eq("archived", false)
      .not("latitude", "is", null),
    ctx.supabase
      .from("work_sessions")
      .select("start_latitude, start_longitude, job_site_id, start_address")
      .not("start_latitude", "is", null)
      .order("started_at", { ascending: false })
      .limit(300),
  ]);

  const match = matchJobSite(
    { latitude: loc.latitude, longitude: loc.longitude, accuracy: loc.accuracy },
    (sites ?? []) as { id: string; name: string; latitude: number; longitude: number; match_radius_m: number }[],
  );
  const repeat = countRepeatVisits(
    loc,
    (past ?? []).map((p) => ({
      latitude: p.start_latitude as number,
      longitude: p.start_longitude as number,
      job_site_id: p.job_site_id as string | null,
      address: p.start_address as string | null,
    })),
  );

  return {
    address,
    source: manualAddress ? "manual" : "gps",
    accuracy: loc.accuracy,
    capturedAt: loc.capturedAt,
    geocoderConfigured,
    suggestedJobSite: match ? { id: match.site.id, name: match.site.name, distance: Math.round(match.distance) } : null,
    repeatVisits: repeat.count,
  };
}

function revalidateTime() {
  revalidatePath("/dashboard");
  revalidatePath("/timesheets");
  revalidatePath("/job-sites");
}

/* --------------------------------- clock in -------------------------------- */

const clockInSchema = z.object({
  employerId: optionalUuid,
  jobSiteId: optionalUuid,
  location: locationSchema,
  manualAddress: optionalText(300),
  pressedAt: z.iso.datetime().optional(),
});

export type ClockInResult = { sessionId: string; startedAt: string; alreadyActive: boolean; location: LocationOutcome | null };

export async function clockIn(input: z.input<typeof clockInSchema>): Promise<ActionResult<ClockInResult>> {
  return safeAction<ClockInResult>("clockIn", async () => {
    const ctx = await requireUserForAction();
    const parsed = clockInSchema.safeParse(input);
    if (!parsed.success) return zodFail(parsed.error);
    const v = parsed.data;

    // Graceful double clock-in: return the session that's already running.
    const { data: existing } = await ctx.supabase.from("work_sessions").select("id, started_at").is("ended_at", null).maybeSingle();
    if (existing) {
      return ok({ sessionId: existing.id, startedAt: existing.started_at, alreadyActive: true, location: null }, "You're already clocked in.");
    }

    const loc = ctx.profile.location_enabled ? v.location : null;
    const outcome = await resolveLocation(ctx, loc, v.manualAddress);
    const jobSiteId = v.jobSiteId ?? outcome.suggestedJobSite?.id ?? null;

    let employerId = v.employerId;
    if (!employerId && jobSiteId) {
      const { data: site } = await ctx.supabase.from("job_sites").select("employer_id").eq("id", jobSiteId).maybeSingle();
      employerId = (site?.employer_id as string | null) ?? null;
    }
    if (!employerId) {
      const { data: primary } = await ctx.supabase.from("employers").select("id").eq("is_primary", true).eq("archived", false).limit(1).maybeSingle();
      employerId = primary?.id ?? null;
    }

    const startedAt = resolvePressTime(v.pressedAt);
    const { data, error } = await ctx.supabase
      .from("work_sessions")
      .insert({
        user_id: ctx.userId,
        started_at: startedAt,
        timezone: ctx.profile.timezone,
        source: "clock",
        employer_id: employerId,
        job_site_id: jobSiteId,
        start_latitude: loc?.latitude ?? null,
        start_longitude: loc?.longitude ?? null,
        start_accuracy_m: loc?.accuracy ?? null,
        start_address: outcome.address,
        start_location_source: outcome.source,
        start_location_captured_at: outcome.capturedAt,
      })
      .select("id, started_at")
      .single();

    if (error) {
      if (error.code === "23505") {
        // Lost a race with another device/tab: surface the active session instead of failing.
        const { data: active } = await ctx.supabase.from("work_sessions").select("id, started_at").is("ended_at", null).single();
        return ok({ sessionId: active!.id, startedAt: active!.started_at, alreadyActive: true, location: null }, "You're already clocked in.");
      }
      return fail(dbError(error, "Couldn't clock in. Please try again."));
    }
    revalidateTime();
    return ok({ sessionId: data.id, startedAt: data.started_at, alreadyActive: false, location: loc || v.manualAddress ? outcome : null });
  });
}

/* -------------------------------- clock out -------------------------------- */

const clockOutSchema = z.object({
  sessionId: z.uuid(),
  location: locationSchema,
  manualAddress: optionalText(300),
  pressedAt: z.iso.datetime().optional(),
  /** For forgotten clock-outs: the real finish time as a local datetime-local value. */
  finishLocal: z.string().optional(),
});

export type ClockOutResult = {
  sessionId: string;
  workedMinutes: number;
  hasDiaryEntry: boolean;
  location: LocationOutcome | null;
};

export async function clockOut(input: z.input<typeof clockOutSchema>): Promise<ActionResult<ClockOutResult>> {
  return safeAction<ClockOutResult>("clockOut", async () => {
    const ctx = await requireUserForAction();
    const parsed = clockOutSchema.safeParse(input);
    if (!parsed.success) return zodFail(parsed.error);
    const v = parsed.data;

    const { data: session } = await ctx.supabase
      .from("work_sessions")
      .select("id, started_at, ended_at, timezone, breaks(id, started_at, ended_at, kind)")
      .eq("id", v.sessionId)
      .maybeSingle();
    if (!session) return fail("That session couldn't be found.");
    if (session.ended_at) return fail("You've already clocked out of this session.");

    let endedAt = resolvePressTime(v.pressedAt);
    let needsReview = false;
    let reviewReason: string | null = null;
    if (v.finishLocal) {
      const iso = localInputToIso(v.finishLocal, session.timezone);
      if (!iso) return fail("Enter a valid finish time.", { finishLocal: "Enter a valid finish time" });
      if (new Date(iso).getTime() > Date.now() + 60_000) return fail("Finish time can't be in the future.", { finishLocal: "Can't be in the future" });
      endedAt = iso;
      needsReview = true;
      reviewReason = "Finish time entered manually after a late clock-out";
    }
    const startMs = new Date(session.started_at).getTime();
    const endMs = new Date(endedAt).getTime();
    if (endMs <= startMs) return fail("Finish time must be after your start time.", { finishLocal: "Must be after start" });
    if (endMs - startMs > 24 * 3600_000) {
      return fail("This session is over 24 hours long. Enter the time you actually finished.", { finishLocal: "Enter your real finish time" });
    }

    // Close any break that's still running at the finish time.
    const breaks = (session.breaks ?? []) as Break[];
    const openBreak = breaks.find((b) => !b.ended_at);
    if (openBreak) {
      const breakEnd = new Date(Math.max(new Date(openBreak.started_at).getTime() + 60_000, Math.min(endMs, Date.now()))).toISOString();
      await ctx.supabase.from("breaks").update({ ended_at: breakEnd }).eq("id", openBreak.id);
      openBreak.ended_at = breakEnd;
    }
    // Breaks that start after a manually-entered finish make no sense; trim them.
    for (const b of breaks) {
      if (new Date(b.started_at).getTime() >= endMs) await ctx.supabase.from("breaks").delete().eq("id", b.id);
    }

    const loc = ctx.profile.location_enabled && !v.finishLocal ? v.location : null;
    const outcome = loc || v.manualAddress ? await resolveLocation(ctx, loc, v.manualAddress) : null;

    const { error } = await ctx.supabase
      .from("work_sessions")
      .update({
        ended_at: endedAt,
        needs_review: needsReview,
        review_reason: reviewReason,
        end_latitude: loc?.latitude ?? null,
        end_longitude: loc?.longitude ?? null,
        end_accuracy_m: loc?.accuracy ?? null,
        end_address: outcome?.address ?? null,
        end_location_source: outcome?.source ?? "none",
        end_location_captured_at: outcome?.capturedAt ?? null,
        change_reason: v.finishLocal ? "Finish time set manually (forgot to clock out)" : null,
      })
      .eq("id", v.sessionId);
    if (error) return fail(dbError(error, "Couldn't clock out. Please try again."));

    const { count } = await ctx.supabase
      .from("work_diary_entries")
      .select("id", { count: "exact", head: true })
      .eq("session_id", v.sessionId);

    revalidateTime();
    return ok({
      sessionId: v.sessionId,
      workedMinutes: Math.round(sessionWorkedMinutes({ started_at: session.started_at, ended_at: endedAt }, breaks, endMs)),
      hasDiaryEntry: (count ?? 0) > 0,
      location: outcome,
    });
  });
}

/* ---------------------------------- breaks --------------------------------- */

export async function startBreak(sessionId: string, kind: "paid" | "unpaid" = "unpaid"): Promise<ActionResult<null>> {
  return safeAction("startBreak", async () => {
    const ctx = await requireUserForAction();
    if (!z.uuid().safeParse(sessionId).success) return fail("Invalid session.");
    const { data: s } = await ctx.supabase.from("work_sessions").select("id, ended_at").eq("id", sessionId).maybeSingle();
    if (!s || s.ended_at) return fail("You need to be clocked in to start a break.");
    const { error } = await ctx.supabase
      .from("breaks")
      .insert({ user_id: ctx.userId, session_id: sessionId, started_at: new Date().toISOString(), kind });
    if (error) return fail(error.code === "23505" ? "You're already on a break." : dbError(error));
    revalidateTime();
    return ok(null);
  });
}

export async function endBreak(sessionId: string): Promise<ActionResult<null>> {
  return safeAction("endBreak", async () => {
    const ctx = await requireUserForAction();
    const { data: b } = await ctx.supabase.from("breaks").select("id, started_at").eq("session_id", sessionId).is("ended_at", null).maybeSingle();
    if (!b) return fail("You're not on a break.");
    const end = new Date(Math.max(Date.now(), new Date(b.started_at).getTime() + 1000)).toISOString();
    const { error } = await ctx.supabase.from("breaks").update({ ended_at: end }).eq("id", b.id);
    if (error) return fail(dbError(error));
    revalidateTime();
    return ok(null);
  });
}

/* ------------------------------ location edits ----------------------------- */

const correctSchema = z.object({
  sessionId: z.uuid(),
  which: z.enum(["start", "end"]),
  address: z.string().trim().min(3, "Enter an address").max(300),
});

/** User correction of a detected address. Marks the address as manually entered. */
export async function correctSessionAddress(input: z.input<typeof correctSchema>): Promise<ActionResult<null>> {
  return safeAction("correctAddress", async () => {
    const ctx = await requireUserForAction();
    const parsed = correctSchema.safeParse(input);
    if (!parsed.success) return zodFail(parsed.error);
    const { sessionId, which, address } = parsed.data;
    const patch =
      which === "start"
        ? { start_address: address, start_location_source: "manual", change_reason: "Address corrected by user" }
        : { end_address: address, end_location_source: "manual", change_reason: "Address corrected by user" };
    const { error } = await ctx.supabase.from("work_sessions").update(patch).eq("id", sessionId);
    if (error) return fail(dbError(error));
    revalidateTime();
    return ok(null, "Address updated");
  });
}

/** Removes stored coordinates and addresses from a session (user privacy control). */
export async function clearSessionLocation(sessionId: string): Promise<ActionResult<null>> {
  return safeAction("clearLocation", async () => {
    const ctx = await requireUserForAction();
    if (!z.uuid().safeParse(sessionId).success) return fail("Invalid session.");
    const { error } = await ctx.supabase
      .from("work_sessions")
      .update({
        start_latitude: null,
        start_longitude: null,
        start_accuracy_m: null,
        start_address: null,
        start_location_source: "none",
        start_location_captured_at: null,
        end_latitude: null,
        end_longitude: null,
        end_accuracy_m: null,
        end_address: null,
        end_location_source: "none",
        end_location_captured_at: null,
        change_reason: "Location data removed by user",
      })
      .eq("id", sessionId);
    if (error) return fail(dbError(error));
    revalidateTime();
    return ok(null, "Location data removed");
  });
}

/** Explicit "update my location" while clocked in: replaces the clock-in reading. */
export async function refreshSessionLocation(input: { sessionId: string; location: LocationInput }): Promise<ActionResult<LocationOutcome>> {
  return safeAction("refreshLocation", async () => {
    const ctx = await requireUserForAction();
    if (!ctx.profile.location_enabled) return fail("Location is turned off in Settings.");
    const parsed = z.object({ sessionId: z.uuid(), location: locationSchema }).safeParse(input);
    if (!parsed.success || !parsed.data.location) return fail("Couldn't read your location.");
    const loc = parsed.data.location;
    const outcome = await resolveLocation(ctx, loc, null);
    const { error } = await ctx.supabase
      .from("work_sessions")
      .update({
        start_latitude: loc.latitude,
        start_longitude: loc.longitude,
        start_accuracy_m: loc.accuracy,
        start_address: outcome.address,
        start_location_source: "gps",
        start_location_captured_at: loc.capturedAt,
        change_reason: "Location updated by user",
      })
      .eq("id", parsed.data.sessionId);
    if (error) return fail(dbError(error));
    revalidateTime();
    return ok(outcome, "Location updated");
  });
}

export async function assignJobSite(sessionId: string, jobSiteId: string | null): Promise<ActionResult<null>> {
  return safeAction("assignJobSite", async () => {
    const ctx = await requireUserForAction();
    const parsed = z.object({ sessionId: z.uuid(), jobSiteId: z.uuid().nullable() }).safeParse({ sessionId, jobSiteId });
    if (!parsed.success) return fail("Invalid selection.");
    let employerPatch: { employer_id?: string } = {};
    if (jobSiteId) {
      const { data: site } = await ctx.supabase.from("job_sites").select("employer_id").eq("id", jobSiteId).maybeSingle();
      if (!site) return fail("That job site couldn't be found.");
      if (site.employer_id) employerPatch = { employer_id: site.employer_id };
    }
    const { error } = await ctx.supabase
      .from("work_sessions")
      .update({ job_site_id: jobSiteId, ...employerPatch })
      .eq("id", sessionId);
    if (error) return fail(dbError(error));
    revalidateTime();
    return ok(null, jobSiteId ? "Job site set" : "Job site cleared");
  });
}

/** Saves the session's clock-in location as a named job site and links it. */
export async function saveSessionAsJobSite(input: { sessionId: string; name: string }): Promise<ActionResult<{ jobSiteId: string }>> {
  return safeAction("saveAsJobSite", async () => {
    const ctx = await requireUserForAction();
    const parsed = z.object({ sessionId: z.uuid(), name: z.string().trim().min(1, "Name the job site").max(160) }).safeParse(input);
    if (!parsed.success) return zodFail(parsed.error);
    const limit = ctx.entitlements.plan.limits.jobSites;
    if (limit !== null) {
      const { count } = await ctx.supabase.from("job_sites").select("id", { count: "exact", head: true }).eq("archived", false);
      if ((count ?? 0) >= limit) return { ok: false, error: `The Free plan includes ${limit} saved job sites.`, upgrade: true };
    }
    const { data: s } = await ctx.supabase
      .from("work_sessions")
      .select("start_latitude, start_longitude, start_address, employer_id")
      .eq("id", parsed.data.sessionId)
      .maybeSingle();
    if (!s) return fail("Session not found.");
    const { data: site, error } = await ctx.supabase
      .from("job_sites")
      .insert({
        user_id: ctx.userId,
        name: parsed.data.name,
        address: s.start_address,
        latitude: s.start_latitude,
        longitude: s.start_longitude,
        employer_id: s.employer_id,
      })
      .select("id")
      .single();
    if (error) return fail(dbError(error));
    await ctx.supabase.from("work_sessions").update({ job_site_id: site.id }).eq("id", parsed.data.sessionId);
    revalidateTime();
    return ok({ jobSiteId: site.id }, "Job site saved");
  });
}

/* ------------------------------ manual entries ----------------------------- */

const manualSchema = z.object({
  start_local: z.string().min(1, "Enter a start time"),
  end_local: z.string().min(1, "Enter a finish time"),
  break_minutes: z.coerce.number().int().min(0, "Can't be negative").max(600, "That's a long break").default(0),
  employer_id: optionalUuid,
  job_site_id: optionalUuid,
  address: optionalText(300),
  notes: optionalText(4000),
  change_reason: optionalText(500),
});

function parseTimes(startLocal: string, endLocal: string, tz: string) {
  const start = localInputToIso(startLocal, tz);
  const end = localInputToIso(endLocal, tz);
  const fieldErrors: Record<string, string> = {};
  if (!start) fieldErrors.start_local = "Enter a valid start time";
  if (!end) fieldErrors.end_local = "Enter a valid finish time";
  if (start && end) {
    const d = new Date(end).getTime() - new Date(start).getTime();
    if (d <= 0) fieldErrors.end_local = "Finish must be after start";
    else if (d > 24 * 3600_000) fieldErrors.end_local = "A single session can't be longer than 24 hours";
    if (new Date(end).getTime() > Date.now() + 60_000) fieldErrors.end_local = "Finish time can't be in the future";
  }
  return { start, end, fieldErrors };
}

/** A single unpaid break of N minutes, placed in the middle of the session. */
function breakAtMidpoint(startIso: string, endIso: string, minutes: number) {
  const s = new Date(startIso).getTime();
  const e = new Date(endIso).getTime();
  const len = Math.min(minutes * 60_000, e - s - 60_000);
  if (len <= 0) return null;
  const mid = s + (e - s - len) / 2;
  return { started_at: new Date(mid).toISOString(), ended_at: new Date(mid + len).toISOString() };
}

async function overlapsExisting(ctx: AppContext, startIso: string, endIso: string, excludeId?: string) {
  let q = ctx.supabase.from("work_sessions").select("id").lt("started_at", endIso).or(`ended_at.gt.${startIso},ended_at.is.null`);
  if (excludeId) q = q.neq("id", excludeId);
  const { data } = await q.limit(1);
  return (data ?? []).length > 0;
}

export async function createManualSession(fd: FormData): Promise<ActionResult<{ id: string }>> {
  return safeAction("manualSession", async () => {
    const ctx = await requireUserForAction();
    const parsed = manualSchema.safeParse(formToObject(fd));
    if (!parsed.success) return zodFail(parsed.error);
    const v = parsed.data;
    const tz = ctx.profile.timezone;
    const { start, end, fieldErrors } = parseTimes(v.start_local, v.end_local, tz);
    if (Object.keys(fieldErrors).length) return fail("Please check the times.", fieldErrors);
    if (await overlapsExisting(ctx, start!, end!)) {
      return fail("This overlaps another session. Edit that session instead, or adjust these times.", { start_local: "Overlaps an existing session" });
    }

    const { data, error } = await ctx.supabase
      .from("work_sessions")
      .insert({
        user_id: ctx.userId,
        started_at: start,
        ended_at: end,
        timezone: tz,
        source: "manual",
        employer_id: v.employer_id,
        job_site_id: v.job_site_id,
        start_address: v.address,
        start_location_source: v.address ? "manual" : "none",
        start_location_captured_at: v.address ? new Date().toISOString() : null,
        notes: v.notes,
      })
      .select("id")
      .single();
    if (error) return fail(dbError(error));
    if (v.break_minutes > 0) {
      const b = breakAtMidpoint(start!, end!, v.break_minutes);
      if (b) await ctx.supabase.from("breaks").insert({ user_id: ctx.userId, session_id: data.id, kind: "unpaid", ...b });
    }
    revalidateTime();
    return ok({ id: data.id }, "Session added");
  });
}

const editSchema = manualSchema.extend({
  id: z.uuid(),
  approval_status: z.enum(["draft", "submitted", "approved", "rejected"]),
});

export async function updateSession(fd: FormData): Promise<ActionResult<null>> {
  return safeAction("updateSession", async () => {
    const ctx = await requireUserForAction();
    const parsed = editSchema.safeParse(formToObject(fd));
    if (!parsed.success) return zodFail(parsed.error);
    const v = parsed.data;
    const { data: existing } = await ctx.supabase.from("work_sessions").select("id, timezone, ended_at, start_address, start_location_source").eq("id", v.id).maybeSingle();
    if (!existing) return fail("Session not found.");
    if (!existing.ended_at) return fail("Clock out before editing this session's times.");
    const { start, end, fieldErrors } = parseTimes(v.start_local, v.end_local, existing.timezone);
    if (Object.keys(fieldErrors).length) return fail("Please check the times.", fieldErrors);
    if (await overlapsExisting(ctx, start!, end!, v.id)) {
      return fail("These times overlap another session.", { start_local: "Overlaps an existing session" });
    }

    const addressChanged = (v.address ?? null) !== (existing.start_address ?? null);
    const { error } = await ctx.supabase
      .from("work_sessions")
      .update({
        started_at: start,
        ended_at: end,
        employer_id: v.employer_id,
        job_site_id: v.job_site_id,
        notes: v.notes,
        approval_status: v.approval_status,
        needs_review: false,
        review_reason: null,
        change_reason: v.change_reason,
        ...(addressChanged
          ? { start_address: v.address, start_location_source: v.address ? "manual" : existing.start_location_source }
          : {}),
      })
      .eq("id", v.id);
    if (error) return fail(dbError(error));

    // Breaks: re-sync the single "quick" unpaid break if the user changed the total.
    const { data: brks } = await ctx.supabase.from("breaks").select("id, started_at, ended_at, kind").eq("session_id", v.id);
    const unpaid = (brks ?? []).filter((b) => b.kind === "unpaid" && b.ended_at);
    const currentMins = Math.round(unpaid.reduce((s, b) => s + (new Date(b.ended_at!).getTime() - new Date(b.started_at).getTime()) / 60_000, 0));
    if (currentMins !== v.break_minutes) {
      if (unpaid.length) await ctx.supabase.from("breaks").delete().in("id", unpaid.map((b) => b.id));
      const b = v.break_minutes > 0 ? breakAtMidpoint(start!, end!, v.break_minutes) : null;
      if (b) await ctx.supabase.from("breaks").insert({ user_id: ctx.userId, session_id: v.id, kind: "unpaid", ...b });
    } else {
      // Keep existing breaks but drop any that fall outside the new times.
      for (const b of unpaid) {
        if (b.started_at < start! || b.ended_at! > end!) await ctx.supabase.from("breaks").delete().eq("id", b.id);
      }
    }
    revalidateTime();
    return ok(null, "Session updated");
  });
}

export async function deleteSession(id: string): Promise<ActionResult<null>> {
  return safeAction("deleteSession", async () => {
    const ctx = await requireUserForAction();
    if (!z.uuid().safeParse(id).success) return fail("Invalid session.");
    const { error } = await ctx.supabase.from("work_sessions").delete().eq("id", id);
    if (error) return fail(dbError(error));
    revalidateTime();
    return ok(null, "Session deleted");
  });
}

/** Marks every completed draft session in [fromIso, toIso) as submitted. */
export async function submitSessions(sessionIds: string[]): Promise<ActionResult<{ count: number }>> {
  return safeAction("submitSessions", async () => {
    const ctx = await requireUserForAction();
    const ids = z.array(z.uuid()).max(500).safeParse(sessionIds);
    if (!ids.success || ids.data.length === 0) return fail("Nothing to submit.");
    const { data, error } = await ctx.supabase
      .from("work_sessions")
      .update({ approval_status: "submitted", change_reason: "Submitted for approval" })
      .in("id", ids.data)
      .eq("approval_status", "draft")
      .not("ended_at", "is", null)
      .select("id");
    if (error) return fail(dbError(error));
    revalidateTime();
    return ok({ count: data.length }, `${data.length} session${data.length === 1 ? "" : "s"} marked as submitted`);
  });
}
