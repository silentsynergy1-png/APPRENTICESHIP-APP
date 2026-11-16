"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserForAction } from "@/lib/auth";
import { dbError, fail, formToObject, ok, optionalDate, optionalText, optionalUuid, safeAction, zodFail, type ActionResult } from "@/lib/actions";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const STATUSES = ["not_started", "learning", "practised", "completed", "awaiting_signoff"] as const;

function revalidate() {
  revalidatePath("/progress");
  revalidatePath("/dashboard");
}

/* ------------------------------ apprenticeship ----------------------------- */
const apprenticeshipSchema = z
  .object({
    trade: z.enum(["electrical", "plumbing", "carpentry", "automotive", "refrigeration", "other"]),
    qualification: optionalText(200),
    qualification_code: optionalText(40),
    training_provider: optionalText(200),
    employer_id: optionalUuid,
    start_date: date,
    expected_completion_date: date,
    notes: optionalText(4000),
  })
  .refine((v) => v.expected_completion_date > v.start_date, { path: ["expected_completion_date"], message: "Must be after the start date" });

export async function saveApprenticeship(fd: FormData): Promise<ActionResult<null>> {
  return safeAction("saveApprenticeship", async () => {
    const ctx = await requireUserForAction();
    const parsed = apprenticeshipSchema.safeParse(formToObject(fd));
    if (!parsed.success) return zodFail(parsed.error);
    const { data: current } = await ctx.supabase.from("apprenticeships").select("id").eq("is_current", true).maybeSingle();
    const res = current
      ? await ctx.supabase.from("apprenticeships").update(parsed.data).eq("id", current.id)
      : await ctx.supabase.from("apprenticeships").insert({ ...parsed.data, user_id: ctx.userId, is_current: true });
    if (res.error) return fail(dbError(res.error));
    revalidate();
    return ok(null, "Apprenticeship details saved");
  });
}

/* -------------------------------- categories ------------------------------- */
export async function saveCategory(input: { id?: string; name: string }): Promise<ActionResult<null>> {
  return safeAction("saveCategory", async () => {
    const ctx = await requireUserForAction();
    const parsed = z.object({ id: z.uuid().optional(), name: z.string().trim().min(1, "Name the category").max(120) }).safeParse(input);
    if (!parsed.success) return zodFail(parsed.error);
    const { id, name } = parsed.data;
    const res = id
      ? await ctx.supabase.from("competency_categories").update({ name }).eq("id", id)
      : await ctx.supabase.from("competency_categories").insert({ name, user_id: ctx.userId, sort_order: 999 });
    if (res.error) return fail(res.error.code === "23505" ? "You already have a category with that name." : dbError(res.error));
    revalidate();
    return ok(null, id ? "Category renamed" : "Category added");
  });
}

/** Deleting a category keeps its competencies (they become uncategorised). */
export async function deleteCategory(id: string): Promise<ActionResult<null>> {
  return safeAction("deleteCategory", async () => {
    const ctx = await requireUserForAction();
    if (!z.uuid().safeParse(id).success) return fail("Invalid category.");
    const { error } = await ctx.supabase.from("competency_categories").delete().eq("id", id);
    if (error) return fail(dbError(error));
    revalidate();
    return ok(null, "Category removed");
  });
}

/* ------------------------------- competencies ------------------------------ */
const competencySchema = z.object({
  id: z.uuid().optional(),
  title: z.string().trim().min(1, "Give it a name").max(250),
  code: optionalText(40),
  description: optionalText(4000),
  category_id: optionalUuid,
  is_tafe_unit: z.enum(["on", "off"]).default("off").transform((v) => v === "on"),
  status: z.enum(STATUSES).default("not_started"),
  target_date: optionalDate,
});

