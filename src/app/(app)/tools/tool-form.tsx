"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, FileText, Loader2, Plus, Receipt, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { ActionForm, FieldError, SubmitButton, useActionCall } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { TOOL_CATEGORIES, TOOL_CONDITIONS, TOOL_STATUSES } from "@/lib/constants";
import { compressImage, uploadUserFile } from "@/lib/upload";
import type { Tool } from "@/lib/types";
import { addMaintenance, deleteTool, saveTool } from "./actions";

function FilePick({
  userId,
  label,
  icon,
  accept,
  name,
  initialPath,
  initialUrl,
}: {
  userId: string;
  label: string;
  icon: React.ReactNode;
  accept: string;
  name: string;
  initialPath: string | null;
  initialUrl: string | null;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [path, setPath] = useState(initialPath);
  const [preview, setPreview] = useState<string | null>(initialUrl);
  const [isPdf, setIsPdf] = useState(Boolean(initialPath?.endsWith(".pdf")));
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <input type="hidden" name={name} value={path ?? ""} />
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={async (e) => {
          const raw = e.target.files?.[0];
          if (!raw) return;
          setBusy(true);
          try {
            const file = await compressImage(raw);
            const up = await uploadUserFile(userId, "tools", file);
            setPath(up.path);
            setIsPdf(file.type === "application/pdf");
            setPreview(file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Upload failed");
          }
          setBusy(false);
          e.target.value = "";
        }}
      />
      {path ? (
        <div className="relative flex h-28 items-center justify-center overflow-hidden rounded-xl border border-border bg-subtle">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- local preview / signed URL
            <img src={preview} alt={label} className="size-full object-cover" />
          ) : (
            <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
              {isPdf ? <FileText className="size-4" /> : icon} File attached
            </span>
          )}
          <button
            type="button"
            aria-label={`Remove ${label}`}
            onClick={() => {
              setPath(null);
              setPreview(null);
            }}
            className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-background/90 shadow-soft"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={busy}
          className="flex h-28 w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-[13px] text-muted-foreground hover:border-primary/40 hover:bg-subtle"
        >
          {busy ? <Loader2 className="size-5 animate-spin" /> : icon}
          {busy ? "Uploading…" : label}
        </button>
      )}
    </div>
  );
}

