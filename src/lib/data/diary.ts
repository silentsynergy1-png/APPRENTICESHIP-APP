import "server-only";
import type { AppContext } from "@/lib/auth";

/** Suggestions for the diary chip inputs, drawn from the user's own records. */
export async function diarySuggestions(ctx: AppContext) {
  const [{ data: comps }, { data: tools }, { data: recent }] = await Promise.all([
    ctx.supabase.from("competencies").select("title").neq("status", "completed").order("updated_at", { ascending: false }).limit(12),
    ctx.supabase.from("tools").select("name").in("status", ["available", "lent"]).order("name").limit(40),
    ctx.supabase.from("work_diary_entries").select("skills, tools_used").order("entry_date", { ascending: false }).limit(30),
  ]);
  const freq = (key: "skills" | "tools_used") => {
    const m = new Map<string, number>();
    for (const r of recent ?? []) for (const s of (r[key] as string[]) ?? []) m.set(s, (m.get(s) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  };
  return {
    skills: [...new Set([...freq("skills"), ...(comps ?? []).map((c) => c.title as string)])].slice(0, 12),
    tools: [...new Set([...freq("tools_used"), ...(tools ?? []).map((t) => t.name as string)])].slice(0, 12),
  };
}
