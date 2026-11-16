import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle, Search, ShieldCheck, Wrench } from "lucide-react";
import { requireAppContext } from "@/lib/auth";
import { signedUrls } from "@/lib/data/files";
import { Card } from "@/components/ui/card";
import { Badge, EmptyState, PageHeader, Stat } from "@/components/ui/misc";
import { TOOL_CATEGORIES, TOOL_STATUSES } from "@/lib/constants";
import { todayKey, addDaysToKey } from "@/lib/time/calc";
import type { Tool } from "@/lib/types";
import { cn, formatCurrency } from "@/lib/utils";
import { NewToolButton } from "./tool-form";

export const metadata: Metadata = { title: "Tools" };

export default async function ToolsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireAppContext();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const category = TOOL_CATEGORIES.includes(sp.category ?? "") ? sp.category! : "";
  const status = TOOL_STATUSES.some((s) => s.value === sp.status) ? sp.status! : "";
  const today = todayKey(ctx.profile.timezone);

  const { data: all } = await ctx.supabase.from("tools").select("*").order("name");
  const tools = (all ?? []) as Tool[];
  const filtered = tools.filter(
    (t) =>
      (!q || [t.name, t.brand, t.model, t.serial_number].some((f) => f?.toLowerCase().includes(q.toLowerCase()))) &&
      (!category || t.category === category) &&
      (!status || t.status === status),
  );
  const urls = await signedUrls(ctx, filtered.map((t) => t.photo_path ?? "").filter(Boolean));

  const owned = tools.filter((t) => t.status !== "retired" && t.status !== "lost");
  const value = owned.reduce((s, t) => s + Number(t.purchase_price ?? 0), 0);
  const missing = tools.filter((t) => t.status === "lost").length;
  const inWarranty = tools.filter((t) => t.warranty_expires_on && t.warranty_expires_on >= today).length;
  const soon = addDaysToKey(today, 30);

  const filterLink = (params: Record<string, string>) => {
    const u = new URLSearchParams({ ...(q ? { q } : {}), ...(category ? { category } : {}), ...(status ? { status } : {}), ...params });
    for (const [k, v] of [...u.entries()]) if (!v) u.delete(k);
    return `/tools${u.toString() ? `?${u}` : ""}`;
  };

  return (
    <div>
      <PageHeader title="Tools" description="Your kit, with serial numbers, receipts and warranties in one place." actions={<NewToolButton userId={ctx.userId} autoOpen={sp.new === "1"} />} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Inventory value" value={formatCurrency(value)} hint={`${owned.length} tool${owned.length === 1 ? "" : "s"}`} />
        <Stat label="Under warranty" value={inWarranty} icon={<ShieldCheck />} />
        <Stat label="Missing" value={missing} icon={<AlertTriangle />} />
        <Stat label="Total tools" value={tools.length} icon={<Wrench />} />
      </div>

      <div className="my-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <form className="relative w-full lg:max-w-xs">
          {category ? <input type="hidden" name="category" value={category} /> : null}
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input name="q" defaultValue={q} placeholder="Search name, brand or serial…" className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm shadow-soft outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25" />
        </form>
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 scrollbar-none lg:mx-0 lg:px-0">
          <Link href={filterLink({ status: "" })} className={cn("shrink-0 rounded-full border px-3 py-1.5 text-[12.5px]", !status ? "border-primary/40 bg-primary-soft text-primary" : "border-border text-muted-foreground")}>
            All statuses
          </Link>
          {TOOL_STATUSES.map((s) => (
            <Link key={s.value} href={filterLink({ status: s.value })} className={cn("shrink-0 rounded-full border px-3 py-1.5 text-[12.5px]", status === s.value ? "border-primary/40 bg-primary-soft text-primary" : "border-border text-muted-foreground")}>
              {s.label}
            </Link>
          ))}
          <select
            aria-label="Category"
            defaultValue={category}
            className="h-8 shrink-0 rounded-full border border-border bg-card px-3 text-[12.5px]"
            // Progressive enhancement: plain links above work without JS; this select needs a submit, so wrap in a form.
            form="cat-form"
            name="category"
          >
            <option value="">All categories</option>
            {TOOL_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <form id="cat-form" className="contents">
            {q ? <input type="hidden" name="q" value={q} /> : null}
            {status ? <input type="hidden" name="status" value={status} /> : null}
            <button className="shrink-0 rounded-full border border-border px-3 py-1.5 text-[12.5px] text-muted-foreground hover:text-foreground">Apply</button>
          </form>
        </div>
      </div>

      {filtered.length ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {filtered.map((t) => {
            const st = TOOL_STATUSES.find((s) => s.value === t.status)!;
            const warrantySoon = t.warranty_expires_on && t.warranty_expires_on >= today && t.warranty_expires_on <= soon;
            const maintDue = t.next_maintenance_on && t.next_maintenance_on <= addDaysToKey(today, 7);
            return (
              <Link key={t.id} href={`/tools/${t.id}`}>
                <Card className="group h-full overflow-hidden transition-shadow hover:shadow-pop">
                  <div className="relative aspect-[4/3] bg-subtle">
                    {t.photo_path && urls[t.photo_path] ? (
                      // eslint-disable-next-line @next/next/no-img-element -- private signed URL
                      <img src={urls[t.photo_path]} alt={t.name} className="size-full object-cover transition-transform group-hover:scale-[1.03]" loading="lazy" />
                    ) : (
                      <div className="grid size-full place-items-center text-muted-foreground/50">
                        <Wrench className="size-8" />
                      </div>
                    )}
                    {t.status !== "available" ? (
                      <Badge tone={st.tone} className="absolute left-2 top-2 shadow-soft">
                        {st.label}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="p-3">
                    <div className="truncate text-[14px] font-semibold">{t.name}</div>
                    <div className="truncate text-[12px] text-muted-foreground">{[t.brand, t.model].filter(Boolean).join(" ") || t.category || "—"}</div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-[13px] font-medium tabular">{t.purchase_price != null ? formatCurrency(t.purchase_price) : ""}</span>
                      {maintDue ? <Badge tone="warning">Service due</Badge> : warrantySoon ? <Badge tone="warning">Warranty ending</Badge> : null}
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<Wrench />}
          title={tools.length ? "No tools match" : "Start your tool register"}
          description={tools.length ? "Try a different search or filter." : "Record serial numbers and receipts now, before anything goes missing or needs a warranty claim."}
        />
      )}
    </div>
  );
}
