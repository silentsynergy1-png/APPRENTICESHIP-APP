import Link from "next/link";
import type { Metadata } from "next";
import { BookOpenText, ChevronLeft, ChevronRight, ImageIcon, MapPin, Plus, Search, Sparkles } from "lucide-react";
import { requireAppContext } from "@/lib/auth";
import { signedUrls } from "@/lib/data/files";
import { Card } from "@/components/ui/card";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { addDaysToKey, formatLocal, todayKey, weekStartKey } from "@/lib/time/calc";
import type { DiaryEntry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PhotoGrid } from "./photos";

export const metadata: Metadata = { title: "Work diary" };

type View = "timeline" | "calendar" | "photos";
const keyLabel = (key: string, p: string) => formatLocal(`${key}T12:00:00Z`, "UTC", p);

export default async function DiaryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireAppContext();
  const sp = await searchParams;
  const view: View = sp.view === "calendar" || sp.view === "photos" ? sp.view : "timeline";
  const q = (sp.q ?? "").trim().slice(0, 120);
  const site = sp.site && /^[0-9a-f-]{36}$/.test(sp.site) ? sp.site : "";
  const from = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : "";
  const to = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : "";
  const today = todayKey(ctx.profile.timezone);

  const { data: sites } = await ctx.supabase.from("job_sites").select("id, name").order("name");
  const siteName = (id: string | null) => (id ? sites?.find((s) => s.id === id)?.name : null);

  const tabs = (
    <div className="inline-flex rounded-xl bg-muted p-1 text-[13px] font-medium">
      {(["timeline", "calendar", "photos"] as const).map((v) => (
        <Link key={v} href={`/diary?view=${v}`} className={cn("rounded-lg px-3 py-1.5 capitalize text-muted-foreground", view === v && "bg-card text-foreground shadow-soft")}>
          {v}
        </Link>
      ))}
    </div>
  );

  const header = (
    <PageHeader
      title="Work diary"
      description="What you did, what you learned, and the photos to prove it."
      actions={
        <Button asChild>
          <Link href="/diary/new">
            <Plus /> New entry
          </Link>
        </Button>
      }
    />
  );

  /* ------------------------------- PHOTOS ------------------------------- */
  if (view === "photos") {
    const { data: photos } = await ctx.supabase
      .from("diary_photos")
      .select("id, storage_path, caption, mime_type, entry_id, created_at, work_diary_entries(entry_date, title)")
      .eq("is_attachment", false)
      .order("created_at", { ascending: false })
      .limit(120);
    const urls = await signedUrls(ctx, (photos ?? []).map((p) => p.storage_path as string));
    const groups = new Map<string, { id: string; url: string | null; caption: string | null; mime: string }[]>();
    for (const p of photos ?? []) {
      const entry = p.work_diary_entries as unknown as { entry_date: string } | null;
      const month = (entry?.entry_date ?? (p.created_at as string).slice(0, 10)).slice(0, 7);
      groups.set(month, [...(groups.get(month) ?? []), { id: p.id, url: urls[p.storage_path as string] ?? null, caption: p.caption, mime: p.mime_type }]);
    }
    return (
      <div>
        {header}
        <div className="mb-5">{tabs}</div>
        {groups.size ? (
          <div className="grid gap-8">
            {[...groups.entries()].map(([month, list]) => (
              <section key={month}>
                <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">{keyLabel(`${month}-01`, "MMMM yyyy")}</h2>
                <PhotoGrid photos={list} editable={false} />
              </section>
            ))}
          </div>
        ) : (
          <EmptyState icon={<ImageIcon />} title="No photos yet" description="Photos you add to diary entries build up into a timeline of your work." />
        )}
      </div>
    );
  }

  /* ------------------------------ CALENDAR ------------------------------ */
  if (view === "calendar") {
    const monthKey = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : today.slice(0, 7);
    const monthStart = `${monthKey}-01`;
    const [yy, mm] = monthKey.split("-").map(Number);
    const nextMonth = new Date(Date.UTC(yy!, mm!, 1)).toISOString().slice(0, 10);
    const prevMonth = new Date(Date.UTC(yy!, mm! - 2, 1)).toISOString().slice(0, 7);
    const gridStart = weekStartKey(monthStart, ctx.rules.week_starts_on);
    const gridEnd = addDaysToKey(weekStartKey(addDaysToKey(nextMonth, -1), ctx.rules.week_starts_on), 7);
    const [{ data: entries }, { data: sessions }] = await Promise.all([
      ctx.supabase.from("work_diary_entries").select("id, entry_date, title").gte("entry_date", gridStart).lt("entry_date", gridEnd),
      ctx.supabase.from("work_sessions").select("started_at, timezone").gte("started_at", new Date(`${gridStart}T00:00:00Z`).toISOString()).lt("started_at", new Date(`${gridEnd}T00:00:00Z`).toISOString()),
    ]);
    const workedDays = new Set((sessions ?? []).map((s) => formatLocal(s.started_at, s.timezone || ctx.profile.timezone, "yyyy-MM-dd")));
    const cells: string[] = [];
    for (let k = gridStart; k < gridEnd; k = addDaysToKey(k, 1)) cells.push(k);
    return (
      <div>
        {header}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {tabs}
          <div className="flex items-center gap-1">
            <Button asChild variant="ghost" size="icon" aria-label="Previous month">
              <Link href={`/diary?view=calendar&month=${prevMonth}`}>
                <ChevronLeft />
              </Link>
            </Button>
            <span className="min-w-36 text-center text-[14px] font-medium">{keyLabel(monthStart, "MMMM yyyy")}</span>
            <Button asChild variant="ghost" size="icon" aria-label="Next month">
              <Link href={`/diary?view=calendar&month=${nextMonth.slice(0, 7)}`}>
                <ChevronRight />
              </Link>
            </Button>
          </div>
        </div>
        <Card className="p-2 sm:p-4">
          <div className="grid grid-cols-7 gap-1 pb-2 text-center text-[11px] font-medium text-muted-foreground">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i}>{keyLabel(addDaysToKey(gridStart, i), "EEEEE")}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((k) => {
              const list = (entries ?? []).filter((e) => e.entry_date === k);
              const inMonth = k >= monthStart && k < nextMonth;
              const missing = workedDays.has(k) && !list.length && k <= today;
              return (
                <Link
                  key={k}
                  href={list.length === 1 ? `/diary/${list[0]!.id}` : list.length ? `/diary?from=${k}&to=${k}` : `/diary/new?date=${k}`}
                  className={cn(
                    "flex aspect-square flex-col justify-between rounded-lg border border-transparent p-1.5 hover:border-border sm:aspect-[1.25] sm:p-2",
                    !inMonth && "opacity-35",
                    list.length && "bg-primary-soft/60",
                  )}
                  title={missing ? "You worked this day but haven't written a diary entry" : undefined}
                >
                  <span className={cn("text-[12px] font-medium", k === today && "grid size-5 place-items-center rounded-full bg-primary text-[11px] text-primary-foreground")}>{Number(k.slice(8))}</span>
                  {list.length ? (
                    <span className="truncate text-[10.5px] font-medium text-primary sm:text-[11.5px]">{list.length > 1 ? `${list.length} entries` : list[0]!.title || "Entry"}</span>
                  ) : missing ? (
                    <span className="text-[10.5px] text-warning sm:text-[11.5px]">No entry</span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </Card>
        <p className="mt-3 text-center text-[12.5px] text-muted-foreground">Days you worked without a diary entry are flagged. Tap any day to add one.</p>
      </div>
    );
  }

  /* ------------------------------ TIMELINE ------------------------------ */
  let query = ctx.supabase
    .from("work_diary_entries")
    .select("id, entry_date, title, description, raw_notes, skills, status, ai_assisted, job_site_id, diary_photos(count)")
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);
  if (q) query = query.textSearch("search", q, { type: "websearch", config: "english" });
  if (site) query = query.eq("job_site_id", site);
  if (from) query = query.gte("entry_date", from);
  if (to) query = query.lte("entry_date", to);
  const { data } = await query;
  const entries = (data ?? []) as (Pick<DiaryEntry, "id" | "entry_date" | "title" | "description" | "raw_notes" | "skills" | "status" | "ai_assisted" | "job_site_id"> & { diary_photos: { count: number }[] })[];
  const months = new Map<string, typeof entries>();
  for (const e of entries) months.set(e.entry_date.slice(0, 7), [...(months.get(e.entry_date.slice(0, 7)) ?? []), e]);
  const filtering = Boolean(q || site || from || to);

  return (
    <div>
      {header}
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {tabs}
        <form className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <input type="hidden" name="view" value="timeline" />
          <div className="relative col-span-2 sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Search tasks, skills, notes…"
              className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm shadow-soft outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25"
            />
          </div>
          <select name="site" defaultValue={site} className="h-10 rounded-lg border border-input bg-card px-2 text-sm shadow-soft" aria-label="Job site">
            <option value="">All sites</option>
            {(sites ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input type="date" name="from" defaultValue={from} aria-label="From" className="h-10 rounded-lg border border-input bg-card px-2 text-sm shadow-soft" />
          <input type="date" name="to" defaultValue={to} aria-label="To" className="h-10 rounded-lg border border-input bg-card px-2 text-sm shadow-soft" />
          <Button type="submit" variant="outline">
            Filter
          </Button>
          {filtering ? (
            <Button asChild variant="ghost">
              <Link href="/diary">Clear</Link>
            </Button>
          ) : null}
        </form>
      </div>

      {entries.length ? (
        <div className="grid gap-8">
          {[...months.entries()].map(([month, list]) => (
            <section key={month}>
              <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">{keyLabel(`${month}-01`, "MMMM yyyy")}</h2>
              <ol className="relative grid gap-3 border-l border-border pl-5">
                {list.map((e) => {
                  const photoCount = e.diary_photos?.[0]?.count ?? 0;
                  return (
                    <li key={e.id} className="relative">
                      <span className="absolute -left-[26px] top-5 size-2.5 rounded-full border-2 border-background bg-primary" />
                      <Link href={`/diary/${e.id}`}>
                        <Card className="p-4 transition-colors hover:bg-subtle">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-[12px] text-muted-foreground">{keyLabel(e.entry_date, "EEE d MMM")}</div>
                              <div className="truncate text-[15px] font-semibold">{e.title || "Untitled entry"}</div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              {e.status === "draft" ? <Badge tone="warning">Draft</Badge> : null}
                              {e.ai_assisted ? (
                                <Badge tone="primary">
                                  <Sparkles /> AI
                                </Badge>
                              ) : null}
                            </div>
                          </div>
                          <p className="mt-1.5 line-clamp-2 text-[13.5px] leading-relaxed text-muted-foreground">{e.description || e.raw_notes}</p>
                          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
                            {siteName(e.job_site_id) ? (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="size-3" /> {siteName(e.job_site_id)}
                              </span>
                            ) : null}
                            {photoCount ? (
                              <span className="inline-flex items-center gap-1">
                                <ImageIcon className="size-3" /> {photoCount}
                              </span>
                            ) : null}
                            {e.skills.slice(0, 3).map((s) => (
                              <span key={s} className="rounded bg-muted px-1.5 py-0.5">
                                {s}
                              </span>
                            ))}
                          </div>
                        </Card>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<BookOpenText />}
          title={filtering ? "No matching entries" : "Start your work diary"}
          description={filtering ? "Try different words or clear the filters." : "A few lines a day builds a record of everything you've learned, ready for TAFE, sign-offs and your logbook."}
          action={
            filtering ? undefined : (
              <Button asChild>
                <Link href="/diary/new">
                  <Plus /> Write today&apos;s entry
                </Link>
              </Button>
            )
          }
        />
      )}
    </div>
  );
}
