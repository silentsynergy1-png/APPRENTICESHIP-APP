import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/auth";
import { fileResponse } from "@/lib/export";

const TABLES = [
  "profiles",
  "work_rules",
  "public_holidays",
  "employers",
  "job_sites",
  "work_sessions",
  "breaks",
  "timesheet_adjustments",
  "work_diary_entries",
  "diary_photos",
  "apprenticeships",
  "competency_categories",
  "competencies",
  "competency_records",
  "tafe_assessments",
  "learning_goals",
  "milestones",
  "tools",
  "tool_maintenance",
  "receipts",
  "expenses",
  "documents",
  "reminders",
  "notifications",
  "ai_conversations",
  "ai_messages",
  "weekly_recaps",
  "subscriptions",
] as const;

/** Full personal data export (RLS guarantees only the caller's rows are returned). */
export async function GET() {
  const ctx = await getAppContext();
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const out: Record<string, unknown> = {
    exported_at: new Date().toISOString(),
    account: { id: ctx.userId, email: ctx.email },
    note: "Uploaded files (photos, receipts, documents) are listed by storage path. Download them from the app.",
  };
  for (const t of TABLES) {
    const rows: unknown[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await ctx.supabase.from(t).select("*").range(from, from + 999);
      if (error || !data?.length) break;
      rows.push(...data);
      if (data.length < 1000) break;
    }
    out[t] = rows;
  }
  return fileResponse(JSON.stringify(out, null, 2), `apprentice-os-export-${new Date().toISOString().slice(0, 10)}.json`, "application/json");
}
