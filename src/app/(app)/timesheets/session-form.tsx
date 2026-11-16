"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { ActionForm, FieldError, SubmitButton } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import type { ApprovalStatus } from "@/lib/types";
import { createManualSession, updateSession } from "./actions";

export interface SessionFormValues {
  id?: string;
  start_local: string;
  end_local: string;
  break_minutes: number;
  employer_id: string | null;
  job_site_id: string | null;
  address: string | null;
  notes: string | null;
  approval_status?: ApprovalStatus;
}

type Option = { id: string; name: string };

export function SessionFields({
  values,
  employers,
  jobSites,
  editing,
}: {
  values: SessionFormValues;
  employers: Option[];
  jobSites: Option[];
  editing: boolean;
}) {
  return (
    <>
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Start" htmlFor="start_local">
          <Input id="start_local" name="start_local" type="datetime-local" defaultValue={values.start_local} required />
          <FieldError name="start_local" />
        </Field>
        <Field label="Finish" htmlFor="end_local">
          <Input id="end_local" name="end_local" type="datetime-local" defaultValue={values.end_local} required />
          <FieldError name="end_local" />
        </Field>
      </div>
      <Field label="Unpaid break (minutes)" htmlFor="break_minutes" hint="Deducted from your worked hours.">
        <Input id="break_minutes" name="break_minutes" type="number" inputMode="numeric" min={0} max={600} step={5} defaultValue={values.break_minutes} />
        <FieldError name="break_minutes" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Employer" htmlFor="employer_id">
          <NativeSelect id="employer_id" name="employer_id" defaultValue={values.employer_id ?? ""}>
            <option value="">None</option>
            {employers.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Job site" htmlFor="job_site_id">
          <NativeSelect id="job_site_id" name="job_site_id" defaultValue={values.job_site_id ?? ""}>
            <option value="">None</option>
            {jobSites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <Field label="Address" htmlFor="address" hint={editing ? "Changing this marks the address as entered manually." : "Optional."}>
        <Input id="address" name="address" defaultValue={values.address ?? ""} maxLength={300} placeholder="e.g. 15 Hawkesbury Rd, Westmead NSW" />
      </Field>
      <Field label="Notes" htmlFor="notes">
        <Textarea id="notes" name="notes" defaultValue={values.notes ?? ""} maxLength={4000} rows={3} />
      </Field>
      {editing ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Status" htmlFor="approval_status">
            <NativeSelect id="approval_status" name="approval_status" defaultValue={values.approval_status ?? "draft"}>
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </NativeSelect>
          </Field>
          <Field label="Reason for change (optional)" htmlFor="change_reason" hint="Saved in this session's history.">
            <Input id="change_reason" name="change_reason" maxLength={500} placeholder="e.g. Forgot to clock out" />
          </Field>
        </div>
      ) : null}
    </>
  );
}

export function AddSessionButton({
  employers,
  jobSites,
  defaultDate,
  label = "Add manually",
  primaryEmployerId,
}: {
  employers: Option[];
  jobSites: Option[];
  defaultDate: string;
  label?: string;
  primaryEmployerId: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus /> {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Add a work session" description="For days you didn't clock in, or worked offline.">
          <ActionForm action={createManualSession} onSuccess={() => setOpen(false)} successMessage="Session added">
            <SessionFields
              editing={false}
              employers={employers}
              jobSites={jobSites}
              values={{
                start_local: `${defaultDate}T07:00`,
                end_local: `${defaultDate}T15:30`,
                break_minutes: 30,
                employer_id: primaryEmployerId,
                job_site_id: null,
                address: null,
                notes: null,
              }}
            />
            <SubmitButton size="lg">Save session</SubmitButton>
          </ActionForm>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function EditSessionForm({ values, employers, jobSites }: { values: SessionFormValues; employers: Option[]; jobSites: Option[] }) {
  return (
    <ActionForm action={updateSession} successMessage="Session updated">
      <SessionFields editing values={values} employers={employers} jobSites={jobSites} />
      <SubmitButton size="lg">Save changes</SubmitButton>
    </ActionForm>
  );
}
