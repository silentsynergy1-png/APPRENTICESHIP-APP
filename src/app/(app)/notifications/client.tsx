"use client";

import { useState } from "react";
import Link from "next/link";
import { BellRing, Check, CheckCheck, Clock, Plus, Trash2, X } from "lucide-react";
import { ActionForm, FieldError, SubmitButton, useActionCall } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import type { NotificationRow, Reminder } from "@/lib/types";
import { cn } from "@/lib/utils";
import { addReminder, completeReminder, deleteReminder, markNotifications } from "./actions";

const fmt = (iso: string, tz: string) => new Date(iso).toLocaleString("en-AU", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export function NotificationList({ items, timezone }: { items: NotificationRow[]; timezone: string }) {
  const { pending, run } = useActionCall();
  const unread = items.filter((n) => !n.read_at);
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[13px] text-muted-foreground">{unread.length ? `${unread.length} unread` : "All caught up"}</p>
        {unread.length ? (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => markNotifications("all", "read"))}>
            <CheckCheck /> Mark all read
          </Button>
        ) : null}
      </div>
      {items.length ? (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card shadow-card">
          {items.map((n) => (
            <li key={n.id} className={cn("flex items-start gap-3 px-4 py-3.5 sm:px-5", !n.read_at && "bg-primary-soft/25")}>
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : n.kind === "forgotten_clock_out" ? "bg-warning" : "bg-primary")} />
              <Link
                href={n.link_path ?? "/notifications"}
                className="min-w-0 flex-1"
                onClick={() => !n.read_at && run(() => markNotifications([n.id], "read"), { refresh: false })}
              >
                <div className="text-[14px] font-medium">{n.title}</div>
                {n.body ? <div className="text-[13px] text-muted-foreground">{n.body}</div> : null}
                <div className="mt-0.5 text-[11.5px] text-muted-foreground">{fmt(n.created_at, timezone)}</div>
              </Link>
              <div className="flex shrink-0">
                {!n.read_at ? (
                  <Button size="icon-sm" variant="ghost" aria-label="Mark read" onClick={() => run(() => markNotifications([n.id], "read"))}>
                    <Check />
                  </Button>
                ) : null}
                <Button size="icon-sm" variant="ghost" aria-label="Dismiss" onClick={() => run(() => markNotifications([n.id], "dismiss"))}>
                  <X />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center text-[13px] text-muted-foreground">
          <BellRing className="mx-auto mb-2 size-5" />
          Alerts for assessments, expiring documents, warranties, timesheets and your reminders will appear here.
        </div>
      )}
    </div>
  );
}

export function ReminderPanel({ reminders, timezone }: { reminders: Reminder[]; timezone: string }) {
  const [open, setOpen] = useState(false);
  const { run } = useActionCall();
  const now = useState(() => Date.now())[0];
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[13px] text-muted-foreground">Your own reminders</p>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus /> Reminder
        </Button>
      </div>
      {reminders.length ? (
        <ul className="space-y-2">
          {reminders.map((r) => {
            const overdue = !r.completed_at && new Date(r.due_at).getTime() < now;
            return (
              <li key={r.id} className="flex items-start gap-3 rounded-xl border border-border bg-card p-3.5 shadow-soft">
                <button
                  type="button"
                  aria-label={r.completed_at ? "Mark not done" : "Mark done"}
                  onClick={() => run(() => completeReminder(r.id, !r.completed_at))}
                  className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border-2", r.completed_at ? "border-success bg-success text-white" : "border-border hover:border-primary")}
                >
                  {r.completed_at ? <Check className="size-3" /> : null}
                </button>
                <div className="min-w-0 flex-1">
                  <div className={cn("text-[14px] font-medium", r.completed_at && "text-muted-foreground line-through")}>{r.title}</div>
                  <div className={cn("flex items-center gap-1 text-[12px] text-muted-foreground", overdue && "text-destructive")}>
                    <Clock className="size-3" /> {fmt(r.due_at, timezone)}
                    {overdue ? " · overdue" : ""}
                  </div>
                  {r.notes ? <p className="mt-1 text-[13px] text-muted-foreground">{r.notes}</p> : null}
                </div>
                <button type="button" aria-label="Delete reminder" className="text-muted-foreground hover:text-destructive" onClick={() => run(() => deleteReminder(r.id))}>
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground">No reminders yet.</p>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="New reminder">
          <ActionForm action={addReminder} onSuccess={() => setOpen(false)}>
            <Field label="Remind me to…" htmlFor="rem-title">
              <Input id="rem-title" name="title" placeholder="e.g. Hand in timesheet to supervisor" required />
              <FieldError name="title" />
            </Field>
            <Field label="When" htmlFor="rem-due">
              <Input id="rem-due" name="due_local" type="datetime-local" required />
              <FieldError name="due_local" />
            </Field>
            <Field label="Notes" htmlFor="rem-notes">
              <Textarea id="rem-notes" name="notes" rows={2} />
            </Field>
            <SubmitButton size="lg">Set reminder</SubmitButton>
          </ActionForm>
        </DialogContent>
      </Dialog>
    </div>
  );
}
