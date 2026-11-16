"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserForAction } from "@/lib/auth";
import { dbError, fail, formToObject, ok, optionalDate, optionalMoney, optionalText, safeAction, zodFail, type ActionResult } from "@/lib/actions";

const pathFor = (userId: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || (v.startsWith(`${userId}/tools/`) && v.length <= 500), "Invalid file");

function schema(userId: string) {
  return z.object({
    id: z.uuid().optional(),
    name: z.string().trim().min(1, "Name the tool").max(160),
    brand: optionalText(80),
    model: optionalText(80),
    serial_number: optionalText(120),
    category: optionalText(80),
    purchase_date: optionalDate,
    purchase_price: optionalMoney,
    warranty_expires_on: optionalDate,
    next_maintenance_on: optionalDate,
    condition: z.enum(["new", "good", "fair", "poor"]).default("good"),
    status: z.enum(["available", "lent", "lost", "damaged", "retired"]).default("available"),
    notes: optionalText(4000),
    photo_path: pathFor(userId),
    receipt_path: pathFor(userId),
  });
}

function revalidate(id?: string) {
  revalidatePath("/tools");
  if (id) revalidatePath(`/tools/${id}`);
}

export async function saveTool(fd: FormData): Promise<ActionResult<{ id: string }>> {
  return safeAction<{ id: string }>("saveTool", async () => {
    const ctx = await requireUserForAction();
    const parsed = schema(ctx.userId).safeParse(formToObject(fd));
    if (!parsed.success) return zodFail(parsed.error);
    const { id, ...v } = parsed.data;

    if (id) {
      const { data: prev } = await ctx.supabase.from("tools").select("photo_path, receipt_path").eq("id", id).maybeSingle();
      if (!prev) return fail("Tool not found.");
      const { error } = await ctx.supabase.from("tools").update(v).eq("id", id);
      if (error) return fail(dbError(error));
      // Remove files that were replaced or cleared.
      const stale = [prev.photo_path !== v.photo_path ? prev.photo_path : null, prev.receipt_path !== v.receipt_path ? prev.receipt_path : null].filter(Boolean) as string[];
      if (stale.length) await ctx.supabase.storage.from("user-files").remove(stale);
      revalidate(id);
      return ok({ id }, "Tool saved");
    }

    const limit = ctx.entitlements.plan.limits.tools;
    if (limit !== null) {
      const { count } = await ctx.supabase.from("tools").select("id", { count: "exact", head: true });
      if ((count ?? 0) >= limit) return { ok: false, error: `The Free plan includes up to ${limit} tools.`, upgrade: true };
    }
    const { data, error } = await ctx.supabase.from("tools").insert({ ...v, user_id: ctx.userId }).select("id").single();
    if (error) return fail(dbError(error));
    revalidate();
    return ok({ id: data.id }, "Tool added");
  });
}

export async function setToolStatus(id: string, status: "available" | "lent" | "lost" | "damaged" | "retired"): Promise<ActionResult<null>> {
  return safeAction("toolStatus", async () => {
    const ctx = await requireUserForAction();
    const parsed = z.object({ id: z.uuid(), status: z.enum(["available", "lent", "lost", "damaged", "retired"]) }).safeParse({ id, status });
    if (!parsed.success) return fail("Invalid status.");
    const { error } = await ctx.supabase.from("tools").update({ status }).eq("id", id);
    if (error) return fail(dbError(error));
    revalidate(id);
    return ok(null, "Status updated");
  });
}

export async function deleteTool(id: string): Promise<ActionResult<null>> {
  return safeAction("deleteTool", async () => {
    const ctx = await requireUserForAction();
    if (!z.uuid().safeParse(id).success) return fail("Invalid tool.");
    const { data: t } = await ctx.supabase.from("tools").select("photo_path, receipt_path").eq("id", id).maybeSingle();
    const { error } = await ctx.supabase.from("tools").delete().eq("id", id);
    if (error) return fail(dbError(error));
    const files = [t?.photo_path, t?.receipt_path].filter(Boolean) as string[];
    if (files.length) await ctx.supabase.storage.from("user-files").remove(files);
    revalidate();
    return ok(null, "Tool deleted");
  });
}

const maintenanceSchema = z.object({
  tool_id: z.uuid(),
  performed_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  description: z.string().trim().min(1, "What was done?").max(1000),
  cost: optionalMoney,
  next_maintenance_on: optionalDate,
});

export async function addMaintenance(fd: FormData): Promise<ActionResult<null>> {
  return safeAction("addMaintenance", async () => {
    const ctx = await requireUserForAction();
    const parsed = maintenanceSchema.safeParse(formToObject(fd));
    if (!parsed.success) return zodFail(parsed.error);
    const { next_maintenance_on, ...v } = parsed.data;
    const { error } = await ctx.supabase.from("tool_maintenance").insert({ ...v, user_id: ctx.userId });
    if (error) return fail(dbError(error));
    await ctx.supabase.from("tools").update({ next_maintenance_on }).eq("id", v.tool_id);
    revalidate(v.tool_id);
    return ok(null, "Maintenance logged");
  });
}

export async function deleteMaintenance(id: string, toolId: string): Promise<ActionResult<null>> {
  return safeAction("deleteMaintenance", async () => {
    const ctx = await requireUserForAction();
    if (!z.uuid().safeParse(id).success) return fail("Invalid record.");
    const { error } = await ctx.supabase.from("tool_maintenance").delete().eq("id", id);
    if (error) return fail(dbError(error));
    revalidate(toolId);
    return ok(null, "Removed");
  });
}
