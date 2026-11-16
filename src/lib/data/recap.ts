import "server-only";
import type { AppContext } from "@/lib/auth";
import { getRangeSummary } from "@/lib/data/sessions";
import { addDaysToKey, localDateKey, localMidnightMs } from "@/lib/time/calc";

export interface WeekStats {
  weekStart: string;
  weekEnd: string; // exclusive
  totalMinutes: number;
  overtimeMinutes: number;
  daysWorked: number;
  sessions: number;
  jobSites: string[];
  diaryEntries: number;
  missingDiaryDays: string[];
  skills: string[];
  expensesTotal: number | null; // null when the plan has no expenses
  practiceLogs: number;
  competenciesCompleted: number;
  upcoming: { title: string; due: string; kind: string }[];
}

/** Deterministic weekly numbers, computed from the user's own records only. */
export async function computeWeekStats(ctx: AppContext, weekStart: string): Promise<WeekStats> {
  const weekEnd = addDaysToKey(weekStart, 7);
  const tz = ctx.profile.timezone;
  const fromIso = new Date(localMidnightMs(weekStart, tz)).toISOString();
  const toIso = new Date(localMidnightMs(weekEnd, tz)).toISOString();

  const [summary, diary, sites, expenses, practice, completed, assessments, reminders] = await Promise.all([
    getRangeSummary(ctx, weekStart, weekEnd),
    ctx.supabase.from("work_diary_entries").select("entry_date, skills").gte("entry_date", weekStart).lt("entry_date", weekEnd),
    ctx.supabase.from("job_sites").select("id, name"),
    ctx.entitlements.has("expenses") ? ctx.supabase.from("expenses").select("amount").gte("spent_on", weekStart).lt("spent_on", weekEnd) : Promise.resolve({ data: null }),
    ctx.supabase.from("competency_records").select("id", { count: "exact", head: true }).eq("record_type", "practice").gte("occurred_on", weekStart).lt("occurred_on", weekEnd),
    ctx.supabase.from("competencies").select("id", { count: "exact", head: true }).eq("status", "completed").gte("completed_on", weekStart).lt("completed_on", weekEnd),
    ctx.supabase.from("tafe_assessments").select("title, due_at").eq("status", "upcoming").gte("due_at", toIso).lt("due_at", new Date(new Date(toIso).getTime() + 14 * 86_400_000).toISOString()),
    ctx.supabase.from("reminders").select("title, due_at").is("completed_at", null).gte("due_at", toIso).lt("due_at", new Date(new Date(toIso).getTime() + 14 * 86_400_000).toISOString()),
  ]);

  const inWeek = summary.sessions.filter((s) => s.started_at >= fromIso && s.started_at < toIso);
  const workedDays = new Set(summary.days.filter((d) => d.totalMinutes >= 30).map((d) => d.date));
  const diaryDays = new Set((diary.data ?? []).map((d) => d.entry_date as string));
  const siteNames = [...new Set(inWeek.map((s) => sites.data?.find((x) => x.id === s.job_site_id)?.name ?? s.start_address).filter(Boolean) as string[])];
  const skills = [...new Set((diary.data ?? []).flatMap((d) => (d.skills as string[]) ?? []))];

  return {
    weekStart,
    weekEnd,
    totalMinutes: summary.totals.totalMinutes,
    overtimeMinutes: summary.totals.overtimeMinutes,
    daysWorked: workedDays.size,
    sessions: inWeek.length,
    jobSites: siteNames,
    diaryEntries: (diary.data ?? []).length,
    missingDiaryDays: [...workedDays].filter((d) => !diaryDays.has(d)).sort(),
    skills,
    expensesTotal: expenses.data ? (expenses.data as { amount: number }[]).reduce((s, e) => s + Number(e.amount), 0) : null,
    practiceLogs: practice.count ?? 0,
    competenciesCompleted: completed.count ?? 0,
    upcoming: [
      ...(assessments.data ?? []).map((a) => ({ title: a.title as string, due: localDateKey(new Date(a.due_at).getTime(), tz), kind: "Assessment" })),
      ...(reminders.data ?? []).map((r) => ({ title: r.title as string, due: localDateKey(new Date(r.due_at).getTime(), tz), kind: "Reminder" })),
    ].sort((a, b) => a.due.localeCompare(b.due)),
  };
}