export function ToolFields({ userId, tool, photoUrl, receiptUrl }: { userId: string; tool?: Tool | null; photoUrl?: string | null; receiptUrl?: string | null }) {
  return (
    <>
      {tool ? <input type="hidden" name="id" value={tool.id} /> : null}
      <div className="grid grid-cols-2 gap-3">
        <FilePick userId={userId} name="photo_path" label="Add photo" icon={<Camera className="size-5" />} accept="image/*" initialPath={tool?.photo_path ?? null} initialUrl={photoUrl ?? null} />
        <FilePick userId={userId} name="receipt_path" label="Attach receipt" icon={<Receipt className="size-5" />} accept="image/*,application/pdf" initialPath={tool?.receipt_path ?? null} initialUrl={receiptUrl ?? null} />
      </div>
      <Field label="Tool name" htmlFor="tool-name">
        <Input id="tool-name" name="name" defaultValue={tool?.name ?? ""} placeholder="e.g. 18V hammer drill" required />
        <FieldError name="name" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Brand" htmlFor="tool-brand">
          <Input id="tool-brand" name="brand" defaultValue={tool?.brand ?? ""} />
        </Field>
        <Field label="Model" htmlFor="tool-model">
          <Input id="tool-model" name="model" defaultValue={tool?.model ?? ""} />
        </Field>
        <Field label="Serial number" htmlFor="tool-serial">
          <Input id="tool-serial" name="serial_number" defaultValue={tool?.serial_number ?? ""} />
        </Field>
        <Field label="Category" htmlFor="tool-cat">
          <NativeSelect id="tool-cat" name="category" defaultValue={tool?.category ?? ""}>
            <option value="">None</option>
            {TOOL_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Purchase date" htmlFor="tool-date">
          <Input id="tool-date" name="purchase_date" type="date" defaultValue={tool?.purchase_date ?? ""} />
        </Field>
        <Field label="Price (AUD)" htmlFor="tool-price">
          <Input id="tool-price" name="purchase_price" inputMode="decimal" defaultValue={tool?.purchase_price ?? ""} placeholder="0.00" />
          <FieldError name="purchase_price" />
        </Field>
        <Field label="Warranty expires" htmlFor="tool-warranty">
          <Input id="tool-warranty" name="warranty_expires_on" type="date" defaultValue={tool?.warranty_expires_on ?? ""} />
        </Field>
        <Field label="Next maintenance" htmlFor="tool-maint">
          <Input id="tool-maint" name="next_maintenance_on" type="date" defaultValue={tool?.next_maintenance_on ?? ""} />
        </Field>
        <Field label="Condition" htmlFor="tool-cond">
          <NativeSelect id="tool-cond" name="condition" defaultValue={tool?.condition ?? "good"}>
            {TOOL_CONDITIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Status" htmlFor="tool-status">
          <NativeSelect id="tool-status" name="status" defaultValue={tool?.status ?? "available"}>
            {TOOL_STATUSES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <Field label="Notes" htmlFor="tool-notes">
        <Textarea id="tool-notes" name="notes" defaultValue={tool?.notes ?? ""} rows={2} placeholder="e.g. Lent to Sam on 3 Nov" />
      </Field>
    </>
  );
}

export function NewToolButton({ userId, autoOpen }: { userId: string; autoOpen?: boolean }) {
  const [open, setOpen] = useState(Boolean(autoOpen));
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus /> Add tool
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Add tool">
          <ActionForm action={saveTool} onSuccess={() => setOpen(false)} resetOnSuccess>
            <ToolFields userId={userId} />
            <SubmitButton size="lg">Save tool</SubmitButton>
          </ActionForm>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function EditToolForm({ userId, tool, photoUrl, receiptUrl }: { userId: string; tool: Tool; photoUrl: string | null; receiptUrl: string | null }) {
  return (
    <ActionForm action={saveTool}>
      <ToolFields userId={userId} tool={tool} photoUrl={photoUrl} receiptUrl={receiptUrl} />
      <SubmitButton>Save changes</SubmitButton>
    </ActionForm>
  );
}

export function MaintenanceForm({ toolId }: { toolId: string }) {
  return (
    <ActionForm action={addMaintenance} resetOnSuccess>
      <input type="hidden" name="tool_id" value={toolId} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" htmlFor="m-date">
          <Input id="m-date" name="performed_on" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
        </Field>
        <Field label="Cost (AUD)" htmlFor="m-cost">
          <Input id="m-cost" name="cost" inputMode="decimal" placeholder="0.00" />
        </Field>
      </div>
      <Field label="What was done" htmlFor="m-desc">
        <Input id="m-desc" name="description" placeholder="e.g. Replaced brushes, test and tag" required />
        <FieldError name="description" />
      </Field>
      <Field label="Next due (optional)" htmlFor="m-next">
        <Input id="m-next" name="next_maintenance_on" type="date" />
      </Field>
      <SubmitButton variant="outline">Log maintenance</SubmitButton>
    </ActionForm>
  );
}

export function DeleteToolButton({ id }: { id: string }) {
  const router = useRouter();
  const { pending, run } = useActionCall();
  return (
    <Button
      variant="ghost"
      className="text-destructive hover:bg-destructive-soft"
      disabled={pending}
      onClick={() => confirm("Delete this tool, its photo and receipt?") && run(() => deleteTool(id), { onSuccess: () => router.push("/tools"), refresh: false })}
    >
      <Trash2 /> Delete tool
    </Button>
  );
}
