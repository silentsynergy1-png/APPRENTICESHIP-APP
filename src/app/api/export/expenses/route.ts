import { NextResponse, type NextRequest } from "next/server";
import { getAppContext } from "@/lib/auth";
import { fileResponse, renderPdf, toCsv } from "@/lib/export";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import type { Expense } from "@/lib/types";

const KEY = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  const ctx = await getAppContext();
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!ctx.entitlements.has("expenses")) return NextResponse.json({ error: "Expenses are part of Apprentice OS Pro" }, { status: 402 });
  const sp = request.nextUrl.searchParams;
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  const format = sp.get("format") === "pdf" ? "pdf" : "csv";
  if (!KEY.test(from) || !KEY.test(to) || to <= from) return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  if (format === "pdf" && !ctx.entitlements.has("pdf_reports")) return NextResponse.json({ error: "PDF reports are part of Pro" }, { status: 402 });

  const { data } = await ctx.supabase.from("expenses").select("*").gte("spent_on", from).lt("spent_on", to).order("spent_on").limit(5000);
  const rows = (data ?? []) as Expense[];
  const cat = (c: string) => EXPENSE_CATEGORIES.find((x) => x.value === c)?.label ?? c;
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  const gst = rows.reduce((s, r) => s + Number(r.gst_amount ?? 0), 0);
  const toDate = new Date(new Date(`${to}T00:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10);
  const stamp = `${from}_to_${toDate}`;

  if (format === "csv") {
    const csv = toCsv(
      ["Date", "Merchant", "Description", "Category", "Amount (AUD)", "GST (AUD, as shown)", "Work notes", "Receipt attached"],
      rows.map((r) => [r.spent_on, r.merchant ?? "", r.description ?? "", cat(r.category), Number(r.amount).toFixed(2), r.gst_amount != null ? Number(r.gst_amount).toFixed(2) : "", r.work_notes ?? "", r.receipt_id ? "yes" : "no"]),
    );
    return fileResponse(csv, `expenses_${stamp}.csv`, "text/csv; charset=utf-8");
  }

  const byCat = EXPENSE_CATEGORIES.map((c) => [c.label, rows.filter((r) => r.category === c.value).reduce((s, r) => s + Number(r.amount), 0)] as const).filter(([, v]) => v > 0);
  const pdf = renderPdf({
    title: "Expense report",
    subtitle: `${from} to ${toDate}`,
    meta: [
      ["Name", ctx.profile.full_name ?? ""],
      ["Expenses", String(rows.length)],
    ],
    headers: ["Date", "Merchant", "Description", "Category", "Amount", "GST"],
    rows: rows.map((r) => [r.spent_on, r.merchant ?? "", r.description ?? "", cat(r.category), `$${Number(r.amount).toFixed(2)}`, r.gst_amount != null ? `$${Number(r.gst_amount).toFixed(2)}` : ""]),
    columnStyles: { 4: { halign: "right" }, 5: { halign: "right" } },
    summary: [...byCat.map(([k, v]) => [k, `$${v.toFixed(2)}`] as [string, string]), ["GST shown on receipts", `$${gst.toFixed(2)}`], ["Total", `$${total.toFixed(2)}`]],
    footnote: "Records entered by the user for their own review. Apprentice OS does not determine tax deductibility. Seek advice from a registered tax agent.",
  });
  return fileResponse(pdf, `expenses_${stamp}.pdf`, "application/pdf");
}
