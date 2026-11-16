import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AlertTriangle, ArrowLeft, BookOpenText, History, MapPin, MapPinOff } from "lucide-react";
import { z } from "zod";
import { requireAppContext } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Badge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { accuracyLabel } from "@/lib/geo/distance";
import { breakMinutes, formatLocal, formatMinutes, isoToLocalInput, sessionWorkedMinutes } from "@/lib/time/calc";
import type { Break, WorkSession } from "@/lib/types";
import { EditSessionForm } from "../session-form";
import { DeleteSessionButton, RemoveLocationButton } from "../buttons";

export const metadata: Metadata = { title: "Session" };

const FIELD_LABELS: Record<string, string> = {
  started_at: "Start",
  ended_at: "Finish",
  employer_id: "Employer",
  job_site_id: "Job site",
  approval_status: "Status",
  start_address: "Clock-in address",
  end_address: "Clock-out address",
  start_latitude: "Clock-in location",
  end_latitude: "Clock-out location",
};

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const ctx = await requireAppContext();
  const tz = ctx.profile.timezone;

  const [{ data: session }, { data: employers }, { data: sites }, { data: audit }, { data: diary }] = await Promise.all([
    ctx.supabase.from("work_sessions").select("*, breaks(*)").eq("id", id).maybeSingle(),
    ctx.supabase.from("employers").select("id, name").eq("archived", false).order("name"),
    ctx.supabase.from("job_sites").select("id, name").eq("archived", false).order("name"),
    ctx.supabase.from("timesheet_adjustments").select("id, action, changes, reason, created_at").eq("session_id", id).order("created_at", { ascending: false }).limit(50),
    ctx.supabase.from("work_diary_entries").select("id, title").eq("session_id", id).limit(5),
  ]);
  if (!session) notFound();
  const s = session as WorkSession & { breaks: Break[] };
  const sessionTz = s.timezone || tz;
  const worked = sessionWorkedMinutes(s, s.breaks);
  const unpaid = breakMinutes(s, s.breaks, Date.now(), "unpaid");
  const paid = breakMinutes(s, s.breaks, Date.now(), "paid");

  const fmtValue = (field: string, v: unknown) => {
    if (v === null || v === undefined) return "—";
    if (field === "started_at" || field === "ended_at") return formatLocal(String(v), sessionTz, "d MMM h:mm a");
    if (field === "employer_id") return employers?.find((e) => e.id === v)?.name ?? "Removed employer";
    if (field === "job_site_id") return sites?.find((x) => x.id === v)?.name ?? "Removed site";
    if (field.endsWith("latitude")) return "Coordinates recorded";
    return String(v);
  };

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/timesheets" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Timesheets
      </Link>
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[13px] text-muted-foreground">{formatLocal(s.started_at, sessionTz, "EEEE d MMMM yyyy")}</div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {formatLocal(s.started_at, sessionTz, "h:mm a")} – {s.ended_at ? formatLocal(s.ended_at, sessionTz, "h:mm a") : "now"}
          </h1>
        </div>
        <div className="text-right">
          <div className="text-3xl font-semibold tracking-tight tabular">{formatMinutes(worked)}</div>
          <div className="text-[12.5px] text-muted-foreground">
            worked{unpaid >= 1 ? ` · ${formatMinutes(unpaid)} unpaid break` : ""}
            {paid >= 1 ? ` · ${formatMinutes(paid)} paid break` : ""}
          </div>
        </div>
      </div>

      {s.needs_review ? (
        <Alert tone="warning" icon={<AlertTriangle />} title="Please double-check this session" className="mb-5">
          {s.review_reason ?? "Some details were entered after the fact."} Saving the form below clears this flag.
        </Alert>
      ) : null}
      {sessionTz !== tz ? (
        <Alert tone="neutral" className="mb-5">
          Times are shown in {sessionTz.replace("_", " ")}, the timezone this session was recorded in.
        </Alert>
      ) : null}

      <div className="grid gap-5">
        <Card>
          <CardHeader>
            <CardTitle>Location</CardTitle>
            {s.start_location_source !== "none" || s.end_location_source !== "none" ? <RemoveLocationButton id={s.id} /> : null}
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {(["start", "end"] as const).map((which) => {
              const src = which === "start" ? s.start_location_source : s.end_location_source;
              const address = which === "start" ? s.start_address : s.end_address;
              const acc = which === "start" ? s.start_accuracy_m : s.end_accuracy_m;
              const at = which === "start" ? s.start_location_captured_at : s.end_location_captured_at;
              const hasCoords = (which === "start" ? s.start_latitude : s.end_latitude) != null;
              const a = accuracyLabel(acc);
              return (
                <div key={which} className="rounded-xl bg-subtle p-4">
                  <div className="mb-2 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
                    {which === "start" ? "Clock in" : "Clock out"}
                  </div>
                  {src === "none" ? (
                    <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                      <MapPinOff className="size-4" /> Not recorded
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex gap-2 text-[14px]">
                        <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
                        <span>
                          {src === "gps" && address ? "Approx. " : ""}
                          {address ?? "Coordinates only (no address)"}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge tone={src === "gps" ? "primary" : "neutral"}>{src === "gps" ? "GPS detected" : "Entered manually"}</Badge>
                        {hasCoords ? <Badge tone={a.tone}>{a.label}</Badge> : null}
                      </div>
                      {at ? <div className="text-[12px] text-muted-foreground">Captured {formatLocal(at, sessionTz, "d MMM, h:mm a")}</div> : null}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Work diary</CardTitle>
          </CardHeader>
          <CardContent>
            {diary?.length ? (
              <ul className="space-y-2">
                {diary.map((d) => (
                  <li key={d.id}>
                    <Link href={`/diary/${d.id}`} className="flex items-center gap-2 text-[14px] text-primary hover:underline">
                      <BookOpenText className="size-4" /> {d.title || "Diary entry"}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[13px] text-muted-foreground">No diary entry for this session yet.</p>
                <Button asChild size="sm">
                  <Link href={`/diary/new?session=${s.id}`}>
                    <BookOpenText /> Add diary entry
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {s.ended_at ? (
          <Card>
            <CardHeader>
              <CardTitle>Edit session</CardTitle>
            </CardHeader>
            <CardContent>
              <EditSessionForm
                employers={(employers ?? []) as { id: string; name: string }[]}
                jobSites={(sites ?? []) as { id: string; name: string }[]}
                values={{
                  id: s.id,
                  start_local: isoToLocalInput(s.started_at, sessionTz),
                  end_local: isoToLocalInput(s.ended_at, sessionTz),
                  break_minutes: Math.round(unpaid),
                  employer_id: s.employer_id,
                  job_site_id: s.job_site_id,
                  address: s.start_address,
                  notes: s.notes,
                  approval_status: s.approval_status,
                }}
              />
            </CardContent>
          </Card>
        ) : (
          <Alert tone="primary">This session is still running. Clock out to edit its times.</Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="size-4 text-muted-foreground" /> History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {audit?.length ? (
              <ol className="relative space-y-4 border-l border-border pl-5">
                {audit.map((a) => (
                  <li key={a.id} className="relative">
                    <span className="absolute -left-[25px] top-1.5 size-2 rounded-full bg-primary" />
                    <div className="text-[12px] text-muted-foreground">{formatLocal(a.created_at, tz, "d MMM yyyy, h:mm a")}</div>
                    <div className="text-[14px] font-medium">
                      {a.action === "insert" ? "Session created" : a.action === "delete" ? "Session deleted" : "Edited"}
                    </div>
                    {a.action === "update" ? (
                      <ul className="mt-1 space-y-0.5 text-[13px] text-muted-foreground">
                        {Object.entries(a.changes as Record<string, { from: unknown; to: unknown }>).map(([field, c]) => (
                          <li key={field}>
                            {FIELD_LABELS[field] ?? field}: {fmtValue(field, c.from)} → <span className="text-foreground">{fmtValue(field, c.to)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {a.reason ? <div className="mt-1 text-[12.5px] italic text-muted-foreground">“{a.reason}”</div> : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-[13px] text-muted-foreground">No changes recorded.</p>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <DeleteSessionButton id={s.id} />
        </div>
      </div>
    </div>
  );
}
