import "server-only";
import type { AppContext } from "@/lib/auth";
import type { Break, SessionWithBreaks } from "@/lib/types";
import { localMidnightMs, summariseSessions, totals, type DayBreakdown } from "@/lib/time/calc";

const SESSION_SELECT = "*, breaks(id, session_id, started_at, ended_at, kind)";

function normalise(rows: unknown[] | null): SessionWithBreaks[] {
  return ((rows ?? []) as SessionWithBreaks[]).map((s) => ({
    ...s,
    breaks: ((s.breaks ?? []) as Break[]).sort((a, b) => a.started_at.localeCompare(b.started_at)),
  }));
}

export async function getActiveSession(ctx: AppContext): Promise<SessionWithBreaks | null> {
  const { data } = await ctx.supabase.from("work_sessions").select(SESSION_SELECT).is("ended_at", null).maybeSingle();
  return data ? normalise([data])[0]! : null;
}

/**
 * Sessions overlapping [fromKey, toKeyExclusive) local dates in the user's timezone.
 * Fetches with a one-day margin either side so overnight shifts are included, then the
 * calculator splits minutes onto the correct local days.
 */
export async function getSessionsInRange(ctx: AppContext, fromKey: string, toKeyExclusive: string) {
  const tz = ctx.profile.timezone;
  const from = new Date(localMidnightMs(fromKey, tz) - 86_400_000).toISOString();
  const to = new Date(localMidnightMs(toKeyExclusive, tz)).toISOString();
  const { data, error } = await ctx.supabase
    .from("work_sessions")
    .select(SESSION_SELECT)
    .gte("started_at", from)
    .lt("started_at", to)
    .order("started_at", { ascending: true })
    .limit(2000);
  if (error) throw new Error("Couldn't load sessions");
  return normalise(data);
}

export async function getHolidaySet(ctx: AppContext, fromKey: string, toKeyExclusive: string): Promise<Set<string>> {
  const { data } = await ctx.supabase
    .from("public_holidays")
    .select("holiday_date")
    .gte("holiday_date", fromKey)
    .lt("holiday_date", toKeyExclusive);
  return new Set((data ?? []).map((h) => h.holiday_date as string));
}

/** Categorised day breakdowns limited to the requested local-date window. */
export async function getRangeSummary(ctx: AppContext, fromKey: string, toKeyExclusive: string, now = Date.now()) {
  const [sessions, holidays] = await Promise.all([
    getSessionsInRange(ctx, fromKey, toKeyExclusive),
    getHolidaySet(ctx, fromKey, toKeyExclusive),
  ]);
  // Weekly overtime needs whole weeks; callers pass week-aligned ranges for that view.
  const all = summariseSessions(sessions, ctx.rules, holidays, now, ctx.profile.timezone);
  const days: DayBreakdown[] = all.filter((d) => d.date >= fromKey && d.date < toKeyExclusive);
  return { sessions, days, totals: totals(days), holidays };
}
