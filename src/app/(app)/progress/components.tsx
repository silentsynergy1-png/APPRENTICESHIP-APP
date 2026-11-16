"use client";

import { useMemo, useState } from "react";
import { Check, ChevronRight, CircleCheck, Flag, FolderPlus, Pencil, Plus, ShieldCheck, Target, Trash2 } from "lucide-react";
import { ActionForm, FieldError, SubmitButton, useActionCall } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Alert, Badge, EmptyState, ProgressBar } from "@/components/ui/misc";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { COMPETENCY_STATUSES, TRADES } from "@/lib/constants";
import type { Apprenticeship, Competency, CompetencyCategory, CompetencyRecord, CompetencyStatus, LearningGoal, Milestone, TafeAssessment } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  addCompetencyRecord,
  deleteAssessment,
  deleteCategory,
  deleteCompetency,
  deleteCompetencyRecord,
  deleteGoalOrMilestone,
  saveApprenticeship,
  saveAssessment,
  saveCategory,
  saveCompetency,
  saveGoal,
  saveMilestone,
  setAssessmentStatus,
  setCompetencyStatus,
  setGoalStatus,
  toggleMilestone,
} from "./actions";

type Option = { id: string; name: string };
const fmtDate = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "");
const statusMeta = (s: CompetencyStatus) => COMPETENCY_STATUSES.find((x) => x.value === s)!;

