"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, FileText, Loader2, Plus, ScanText, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { ActionForm, FieldError, SubmitButton, useActionCall } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import { compressImage, uploadUserFile } from "@/lib/upload";
import type { Expense } from "@/lib/types";
import { createReceipt, deleteExpense, saveExpense } from "./actions";

interface Extraction {
  is_receipt: boolean;
  merchant: string | null;
  purchase_date: string | null;
  total: number | null;
  gst: number | null;
  items: { description: string; amount: number | null }[];
  suggested_category: Expense["category"];
  uncertain_fields: string[];
}

type Values = {
  spent_on: string;
  merchant: string;
  amount: string;
  gst_amount: string;
  category: Expense["category"];
  description: string;
  work_notes: string;
};

export function ExpenseDialog({
  userId,
  scanAvailable,
  expense,
  receiptUrl,
  open,
  onOpenChange,
}: {
  userId: string;
  scanAvailable: boolean;
  expense?: Expense | null;
  receiptUrl?: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const blank: Values = { spent_on: today, merchant: "", amount: "", gst_amount: "", category: "tools", description: "", work_notes: "" };
  const fromExpense = (e: Expense): Values => ({
    spent_on: e.spent_on,
    merchant: e.merchant ?? "",
    amount: String(e.amount),
    gst_amount: e.gst_amount != null ? String(e.gst_amount) : "",
    category: e.category,
    description: e.description ?? "",
    work_notes: e.work_notes ?? "",
  });
  const [v, setV] = useState<Values>(expense ? fromExpense(expense) : blank);
  const [receiptId, setReceiptId] = useState<string | null>(expense?.receipt_id ?? null);
  const [preview, setPreview] = useState<{ url: string | null; pdf: boolean } | null>(receiptUrl ? { url: receiptUrl, pdf: false } : null);
  const [items, setItems] = useState<{ description: string; amount: number | null }[]>(expense?.items ?? []);
  const [fromAi, setFromAi] = useState(expense?.from_ai_extraction ?? false);
  const [uncertain, setUncertain] = useState<string[]>([]);
  const [busy, setBusy] = useState<"upload" | "scan" | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the form each time the dialog opens
    setV(expense ? fromExpense(expense) : blank);
    setReceiptId(expense?.receipt_id ?? null);
    setPreview(receiptUrl ? { url: receiptUrl, pdf: false } : null);
    setItems(expense?.items ?? []);
    setFromAi(expense?.from_ai_extraction ?? false);
    setUncertain([]);
    setScanError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, expense?.id]);

  const set = <K extends keyof Values>(k: K, val: Values[K]) => setV((p) => ({ ...p, [k]: val }));

  async function scan(id: string) {
    setBusy("scan");
    setScanError(null);
    try {
      const res = await fetch("/api/ai/receipt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ receiptId: id }) });
      const json = (await res.json()) as { result?: Extraction; error?: string };
      if (!res.ok || !json.result) {
        setScanError(json.error ?? "Couldn't scan this receipt.");
      } else if (!json.result.is_receipt) {
        setScanError("That doesn't look like a receipt. Enter the details manually.");
      } else {
        const r = json.result;
        setV((p) => ({
          ...p,
          merchant: r.merchant ?? p.merchant,
          spent_on: r.purchase_date && /^\d{4}-\d{2}-\d{2}$/.test(r.purchase_date) ? r.purchase_date : p.spent_on,
          amount: r.total != null ? r.total.toFixed(2) : p.amount,
          gst_amount: r.gst != null ? r.gst.toFixed(2) : p.gst_amount,
          category: r.suggested_category ?? p.category,
        }));
        setItems(r.items.slice(0, 30));
        setUncertain(r.uncertain_fields);
        setFromAi(true);
      }
    } catch {
      setScanError("Couldn't reach the scanning service.");
    }
    setBusy(null);
  }

  async function onFile(raw: File | undefined) {
    if (!raw) return;
    setBusy("upload");
    try {
      const file = await compressImage(raw, 2400, 0.85);
      const up = await uploadUserFile(userId, "receipts", file);
      const res = await createReceipt(up);
      if (!res.ok) throw new Error(res.error);
      setReceiptId(res.data.id);
      setPreview({ url: file.type.startsWith("image/") ? URL.createObjectURL(file) : null, pdf: file.type === "application/pdf" });
      setBusy(null);
      if (scanAvailable) await scan(res.data.id);
    } catch (e) {
      setBusy(null);
      toast.error(e instanceof Error ? e.message : "Upload failed");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={expense ? "Edit expense" : "Add expense"} description="Records are for your own review. Check with a tax professional about what you can claim.">
        <ActionForm action={saveExpense} onSuccess={() => onOpenChange(false)}>
          {expense ? <input type="hidden" name="id" value={expense.id} /> : null}
          <input type="hidden" name="receipt_id" value={receiptId ?? ""} />
          <input type="hidden" name="items_json" value={JSON.stringify(items)} />
          <input type="hidden" name="from_ai_extraction" value={String(fromAi)} />

          <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          {preview || receiptId ? (
            <div className="flex items-center gap-3 rounded-xl border border-border bg-subtle p-2.5">
              <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted">
                {preview?.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local preview / signed URL
                  <img src={preview.url} alt="Receipt" className="size-full object-cover" />
                ) : (
                  <FileText className="size-5 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1 text-[13px]">
                <div className="font-medium">Receipt attached</div>
                <div className="text-muted-foreground">{busy === "scan" ? "Reading receipt…" : fromAi ? "Details filled from the receipt. Please check them." : "Stored privately with this expense."}</div>
              </div>
              {busy === "scan" ? <Loader2 className="size-4 animate-spin text-primary" /> : null}
              {scanAvailable && receiptId && !busy ? (
                <Button type="button" size="sm" variant="ghost" onClick={() => scan(receiptId)}>
                  <ScanText /> Rescan
                </Button>
              ) : null}
              <button type="button" aria-label="Remove receipt" onClick={() => { setReceiptId(null); setPreview(null); setFromAi(false); }} className="text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" size="lg" disabled={Boolean(busy)} onClick={() => camRef.current?.click()} className="sm:hidden">
                <Camera /> Photograph receipt
              </Button>
              <Button type="button" variant="outline" size="lg" disabled={Boolean(busy)} onClick={() => fileRef.current?.click()} className="col-span-1 sm:col-span-2">
                {busy === "upload" ? <Loader2 className="animate-spin" /> : <FileText />} {busy === "upload" ? "Uploading…" : "Upload receipt"}
              </Button>
              {scanAvailable ? (
                <p className="col-span-2 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                  <Sparkles className="size-3.5 text-primary" /> We&apos;ll read the merchant, date and total for you to check.
                </p>
              ) : null}
            </div>
          )}
          {scanError ? <Alert tone="warning">{scanError}</Alert> : null}
          {fromAi && uncertain.length ? (
            <Alert tone="warning" title="Please double-check">
              The scan wasn&apos;t sure about: {uncertain.join(", ")}.
            </Alert>
          ) : null}

          <div className="grid grid-cols-2 gap-4">
            <Field label="Date" htmlFor="ex-date">
              <Input id="ex-date" name="spent_on" type="date" value={v.spent_on} onChange={(e) => set("spent_on", e.target.value)} required />
            </Field>
            <Field label="Category" htmlFor="ex-cat">
              <NativeSelect id="ex-cat" name="category" value={v.category} onChange={(e) => set("category", e.target.value as Values["category"])}>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Total (AUD)" htmlFor="ex-amount">
              <Input id="ex-amount" name="amount" inputMode="decimal" value={v.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0.00" required />
              <FieldError name="amount" />
            </Field>
            <Field label="GST (if shown)" htmlFor="ex-gst">
              <Input id="ex-gst" name="gst_amount" inputMode="decimal" value={v.gst_amount} onChange={(e) => set("gst_amount", e.target.value)} placeholder="0.00" />
              <FieldError name="gst_amount" />
            </Field>
          </div>
          <Field label="Merchant" htmlFor="ex-merchant">
            <Input id="ex-merchant" name="merchant" value={v.merchant} onChange={(e) => set("merchant", e.target.value)} placeholder="e.g. Bunnings" maxLength={160} />
          </Field>
          <Field label="Description" htmlFor="ex-desc">
            <Input id="ex-desc" name="description" value={v.description} onChange={(e) => set("description", e.target.value)} placeholder="e.g. Safety boots" maxLength={500} />
          </Field>
          {items.length ? (
            <div className="rounded-xl border border-border p-3 text-[13px]">
              <div className="mb-1.5 flex items-center justify-between font-medium">
                Items on receipt
                <button type="button" className="text-[12px] font-normal text-muted-foreground hover:text-foreground" onClick={() => setItems([])}>
                  Clear
                </button>
              </div>
              <ul className="space-y-0.5 text-muted-foreground">
                {items.map((i, idx) => (
                  <li key={idx} className="flex justify-between gap-3">
                    <span className="truncate">{i.description}</span>
                    <span className="tabular">{i.amount != null ? `$${i.amount.toFixed(2)}` : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <Field label="Work-related notes" htmlFor="ex-notes" hint="Why you bought it, for your own records.">
            <Textarea id="ex-notes" name="work_notes" value={v.work_notes} onChange={(e) => set("work_notes", e.target.value)} rows={2} maxLength={2000} />
          </Field>
          <SubmitButton size="lg" disabled={busy !== null}>
            {expense ? "Save changes" : "Save expense"}
          </SubmitButton>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

export function AddExpenseButton({ userId, scanAvailable, autoOpen }: { userId: string; scanAvailable: boolean; autoOpen?: boolean }) {
  const [open, setOpen] = useState(Boolean(autoOpen));
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus /> Add expense
      </Button>
      <ExpenseDialog userId={userId} scanAvailable={scanAvailable} open={open} onOpenChange={setOpen} />
    </>
  );
}

export function ExpenseRowActions({ userId, scanAvailable, expense, receiptUrl }: { userId: string; scanAvailable: boolean; expense: Expense; receiptUrl: string | null }) {
  const [open, setOpen] = useState(false);
  const { pending, run } = useActionCall();
  return (
    <div className="flex items-center gap-1">
      {receiptUrl ? (
        <Button asChild size="icon-sm" variant="ghost" aria-label="View receipt">
          <a href={receiptUrl} target="_blank" rel="noreferrer">
            <FileText />
          </a>
        </Button>
      ) : null}
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Edit
      </Button>
      <Button size="icon-sm" variant="ghost" aria-label="Delete expense" disabled={pending} onClick={() => confirm("Delete this expense and its receipt?") && run(() => deleteExpense(expense.id))}>
        <Trash2 />
      </Button>
      <ExpenseDialog userId={userId} scanAvailable={scanAvailable} expense={expense} receiptUrl={receiptUrl && !receiptUrl.includes(".pdf") ? receiptUrl : null} open={open} onOpenChange={setOpen} />
    </div>
  );
}
