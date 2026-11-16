import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight, MapPinned } from "lucide-react";
import { requireAppContext } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { formatLocal, formatMinutes } from "@/lib/time/calc";
import type { JobSite } from "@/lib/types";
import { cn } from "@/lib/utils";
import { NewSiteButton } from "./site-form";

export const metadata: Metadata = { title: "Job sites" };

export default async function JobSitesPage({ searchParams }: { searchParams: Promise<{ q?: string; archived?: string }> }) {
  const ctx = await requireAppContext();
  const sp = await searchParams;
  const showArchived = sp.archived === "1";
  const q = (sp.q ?? "").trim().slice(0, 100);

  let query = ctx.supabase.from("job_sites").select("*").eq("archived", showArchived).order("name");
  if (q) query = query.or(`name.ilike.%${q.replace(/[%,()]/g, "")}%,address.ilike.%${q.replace(/[%,()]/g, "")}%`);
  const [{ data: sites }, { data: stats }, { data: employers }] = await Promise.all([
    query,
    ctx.supabase.rpc("job_site_stats"),
    ctx.supabase.from("employers").select("id, name").eq("archived", false).order("name"),
  ]);
  const statFor = (id: string) =>
    ((stats ?? []) as { job_site_id: string; session_count: number; worked_minutes: number; last_worked_at: string }[]).find((s) => s.job_site_id === id);
  const employerName = (id: string | null) => (id ? employers?.find((e) => e.id === id)?.name : null);
  const list = ((sites ?? []) as JobSite[]).sort((a, b) => (statFor(b.id)?.last_worked_at ?? "").localeCompare(statFor(a.id)?.last_worked_at ?? ""));

  return (
    <div>
      <PageHeader
        title="Job sites"
        description="Places you work. Saved sites are recognised automatically when you clock in nearby."
        actions={<NewSiteButton employers={(employers ?? []) as { id: string; name: string }[]} />}
      />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form className="w-full sm:max-w-xs">
          {showArchived ? <input type="hidden" name="archived" value="1" /> : null}
          <input
            name="q"
            defaultValue={q}
            placeholder="Search sites or addresses"
            className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-soft outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25"
          />
        </form>
        <div className="inline-flex rounded-xl bg-muted p-1 text-[13px] font-medium">
          <Link href="/job-sites" className={cn("rounded-lg px-3 py-1.5 text-muted-foreground", !showArchived && "bg-card text-foreground shadow-soft")}>
            Active
          </Link>
          <Link href="/job-sites?archived=1" className={cn("rounded-lg px-3 py-1.5 text-muted-foreground", showArchived && "bg-card text-foreground shadow-soft")}>
            Archived
          </Link>
        </div>
      </div>

      {list.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((s) => {
            const st = statFor(s.id);
            return (
              <Link key={s.id} href={`/job-sites/${s.id}`}>
                <Card className="flex items-center gap-4 p-4 transition-colors hover:bg-subtle">
                  <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                    <MapPinned className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[15px] font-semibold">{s.name}</span>
                      {s.latitude == null ? <Badge tone="outline">No location</Badge> : null}
                    </div>
                    <div className="truncate text-[13px] text-muted-foreground">{s.address ?? employerName(s.employer_id) ?? "No address"}</div>
                    <div className="mt-1 text-[12px] text-muted-foreground">
                      {st ? (
                        <>
                          {st.session_count} sessions · {formatMinutes(Number(st.worked_minutes))} · last {formatLocal(st.last_worked_at, ctx.profile.timezone, "d MMM")}
                        </>
                      ) : (
                        "No sessions yet"
                      )}
                    </div>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Card>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<MapPinned />}
          title={q ? "No matching job sites" : showArchived ? "No archived sites" : "No job sites yet"}
          description={
            q || showArchived
              ? undefined
              : "Add one now, or clock in at a site and save it from there. After a few visits to the same spot, Apprentice OS will offer to save it for you."
          }
        />
      )}
    </div>
  );
}
