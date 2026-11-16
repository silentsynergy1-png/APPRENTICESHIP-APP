"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserForAction } from "@/lib/auth";
import { dbError, fail, ok, safeAction, type ActionResult } from "@/lib/actions";

const CARDS = ["clock", "hours", "progress", "diary", "sites", "deadlines", "expenses", "reminders"] as const;

export async function saveDashboardCards(cards: string[]): Promise<ActionResult<null>> {
  return safeAction("dashboardCards", async () => {
    const ctx = await requireUserForAction();
    const parsed = z.array(z.enum(CARDS)).max(CARDS.length).safeParse(cards);
    if (!parsed.success) return fail("Invalid selection.");
    const unique = [...new Set(parsed.data)];
    // The clock card is always shown: it's the primary action of the app.
    if (!unique.includes("clock")) unique.unshift("clock");
    const { error } = await ctx.supabase.from("profiles").update({ dashboard_cards: unique }).eq("id", ctx.userId);
    if (error) return fail(dbError(error));
    revalidatePath("/dashboard");
    return ok(null, "Dashboard updated");
  });
}
