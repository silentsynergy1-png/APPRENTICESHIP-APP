import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, FileText, Wrench } from "lucide-react";
import { z } from "zod";
import { requireAppContext } from "@/lib/auth";
import { signedUrls } from "@/lib/data/files";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/misc";
import { TOOL_STATUSES } from "@/lib/constants";
import { todayKey } from "@/lib/time/calc";
import type { Tool, ToolMaintenance } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { DeleteToolButton, EditToolForm, MaintenanceForm } from "../tool-form";
import { DeleteMaintenanceButton } from "./delete-maintenance";

export const metadata: Metadata = { title: "Tool" };

const fmt = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—");

export default async function ToolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const ctx = await requireAppContext();
  const [{ data }, { data: maint }] = await Promise.all([
    ctx.supabase.from("tools").select("*").eq("id", id).maybeSingle(),
    ctx.supabase.from("tool_maintenance").select("*").eq("tool_id", id).order("performed_on", { ascending: false }),
  ]);
  if (!data) notFound();
  const t = data as Tool;
  const urls = await signedUrls(ctx, [t.photo_path ?? "", t.receipt_path ?? ""].filter(Boolean));
  const st = TOOL_STATUSES.find((s) => s.value === t.status)!;
  const today = todayKey(ctx.profile.timezone);
  const warrantyActive = t.warranty_expires_on && t.warranty_expires_on >= today;

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/tools" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Tools
      </Link>
      <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
        <div className="grid content-start gap-5">
          <Card className="overflow-hidden">
            <div className="aspect-[4/3] bg-subtle">
              {t.photo_path && urls[t.photo_path] ? (
                // eslint-disable-next-line @next/next/no-img-element -- private signed URL
                <img src={urls[t.photo_path]} alt={t.name} className="size-full object-cover" />
              ) : (
                <div className="grid size-full place-items-center text-muted-foreground/40">
                  <Wrench className="size-12" />
                </div>
              )}
            </div>
            <CardContent>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h1 className="text-xl font-semibold tracking-tight">{t.name}</h1>
                  <div className="text-[13px] text-muted-foreground">{[t.brand, t.model].filter(Boolean).join(" ") || "No brand or model"}</div>
                </div>
                <Badge tone={st.tone}>{st.label}</Badge>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
                <Detail label="Serial number" value={t.serial_number ?? "—"} mono />
                <Detail label="Category" value={t.category ?? "—"} />
                <Detail label="Purchased" value={fmt(t.purchase_date)} />
                <Detail label="Price" value={t.purchase_price != null ? formatCurrency(t.purchase_price) : "—"} />
                <Detail label="Warranty" value={t.warranty_expires_on ? `${warrantyActive ? "Until" : "Expired"} ${fmt(t.warranty_expires_on)}` : "—"} />
                <Detail label="Next service" value={fmt(t.next_maintenance_on)} />
              </dl>
              {t.receipt_path && urls[t.receipt_path] ? (
                <a href={urls[t.receipt_path]} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-primary hover:underline">
                  <FileText className="size-4" /> View receipt
                </a>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Maintenance history</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5">
              {maint?.length ? (
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {(maint as ToolMaintenance[]).map((m) => (
                    <li key={m.id} className="flex items-center gap-3 px-3.5 py-2.5 text-[13px]">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{m.description}</div>
                        <div className="text-muted-foreground">{fmt(m.performed_on)}</div>
                      </div>
                      {m.cost != null ? <span className="tabular">{formatCurrency(m.cost)}</span> : null}
                      <DeleteMaintenanceButton id={m.id} toolId={t.id} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-muted-foreground">No maintenance logged yet.</p>
              )}
              <MaintenanceForm toolId={t.id} />
            </CardContent>
          </Card>
        </div>

        <Card className="content-start">
          <CardHeader>
            <CardTitle>Edit details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5">
            <EditToolForm userId={ctx.userId} tool={t} photoUrl={t.photo_path ? (urls[t.photo_path] ?? null) : null} receiptUrl={t.receipt_path && !t.receipt_path.endsWith(".pdf") ? (urls[t.receipt_path] ?? null) : null} />
            <div className="border-t border-border pt-4">
              <DeleteToolButton id={t.id} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-[12.5px]" : "font-medium"}>{value}</dd>
    </div>
  );
}
