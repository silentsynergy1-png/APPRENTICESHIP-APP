import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { requireAppContext } from "@/lib/auth";
import { computeWeekStats } from "@/lib/data/recap";
import { getAnthropic } from "@/lib/ai/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Badge, Stat } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/markdown";
import { addDaysToKey, formatMinutes, todayKey, weekStartKey } from "@/lib/time/calc";
import { formatCurrency } from "@/lib/utils";
import { GenerateRecapButton } from "./generate-button";

export const metadata: Metadata = { title: "Weekly recap" };

const label = (k: string, opts: Intl.DateTimeFormatOptions) => new Date(`${k}T12:00:00Z`).toLocaleDateString("en-AU", { ...opts, timeZone: "UTC" });

export default async function RecapPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const ctx = await requireAppContext();
  const sp = await searchParams;
  const today = todayKey(ctx.profile.timezone);
  const current = weekStartKey(today, ctx.rules.week_starts_on);
  // Default to last week (a complete week), unless one is requested.
  const weekStart = sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? weekStartKey(sp.week, ctx.rules.week_starts_on) : addDaysToKey(current, -7);
  const [stats, { data: recap }] = await Promise.all([
    computeWeekStats(ctx, weekStart),
    ctx.supabase.from("weekly_recaps").select("*").eq("week_start", weekStart).maybeSingle(),
  ]);
  const aiAllowed = ctx.entitlements.has("weekly_recap");
  const aiConfigured = Boolean(getAnthropic());

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/dashboard" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Overview
      </Link>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[13px] font-medium uppercase tracking-wider text-primary">Your weekly apprenticeship recap</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {label(weekStart, { day: "numeric", month: "short" })} – {label(addDaysToKey(weekStart, 6), { day: "numeric", month: "short", year: "numeric" })}
          </h1>
        </div>
        <div className="flex items-center gap-1">
          <Button asChild variant="ghost" size="icon" aria-label="Previous week">
            <Link href={`/recap?week=${addDaysToKey(weekStart, -7)}`}>
              <ChevronLeft />
            </Link>
          </Button>
          {weekStart < current ? (
            <Button asChild variant="ghost" size="icon" aria-label="Next week">
              <Link href={`/recap?week=${addDaysToKey(weekStart, 7)}`}>
                <ChevronRight />
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Hours worked" value={formatMinutes(stats.totalMinutes)} hint={stats.overtimeMinutes ? `${formatMinutes(stats.overtimeMinutes)} overtime` : `${stats.daysWorked} days`} />
        <Stat label="Job sites" value={stats.jobSites.length} hint={stats.jobSites.slice(0, 2).join(", ") || undefined} />
        <Stat label="Diary entries" value={stats.diaryEntries} />
        <Stat label="Skills practised" value={stats.skills.length} />
        {stats.expensesTotal !== null ? <Stat label="Expenses" value={formatCurrency(stats.expensesTotal)} /> : null}
        <Stat label="Practice logged" value={stats.practiceLogs} />
        <Stat label="Competencies completed" value={stats.competenciesCompleted} />
        <Stat label="Coming up" value={stats.upcoming.length} hint="Next 2 weeks" />
      </div>

      {stats.missingDiaryDays.length ? (
        <Alert tone="warning" icon={<AlertTriangle />} className="mt-5" title="Missing diary entries">
          You worked on {stats.missingDiaryDays.map((d) => label(d, { weekday: "short", day: "numeric", month: "short" })).join(", ")} without writing a diary entry.{" "}
          <Link href={`/diary/new?date=${stats.missingDiaryDays[0]}`} className="font-medium text-primary underline">
            Add one now
          </Link>
        </Alert>
      ) : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" /> Summary
            </CardTitle>
            {recap && aiAllowed ? <GenerateRecapButton weekStart={weekStart} regenerate /> : null}
          </CardHeader>
          <CardContent>
            {recap?.summary ? (
              <>
                <Markdown>{recap.summary}</Markdown>
                <p className="mt-4 text-[11.5px] text-muted-foreground">Written by AI from your own diary entries and records. Check it reflects your week.</p>
              </>
            ) : !aiAllowed ? (
              <div className="text-[14px] text-muted-foreground">
                AI-written recaps are part of Pro. Your numbers above are always free.{" "}
                <Link href="/settings/plan" className="font-medium text-primary underline">
                  See Pro
                </Link>
              </div>
            ) : !aiConfigured ? (
              <p className="text-[14px] text-muted-foreground">AI isn&apos;t set up on this server yet (ANTHROPIC_API_KEY missing).</p>
            ) : (
              <div className="grid gap-3">
                <p className="text-[14px] text-muted-foreground">Get a short summary of what you worked on and learned, written only from your diary entries.</p>
                <div>
                  <GenerateRecapButton weekStart={weekStart} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        <div className="grid content-start gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Skills practised</CardTitle>
            </CardHeader>
            <CardContent>
              {stats.skills.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {stats.skills.map((s) => (
                    <span key={s} className="rounded-lg bg-muted px-2.5 py-1 text-[13px]">
                      {s}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-muted-foreground">No skills recorded in diary entries this week.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Coming up</CardTitle>
            </CardHeader>
            <CardContent>
              {stats.upcoming.length ? (
                <ul className="space-y-2 text-[13.5px]">
                  {stats.upcoming.map((u, i) => (
                    <li key={i} className="flex items-center justify-between gap-3">
                      <span className="truncate">{u.title}</span>
                      <Badge tone="neutral">{label(u.due, { day: "numeric", month: "short" })}</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-muted-foreground">Nothing due in the next two weeks.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
