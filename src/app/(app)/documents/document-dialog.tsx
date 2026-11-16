"use client";

import { useRef, useState } from "react";
import { FileUp, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ActionForm, FieldError, SubmitButton, useActionCall } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { DOCUMENT_CATEGORIES } from "@/lib/constants";
import { compressImage, uploadUserFile } from "@/lib/upload";
import type { DocumentRow } from "@/lib/types";
import { deleteDocument, saveDocument } from "./actions";

export function DocumentDialog({ userId, doc }: { userId: string; doc?: DocumentRow }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<{ path: string; mime: string; size: number; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      {doc ? (
        <Button size="icon-sm" variant="ghost" aria-label="Edit document" onClick={() => setOpen(true)}>
          <Pencil />
        </Button>
      ) : (
        <Button onClick={() => setOpen(true)}>
          <Plus /> Add document
        </Button>
      )}
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setFile(null);
        }}
      >
        <DialogContent title={doc ? "Edit document" : "Add document"} description="Stored privately. Only you can open it.">
          <ActionForm action={saveDocument} onSuccess={() => { setOpen(false); setFile(null); }}>
            {doc ? <input type="hidden" name="id" value={doc.id} /> : null}
            {!doc ? (
              <>
                <input type="hidden" name="storage_path" value={file?.path ?? ""} />
                <input type="hidden" name="mime_type" value={file?.mime ?? ""} />
                <input type="hidden" name="size_bytes" value={file?.size ?? ""} />
                <input
                  ref={ref}
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const raw = e.target.files?.[0];
                    if (!raw) return;
                    setBusy(true);
                    try {
                      const f = await compressImage(raw, 2600, 0.88);
                      const up = await uploadUserFile(userId, "documents", f);
                      setFile({ ...up, name: raw.name });
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Upload failed");
                    }
                    setBusy(false);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => ref.current?.click()}
                  disabled={busy}
                  className="flex h-24 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-[13px] text-muted-foreground hover:border-primary/40 hover:bg-subtle"
                >
                  {busy ? <Loader2 className="size-5 animate-spin" /> : <FileUp className="size-5" />}
                  {busy ? "Uploading…" : file ? file.name : "Choose a PDF or photo"}
                </button>
                <FieldError name="file" />
              </>
            ) : null}
            <Field label="Name" htmlFor="doc-title">
              <Input id="doc-title" name="title" defaultValue={doc?.title ?? ""} placeholder="e.g. White Card" required />
              <FieldError name="title" />
            </Field>
            <Field label="Category" htmlFor="doc-cat">
              <NativeSelect id="doc-cat" name="category" defaultValue={doc?.category ?? "licence"}>
                {DOCUMENT_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Issued" htmlFor="doc-issued">
                <Input id="doc-issued" name="issued_on" type="date" defaultValue={doc?.issued_on ?? ""} />
              </Field>
              <Field label="Expires" htmlFor="doc-expires" hint="You'll be reminded 60 days before.">
                <Input id="doc-expires" name="expires_on" type="date" defaultValue={doc?.expires_on ?? ""} />
                <FieldError name="expires_on" />
              </Field>
            </div>
            <Field label="Notes" htmlFor="doc-notes">
              <Textarea id="doc-notes" name="notes" defaultValue={doc?.notes ?? ""} rows={2} />
            </Field>
            <SubmitButton size="lg" disabled={busy || (!doc && !file)}>
              Save
            </SubmitButton>
          </ActionForm>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function DeleteDocumentButton({ id }: { id: string }) {
  const { pending, run } = useActionCall();
  return (
    <Button size="icon-sm" variant="ghost" aria-label="Delete document" disabled={pending} onClick={() => confirm("Delete this document permanently?") && run(() => deleteDocument(id))}>
      <Trash2 />
    </Button>
  );
}
