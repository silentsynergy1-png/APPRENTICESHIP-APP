import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  Bell,
  BookOpenText,
  CalendarClock,
  Clock3,
  GraduationCap,
  MapPinned,
  Plus,
  Receipt,
  Wrench,
} from "lucide-react";
import { requireAppContext } from "@/lib/auth";
import { getActiveSession, getRangeSummary } from "@/lib/data/sessions";
import { ClockPanel } from "@/components/clock/clock-panel";
import { ChartLegend, HoursChart } from "@/components/charts/hours-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, EmptyState, ProgressRing } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { addDaysToKey, formatLocal, localMidnightMs, formatMinutes, todayKey, weekStartKey } from "@/lib/time/calc";
import { apprenticeshipTimeline, ordinal } from "@/lib/apprenticeship";
import { cn, firstName, formatCurrency } from "@/lib/utils";
import type { DashboardCard, DiaryEntry, Employer, Expense, JobSite, NotificationRow } from "@/lib/types";
import { CustomiseDashboard } from "./customise";

export const metadata: Metadata = { title: "Overview" };

function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const ctx = await requireAppContext();
  const { supabase, profile, rules, entitlements } = ctx;
  const tz = profile.timezone;
  const now = Date.now();
  const today = todayKey(tz, now);
  const weekStart = weekStartKey(today, rules.week_starts_on);
  const weekEnd = addDaysToKey(weekStart, 7);
  const monthStart = today.slice(0, 8) + "01";
  const [y, m] = monthStart.split("-").map(Number);
  const nextMonthStart = new Date(Date.UTC(y!, m!, 1)).toISOString().slice(0, 10);

  // Derive alerts from deadlines before reading them (idempotent).
  await supabase.rpc("refresh_notifications");

  const [
    session,
    week,
    month,
    employersRes,
    sitesRes,
    apprenticeshipRes,
    competenciesRes,
    diaryRes,
    statsRes,
    assessmentsRes,
    remindersRes,
    expensesRes,
    notificationsRes,
  ] = await Promise.all([
    getActiveSession(ctx),
    getRangeSummary(ctx, weekStart, weekEnd, now),
    getRangeSummary(ctx, monthStart < weekStart ? monthStart : weekStart, nextMonthStart > weekEnd ? nextMonthStart : weekEnd, now),
    supabase.from("employers").select("id, name, is_primary").eq("archived", false).order("is_primary", { ascending: false }),
    supabase.from("job_sites").select("id, name, address, employer_id").eq("archived", false),
    supabase.from("apprenticeships").select("*").eq("is_current", true).maybeSingle(),
    supabase.from("competencies").select("status"),
    supabase.from("work_diary_entries").select("id, entry_date, title, description, raw_notes, status, job_site_id").order("entry_date", { ascending: false }).order("created_at", { ascending: false }).limit(4),
    supabase.rpc("job_site_stats"),
    supabase.from("tafe_assessments").select("id, title, due_at, status").eq("status", "upcoming").gte("due_at", new Date(now - 86_400_000).toISOString()).order("due_at").limit(5),
    supabase.from("reminders").select("id, title, due_at").is("completed_at", null).order("due_at").limit(5),
    entitlements.has("expenses")
      ? supabase.from("expenses").select("id, spent_on, merchant, amount, category, description").order("spent_on", { ascending: false }).limit(4)
      : Promise.resolve({ data: [] as Expense[] }),
    supabase.from("notifications").select("*").is("dismissed_at", null).is("read_at", null).order("created_at", { ascending: false }).limit(4),
  ]);

  const monthDays = month.days.filter((d) => d.date >= monthStart && d.date < nextMonthStart);
  const monthMinutes = monthDays.reduce((s, d) => s + d.totalMinutes, 0);
  const monthOvertime = monthDays.reduce((s, d) => s + d.overtimeMinutes, 0);

  const weekChart = Array.from({ length: 7 }, (_, i) => {
    const key = addDaysToKey(weekStart, i);
    const d = week.days.find((x) => x.date === key);
    return {
      label: formatLocal(`${key}T12:00:00Z`, "UTC", "EEE"),
      ordinary: +(d?.ordinaryMinutes ?? 0) / 60,
      overtime: +(d?.overtimeMinutes ?? 0) / 60,
      weekend: +(d?.weekendMinutes ?? 0) / 60,
      holiday: +(d?.holidayMinutes ?? 0) / 60,
    };
  });
  const todayMinutes = week.days.find((d) => d.date === today)?.totalMinutes ?? 0;

  const app = apprenticeshipRes.data;
  const timeline = app ? apprenticeshipTimeline(app.start_date, app.expected_completion_date, today) : null;
  const comps = (competenciesRes.data ?? []) as { status: string }[];
  const compsDone = comps.filter((c) => c.status === "completed").length;
  const compPercent = comps.length ? (compsDone / comps.length) * 100 : null;

  const sites = (sitesRes.data ?? []) as Pick<JobSite, "id" | "name" | "address" | "employer_id">[];
  const stats = (statsRes.data ?? []) as { job_site_id: string; session_count: number; worked_minutes: number; last_worked_at: string }[];
  const recentSites = stats
    .sort((a, b) => b.last_worked_at.localeCompare(a.last_worked_at))
    .slice(0, 4)
    .map((s) => ({ ...s, site: sites.find((x) => x.id === s.job_site_id) }))
    .filter((s) => s.site);

  const deadlines = [
    ...(assessmentsRes.data ?? []).map((a) => ({ id: a.id, title: a.title as string, due: a.due_at as string, kind: "Assessment", href: "/progress" })),
    ...(remindersRes.data ?? []).map((r) => ({ id: r.id, title: r.title as string, due: r.due_at as string, kind: "Reminder", href: "/notifications" })),
  ]
    .sort((a, b) => a.due.localeCompare(b.due))
    .slice(0, 5);

  const cards = (profile.dashboard_cards?.length ? profile.dashboard_cards : ["clock", "hours", "progress", "diary", "sites", "deadlines", "expenses", "reminders"]) as DashboardCard[];
  const hourNow = Number(formatLocal(now, tz, "H"));
  const name = firstName(profile.full_name);

  const sections: Record<DashboardCard, React.ReactNode> = {
    clock: (
      <div key="clock" className="lg:col-span-2">
        <ClockPanel
          session={session}
          employers={(employersRes.data ?? []) as Pick<Employer, "id" | "name" | "is_primary">[]}
          jobSites={sites}
          locationEnabled={profile.location_enabled}
          timezone={tz}
          forgottenHours={rules.forgotten_clock_out_hours}
        />
      </div>
    ),
    hours: (
      <Card key="hours" className="lg:col-span-2">
        <CardHeader>
          <div>
            <CardTitle>Hours</CardTitle>
            <p className="text-[12.5px] text-muted-foreground">
              Week of {formatLocal(`${weekStart}T12:00:00Z`, "UTC", "d MMM")}
            </p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/timesheets">
              Timesheets <ArrowRight />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Today" value={formatMinutes(todayMinutes)} />
            <Metric label="This week" value={formatMinutes(week.totals.totalMinutes)} hint={week.totals.overtimeMinutes ? `${formatMinutes(week.totals.overtimeMinutes)} overtime` : `of ${rules.weekly_ordinary_hours}h ordinary`} />
            <Metric label="This month" value={formatMinutes(monthMinutes)} hint={monthOvertime ? `${formatMinutes(monthOvertime)} overtime` : undefined} />
            <Metric label="Sessions this week" value={String(week.sessions.filter((s) => new Date(s.started_at).getTime() >= localMidnightMs(weekStart, tz)).length)} />
          </div>
          <div className="mt-5">
            <HoursChart data={weekChart} height={180} />
            <div className="mt-2">
              <ChartLegend data={weekChart} />
            </div>
          </div>
        </CardContent>
      </Card>
    ),
    progress: (
      <Card key="progress">
        <CardHeader>
          <CardTitle>Apprenticeship</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link href="/progress">
              View <ArrowRight />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {app && timeline ? (
            <div className="flex items-center gap-5">
              <ProgressRing
                value={compPercent ?? timeline.timePercent}
                size={112}
                sublabel={compPercent !== null ? "skills done" : "time elapsed"}
              />
              <div className="min-w-0 space-y-1.5 text-[13px]">
                <div className="text-lg font-semibold tracking-tight">
                  {timeline.started ? `${ordinal(timeline.year)} year` : "Starting soon"}
                </div>
                <div className="text-muted-foreground">
                  {timeline.finished ? "Expected completion reached" : `${timeline.daysRemaining} days to expected completion`}
                </div>
                {comps.length ? (
                  <div className="text-muted-foreground">
                    {compsDone} of {comps.length} competencies completed
                  </div>
                ) : (
                  <Link href="/progress" className="text-primary hover:underline">
                    Add your competencies
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <EmptyState icon={<GraduationCap />} title="No apprenticeship details" description="Add your start and expected completion dates." action={<Button asChild size="sm"><Link href="/progress">Set up</Link></Button>} className="py-8" />
          )}
        </CardContent>
      </Card>
    ),
    deadlines: (
      <Card key="deadlines">
        <CardHeader>
          <CardTitle>Upcoming</CardTitle>
          <CalendarClock className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {deadlines.length ? (
            <ul className="space-y-3">
              {deadlines.map((d) => {
                const days = Math.ceil((new Date(d.due).getTime() - now) / 86_400_000);
                return (
                  <li key={d.id}>
                    <Link href={d.href} className="flex items-center gap-3 rounded-lg hover:opacity-80">
                      <div className="grid w-11 shrink-0 place-items-center rounded-lg bg-subtle py-1.5 text-center">
                        <div className="text-[10px] uppercase text-muted-foreground">{formatLocal(d.due, tz, "MMM")}</div>
                        <div className="text-[15px] font-semibold leading-tight">{formatLocal(d.due, tz, "d")}</div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-medium">{d.title}</div>
                        <div className="text-[12px] text-muted-foreground">{d.kind}</div>
                      </div>
                      <Badge tone={days <= 2 ? "danger" : days <= 7 ? "warning" : "neutral"}>
                        {days <= 0 ? "Today" : days === 1 ? "Tomorrow" : `${days} days`}
                      </Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-6 text-center text-[13px] text-muted-foreground">No upcoming deadlines. Add TAFE assessments in Apprenticeship.</p>
          )}
        </CardContent>
      </Card>
    ),
    diary: (
      <Card key="diary">
        <CardHeader>
          <CardTitle>Recent diary</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link href="/diary/new">
              <Plus /> New
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {(diaryRes.data ?? []).length ? (
            <ul className="divide-y divide-border">
              {(diaryRes.data as Pick<DiaryEntry, "id" | "entry_date" | "title" | "description" | "raw_notes" | "status">[]).map((e) => (
                <li key={e.id}>
                  <Link href={`/diary/${e.id}`} className="block py-2.5 first:pt-0 hover:opacity-80">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[14px] font-medium">{e.title || "Untitled entry"}</span>
                      <span className="shrink-0 text-[12px] text-muted-foreground">{formatLocal(`${e.entry_date}T12:00:00Z`, "UTC", "EEE d MMM")}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-[13px] text-muted-foreground">{e.description || e.raw_notes || "No description yet"}</p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<BookOpenText />} title="No entries yet" description="Write a quick note about today's work." className="py-8" action={<Button asChild size="sm"><Link href="/diary/new">Add entry</Link></Button>} />
          )}
        </CardContent>
      </Card>
    ),
    sites: (
      <Card key="sites">
        <CardHeader>
          <CardTitle>Recent job sites</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link href="/job-sites">
              All <ArrowRight />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {recentSites.length ? (
            <ul className="space-y-3">
              {recentSites.map((s) => (
                <li key={s.job_site_id}>
                  <Link href={`/job-sites/${s.job_site_id}`} className="flex items-center gap-3 hover:opacity-80">
                    <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                      <MapPinned className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-medium">{s.site!.name}</div>
                      <div className="truncate text-[12px] text-muted-foreground">
                        {s.session_count} sessions · {formatMinutes(Number(s.worked_minutes))}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-[13px] text-muted-foreground">Job sites you work at will show up here.</p>
          )}
        </CardContent>
      </Card>
    ),
    expenses: entitlements.has("expenses") ? (
      <Card key="expenses">
        <CardHeader>
          <CardTitle>Recent expenses</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link href="/expenses">
              All <ArrowRight />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {(expensesRes.data ?? []).length ? (
            <ul className="divide-y divide-border">
              {(expensesRes.data as Pick<Expense, "id" | "spent_on" | "merchant" | "amount" | "category" | "description">[]).map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-medium">{x.merchant || x.description || "Expense"}</div>
                    <div className="text-[12px] capitalize text-muted-foreground">
                      {x.category === "ppe" ? "PPE" : x.category} · {formatLocal(`${x.spent_on}T12:00:00Z`, "UTC", "d MMM")}
                    </div>
                  </div>
                  <span className="tabular text-[14px] font-medium">{formatCurrency(x.amount)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<Receipt />} title="No expenses yet" className="py-8" action={<Button asChild size="sm"><Link href="/expenses?new=1">Add expense</Link></Button>} />
          )}
        </CardContent>
      </Card>
    ) : null,
    reminders: (
      <Card key="reminders">
        <CardHeader>
          <CardTitle>Alerts</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link href="/notifications">
              All <ArrowRight />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {(notificationsRes.data ?? []).length ? (
            <ul className="space-y-3">
              {(notificationsRes.data as NotificationRow[]).map((n) => (
                <li key={n.id}>
                  <Link href={n.link_path ?? "/notifications"} className="flex gap-3 hover:opacity-80">
                    <Bell className={cn("mt-0.5 size-4 shrink-0", n.kind === "forgotten_clock_out" ? "text-warning" : "text-primary")} />
                    <div className="min-w-0">
                      <div className="text-[14px] font-medium">{n.title}</div>
                      {n.body ? <div className="line-clamp-2 text-[12.5px] text-muted-foreground">{n.body}</div> : null}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-[13px] text-muted-foreground">You&apos;re all caught up.</p>
          )}
        </CardContent>
      </Card>
    ),
  };

  const quickActions = (
    <div key="quick-actions" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:px-0 lg:col-span-2">
      <QuickAction href="/diary/new" icon={<BookOpenText />} label="Diary entry" />
      <QuickAction href="/timesheets" icon={<Clock3 />} label="Timesheets" />
      <QuickAction href={entitlements.has("expenses") ? "/expenses?new=1" : "/settings/plan"} icon={<Receipt />} label="Add expense" />
      <QuickAction href="/tools?new=1" icon={<Wrench />} label="Add tool" />
      <QuickAction href="/progress" icon={<GraduationCap />} label="Progress" />
    </div>
  );

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <div className="text-[13px] text-muted-foreground">{formatLocal(now, tz, "EEEE d MMMM")}</div>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight sm:text-[28px]">
            {greeting(hourNow)}
            {name ? `, ${name}` : ""}
          </h1>
          {timeline?.started ? (
            <p className="mt-1 text-[14px] text-muted-foreground">
              {ordinal(timeline.year)}-year {app!.trade === "other" ? "" : app!.trade} apprentice
            </p>
          ) : null}
        </div>
        <CustomiseDashboard cards={cards} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {cards.flatMap((c, i) => {
          const node = sections[c] ?? null;
          // Quick actions sit directly under the first card (normally the clock), so the
          // clock-in control is the first thing on a phone screen.
          return i === 0 ? [node, quickActions] : [node];
        })}
      </div>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-subtle p-3">
      <div className="text-[12px] text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tracking-tight tabular">{value}</div>
      {hint ? <div className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function QuickAction({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex shrink-0 items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 text-[13px] font-medium shadow-soft transition-colors hover:bg-muted active:scale-[0.98] [&_svg]:size-4 [&_svg]:text-primary"
    >
      {icon}
      {label}
    </Link>
  );
}
