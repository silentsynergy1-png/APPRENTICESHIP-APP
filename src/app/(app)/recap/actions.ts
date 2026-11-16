"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserForAction } from "@/lib/auth";
import { fail, ok, safeAction, type ActionResult } from "@/lib/actions";
import { AI_MODEL, FALLBACK_BETA, SAFETY_FOOTER, guardAi, toAiError, tradeLabel } from "@/lib/ai/client";
import { computeWeekStats } from "@/lib/data/recap";
import { formatMinutes } from "@/lib/time/calc";

/** Generates (or regenerates) the AI-written weekly recap from the user's own records only. */
export async function generateRecap(weekStart: string): Promise<ActionResult<null>> {
  return safeAction("generateRecap", async () => {
    const ctx = await requireUserForAction();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return fail("Invalid week.");
    let ai;
    try {
      ai = await guardAi(ctx, "weekly_recap");
    } catch (e) {
      const err = toAiError(e);
      return { ok: false, error: err.message, upgrade: err.code === "plan" };
    }
    const stats = await computeWeekStats(ctx, weekStart);
    const { data: entries } = await ctx.supabase
      .from("work_diary_entries")
      .select("entry_date, title, description, raw_notes, tasks, skills, lessons_learned")
      .gte("entry_date", stats.weekStart)
      .lt("entry_date", stats.weekEnd)
      .order("entry_date")
      .limit(30);

    const records = (entries ?? [])
      .map(
        (e) =>
          `## ${e.entry_date}${e.title ? ` · ${e.title}` : ""}\n${(e.description || e.raw_notes || "").slice(0, 1500)}\nTasks: ${(e.tasks as string[]).join("; ") || "—"}\nSkills: ${(e.skills as string[]).join("; ") || "—"}\nLessons: ${e.lessons_learned ?? "—"}`,
      )
      .join("\n\n");
    const facts = [
      `Hours worked: ${formatMinutes(stats.totalMinutes)} over ${stats.daysWorked} day(s), ${stats.sessions} session(s)`,
      `Overtime: ${formatMinutes(stats.overtimeMinutes)}`,
      `Job sites: ${stats.jobSites.join(", ") || "none recorded"}`,
      `Diary entries: ${stats.diaryEntries}`,
      `Worked days without a diary entry: ${stats.missingDiaryDays.join(", ") || "none"}`,
      `Practice logs: ${stats.practiceLogs}; competencies completed: ${stats.competenciesCompleted}`,
      stats.expensesTotal !== null ? `Expenses recorded: $${stats.expensesTotal.toFixed(2)}` : null,
      `Upcoming in the next 2 weeks: ${stats.upcoming.map((u) => `${u.kind}: ${u.title} (${u.due})`).join("; ") || "nothing"}`,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const response = await ai.beta.messages.create({
        model: AI_MODEL,
        max_tokens: 2000,
        betas: [FALLBACK_BETA],
        fallbacks: "default",
        output_config: { effort: "low" },
        system: `You write a short, encouraging weekly recap for an Australian ${tradeLabel(ctx.profile.trade).toLowerCase()} apprentice, addressed to them as "you".
Use ONLY the facts and diary entries provided. Never invent work, skills, results or feelings. If there's little information, say so briefly and suggest what to record next week.
Format in Markdown with these sections: **What you worked on**, **What you learned**, **Progress**, **Coming up**, and **Gaps to fill** (e.g. worked days without diary entries). Keep it under 220 words.
${SAFETY_FOOTER}`,
        messages: [{ role: "user", content: `Facts for the week starting ${weekStart}:\n${facts}\n\nDiary entries:\n${records || "(none)"}` }],
      });
      if (response.stop_reason === "refusal") return fail("Couldn't write a recap for this week.");
      const summary = response.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n").trim();
      const { error } = await ctx.supabase
        .from("weekly_recaps")
        .upsert({ user_id: ctx.userId, week_start: weekStart, stats, summary: summary.slice(0, 12000) }, { onConflict: "user_id,week_start" });
      if (error) return fail("Couldn't save the recap.");
    } catch (e) {
      return fail(toAiError(e).message);
    }
    revalidatePath("/recap");
    return ok(null, "Recap ready");
  });
}

export async function deleteRecap(id: string): Promise<ActionResult<null>> {
  return safeAction("deleteRecap", async () => {
    const ctx = await requireUserForAction();
    if (!z.uuid().safeParse(id).success) return fail("Invalid recap.");
    await ctx.supabase.from("weekly_recaps").delete().eq("id", id);
    revalidatePath("/recap");
    return ok(null);
  });
}