export async function saveCompetency(fd: FormData): Promise<ActionResult<null>> {
  return safeAction("saveCompetency", async () => {
    const ctx = await requireUserForAction();
    const parsed = competencySchema.safeParse(formToObject(fd));
    if (!parsed.success) return zodFail(parsed.error);
    const { id, ...v } = parsed.data;
    const completed_on = v.status === "completed" ? new Date().toISOString().slice(0, 10) : null;
    if (id) {
      const { data: prev } = await ctx.supabase.from("competencies").select("status, completed_on").eq("id", id).maybeSingle();
      const patch = { ...v, completed_on: v.status === "completed" ? (prev?.completed_on ?? completed_on) : null };
      const { error } = await ctx.supabase.from("competencies").update(patch).eq("id", id);
      if (error) return fail(dbError(error));
    } else {
      const { data: app } = await ctx.supabase.from("apprenticeships").select("id").eq("is_current", true).maybeSingle();
      const { error } = await ctx.supabase
        .from("competencies")
        .insert({ ...v, completed_on, user_id: ctx.userId, apprenticeship_id: app?.id ?? null });
      if (error) return fail(dbError(error));
    }
    revalidate();
    return ok(null, id ? "Competency updated" : "Competency added");
  });
}

export async function setCompetencyStatus(id: string, status: (typeof STATUSES)[number]): Promise<ActionResult<null>> {
  return safeAction("competencyStatus", async () => {
    const ctx = await requireUserForAction();
    const parsed = z.object({ id: z.uuid(), status: z.enum(STATUSES) }).safeParse({ id, status });
    if (!parsed.success) return fail("Invalid status.");
    const { error } = await ctx.supabase
      .from("competencies")
      .update({ status, completed_on: status === "completed" ? new Date().toISOString().slice(0, 10) : null })
      .eq("id", id);
    if (error) return fail(dbError(error));
    revalidate();
    return ok(null);
  });
}

export async function deleteCompetency(id: string): Promise<ActionResult<null>> {
  return safeAction("deleteCompetency", async () => {
    const ctx = await requireUserForAction();
    if (!z.uuid().safeParse(id).success) return fail("Invalid competency.");
    const { error } = await ctx.supabase.from("competencies").delete().eq("id", id);
    if (error) return fail(dbError(error));
    revalidate();
    return ok(null, "Competency deleted");
  });
}

/* ------------------------- practice logs & sign-offs ------------------------ */
const recordSchema = z
  .object({
    competency_id: z.uuid(),
    record_type: z.enum(["practice", "signoff", "note"]),
    occurred_on: date,
    supervisor_name: optionalText(120),
    supervisor_licence: optionalText(60),
    notes: optionalText(4000),
    diary_entry_id: optionalUuid,
  })
  .refine((v) => v.record_type !== "signoff" || v.supervisor_name, { path: ["supervisor_name"], message: "Who signed it off?" });

export async function addCompetencyRecord(fd: FormData): Promise<ActionResult<null>> {
  return safeAction("addRecord", async () => {
    const ctx = await requireUserForAction();
    const parsed = recordSchema.safeParse(formToObject(fd));
    if (!parsed.success) return zodFail(parsed.error);
    const v = parsed.data;
    const { error } = await ctx.supabase.from("competency_records").insert({ ...v, user_id: ctx.userId });
    if (error) return fail(dbError(error));

    // Move the status forward sensibly, but never to "completed" automatically.
    const { data: comp } = await ctx.supabase.from("competencies").select("status").eq("id", v.competency_id).maybeSingle();
    if (comp) {
      if (v.record_type === "practice" && (comp.status === "not_started" || comp.status === "learning")) {
        await ctx.supabase.from("competencies").update({ status: "practised" }).eq("id", v.competency_id);
      }
    }
    revalidate();
    if (v.diary_entry_id) revalidatePath(`/diary/${v.diary_entry_id}`);
    return ok(null, v.record_type === "signoff" ? "Sign-off recorded" : "Practice logged");
  });
}

export async function deleteCompetencyRecord(id: string): Promise<ActionResult<null>> {
  return safeAction("deleteRecord", async () => {
    const ctx = await requireUserForAction();
    if (!z.uuid().safeParse(id).success) return fail("Invalid record.");
    const { error } = await ctx.supabase.from("competency_records").delete().eq("id", id);
    if (error) return fail(dbError(error));
    revalidate();
    return ok(null, "Record removed");
  });
}

