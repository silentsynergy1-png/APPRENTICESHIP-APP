import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { z } from "zod";
import { requireAppContext } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, Stat } from "@/components/ui/misc";
import { formatLocal, formatMinutes, sessionWorkedMinutes } from "@/lib/time/calc";
import type { Break, JobSite, WorkSession } from "@/lib/types";
import { EditSiteForm, SiteDangerZone } from "../site-form";

export const metadata: Metadata = { title: "Job site" };

export default async function JobSitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const ctx = await requireAppContext();
  const tz = ctx.profile.timezone;

  const [{ data: site }, { data: sessions }, { data: employers }, { count: diaryCount }] = await Promise.all([
    ctx.supabase.from("job_sites").select("*").eq("id", id).maybeSingle(),
    ctx.supabase.from("work_sessions").select("*, breaks(*)").eq("job_site_id", id).order("started_at", { ascending: false }).limit(200),
    ctx.supabase.from("employers").select("id, name").eq("archived", false).order("name"),
    ctx.supabase.from("work_diary_entries").select("id", { count: "exact", head: true }).eq("job_site_id", id),
  ]);
  if (!site) notFound();
  const s = site as JobSite;
  const list = (sessions ?? []) as (WorkSession & { breaks: Break[] })[];
  const total = list.reduce((sum, x) => sum + (x.ended_at ? sessionWorkedMinutes(x, x.breaks) : 0), 0);
  const first = list.at(-1);

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/job-sites" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Job sites
      </Link>
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{s.name}</h1>
          {s.archived ? <Badge>Archived</Badge> : null}
        </div>
        <p className="mt-1 text-[14px] text-muted-foreground">{s.address ?? "No address saved"}</p>
        {s.description ? <p className="mt-2 max-w-2xl text-[14px]">{s.description}</p> : null}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Sessions" value={list.length} />
        <Stat label="Total hours" value={formatMinutes(total)} />
        <Stat label="Diary entries" value={diaryCount ?? 0} />
        <Stat label="First visit" value={first ? formatLocal(first.started_at, tz, "d MMM yy") : "—"} />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Sessions at this site</CardTitle>
          </CardHeader>
          {list.length ? (
            <ul className="mt-3 divide-y divide-border border-t border-border">
              {list.slice(0, 60).map((x) => (
                <li key={x.id}>
                  <Link href={`/timesheets/${x.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-subtle">
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-medium">{formatLocal(x.started_at, x.timezone || tz, "EEE d MMM yyyy")}</div>
                      <div className="text-[12.5px] text-muted-foreground tabular">
                        {formatLocal(x.started_at, x.timezone || tz, "h:mm a")} – {x.ended_at ? formatLocal(x.ended_at, x.timezone || tz, "h:mm a") : "now"}
                      </div>
                    </div>
                    <span className="text-[14px] font-semibold tabular">{formatMinutes(sessionWorkedMinutes(x, x.breaks))}</span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <CardContent>
              <p className="text-[13px] text-muted-foreground">No sessions linked yet. Clock in here, or choose this site when adding a session.</p>
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6">
            <EditSiteForm site={s} employers={(employers ?? []) as { id: string; name: string }[]} />
            <div className="border-t border-border pt-5">
              <SiteDangerZone id={s.id} archived={s.archived} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
