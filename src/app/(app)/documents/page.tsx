import Link from "next/link";
import type { Metadata } from "next";
import { FileText, FolderLock, ImageIcon } from "lucide-react";
import { requireAppContext } from "@/lib/auth";
import { signedUrls } from "@/lib/data/files";
import { UpgradeGate } from "@/components/upgrade-gate";
import { Card } from "@/components/ui/card";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { DOCUMENT_CATEGORIES } from "@/lib/constants";
import { addDaysToKey, todayKey } from "@/lib/time/calc";
import type { DocumentRow } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DeleteDocumentButton, DocumentDialog } from "./document-dialog";

export const metadata: Metadata = { title: "Documents" };

const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const size = (b: number) => (b > 1_000_000 ? `${(b / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1000))} KB`);

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const ctx = await requireAppContext();
  if (!ctx.entitlements.has("documents")) {
    return (
      <UpgradeGate
        title="Documents"
        description="Licences, certificates and training records in one secure place."
        points={["Store licences, tickets and certificates", "Expiry reminders before they lapse", "Private storage that only you can open", "Preview PDFs and photos on your phone"]}
      />
    );
  }
  const sp = await searchParams;
  const category = DOCUMENT_CATEGORIES.some((c) => c.value === sp.category) ? sp.category! : "";
  let q = ctx.supabase.from("documents").select("*").order("expires_on", { nullsFirst: false }).order("title");
  if (category) q = q.eq("category", category);
  const { data } = await q;
  const docs = (data ?? []) as DocumentRow[];
  const urls = await signedUrls(ctx, docs.map((d) => d.storage_path), 900);
  const today = todayKey(ctx.profile.timezone);
  const soon = addDaysToKey(today, 60);

  return (
    <div>
      <PageHeader title="Documents" description="Licences, certificates and training records, private to you." actions={<DocumentDialog userId={ctx.userId} />} />
      <div className="-mx-4 mb-5 flex gap-1.5 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
        <Link href="/documents" className={cn("shrink-0 rounded-full border px-3 py-1.5 text-[12.5px]", !category ? "border-primary/40 bg-primary-soft text-primary" : "border-border text-muted-foreground")}>
          All
        </Link>
        {DOCUMENT_CATEGORIES.map((c) => (
          <Link key={c.value} href={`/documents?category=${c.value}`} className={cn("shrink-0 rounded-full border px-3 py-1.5 text-[12.5px]", category === c.value ? "border-primary/40 bg-primary-soft text-primary" : "border-border text-muted-foreground")}>
            {c.label}
          </Link>
        ))}
      </div>
      {docs.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {docs.map((d) => {
            const expired = d.expires_on && d.expires_on < today;
            const expiring = d.expires_on && !expired && d.expires_on <= soon;
            const isPdf = d.mime_type === "application/pdf";
            return (
              <Card key={d.id} className="flex items-center gap-4 p-4">
                <a href={urls[d.storage_path]} target="_blank" rel="noreferrer" className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-subtle text-muted-foreground" aria-label={`Open ${d.title}`}>
                  {!isPdf && urls[d.storage_path] && !d.mime_type.includes("hei") ? (
                    // eslint-disable-next-line @next/next/no-img-element -- private signed URL
                    <img src={urls[d.storage_path]} alt="" className="size-full object-cover" loading="lazy" />
                  ) : isPdf ? (
                    <FileText className="size-6" />
                  ) : (
                    <ImageIcon className="size-6" />
                  )}
                </a>
                <div className="min-w-0 flex-1">
                  <a href={urls[d.storage_path]} target="_blank" rel="noreferrer" className="block truncate text-[15px] font-semibold hover:underline">
                    {d.title}
                  </a>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
                    <Badge tone="neutral">{DOCUMENT_CATEGORIES.find((c) => c.value === d.category)?.label}</Badge>
                    {expired ? <Badge tone="danger">Expired {fmt(d.expires_on!)}</Badge> : expiring ? <Badge tone="warning">Expires {fmt(d.expires_on!)}</Badge> : d.expires_on ? <span>Expires {fmt(d.expires_on)}</span> : null}
                    <span>{size(d.size_bytes)}</span>
                  </div>
                </div>
                <div className="flex">
                  <DocumentDialog userId={ctx.userId} doc={d} />
                  <DeleteDocumentButton id={d.id} />
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={<FolderLock />} title={category ? "Nothing in this category" : "Your document vault is empty"} description={category ? undefined : "Keep your White Card, licences, certificates and training records here, with reminders before they expire."} />
      )}
    </div>
  );
}
