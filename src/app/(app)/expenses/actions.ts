"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertFeature, requireUserForAction } from "@/lib/auth";
import { dbError, fail, formToObject, ok, optionalMoney, optionalText, optionalUuid, safeAction, zodFail, type ActionResult } from "@/lib/actions";

const RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];

/** Records a receipt file the browser uploaded into the user's own folder. */
export async function createReceipt(input: { path: string; mime: string; size: number }): Promise<ActionResult<{ id: string }>> {
  return safeAction<{ id: string }>("createReceipt", async () => {
    const ctx = await requireUserForAction();
    assertFeature(ctx, "expenses");
    const parsed = z
      .object({
        path: z.string().max(500).refine((p) => p.startsWith(`${ctx.userId}/receipts/`), "Invalid file location"),
        mime: z.string().refine((m) => RECEIPT_TYPES.includes(m), "Unsupported file type"),
        size: z.number().int().positive().max(15 * 1024 * 1024, "Files must be under 15 MB"),
      })
      .safeParse(input);
    if (!parsed.success) return zodFail(parsed.error);
    const { data, error } = await ctx.supabase
      .from("receipts")
      .insert({ user_id: ctx.userId, storage_path: parsed.data.path, mime_type: parsed.data.mime, size_bytes: parsed.data.size })
      .select("id")
      .single();
    if (error) return fail(dbError(error));
    return ok({ id: data.id });
  });
}

const expenseSchema = z
  .object({
    id: z.uuid().optional(),
    receipt_id: optionalUuid,
    spent_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
    merchant: optionalText(160),
    amount: optionalMoney.refine((v) => v !== null, "Enter the amount"),
    gst_amount: optionalMoney,
    category: z.enum(["tools", "ppe", "fuel", "training", "equipment", "other"]),
    description: optionalText(500),
    work_notes: optionalText(2000),
    items_json: z.string().max(20000).optional(),
    from_ai_extraction: z.enum(["true", "false"]).optional().transform((v) => v === "true"),
  })
  .refine((v) => v.gst_amount === null || v.amount === null || v.gst_amount <= v.amount, { path: ["gst_amount"], message: "GST can't be more than the total" });

export async function saveExpense(fd: FormData): Promise<ActionResult<{ id: string }>> {
  return safeAction<{ id: string }>("saveExpense", async () => {
    const ctx = await requireUserForAction();
    assertFeature(ctx, "expenses");
    const parsed = expenseSchema.safeParse(formToObject(fd));
    if (!parsed.success) return zodFail(parsed.error);
    const { id, items_json, ...v } = parsed.data;
    let items: { description: string; amount: number | null }[] = [];
    if (items_json) {
      const p = z.array(z.object({ description: z.string().max(300), amount: z.number().nullable() })).max(50).safeParse(JSON.parse(items_json));
      if (p.success) items = p.data;
    }
    const row = { ...v, items };
    const res = id
      ? await ctx.supabase.from("expenses").update(row).eq("id", id).select("id").single()
      : await ctx.supabase.from("expenses").insert({ ...row, user_id: ctx.userId }).select("id").single();
    if (res.error) return fail(dbError(res.error));
    revalidatePath("/expenses");
    revalidatePath("/dashboard");
    return ok({ id: res.data.id }, id ? "Expense updated" : "Expense saved");
  });
}

export async function deleteExpense(id: string): Promise<ActionResult<null>> {
  return safeAction("deleteExpense", async () => {
    const ctx = await requireUserForAction();
    if (!z.uuid().safeParse(id).success) return fail("Invalid expense.");
    const { data: e } = await ctx.supabase.from("expenses").select("receipt_id, receipts(storage_path)").eq("id", id).maybeSingle();
    const { error } = await ctx.supabase.from("expenses").delete().eq("id", id);
    if (error) return fail(dbError(error));
    const receipt = e?.receipts as unknown as { storage_path: string } | null;
    if (e?.receipt_id && receipt) {
      await ctx.supabase.from("receipts").delete().eq("id", e.receipt_id);
      await ctx.supabase.storage.from("user-files").remove([receipt.storage_path]);
    }
    revalidatePath("/expenses");
    revalidatePath("/dashboard");
    return ok(null, "Expense deleted");
  });
}
