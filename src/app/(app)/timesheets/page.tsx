import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle, ChevronLeft, ChevronRight, Clock3, Download, FileText, MapPin, Settings2 } from "lucide-react";
import { requireAppContext } from "@/lib/auth";
import { getRangeSummary } from "@/lib/data/sessions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { ChartLegend, HoursChart } from "@/components/charts/hours-chart";
import {
  addDaysToKey,
  breakMinutes,
  formatLocal,
  formatMinutes,
  localDateKey,
  sessionWorkedMinutes,
  todayKey,
  weekStartKey,
  weekdayOfKey,
} from "@/lib/time/calc";
import type { ApprovalStatus, SessionWithBreaks } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AddSessionButton } from "./session-form";
import { SubmitWeekButton } from "./buttons";

export const metadata: Metadata = { title: "Timesheets" };

type View = "week" | "month" | "trends";
const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

const keyLabel = (key: string, pattern: string) => formatLocal(`${key}T12:00:00Z`, "UTC", pattern);

const STATUS_TONE: Record<ApprovalStatus, "neutral" | "primary" | "success" | "danger"> = {
  draft: "neutral",
  submitted: "primary",
  approved: "success",
  rejected: "danger",
};

export default async function TimesheetsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireAppContext();
  const sp = await searchParams;
  const tz = ctx.profile.timezone;
  const today = todayKey(tz);
  const view: View = sp.view === "month" || sp.view === "trends" ? sp.view : "week";

  const [{ data: employers }, { data: sites }] = await Promise.all([
    ctx.supabase.from("employers").select("id, name, is_primary").eq("archived", false).order("name"),
    ctx.supabase.from("job_sites").select("id, name").eq("archived", false).order("name"),
  ]);
  const employerList = (employers ?? []) as { id: string; name: string; is_primary: boolean }[];
  const siteList = (sites ?? []) as { id: string; name: string }[];
  const nameOf = (list: { id: string; name: string }[], id: string | null) => (id ? list.find((x) => x.id === id)?.name : undefined);
  const primaryEmployerId = employerList.find((e) => e.is_primary)?.id ?? null;

  const tabs = (
    <div className="inline-flex rounded-xl bg-muted p-1 text-[13px] font-medium">
      {(["week", "month", "trends"] as const).map((v) => (
        <Link
          key={v}
          href={`/timesheets?view=${v}`}
          className={cn("rounded-lg px-3 py-1.5 capitalize text-muted-foreground", view === v && "bg-card text-foreground shadow-soft")}
        >
          {v}
        </Link>
      ))}
    </div>
  );

  const header = (
    <PageHeader
      title="Timesheets"
      description="Your hours, breaks and job sites. Calculated with your own work rules."
      actions={
        <>
          <AddSessionButton employers={employerList} jobSites={siteList} defaultDate={today} primaryEmployerId={primaryEmployerId} />
          <Button asChild variant="ghost" size="icon" aria-label="Work rules">
            <Link href="/settings/work">
              <Settings2 />
            </Link>
          </Button>
        </>
      }
    />
  );

  /* --------------------------------- WEEK --------------------------------- */
  if (view === "week") {
    const anchor = sp.week && KEY_RE.test(sp.week) ? sp.week : today;
    const weekStart = weekStartKey(anchor, ctx.rules.week_starts_on);
    const weekEnd = addDaysToKey(weekStart, 7);
    const { sessions, days, totals } = await getRangeSummary(ctx, weekStart, weekEnd);
    const byDay = new Map<string, SessionWithBreaks[]>();
    for (const s of sessions) {
      const k = localDateKey(new Date(s.started_at).getTime(), tz);
      if (k < weekStart || k >= weekEnd) continue;
      byDay.set(k, [...(byDay.get(k) ?? []), s]);
    }
    const draftIds = sessions.filter((s) => s.ended_at && s.approval_status === "draft").map((s) => s.id);
    const chart = Array.from({ length: 7 }, (_, i) => {
      const key = addDaysToKey(weekStart, i);
      const d = days.find((x) => x.date === key);
      return {
        label: keyLabel(key, "EEE"),
        ordinary: (d?.ordinaryMinutes ?? 0) / 60,
        overtime: (d?.overtimeMinutes ?? 0) / 60,
        weekend: (d?.weekendMinutes ?? 0) / 60,
        holiday: (d?.holidayMinutes ?? 0) / 60,
      };
    });
    const exportQs = `from=${weekStart}&to=${weekEnd}`;

    return (
      <div>
        {header}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {tabs}
          <div className="flex items-center gap-1">
            <Button asChild variant="ghost" size="icon" aria-label="Previous week">
              <Link href={`/timesheets?view=week&week=${addDaysToKey(weekStart, -7)}`}>
                <ChevronLeft />
              </Link>
            </Button>
            <Link href="/timesheets" className="min-w-40 text-center text-[14px] font-medium">
              {keyLabel(weekStart, "d MMM")} – {keyLabel(addDaysToKey(weekStart, 6), "d MMM yyyy")}
            </Link>
            <Button asChild variant="ghost" size="icon" aria-label="Next week">
              <Link href={`/timesheets?view=week&week=${addDaysToKey(weekStart, 7)}`}>
                <ChevronRight />
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-5">
          <Total label="Total" value={totals.totalMinutes} strong />
          <Total label="Ordinary" value={totals.ordinaryMinutes} />
          <Total label="Overtime" value={totals.overtimeMinutes} />
          <Total label="Weekend" value={totals.weekendMinutes} />
          <Total label="Public holiday" value={totals.holidayMinutes} />
        </div>

        <Card className="mt-5">
          <CardContent>
            <HoursChart data={chart} height={190} />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <ChartLegend data={chart} />
              <div className="flex flex-wrap gap-2">
                <SubmitWeekButton ids={draftIds} />
                <Button asChild variant="outline">
                  <a href={`/api/export/timesheets?${exportQs}&format=csv`}>
                    <Download /> CSV
                  </a>
                </Button>
                {ctx.entitlements.has("pdf_reports") ? (
                  <Button asChild variant="outline">
                    <a href={`/api/export/timesheets?${exportQs}&format=pdf`}>
                      <FileText /> PDF
                    </a>
                  </Button>
                ) : (
                  <Button asChild variant="ghost">
                    <Link href="/settings/plan">
                      <FileText /> PDF <Badge tone="primary">Pro</Badge>
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-5 space-y-3">
          {Array.from({ length: 7 }, (_, i) => {
            const key = addDaysToKey(weekStart, i);
            const list = byDay.get(key) ?? [];
            const day = days.find((d) => d.date === key);
            const isToday = key === today;
            return (
              <Card key={key} className={cn(isToday && "ring-1 ring-primary/30")}>
                <div className="flex items-center justify-between px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className={cn("grid size-10 place-items-center rounded-xl text-center", isToday ? "bg-primary text-primary-foreground" : "bg-subtle")}>
                      <div className="text-[15px] font-semibold leading-none">{keyLabel(key, "d")}</div>
                    </div>
                    <div>
                      <div className="text-[14px] font-medium">{keyLabel(key, "EEEE")}</div>
                      <div className="text-[12px] text-muted-foreground">
                        {list.length ? `${list.length} session${list.length === 1 ? "" : "s"}` : weekdayOfKey(key) % 6 === 0 ? "Weekend" : "No sessions"}
                        {day?.overtimeMinutes ? ` · ${formatMinutes(day.overtimeMinutes)} OT` : ""}
                        {day?.holidayMinutes ? " · Public holiday" : ""}
                      </div>
                    </div>
                  </div>
                  <div className="text-right text-[15px] font-semibold tabular">{day ? formatMinutes(day.totalMinutes) : "—"}</div>
                </div>
                {list.length ? (
                  <ul className="divide-y divide-border border-t border-border">
                    {list.map((s) => (
                      <SessionRow
                        key={s.id}
                        s={s}
                        tz={tz}
                        site={nameOf(siteList, s.job_site_id)}
                        employer={nameOf(employerList, s.employer_id)}
                      />
                    ))}
                  </ul>
                ) : null}
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  /* --------------------------------- MONTH -------------------------------- */
  if (view === "month") {
    const monthKey = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : today.slice(0, 7);
    const monthStart = `${monthKey}-01`;
    const [yy, mm] = monthKey.split("-").map(Number);
    const nextMonth = new Date(Date.UTC(yy!, mm!, 1)).toISOString().slice(0, 10);
    const prevMonth = new Date(Date.UTC(yy!, mm! - 2, 1)).toISOString().slice(0, 7);
    const gridStart = weekStartKey(monthStart, ctx.rules.week_starts_on);
    const gridEnd = addDaysToKey(weekStartKey(addDaysToKey(nextMonth, -1), ctx.rules.week_starts_on), 7);
    const { sessions, days } = await getRangeSummary(ctx, gridStart, gridEnd);
    const monthDays = days.filter((d) => d.date >= monthStart && d.date < nextMonth);
    const monthTotal = monthDays.reduce((s, d) => s + d.totalMinutes, 0);
    const monthOT = monthDays.reduce((s, d) => s + d.overtimeMinutes, 0);
    const selected = sp.day && KEY_RE.test(sp.day) ? sp.day : null;
    const selectedSessions = selected
      ? sessions.filter((s) => localDateKey(new Date(s.started_at).getTime(), tz) === selected)
      : [];
    const cells: string[] = [];
    for (let k = gridStart; k < gridEnd; k = addDaysToKey(k, 1)) cells.push(k);
    const weekdayHeads = Array.from({ length: 7 }, (_, i) => keyLabel(addDaysToKey(gridStart, i), "EEEEE"));

    return (
      <div>
        {header}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {tabs}
          <div className="flex items-center gap-1">
            <Button asChild variant="ghost" size="icon" aria-label="Previous month">
              <Link href={`/timesheets?view=month&month=${prevMonth}`}>
                <ChevronLeft />
              </Link>
            </Button>
            <span className="min-w-36 text-center text-[14px] font-medium">{keyLabel(monthStart, "MMMM yyyy")}</span>
            <Button asChild variant="ghost" size="icon" aria-label="Next month">
              <Link href={`/timesheets?view=month&month=${nextMonth.slice(0, 7)}`}>
                <ChevronRight />
              </Link>
            </Button>
          </div>
        </div>
        <div className="mb-4 flex gap-6 text-[13px] text-muted-foreground">
          <span>
            Month total <strong className="ml-1 text-foreground tabular">{formatMinutes(monthTotal)}</strong>
          </span>
          <span>
            Overtime <strong className="ml-1 text-foreground tabular">{formatMinutes(monthOT)}</strong>
          </span>
          <span>
            Days worked <strong className="ml-1 text-foreground tabular">{monthDays.filter((d) => d.totalMinutes > 0).length}</strong>
          </span>
        </div>
        <Card>
          <CardContent className="p-2 sm:p-4">
            <div className="grid grid-cols-7 gap-1 pb-2 text-center text-[11px] font-medium text-muted-foreground">
              {weekdayHeads.map((d, i) => (
                <div key={i}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((k) => {
                const d = days.find((x) => x.date === k);
                const inMonth = k >= monthStart && k < nextMonth;
                const mins = d?.totalMinutes ?? 0;
                const intensity = Math.min(1, mins / (ctx.rules.daily_ordinary_hours * 60 * 1.3));
                return (
                  <Link
                    key={k}
                    href={`/timesheets?view=month&month=${monthKey}&day=${k}`}
                    scroll={false}
                    className={cn(
                      "relative flex aspect-square flex-col justify-between rounded-lg border border-transparent p-1.5 text-left transition-colors hover:border-border sm:aspect-[1.25] sm:p-2",
                      !inMonth && "opacity-35",
                      selected === k && "border-primary ring-1 ring-primary/40",
                    )}
                    style={mins > 0 ? { background: `color-mix(in oklch, var(--primary) ${Math.round(8 + intensity * 22)}%, transparent)` } : undefined}
                  >
                    <span className={cn("text-[12px] font-medium", k === today && "grid size-5 place-items-center rounded-full bg-primary text-[11px] text-primary-foreground")}>
                      {Number(k.slice(8))}
                    </span>
                    {mins > 0 ? (
                      <span className="text-[10.5px] font-semibold tabular sm:text-[12px]">
                        {formatMinutes(mins, { compact: true })}
                        {d?.overtimeMinutes ? <span className="ml-0.5 text-warning">•</span> : null}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {selected ? (
          <Card className="mt-5">
            <CardHeader className="pb-3">
              <CardTitle>{keyLabel(selected, "EEEE d MMMM")}</CardTitle>
              <span className="text-[14px] font-semibold tabular">{formatMinutes(days.find((d) => d.date === selected)?.totalMinutes ?? 0)}</span>
            </CardHeader>
            {selectedSessions.length ? (
              <ul className="divide-y divide-border border-t border-border">
                {selectedSessions.map((s) => (
                  <SessionRow key={s.id} s={s} tz={tz} site={nameOf(siteList, s.job_site_id)} employer={nameOf(employerList, s.employer_id)} />
                ))}
              </ul>
            ) : (
              <CardContent>
                <p className="text-[13px] text-muted-foreground">No sessions recorded on this day.</p>
              </CardContent>
            )}
          </Card>
        ) : (
          <p className="mt-4 text-center text-[13px] text-muted-foreground">Tap a day to see its sessions.</p>
        )}
      </div>
    );
  }

  /* -------------------------------- TRENDS -------------------------------- */
  const thisWeek = weekStartKey(today, ctx.rules.week_starts_on);
  const from = addDaysToKey(thisWeek, -7 * 11);
  const to = addDaysToKey(thisWeek, 7);
  const { days, totals } = await getRangeSummary(ctx, from, to);
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const ws = addDaysToKey(from, i * 7);
    const we = addDaysToKey(ws, 7);
    const inWeek = days.filter((d) => d.date >= ws && d.date < we);
    return {
      label: keyLabel(ws, "d MMM"),
      ordinary: inWeek.reduce((s, d) => s + d.ordinaryMinutes, 0) / 60,
      overtime: inWeek.reduce((s, d) => s + d.overtimeMinutes, 0) / 60,
      weekend: inWeek.reduce((s, d) => s + d.weekendMinutes, 0) / 60,
      holiday: inWeek.reduce((s, d) => s + d.holidayMinutes, 0) / 60,
    };
  });
  const worked = weeks.filter((w) => w.ordinary + w.overtime + w.weekend + w.holiday > 0);
  const avg = worked.length ? (totals.totalMinutes / worked.length) : 0;

  return (
    <div>
      {header}
      <div className="mb-5">{tabs}</div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Total label="Last 12 weeks" value={totals.totalMinutes} strong />
        <Total label="Average per worked week" value={avg} />
        <Total label="Overtime" value={totals.overtimeMinutes} />
        <Total label="Weekend + holiday" value={totals.weekendMinutes + totals.holidayMinutes} />
      </div>
      <Card className="mt-5">
        <CardHeader>
          <CardTitle>Weekly hours</CardTitle>
        </CardHeader>
        <CardContent>
          {worked.length ? (
            <>
              <HoursChart data={weeks} height={260} />
              <div className="mt-2">
                <ChartLegend data={weeks} />
              </div>
            </>
          ) : (
            <EmptyState icon={<Clock3 />} title="No hours yet" description="Clock in or add a session, and your trends will build up here." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Total({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card p-4 shadow-card", strong && "bg-primary-soft/40")}>
      <div className="text-[12px] text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tracking-tight tabular">{formatMinutes(value)}</div>
    </div>
  );
}

function SessionRow({ s, tz, site, employer }: { s: SessionWithBreaks; tz: string; site?: string; employer?: string }) {
  const worked = sessionWorkedMinutes(s, s.breaks);
  const brk = breakMinutes(s, s.breaks, Date.now(), "unpaid");
  const overnight = s.ended_at && localDateKey(new Date(s.ended_at).getTime(), tz) !== localDateKey(new Date(s.started_at).getTime(), tz);
  return (
    <li>
      <Link href={`/timesheets/${s.id}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-subtle">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] font-medium tabular">
            {formatLocal(s.started_at, tz, "h:mm a")} – {s.ended_at ? formatLocal(s.ended_at, tz, "h:mm a") : "now"}
            {overnight ? <span className="text-[11.5px] font-normal text-muted-foreground">(next day)</span> : null}
            {!s.ended_at ? <Badge tone="success">Active</Badge> : <Badge tone={STATUS_TONE[s.approval_status]} className="capitalize">{s.approval_status}</Badge>}
            {s.needs_review ? (
              <Badge tone="warning">
                <AlertTriangle /> Check
              </Badge>
            ) : null}
            {s.source === "manual" ? <Badge tone="outline">Manual</Badge> : null}
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[12.5px] text-muted-foreground">
            {site || s.start_address ? <MapPin className="size-3 shrink-0" /> : null}
            <span className="truncate">
              {[site ?? s.start_address, employer, brk >= 1 ? `${formatMinutes(brk)} break` : null].filter(Boolean).join(" · ") || "No site recorded"}
            </span>
          </div>
        </div>
        <div className="text-[14px] font-semibold tabular">{formatMinutes(worked)}</div>
        <ChevronRight className="size-4 text-muted-foreground" />
      </Link>
    </li>
  );
}
