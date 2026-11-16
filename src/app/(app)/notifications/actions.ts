"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserForAction } from "@/lib/auth";
import { dbError, fail, formToObject, ok, optionalText, safeAction, zodFail, type ActionResult } from "@/lib/actions";
import { localInputToIso } from "@/lib/time/calc";

function revalidate() {
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
  revalidatePath("/", "layout");
}

export async function markNotifications(ids: string[] | "all", action: "read" | "dismiss"): Promise<ActionResult<null>> {
  return safeAction("markNotifications", async () => {
    const ctx = await requireUserForAction();
    const now = new Date().toISOString();
    const patch = action === "read" ? { read_at: now } : { dismissed_at: now, read_at: now };
    let q = ctx.supabase.from("notifications").update(patch);
    if (ids === "all") q = q.is(action === "read" ? "read_at" : "dismissed_at", null);
    else {
      const parsed = z.array(z.uuid()).max(500).safeParse(ids);
      if (!parsed.success || !parsed.data.length) return fail("Nothing selected.");
      q = q.in("id", parsed.data);
    }
    const { error } = await q;
    if (error) return fail(dbError(error));
    revalidate();
    return ok(null);
  });
}

const reminderSchema = z.object({
  title: z.string().trim().min(1, "What should we remind you about?").max(200),
  due_local: z.string().min(1, "Pick a date and time"),
  notes: optionalText(2000),
});

export async function addReminder(fd: FormData): Promise<ActionResult<null>> {
  return safeAction("addReminder", async () => {
    const ctx = await requireUserForAction();
    const parsed = reminderSchema.safeParse(formToObject(fd));
    if (!parsed.success) return zodFail(parsed.error);
    const due_at = localInputToIso(parsed.data.due_local, ctx.profile.timezone);
    if (!due_at) return fail("Pick a valid date and time.", { due_local: "Invalid date" });
    const { error } = await ctx.supabase.from("reminders").insert({ user_id: ctx.userId, title: parsed.data.title, notes: parsed.data.notes, due_at });
    if (error) return fail(dbError(error));
    await ctx.supabase.rpc("refresh_notifications");
    revalidate();
    return ok(null, "Reminder set");
  });
}

export async function completeReminder(id: string, done: boolean): Promise<ActionResult<null>> {
  return safeAction("completeReminder", async () => {
    const ctx = await requireUserForAction();
    if (!z.uuid().safeParse(id).success) return fail("Invalid reminder.");
    const { error } = await ctx.supabase.from("reminders").update({ completed_at: done ? new Date().toISOString() : null }).eq("id", id);
    if (error) return fail(dbError(error));
    if (done) {
      // Clear the alert that belonged to this reminder.
      await ctx.supabase.from("notifications").update({ dismissed_at: new Date().toISOString(), read_at: new Date().toISOString() }).like("dedupe_key", `reminder:${id}:%`);
    }
    revalidate();
    return ok(null, done ? "Done" : undefined);
  });
}

export async function deleteReminder(id: string): Promise<ActionResult<null>> {
  return safeAction("deleteReminder", async () => {
    const ctx = await requireUserForAction();
    if (!z.uuid().safeParse(id).success) return fail("Invalid reminder.");
    const { error } = await ctx.supabase.from("reminders").delete().eq("id", id);
    if (error) return fail(dbError(error));
    revalidate();
    return ok(null, "Reminder deleted");
  });
}