/* --------------------------- apprenticeship details -------------------------- */
export function ApprenticeshipDialog({ app, employers }: { app: Apprenticeship | null; employers: Option[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil /> {app ? "Edit details" : "Set up"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Apprenticeship details">
          <ActionForm action={saveApprenticeship} onSuccess={() => setOpen(false)}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Trade" htmlFor="ap-trade">
                <NativeSelect id="ap-trade" name="trade" defaultValue={app?.trade ?? "electrical"}>
                  {TRADES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Employer" htmlFor="ap-employer">
                <NativeSelect id="ap-employer" name="employer_id" defaultValue={app?.employer_id ?? ""}>
                  <option value="">None</option>
                  {employers.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
            <Field label="Qualification" htmlFor="ap-qual">
              <Input id="ap-qual" name="qualification" defaultValue={app?.qualification ?? ""} placeholder="As written on your training plan" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Qualification code" htmlFor="ap-code" hint="Optional, from your training plan.">
                <Input id="ap-code" name="qualification_code" defaultValue={app?.qualification_code ?? ""} />
              </Field>
              <Field label="Training provider" htmlFor="ap-rto">
                <Input id="ap-rto" name="training_provider" defaultValue={app?.training_provider ?? ""} placeholder="e.g. TAFE NSW" />
              </Field>
              <Field label="Start date" htmlFor="ap-start">
                <Input id="ap-start" name="start_date" type="date" defaultValue={app?.start_date ?? ""} required />
                <FieldError name="start_date" />
              </Field>
              <Field label="Expected completion" htmlFor="ap-end">
                <Input id="ap-end" name="expected_completion_date" type="date" defaultValue={app?.expected_completion_date ?? ""} required />
                <FieldError name="expected_completion_date" />
              </Field>
            </div>
            <Field label="Notes" htmlFor="ap-notes">
              <Textarea id="ap-notes" name="notes" defaultValue={app?.notes ?? ""} rows={2} />
            </Field>
            <SubmitButton size="lg">Save</SubmitButton>
          </ActionForm>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* -------------------------------- competencies ------------------------------- */
export function CompetencyBoard({
  competencies,
  categories,
  records,
}: {
  competencies: Competency[];
  categories: CompetencyCategory[];
  records: CompetencyRecord[];
}) {
  const [filter, setFilter] = useState<"all" | "outstanding" | "tafe" | "signoff">("all");
  const [selected, setSelected] = useState<Competency | null>(null);
  const [editing, setEditing] = useState<Competency | "new" | null>(null);
  const [catOpen, setCatOpen] = useState(false);
  const { run } = useActionCall();

  const filtered = competencies.filter((c) =>
    filter === "all" ? true : filter === "outstanding" ? c.status !== "completed" : filter === "tafe" ? c.is_tafe_unit : c.status === "awaiting_signoff",
  );
  const groups = useMemo(() => {
    const g = categories.map((cat) => ({ id: cat.id, name: cat.name, items: filtered.filter((c) => c.category_id === cat.id) }));
    const none = filtered.filter((c) => !c.category_id || !categories.some((cat) => cat.id === c.category_id));
    if (none.length) g.push({ id: "none", name: "Uncategorised", items: none });
    return g;
  }, [categories, filtered]);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex max-w-full overflow-x-auto rounded-xl bg-muted p-1 text-[13px] font-medium scrollbar-none">
          {(
            [
              ["all", "All"],
              ["outstanding", "Still to learn"],
              ["tafe", "TAFE units"],
              ["signoff", "Awaiting sign-off"],
            ] as const
          ).map(([v, l]) => (
            <button key={v} type="button" onClick={() => setFilter(v)} className={cn("shrink-0 rounded-lg px-3 py-1.5 text-muted-foreground", filter === v && "bg-card text-foreground shadow-soft")}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setCatOpen(true)}>
            <FolderPlus /> Categories
          </Button>
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus /> Competency
          </Button>
        </div>
      </div>

      {competencies.length === 0 ? (
        <EmptyState
          icon={<Target />}
          title="Build your competency checklist"
          description="Add the units from your training plan and the practical skills you need to learn. Group them however suits your qualification."
          action={
            <Button onClick={() => setEditing("new")}>
              <Plus /> Add first competency
            </Button>
          }
        />
      ) : (
        <div className="grid gap-5">
          {groups
            .filter((g) => g.items.length || filter === "all")
            .map((g) => {
              const done = g.items.filter((c) => c.status === "completed").length;
              return (
                <section key={g.id} className="rounded-2xl border border-border bg-card shadow-card">
                  <div className="flex items-center gap-3 px-5 py-3.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-semibold">{g.name}</div>
                      <div className="text-[12px] text-muted-foreground">
                        {g.items.length ? `${done} of ${g.items.length} completed` : "Nothing here yet"}
                      </div>
                    </div>
                    {g.items.length ? <ProgressBar value={(done / g.items.length) * 100} className="w-24 sm:w-40" tone={done === g.items.length ? "success" : "primary"} /> : null}
                  </div>
                  {g.items.length ? (
                    <ul className="divide-y divide-border border-t border-border">
                      {g.items.map((c) => {
                        const recs = records.filter((r) => r.competency_id === c.id);
                        const signedOff = recs.some((r) => r.record_type === "signoff");
                        return (
                          <li key={c.id} className="flex items-center gap-3 px-5 py-3">
                            <button
                              type="button"
                              aria-label={c.status === "completed" ? "Completed" : "Mark completed"}
                              onClick={() => run(() => setCompetencyStatus(c.id, c.status === "completed" ? "practised" : "completed"))}
                              className={cn(
                                "grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors",
                                c.status === "completed" ? "border-success bg-success text-white" : "border-border hover:border-primary",
                              )}
                            >
                              {c.status === "completed" ? <Check className="size-3.5" /> : null}
                            </button>
                            <button type="button" onClick={() => setSelected(c)} className="min-w-0 flex-1 text-left">
                              <div className={cn("truncate text-[14px] font-medium", c.status === "completed" && "text-muted-foreground line-through decoration-muted-foreground/40")}>
                                {c.code ? <span className="mr-1.5 font-mono text-[12px] text-muted-foreground">{c.code}</span> : null}
                                {c.title}
                              </div>
                              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted-foreground">
                                {c.is_tafe_unit ? <Badge tone="outline">TAFE unit</Badge> : null}
                                {recs.length ? <span>{recs.filter((r) => r.record_type === "practice").length} practice logs</span> : null}
                                {signedOff ? (
                                  <span className="inline-flex items-center gap-1 text-success">
                                    <ShieldCheck className="size-3" /> Sign-off recorded
                                  </span>
                                ) : null}
                                {c.target_date && c.status !== "completed" ? <span>Target {fmtDate(c.target_date)}</span> : null}
                              </div>
                            </button>
                            <NativeSelect
                              aria-label={`Status of ${c.title}`}
                              value={c.status}
                              onChange={(e) => run(() => setCompetencyStatus(c.id, e.target.value as CompetencyStatus))}
                              className="h-9 w-[150px] text-[13px] sm:h-9"
                            >
                              {COMPETENCY_STATUSES.map((s) => (
                                <option key={s.value} value={s.value}>
                                  {s.label}
                                </option>
                              ))}
                            </NativeSelect>
                            <ChevronRight className="hidden size-4 text-muted-foreground sm:block" />
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </section>
              );
            })}
        </div>
      )}

      <CompetencyDetail
        competency={selected}
        records={selected ? records.filter((r) => r.competency_id === selected.id) : []}
        onClose={() => setSelected(null)}
        onEdit={(c) => {
          setSelected(null);
          setEditing(c);
        }}
      />
      <CompetencyEditor competency={editing} categories={categories} onClose={() => setEditing(null)} />
      <CategoryManager open={catOpen} onOpenChange={setCatOpen} categories={categories} />
    </div>
  );
}

function CompetencyEditor({ competency, categories, onClose }: { competency: Competency | "new" | null; categories: CompetencyCategory[]; onClose: () => void }) {
  const c = competency === "new" ? null : competency;
  return (
    <Dialog open={competency !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={c ? "Edit competency" : "Add competency"} description="Your own record of what you're learning. It isn't an official assessment.">
        <ActionForm action={saveCompetency} onSuccess={onClose}>
          {c ? <input type="hidden" name="id" value={c.id} /> : null}
          <Field label="Name" htmlFor="comp-title">
            <Input id="comp-title" name="title" defaultValue={c?.title ?? ""} placeholder="e.g. Install and terminate power circuits" required />
            <FieldError name="title" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Code (optional)" htmlFor="comp-code" hint="Unit code from your training plan.">
              <Input id="comp-code" name="code" defaultValue={c?.code ?? ""} />
            </Field>
            <Field label="Category" htmlFor="comp-cat">
              <NativeSelect id="comp-cat" name="category_id" defaultValue={c?.category_id ?? ""}>
                <option value="">Uncategorised</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Status" htmlFor="comp-status">
              <NativeSelect id="comp-status" name="status" defaultValue={c?.status ?? "not_started"}>
                {COMPETENCY_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Target date" htmlFor="comp-target">
              <Input id="comp-target" name="target_date" type="date" defaultValue={c?.target_date ?? ""} />
            </Field>
          </div>
          <Field label="Description" htmlFor="comp-desc">
            <Textarea id="comp-desc" name="description" defaultValue={c?.description ?? ""} rows={2} />
          </Field>
          <Checkbox name="is_tafe_unit" defaultChecked={c?.is_tafe_unit ?? false} label="This is a TAFE / training unit" />
          <SubmitButton size="lg">Save</SubmitButton>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

function CompetencyDetail({
  competency,
  records,
  onClose,
  onEdit,
}: {
  competency: Competency | null;
  records: CompetencyRecord[];
  onClose: () => void;
  onEdit: (c: Competency) => void;
}) {
  const { pending, run } = useActionCall();
  const [type, setType] = useState<"practice" | "signoff" | "note">("practice");
  if (!competency) return null;
  const meta = statusMeta(competency.status);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={competency.title} description={competency.code ?? undefined}>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge tone={meta.tone}>{meta.label}</Badge>
          {competency.is_tafe_unit ? <Badge tone="outline">TAFE unit</Badge> : null}
          {competency.completed_on ? <span className="text-[12px] text-muted-foreground">Completed {fmtDate(competency.completed_on)}</span> : null}
          <div className="ml-auto flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => onEdit(competency)}>
              <Pencil /> Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              disabled={pending}
              onClick={() => confirm("Delete this competency and its records?") && run(() => deleteCompetency(competency.id), { onSuccess: onClose })}
            >
              <Trash2 />
            </Button>
          </div>
        </div>
        {competency.description ? <p className="mb-4 text-[14px] text-muted-foreground">{competency.description}</p> : null}

        <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Records</div>
        {records.length ? (
          <ol className="mt-2 space-y-2">
            {records.map((r) => (
              <li key={r.id} className="flex items-start gap-3 rounded-xl bg-subtle p-3 text-[13px]">
                {r.record_type === "signoff" ? <ShieldCheck className="mt-0.5 size-4 text-success" /> : r.record_type === "practice" ? <CircleCheck className="mt-0.5 size-4 text-primary" /> : <Pencil className="mt-0.5 size-4 text-muted-foreground" />}
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {r.record_type === "signoff" ? `Sign-off by ${r.supervisor_name}` : r.record_type === "practice" ? "Practised" : "Note"}
                    <span className="ml-2 font-normal text-muted-foreground">{fmtDate(r.occurred_on)}</span>
                  </div>
                  {r.supervisor_licence ? <div className="text-muted-foreground">Licence {r.supervisor_licence}</div> : null}
                  {r.notes ? <div className="text-muted-foreground">{r.notes}</div> : null}
                  {r.diary_entry_id ? (
                    <a href={`/diary/${r.diary_entry_id}`} className="text-primary hover:underline">
                      View diary entry
                    </a>
                  ) : null}
                </div>
                <button type="button" aria-label="Remove record" className="text-muted-foreground hover:text-destructive" onClick={() => run(() => deleteCompetencyRecord(r.id))}>
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-[13px] text-muted-foreground">No practice logged yet.</p>
        )}

        <div className="mt-5 rounded-2xl border border-border p-4">
          <div className="mb-3 inline-flex rounded-lg bg-muted p-0.5 text-[12.5px] font-medium">
            {(["practice", "signoff", "note"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setType(t)} className={cn("rounded-md px-2.5 py-1 text-muted-foreground", type === t && "bg-card text-foreground shadow-soft")}>
                {t === "practice" ? "Log practice" : t === "signoff" ? "Record sign-off" : "Add note"}
              </button>
            ))}
          </div>
          <ActionForm action={addCompetencyRecord} resetOnSuccess>
            <input type="hidden" name="competency_id" value={competency.id} />
            <input type="hidden" name="record_type" value={type} />
            <Field label="Date" htmlFor="rec-date">
              <Input id="rec-date" name="occurred_on" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
            </Field>
            {type === "signoff" ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Supervisor name" htmlFor="rec-sup">
                    <Input id="rec-sup" name="supervisor_name" required />
                    <FieldError name="supervisor_name" />
                  </Field>
                  <Field label="Licence number" htmlFor="rec-lic">
                    <Input id="rec-lic" name="supervisor_licence" />
                  </Field>
                </div>
                <Alert tone="neutral">
                  This is your own record of a sign-off. Keep your official logbook or training record book up to date as well.
                </Alert>
              </>
            ) : null}
            <Field label="Notes" htmlFor="rec-notes">
              <Textarea id="rec-notes" name="notes" rows={2} />
            </Field>
            <SubmitButton>{type === "signoff" ? "Save sign-off" : type === "practice" ? "Log practice" : "Save note"}</SubmitButton>
          </ActionForm>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CategoryManager({ open, onOpenChange, categories }: { open: boolean; onOpenChange: (o: boolean) => void; categories: CompetencyCategory[] }) {
  const { pending, run } = useActionCall();
  const [name, setName] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Categories" description="Organise competencies to match your qualification.">
        <ul className="mb-4 divide-y divide-border rounded-xl border border-border">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center gap-2 px-3 py-2">
              <span className="flex-1 text-[14px]">{c.name}</span>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Rename ${c.name}`}
                onClick={() => {
                  const n = prompt("Rename category", c.name);
                  if (n && n.trim() && n !== c.name) run(() => saveCategory({ id: c.id, name: n }));
                }}
              >
                <Pencil />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Delete ${c.name}`}
                onClick={() => confirm(`Delete "${c.name}"? Its competencies will become uncategorised.`) && run(() => deleteCategory(c.id))}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
          {!categories.length ? <li className="px-3 py-3 text-[13px] text-muted-foreground">No categories yet.</li> : null}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) run(() => saveCategory({ name }), { onSuccess: () => setName("") });
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category" maxLength={120} />
          <Button type="submit" disabled={pending || !name.trim()}>
            Add
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ TAFE assessments ----------------------------- */
const ASSESSMENT_TONE = { upcoming: "primary", submitted: "warning", passed: "success", resubmit: "danger", cancelled: "neutral" } as const;

export function AssessmentList({ assessments, competencies, timezone }: { assessments: TafeAssessment[]; competencies: Competency[]; timezone: string }) {
  const [editing, setEditing] = useState<TafeAssessment | "new" | null>(null);
  const { run } = useActionCall();
  const now = Date.now();
  const e = editing === "new" ? null : editing;
  const localParts = (iso: string) => {
    const f = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
    const g = (t: string) => f.find((p) => p.type === t)?.value ?? "";
    return { date: `${g("year")}-${g("month")}-${g("day")}`, time: `${g("hour")}:${g("minute")}` };
  };
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus /> Assessment
        </Button>
      </div>
      {assessments.length ? (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card shadow-card">
          {assessments.map((a) => {
            const days = Math.ceil((new Date(a.due_at).getTime() - now) / 86_400_000);
            const overdue = a.status === "upcoming" && days < 0;
            return (
              <li key={a.id} className="flex items-center gap-3 px-5 py-3">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditing(a)}>
                  <div className="truncate text-[14px] font-medium">{a.title}</div>
                  <div className={cn("text-[12px] text-muted-foreground", overdue && "text-destructive")}>
                    Due {new Date(a.due_at).toLocaleString("en-AU", { timeZone: timezone, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                    {a.status === "upcoming" ? (overdue ? " · overdue" : days === 0 ? " · today" : ` · in ${days} day${days === 1 ? "" : "s"}`) : ""}
                  </div>
                </button>
                <NativeSelect
                  aria-label="Assessment status"
                  value={a.status}
                  onChange={(ev) => run(() => setAssessmentStatus(a.id, ev.target.value as TafeAssessment["status"]))}
                  className="h-9 w-[130px] text-[13px] sm:h-9"
                >
                  <option value="upcoming">Upcoming</option>
                  <option value="submitted">Submitted</option>
                  <option value="passed">Passed</option>
                  <option value="resubmit">Resubmit</option>
                  <option value="cancelled">Cancelled</option>
                </NativeSelect>
                <Badge tone={ASSESSMENT_TONE[a.status]} className="hidden capitalize sm:inline-flex">
                  {a.status}
                </Badge>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon={<Flag />} title="No assessments yet" description="Add TAFE assessment due dates and you'll get reminders before they're due." />
      )}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={e ? "Edit assessment" : "Add assessment"}>
          <ActionForm action={saveAssessment} onSuccess={() => setEditing(null)}>
            {e ? <input type="hidden" name="id" value={e.id} /> : null}
            <Field label="Assessment" htmlFor="as-title">
              <Input id="as-title" name="title" defaultValue={e?.title ?? ""} placeholder="e.g. Practical assessment: switchboards" required />
              <FieldError name="title" />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Due date" htmlFor="as-date">
                <Input id="as-date" name="due_date" type="date" defaultValue={e ? localParts(e.due_at).date : ""} required />
                <FieldError name="due_date" />
              </Field>
              <Field label="Time" htmlFor="as-time">
                <Input id="as-time" name="due_time" type="time" defaultValue={e ? localParts(e.due_at).time : "17:00"} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Linked competency" htmlFor="as-comp">
                <NativeSelect id="as-comp" name="competency_id" defaultValue={e?.competency_id ?? ""}>
                  <option value="">None</option>
                  {competencies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Status" htmlFor="as-status">
                <NativeSelect id="as-status" name="status" defaultValue={e?.status ?? "upcoming"}>
                  <option value="upcoming">Upcoming</option>
                  <option value="submitted">Submitted</option>
                  <option value="passed">Passed</option>
                  <option value="resubmit">Resubmit</option>
                  <option value="cancelled">Cancelled</option>
                </NativeSelect>
              </Field>
            </div>
            <Field label="Notes" htmlFor="as-notes">
              <Textarea id="as-notes" name="notes" defaultValue={e?.notes ?? ""} rows={2} />
            </Field>
            <SubmitButton size="lg">Save</SubmitButton>
            {e ? (
              <Button type="button" variant="ghost" className="text-destructive" onClick={() => confirm("Delete this assessment?") && run(() => deleteAssessment(e.id), { onSuccess: () => setEditing(null) })}>
                <Trash2 /> Delete
              </Button>
            ) : null}
          </ActionForm>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------------------- goals & milestones ---------------------------- */
export function GoalsPanel({ goals }: { goals: LearningGoal[] }) {
  const [open, setOpen] = useState(false);
  const { run } = useActionCall();
  const active = goals.filter((g) => g.status === "active");
  const achieved = goals.filter((g) => g.status === "achieved");
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus /> Goal
        </Button>
      </div>
      {goals.length ? (
        <ul className="space-y-2">
          {[...active, ...achieved].map((g) => (
            <li key={g.id} className="flex items-start gap-3 rounded-xl border border-border bg-card p-3.5 shadow-soft">
              <button
                type="button"
                aria-label={g.status === "achieved" ? "Mark active" : "Mark achieved"}
                onClick={() => run(() => setGoalStatus(g.id, g.status === "achieved" ? "active" : "achieved"))}
                className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border-2", g.status === "achieved" ? "border-success bg-success text-white" : "border-border hover:border-primary")}
              >
                {g.status === "achieved" ? <Check className="size-3" /> : null}
              </button>
              <div className="min-w-0 flex-1">
                <div className={cn("text-[14px] font-medium", g.status === "achieved" && "text-muted-foreground line-through")}>{g.title}</div>
                <div className="text-[12px] text-muted-foreground">
                  {g.status === "achieved" ? `Achieved ${fmtDate(g.achieved_on)}` : g.target_date ? `Target ${fmtDate(g.target_date)}` : "No target date"}
                </div>
                {g.notes ? <p className="mt-1 text-[13px] text-muted-foreground">{g.notes}</p> : null}
              </div>
              <button type="button" aria-label="Delete goal" className="text-muted-foreground hover:text-destructive" onClick={() => confirm("Delete this goal?") && run(() => deleteGoalOrMilestone("goal", g.id))}>
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<Target />} title="No learning goals yet" description="E.g. “Be confident terminating a three-phase motor by March”." className="py-8" />
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="New learning goal">
          <ActionForm action={saveGoal} onSuccess={() => setOpen(false)}>
            <Field label="Goal" htmlFor="goal-title">
              <Input id="goal-title" name="title" required placeholder="What do you want to get better at?" />
              <FieldError name="title" />
            </Field>
            <Field label="Target date" htmlFor="goal-date">
              <Input id="goal-date" name="target_date" type="date" />
            </Field>
            <Field label="Notes" htmlFor="goal-notes">
              <Textarea id="goal-notes" name="notes" rows={2} />
            </Field>
            <SubmitButton size="lg">Add goal</SubmitButton>
          </ActionForm>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export interface TimelinePoint {
  key: string;
  title: string;
  date: string | null;
  done: boolean;
  auto: boolean;
  milestone?: Milestone;
}

export function MilestoneTimeline({ points }: { points: TimelinePoint[] }) {
  const [open, setOpen] = useState(false);
  const { run } = useActionCall();
  return (
    <div>
      <ol className="relative space-y-4 border-l-2 border-border pl-6">
        {points.map((p) => (
          <li key={p.key} className="relative">
            <span
              className={cn(
                "absolute -left-[33px] top-0.5 grid size-5 place-items-center rounded-full border-2 bg-background",
                p.done ? "border-success bg-success text-white" : "border-border",
              )}
            >
              {p.done ? <Check className="size-3" /> : null}
            </span>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className={cn("text-[14px] font-medium", !p.done && "text-foreground")}>{p.title}</div>
                <div className="text-[12px] text-muted-foreground">{p.date ? fmtDate(p.date) : "No date"}</div>
              </div>
              {p.milestone ? (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => run(() => toggleMilestone(p.milestone!.id, !p.done))}>
                    {p.done ? "Undo" : "Reached"}
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Delete milestone" onClick={() => confirm("Delete this milestone?") && run(() => deleteGoalOrMilestone("milestone", p.milestone!.id))}>
                    <Trash2 />
                  </Button>
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      <Button size="sm" variant="outline" className="mt-5" onClick={() => setOpen(true)}>
        <Plus /> Milestone
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="New milestone" description="E.g. finished first-year TAFE block, first solo fit-off, capstone booked.">
          <ActionForm action={saveMilestone} onSuccess={() => setOpen(false)}>
            <Field label="Milestone" htmlFor="ms-title">
              <Input id="ms-title" name="title" required />
              <FieldError name="title" />
            </Field>
            <Field label="Target date" htmlFor="ms-date">
              <Input id="ms-date" name="target_date" type="date" />
            </Field>
            <Field label="Description" htmlFor="ms-desc">
              <Textarea id="ms-desc" name="description" rows={2} />
            </Field>
            <SubmitButton size="lg">Add milestone</SubmitButton>
          </ActionForm>
        </DialogContent>
      </Dialog>
    </div>
  );
}