/**
 * Logs a diary entry as practice towards competencies the user confirmed.
 * Status moves to "practised" at most; completion is always the apprentice's explicit choice.
 */
export async function logDiaryPractice(input: { diaryEntryId: string; competencyIds: string[]; occurredOn: string }): Promise<ActionResult<{ count: number }>> {
  return safeAction<{ count: number }>("logDiaryPractice", async () => {
    const ctx = await requireUserForAction();
    const parsed = z
      .object({ diaryEntryId: z.uuid(), competencyIds: z.array(z.uuid()).min(1).max(20), occurredOn: date })
      .safeParse(input);
    if (!parsed.success) return fail("Choose at least one competency.");
    const v = parsed.data;
    const rows = v.competencyIds.map((competency_id) => ({
      user_id: ctx.userId,
      competency_id,
      record_type: "practice",
      occurred_on: v.occurredOn,
      diary_entry_id: v.diaryEntryId,
      notes: "Logged from work diary",
    }));
    const { error } = await ctx.supabase.from("competency_records").insert(rows);
    if (error) return fail(dbError(error));
    await ctx.supabase.from("competencies").update({ status: "practised" }).in("id", v.competencyIds).in("status", ["not_started", "learning"]);
    revalidate();
    revalidatePath(`/diary/${v.diaryEntryId}`);
    return ok({ count: rows.length }, `Practice logged for ${rows.length} competenc${rows.length === 1 ? "y" : "ies"}`);
  });
}

/* ----------------------------- TAFE assessments ----------------------------- */
const assessmentSchema = z.object({
  id: z.uuid().optional(),
  title: z.string().trim().min(1, "Name the assessment").max(250),
  due_date: date,
  due_time: z
    .string()
    .optional()
    .transform((v) => v || "17:00")
    .refine((v) => /^\d{2}:\d{2}$/.test(v), "Use a valid time"),
  competency_id: optionalUuid,
  status: z.enum(["upcoming", "submitted", "passed", "resubmit", "cancelled"]).default("upcoming"),
  notes: optionalText(4000),
});

export async function saveAssessment(fd: FormData): Promise<ActionResult<null>> {
  return safeAction("saveAssessment", async () => {
    const ctx = await requireUserForAction();
    const parsed = assessmentSchema.safeParse(formToObject(fd));
    if (!parsed.success) return zodFail(parsed.error);
    const { id, due_date, due_time, ...v } = parsed.data;
    const { localInputToIso } = await import("@/lib/time/calc");
    const due_at = localInputToIso(`${due_date}T${due_time}`, ctx.profile.timezone);
    if (!due_at) return fail("Enter a valid due date.", { due_date: "Invalid date" });
    const row = { ...v, due_at };
    const res = id
      ? await ctx.supabase.from("tafe_assessments").update(row).eq("id", id)
      : await ctx.supabase.from("tafe_assessments").insert({ ...row, user_id: ctx.userId });
    if (res.error) return fail(dbError(res.error));
    revalidate();
    return ok(null, id ? "Assessment updated" : "Assessment added");
  });
}

export async function setAssessmentStatus(id: string, status: "upcoming" | "submitted" | "passed" | "resubmit" | "cancelled"): Promise<ActionResult<null>> {
  return safeAction("assessmentStatus", async () => {
    const ctx = await requireUserForAction();
    const parsed = z.object({ id: z.uuid(), status: z.enum(["upcoming", "submitted", "passed", "resubmit", "cancelled"]) }).safeParse({ id, status });
    if (!parsed.success) return fail("Invalid status.");
    const { error } = await ctx.supabase.from("tafe_assessments").update({ status }).eq("id", id);
    if (error) return fail(dbError(error));
    revalidate();
    return ok(null);
  });
}

