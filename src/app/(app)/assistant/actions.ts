"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserForAction } from "@/lib/auth";
import { dbError, fail, ok, safeAction, type ActionResult } from "@/lib/actions";

export async function toggleSavedMessage(id: string, saved: boolean): Promise<ActionResult<null>> {
  return safeAction("toggleSaved", async () => {
    const ctx = await requireUserForAction();
    if (!z.uuid().safeParse(id).success) return fail("Invalid message.");
    const { error } = await ctx.supabase.from("ai_messages").update({ saved }).eq("id", id);
    if (error) return fail(dbError(error));
    revalidatePath("/assistant");
    return ok(null, saved ? "Saved to your notes" : "Removed from saved");
  });
}

export async function deleteConversation(id: string): Promise<ActionResult<null>> {
  return safeAction("deleteConversation", async () => {
    const ctx = await requireUserForAction();
    if (!z.uuid().safeParse(id).success) return fail("Invalid conversation.");
    const { error } = await ctx.supabase.from("ai_conversations").delete().eq("id", id);
    if (error) return fail(dbError(error));
    revalidatePath("/assistant");
    return ok(null, "Conversation deleted");
  });
}
