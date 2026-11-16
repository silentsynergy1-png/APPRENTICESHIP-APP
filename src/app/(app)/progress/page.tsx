import type { Metadata } from "next";
import { CalendarClock, GraduationCap, Info, ShieldCheck, Target } from "lucide-react";
import { requireAppContext } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, PageHeader, ProgressRing } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlay";
import { apprenticeshipTimeline, ordinal } from "@/lib/apprenticeship";
import { COMPETENCY_STATUSES, TRADES } from "@/lib/constants";
import { todayKey } from "@/lib/time/calc";
import type { Apprenticeship, Competency, CompetencyCategory, CompetencyRecord, LearningGoal, Milestone, TafeAssessment } from "@/lib/types";
import { ApprenticeshipDialog, AssessmentList, CompetencyBoard, GoalsPanel, MilestoneTimeline, type TimelinePoint } from "./components";

export const metadata: Metadata = { title: "Apprenticeship progress" };

function addYears(date: string, n: number) {
  const [y, m, d] = date.split("-").map(Number);
  return `${String(y! + n).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export default async function ProgressPage() {
  const ctx = await requireAppContext();
  const today = todayKey(ctx.profile.timezone);
  const [appRes, compRes, catRes, recRes, asRes, goalRes, msRes, empRes] = await Promise.all([
    ctx.supabase.from("apprenticeships").select("*").eq("is_current", true).maybeSingle(),
    ctx.supabase.from("competencies").select("*").order("code", { nullsFirst: false }).order("title"),
    ctx.supabase.from("competency_categories").select("*").order("sort_order").order("name"),
    ctx.supabase.from("competency_records").select("*").order("occurred_on", { ascending: false }).limit(2000),
    ctx.supabase.from("tafe_assessments").select("*").order("due_at"),
    ctx.supabase.from("learning_goals").select("*").order("target_date", { nullsFirst: false }),
    ctx.supabase.from("milestones").select("*").order("target_date", { nullsFirst: false }),
    ctx.supabase.from("employers").select("id, name").eq("archived", false).order("name"),
  ]);
  const app = appRes.data as Apprenticeship | null;
  const comps = (compRes.data ?? []) as Competency[];
  const records = (recRes.data ?? []) as CompetencyRecord[];
  const assessments = (asRes.data ?? []) as TafeAssessment[];
  const goals = (goalRes.data ?? []) as LearningGoal[];
  const milestones = (msRes.data ?? []) as Milestone[];
  const timeline = app ? apprenticeshipTimeline(app.start_date, app.expected_completion_date, today) : null;

  const done = comps.filter((c) => c.status === "completed").length;
  const compPct = comps.length ? (done / comps.length) * 100 : 0;
  const tafe = comps.filter((c) => c.is_tafe_unit);
  const tafeDone = tafe.filter((c) => c.status === "completed").length;
  const outstandingAssessments = assessments.filter((a) => a.status === "upcoming" || a.status === "resubmit");
  const signoffs = records.filter((r) => r.record_type === "signoff").length;
  const statusCounts = COMPETENCY_STATUSES.map((s) => ({ ...s, count: comps.filter((c) => c.status === s.value).length }));

  const points: TimelinePoint[] = [];
  if (app && timeline) {
    points.push({ key: "start", title: "Apprenticeship started", date: app.start_date, done: timeline.started, auto: true });
    for (let y = 1; y < timeline.totalYears; y++) {
      const d = addYears(app.start_date, y);
      points.push({ key: `y${y}`, title: `Start of ${ordinal(y + 1)} year`, date: d, done: d <= today, auto: true });
    }
    points.push({ key: "end", title: "Expected completion", date: app.expected_completion_date, done: timeline.finished, auto: true });
  }
  for (const m of milestones) points.push({ key: m.id, title: m.title, date: m.achieved_on ?? m.target_date, done: Boolean(m.achieved_on), auto: false, milestone: m });
  points.sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));

  return (
    <div>
      <PageHeader
        title="Apprenticeship"
        description={app ? [TRADES.find((t) => t.value === app.trade)?.label, app.qualification, app.training_provider].filter(Boolean).join(" · ") : "Track your progress through your apprenticeship."}
        actions={<ApprenticeshipDialog app={app} employers={(empRes.data ?? []) as { id: string; name: string }[]} />}
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
            <div className="flex gap-6">
              <ProgressRing value={compPct} size={136} stroke={11} sublabel="competencies" />
              <ProgressRing value={timeline?.timePercent ?? 0} size={136} stroke={11} sublabel="time elapsed" />
            </div>
            <div className="grid w-full flex-1 grid-cols-2 gap-3">
              <MiniStat label="Year" value={timeline ? (timeline.started ? `${ordinal(timeline.year)} of ${timeline.totalYears}` : "Not started") : "—"} />
              <MiniStat label="Days to completion" value={timeline ? String(timeline.daysRemaining) : "—"} />
              <MiniStat label="Competencies" value={`${done}/${comps.length}`} />
              <MiniStat label="TAFE units" value={`${tafeDone}/${tafe.length}`} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>By status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {statusCounts.map((s) => (
              <div key={s.value} className="flex items-center gap-3 text-[13px]">
                <span className="w-32 text-muted-foreground">{s.label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={s.value === "completed" ? "h-full bg-success" : s.value === "awaiting_signoff" ? "h-full bg-warning" : "h-full bg-primary"}
                    style={{ width: `${comps.length ? (s.count / comps.length) * 100 : 0}%` }}
                  />
                </div>
                <span className="w-6 text-right font-medium tabular">{s.count}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 pt-2 text-[12.5px] text-muted-foreground">
              <ShieldCheck className="size-3.5 text-success" /> {signoffs} supervisor sign-off{signoffs === 1 ? "" : "s"} recorded
            </div>
          </CardContent>
        </Card>
      </div>

      <Alert tone="neutral" icon={<Info />} className="mt-5">
        Your checklist here is a personal record to help you stay on track. Marking something complete in Apprentice OS isn&apos;t an official assessment or
        certification. Your RTO and employer records are the official ones.
      </Alert>

      <Tabs defaultValue="competencies" className="mt-6">
        <TabsList>
          <TabsTrigger value="competencies">
            <GraduationCap /> Competencies
          </TabsTrigger>
          <TabsTrigger value="assessments">
            <CalendarClock /> Assessments{outstandingAssessments.length ? ` (${outstandingAssessments.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="goals">
            <Target /> Goals
          </TabsTrigger>
        </TabsList>
        <TabsContent value="competencies">
          <CompetencyBoard competencies={comps} categories={(catRes.data ?? []) as CompetencyCategory[]} records={records} />
        </TabsContent>
        <TabsContent value="assessments">
          <AssessmentList assessments={assessments} competencies={comps} timezone={ctx.profile.timezone} />
        </TabsContent>
        <TabsContent value="timeline">
          <Card>
            <CardContent>
              {points.length ? <MilestoneTimeline points={points} /> : <p className="text-[13px] text-muted-foreground">Add your apprenticeship dates to see your timeline.</p>}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="goals">
          <GoalsPanel goals={goals} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-subtle p-3">
      <div className="text-[12px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tracking-tight tabular">{value}</div>
    </div>
  );
}
