import type { Metadata } from "next";
import { Download, FileText, Receipt, Search } from "lucide-react";
import { requireAppContext } from "@/lib/auth";
import { signedUrls } from "@/lib/data/files";
import { UpgradeGate } from "@/components/upgrade-gate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Badge, EmptyState, PageHeader, Stat } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { SpendChart, type SpendDatum } from "@/components/charts/spend-chart";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import { getAnthropic } from "@/lib/ai/client";
import { todayKey } from "@/lib/time/calc";
import type { Expense } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { AddExpenseButton, ExpenseRowActions } from "./expense-form";

export const metadata: Metadata = { title: "Expenses" };

const monthLabel = (ym: string) => new Date(`${ym}-15T00:00:00Z`).toLocaleDateString("en-AU", { month: "short", timeZone: "UTC" });

/** Australian financial year (1 July – 30 June) containing `key`. */
function financialYear(key: string) {
  const [y, m] = key.split("-").map(Number);
  const start = m! >= 7 ? y! : y! - 1;
  return { from: `${start}-07-01`, to: `${start + 1}-07-01`, label: `FY ${start}–${String(start + 1).slice(2)}` };
}

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireAppContext();
  if (!ctx.entitlements.has("expenses")) {
    return (
      <UpgradeGate
        title="Expenses"
        description="Track work purchases and receipts."
        points={["Photograph receipts and let AI read them", "Monthly spending charts by category", "CSV and PDF reports for tax time", "Receipts stored privately"]}
      />
    );
  }
  const sp = await searchParams;
  const today = todayKey(ctx.profile.timezone);
  const q = (sp.q ?? "").trim().slice(0, 100);
  const category = EXPENSE_CATEGORIES.some((c) => c.value === sp.category) ? sp.category! : "";
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : "";
  const fy = financialYear(today);

  const since = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 12, 1)).toISOString().slice(0, 10);
  const [{ data: recent }, listRes] = await Promise.all([
    ctx.supabase.from("expenses").select("spent_on, amount, category").gte("spent_on", since < fy.from ? since : fy.from).limit(5000),
    (() => {
      let qy = ctx.supabase.from("expenses").select("*, receipts(storage_path, mime_type)").order("spent_on", { ascending: false }).order("created_at", { ascending: false }).limit(200);
      if (q) {
        const safe = q.replace(/[%,()]/g, "");
        qy = qy.or(`merchant.ilike.%${safe}%,description.ilike.%${safe}%,work_notes.ilike.%${safe}%`);
      }
      if (category) qy = qy.eq("category", category);
      if (month) {
        const [y, m] = month.split("-").map(Number);
        qy = qy.gte("spent_on", `${month}-01`).lt("spent_on", new Date(Date.UTC(y!, m!, 1)).toISOString().slice(0, 10));
      }
      return qy;
    })(),
  ]);

  const rows = (recent ?? []) as Pick<Expense, "spent_on" | "amount" | "category">[];
  const thisMonth = today.slice(0, 7);
  const lastMonthDate = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
  const sum = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).reduce((s, r) => s + Number(r.amount), 0);
  const monthTotal = sum((r) => r.spent_on.startsWith(thisMonth));
  const lastMonthTotal = sum((r) => r.spent_on.startsWith(lastMonthDate));
  const fyTotal = sum((r) => r.spent_on >= fy.from && r.spent_on < fy.to);

  const months: string[] = [];
  for (let i = 11; i >= 0; i--) months.push(new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - i, 1)).toISOString().slice(0, 7));
  const chart: SpendDatum[] = months.map((ym) => {
    const d: SpendDatum = { label: monthLabel(ym) };
    for (const r of rows) if (r.spent_on.startsWith(ym)) d[r.category] = (d[r.category] ?? 0) + Number(r.amount);
    return d;
  });
  const byCat = EXPENSE_CATEGORIES.map((c) => ({ ...c, total: sum((r) => r.category === c.value && r.spent_on >= fy.from && r.spent_on < fy.to) })).filter((c) => c.total > 0);

  const list = (listRes.data ?? []) as (Expense & { receipts: { storage_path: string; mime_type: string } | null })[];
  const urls = await signedUrls(ctx, list.map((e) => e.receipts?.storage_path ?? "").filter(Boolean));
  const scanAvailable = ctx.entitlements.has("receipt_scanning") && Boolean(getAnthropic());
  const exportRange = month ? { from: `${month}-01`, to: new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1)).toISOString().slice(0, 10) } : fy;

  return (
    <div>
      <PageHeader
        title="Expenses"
        description="Work purchases and receipts, ready to review at tax time."
        actions={<AddExpenseButton userId={ctx.userId} scanAvailable={scanAvailable} autoOpen={sp.new === "1"} />}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="This month" value={formatCurrency(monthTotal)} />
        <Stat label="Last month" value={formatCurrency(lastMonthTotal)} />
        <Stat label={fy.label} value={formatCurrency(fyTotal)} hint="Financial year to date" />
        <Stat label="Receipts stored" value={list.filter((e) => e.receipt_id).length} icon={<Receipt />} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Last 12 months</CardTitle>
          </CardHeader>
          <CardContent>
            <SpendChart data={chart} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{fy.label} by category</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {byCat.length ? (
              byCat.map((c) => (
                <div key={c.value} className="flex items-center gap-3 text-[13px]">
                  <span className="w-20 text-muted-foreground">{c.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(c.total / fyTotal) * 100}%` }} />
                  </div>
                  <span className="w-20 text-right font-medium tabular">{formatCurrency(c.total)}</span>
                </div>
              ))
            ) : (
              <p className="text-[13px] text-muted-foreground">No expenses this financial year.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Alert tone="neutral" className="mt-5">
        Apprentice OS doesn&apos;t decide what&apos;s tax-deductible. Treat these records as a starting point to review with a registered tax agent or the ATO&apos;s guidance.
      </Alert>

      <div className="mb-4 mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <form className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <div className="relative col-span-2 sm:w-60">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input name="q" defaultValue={q} placeholder="Search merchant or notes…" className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm shadow-soft outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25" />
          </div>
          <select name="category" defaultValue={category} aria-label="Category" className="h-10 rounded-lg border border-input bg-card px-2 text-sm shadow-soft">
            <option value="">All categories</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <input type="month" name="month" defaultValue={month} aria-label="Month" className="h-10 rounded-lg border border-input bg-card px-2 text-sm shadow-soft" />
          <Button type="submit" variant="outline">
            Filter
          </Button>
        </form>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <a href={`/api/export/expenses?from=${exportRange.from}&to=${exportRange.to}&format=csv`}>
              <Download /> CSV
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={`/api/export/expenses?from=${exportRange.from}&to=${exportRange.to}&format=pdf`}>
              <FileText /> PDF
            </a>
          </Button>
        </div>
      </div>

      {list.length ? (
        <Card>
          <ul className="divide-y divide-border">
            {list.map((e) => {
              const url = e.receipts ? (urls[e.receipts.storage_path] ?? null) : null;
              return (
                <li key={e.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <div className="grid w-12 shrink-0 place-items-center rounded-lg bg-subtle py-1.5 text-center">
                    <div className="text-[10px] uppercase text-muted-foreground">{monthLabel(e.spent_on.slice(0, 7))}</div>
                    <div className="text-[15px] font-semibold leading-tight">{Number(e.spent_on.slice(8))}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-medium">{e.merchant || e.description || "Expense"}</div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
                      <Badge tone="neutral">{EXPENSE_CATEGORIES.find((c) => c.value === e.category)?.label}</Badge>
                      {e.merchant && e.description ? <span className="truncate">{e.description}</span> : null}
                      {e.gst_amount != null ? <span>GST {formatCurrency(e.gst_amount)}</span> : null}
                    </div>
                  </div>
                  <div className="text-right text-[15px] font-semibold tabular">{formatCurrency(e.amount)}</div>
                  <ExpenseRowActions userId={ctx.userId} scanAvailable={scanAvailable} expense={e} receiptUrl={url} />
                </li>
              );
            })}
          </ul>
        </Card>
      ) : (
        <EmptyState icon={<Receipt />} title={q || category || month ? "No matching expenses" : "No expenses yet"} description={q || category || month ? undefined : "Add your first work purchase. Snap the receipt so it's never lost."} />
      )}
    </div>
  );
}
