import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { requireAppContext } from "@/lib/auth";
import { diarySuggestions } from "@/lib/data/diary";
import { breakMinutes, formatLocal, formatMinutes, sessionWorkedMinutes, todayKey, requestNow } from "@/lib/time/calc";
import type { Break, WorkSession } from "@/lib/types";
import { DiaryForm } from "../diary-form";

export const metadata: Metadata = { title: "New diary entry" };

export default async function NewDiaryPage({ searchParams }: { searchParams: Promise<{ session?: string; date?: string }> }) {
  const ctx = await requireAppContext();
  const sp = await searchParams;
  const tz = ctx.profile.timezone;

  const [{ data: employers }, { data: sites }, suggestions] = await Promise.all([
    ctx.supabase.from("employers").select("id, name, is_primary").eq("archived", false).order("name"),
    ctx.supabase.from("job_sites").select("id, name").eq("archived", false).order("name"),
    diarySuggestions(ctx),
  ]);

  type SessionRow = WorkSession & { breaks: Break[] };
  let session = null as SessionRow | null;
  if (sp.session && z.uuid().safeParse(sp.session).success) {
    const { data } = await ctx.supabase.from("work_sessions").select("*, breaks(*)").eq("id", sp.session).maybeSingle();
    session = data as SessionRow;
  }
  if (!session && !sp.date) {
    // Default to today's most recent completed session, so "add diary" after clocking out just works.
    const { data } = await ctx.supabase
      .from("work_sessions")
      .select("*, breaks(*)")
      .not("ended_at", "is", null)
      .gte("started_at", new Date(requestNow() - 18 * 3600_000).toISOString())
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { count } = data ? await ctx.supabase.from("work_diary_entries").select("id", { count: "exact", head: true }).eq("session_id", data.id) : { count: 1 };
    if (data && !count) session = data as SessionRow;
  }

  const stz = session?.timezone || tz;
  const summary = session
    ? [
        `${formatLocal(session.started_at, stz, "EEE d MMM, h:mm a")} – ${session.ended_at ? formatLocal(session.ended_at, stz, "h:mm a") : "now"}`,
        `${formatMinutes(sessionWorkedMinutes(session, session.breaks))} worked`,
        breakMinutes(session, session.breaks, requestNow(), "unpaid") >= 1 ? `${formatMinutes(breakMinutes(session, session.breaks, requestNow(), "unpaid"))} break` : null,
        session.start_address,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  const primary = (employers ?? []).find((e) => e.is_primary)?.id ?? null;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayKey(tz);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/diary" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Work diary
      </Link>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">New diary entry</h1>
      <DiaryForm
        userId={ctx.userId}
        employers={(employers ?? []) as { id: string; name: string }[]}
        jobSites={(sites ?? []) as { id: string; name: string }[]}
        sessionSummary={summary}
        aiAvailable={ctx.entitlements.has("ai_diary")}
        skillSuggestions={suggestions.skills}
        toolSuggestions={suggestions.tools}
        initial={{
          session_id: session?.id ?? null,
          employer_id: session?.employer_id ?? primary,
          job_site_id: session?.job_site_id ?? null,
          entry_date: session ? formatLocal(session.started_at, stz, "yyyy-MM-dd") : date,
          start_time: session ? formatLocal(session.started_at, stz, "HH:mm") : null,
          end_time: session?.ended_at ? formatLocal(session.ended_at, stz, "HH:mm") : null,
          title: "",
          raw_notes: session?.notes ?? "",
          description: "",
          tasks: [],
          skills: [],
          tools_used: [],
          materials: [],
          personal_notes: "",
          lessons_learned: "",
          status: "final",
          ai_assisted: false,
        }}
      />
    </div>
  );
}