export async function deleteAssessment(id: string): Promise<ActionResult<null>> {
  return safeAction("deleteAssessment", async () => {
    const ctx = await requireUserForAction();
    if (!z.uuid().safeParse(id).success) return fail("Invalid assessment.");
    const { error } = await ctx.supabase.from("tafe_assessments").delete().eq("id", id);
    if (error) return fail(dbError(error));
    revalidate();
    return ok(null, "Assessment deleted");
  });
}

/* -------------------------- goals and milestones --------------------------- */
const goalSchema = z.object({
  id: z.uuid().optional(),
  title: z.string().trim().min(1, "Describe the goal").max(250),
  notes: optionalText(4000),
  target_date: optionalDate,
});

export async function saveGoal(fd: FormData): Promise<ActionResult<null>> {
  return safeAction("saveGoal", async () => {
    const ctx = await requireUserForAction();
    const parsed = goalSchema.safeParse(formToObject(fd));
    if (!parsed.success) return zodFail(parsed.error);
    const { id, ...v } = parsed.data;
    const res = id
      ? await ctx.supabase.from("learning_goals").update(v).eq("id", id)
      : await ctx.supabase.from("learning_goals").insert({ ...v, user_id: ctx.userId });
    if (res.error) return fail(dbError(res.error));
    revalidate();
    return ok(null, id ? "Goal updated" : "Goal added");
  });
}

export async function setGoalStatus(id: string, status: "active" | "achieved" | "dropped"): Promise<ActionResult<null>> {
  return safeAction("goalStatus", async () => {
    const ctx = await requireUserForAction();
    const parsed = z.object({ id: z.uuid(), status: z.enum(["active", "achieved", "dropped"]) }).safeParse({ id, status });
    if (!parsed.success) return fail("Invalid status.");
    const { error } = await ctx.supabase
      .from("learning_goals")
      .update({ status, achieved_on: status === "achieved" ? new Date().toISOString().slice(0, 10) : null })
      .eq("id", id);
    if (error) return fail(dbError(error));
    revalidate();
    return ok(null, status === "achieved" ? "Goal achieved. Nice work!" : undefined);
  });
}

const milestoneSchema = z.object({
  id: z.uuid().optional(),
  title: z.string().trim().min(1, "Name the milestone").max(200),
  description: optionalText(2000),
  target_date: optionalDate,
  achieved_on: optionalDate,
});

export async function saveMilestone(fd: FormData): Promise<ActionResult<null>> {
  return safeAction("saveMilestone", async () => {
    const ctx = await requireUserForAction();
    const parsed = milestoneSchema.safeParse(formToObject(fd));
    if (!parsed.success) return zodFail(parsed.error);
    const { id, ...v } = parsed.data;
    const res = id
      ? await ctx.supabase.from("milestones").update(v).eq("id", id)
      : await ctx.supabase.from("milestones").insert({ ...v, user_id: ctx.userId });
    if (res.error) return fail(dbError(res.error));
    revalidate();
    return ok(null, id ? "Milestone updated" : "Milestone added");
  });
}

export async function toggleMilestone(id: string, achieved: boolean): Promise<ActionResult<null>> {
  return safeAction("toggleMilestone", async () => {
    const ctx = await requireUserForAction();
    if (!z.uuid().safeParse(id).success) return fail("Invalid milestone.");
    const { error } = await ctx.supabase
      .from("milestones")
      .update({ achieved_on: achieved ? new Date().toISOString().slice(0, 10) : null })
      .eq("id", id);
    if (error) return fail(dbError(error));
    revalidate();
    return ok(null, achieved ? "Milestone reached 🎉" : undefined);
  });
}

export async function deleteGoalOrMilestone(kind: "goal" | "milestone", id: string): Promise<ActionResult<null>> {
  return safeAction("deleteGoalMilestone", async () => {
    const ctx = await requireUserForAction();
    if (!z.uuid().safeParse(id).success) return fail("Invalid item.");
    const { error } = await ctx.supabase.from(kind === "goal" ? "learning_goals" : "milestones").delete().eq("id", id);
    if (error) return fail(dbError(error));
    revalidate();
    return ok(null, "Removed");
  });
}
