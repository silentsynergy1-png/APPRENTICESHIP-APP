"use server";

import { z } from "zod";
import { requireUserForAction } from "@/lib/auth";
import { dbError, fail, formToObject, ok, optionalText, safeAction, zodFail, type ActionResult } from "@/lib/actions";
import { STARTER_CATEGORIES, STATES } from "@/lib/constants";
import type { Trade } from "@/lib/types";

const schema = z
  .object({
    full_name: z.string().trim().min(1, "Tell us your name").max(120),
    trade: z.enum(["electrical", "plumbing", "carpentry", "automotive", "refrigeration", "other"]),
    state: z.enum(["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"]),
    employer_name: optionalText(160),
    qualification: optionalText(200),
    training_provider: optionalText(200),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick your start date"),
    expected_completion_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick your expected completion date"),
    location_enabled: z.enum(["on", "off"]).default("off"),
    starter_categories: z.enum(["on", "off"]).default("off"),
  })
  .refine((v) => v.expected_completion_date > v.start_date, {
    path: ["expected_completion_date"],
    message: "Completion must be after your start date",
  });

export async function completeOnboarding(fd: FormData): Promise<ActionResult<null>> {
  return safeAction("onboarding", async () => {
    const ctx = await requireUserForAction();
    const parsed = schema.safeParse(formToObject(fd));
    if (!parsed.success) return zodFail(parsed.error);
    const v = parsed.data;
    const { supabase, userId } = ctx;
    const timezone = STATES.find((s) => s.value === v.state)!.timezone;

    let employerId: string | null = null;
    if (v.employer_name) {
      const { data: existing } = await supabase.from("employers").select("id").eq("name", v.employer_name).maybeSingle();
      if (existing) employerId = existing.id;
      else {
        const { data, error } = await supabase
          .from("employers")
          .insert({ user_id: userId, name: v.employer_name, is_primary: true })
          .select("id")
          .single();
        if (error) return fail(dbError(error));
        employerId = data.id;
      }
    }

    const { data: current } = await supabase.from("apprenticeships").select("id").eq("is_current", true).maybeSingle();
    const appRow = {
      user_id: userId,
      trade: v.trade,
      qualification: v.qualification,
      training_provider: v.training_provider,
      start_date: v.start_date,
      expected_completion_date: v.expected_completion_date,
      employer_id: employerId,
      is_current: true,
    };
    const appRes = current
      ? await supabase.from("apprenticeships").update(appRow).eq("id", current.id)
      : await supabase.from("apprenticeships").insert(appRow);
    if (appRes.error) return fail(dbError(appRes.error));

    if (v.starter_categories === "on") {
      const names = STARTER_CATEGORIES[v.trade as Trade];
      await supabase
        .from("competency_categories")
        .upsert(
          names.map((name, i) => ({ user_id: userId, name, sort_order: i })),
          { onConflict: "user_id,name", ignoreDuplicates: true },
        );
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: v.full_name,
        trade: v.trade,
        state: v.state,
        timezone,
        location_enabled: v.location_enabled === "on",
        onboarding_completed: true,
      })
      .eq("id", userId);
    if (error) return fail(dbError(error));
    return ok(null);
  });
}
