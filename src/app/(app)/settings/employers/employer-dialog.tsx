"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, Pencil, Plus } from "lucide-react";
import { ActionForm, FieldError, SubmitButton, useActionCall } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import type { Employer } from "@/lib/types";
import { archiveEmployer, saveEmployer } from "../actions";

export function EmployerDialog({ employer }: { employer?: Employer }) {
  const [open, setOpen] = useState(false);
  const e = employer;
  return (
    <>
      {e ? (
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Pencil /> Edit
        </Button>
      ) : (
        <Button onClick={() => setOpen(true)}>
          <Plus /> Add employer
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={e ? "Edit employer" : "Add employer"}>
          <ActionForm action={saveEmployer} onSuccess={() => setOpen(false)}>
            {e ? <input type="hidden" name="id" value={e.id} /> : null}
            <Field label="Business name" htmlFor="emp-name">
              <Input id="emp-name" name="name" defaultValue={e?.name ?? ""} maxLength={160} required />
              <FieldError name="name" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="ABN" htmlFor="emp-abn">
                <Input id="emp-abn" name="abn" defaultValue={e?.abn ?? ""} inputMode="numeric" placeholder="11 digits" />
                <FieldError name="abn" />
              </Field>
              <Field label="Phone" htmlFor="emp-phone">
                <Input id="emp-phone" name="phone" type="tel" defaultValue={e?.phone ?? ""} />
              </Field>
              <Field label="Email" htmlFor="emp-email">
                <Input id="emp-email" name="email" type="email" defaultValue={e?.email ?? ""} />
                <FieldError name="email" />
              </Field>
              <Field label="Address" htmlFor="emp-address">
                <Input id="emp-address" name="address" defaultValue={e?.address ?? ""} />
              </Field>
            </div>
            <div className="pt-1 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Supervisor</div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" htmlFor="sup-name">
                <Input id="sup-name" name="supervisor_name" defaultValue={e?.supervisor_name ?? ""} />
              </Field>
              <Field label="Licence number" htmlFor="sup-licence">
                <Input id="sup-licence" name="supervisor_licence" defaultValue={e?.supervisor_licence ?? ""} />
              </Field>
              <Field label="Phone" htmlFor="sup-phone">
                <Input id="sup-phone" name="supervisor_phone" type="tel" defaultValue={e?.supervisor_phone ?? ""} />
              </Field>
              <Field label="Email" htmlFor="sup-email">
                <Input id="sup-email" name="supervisor_email" type="email" defaultValue={e?.supervisor_email ?? ""} />
                <FieldError name="supervisor_email" />
              </Field>
            </div>
            <Field label="Notes" htmlFor="emp-notes">
              <Textarea id="emp-notes" name="notes" defaultValue={e?.notes ?? ""} rows={2} />
            </Field>
            <Checkbox name="is_primary" defaultChecked={e?.is_primary ?? false} label="This is my main employer" description="Selected by default when you clock in." />
            <SubmitButton size="lg">Save</SubmitButton>
          </ActionForm>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function EmployerArchiveButton({ id, archived }: { id: string; archived: boolean }) {
  const { pending, run } = useActionCall();
  return (
    <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => archiveEmployer(id, !archived))}>
      {archived ? <ArchiveRestore /> : <Archive />} {archived ? "Restore" : "Archive"}
    </Button>
  );
}
