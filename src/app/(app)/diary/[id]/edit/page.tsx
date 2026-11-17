import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { requireAppContext } from "@/lib/auth";
import { isAiEnabled } from "@/lib/ai/config";
import { diarySuggestions } from "@/lib/data/diary";
import type { DiaryEntry } from "@/lib/types";
import { DiaryForm } from "../../diary-form";

export const metadata: Metadata = { title: "Edit diary entry" };

export default async function EditDiaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const ctx = await requireAppContext();
  const [{ data }, { data: employers }, { data: sites }, suggestions] = await Promise.all([
    ctx.supabase.from("work_diary_entries").select("*").eq("id", id).maybeSingle(),
    ctx.supabase.from("employers").select("id, name").eq("archived", false).order("name"),
    ctx.supabase.from("job_sites").select("id, name").eq("archived", false).order("name"),
    diarySuggestions(ctx),
  ]);
  if (!data) notFound();
  const e = data as DiaryEntry;
  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/diary/${id}`} className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to entry
      </Link>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Edit diary entry</h1>
      <DiaryForm
        userId={ctx.userId}
        employers={(employers ?? []) as { id: string; name: string }[]}
        jobSites={(sites ?? []) as { id: string; name: string }[]}
        aiAvailable={ctx.entitlements.has("ai_diary")}
        aiEnabled={isAiEnabled()}
        skillSuggestions={suggestions.skills}
        toolSuggestions={suggestions.tools}
        initial={{
          id: e.id,
          session_id: e.session_id,
          employer_id: e.employer_id,
          job_site_id: e.job_site_id,
          entry_date: e.entry_date,
          start_time: e.start_time,
          end_time: e.end_time,
          title: e.title ?? "",
          raw_notes: e.raw_notes ?? "",
          description: e.description ?? "",
          tasks: e.tasks,
          skills: e.skills,
          tools_used: e.tools_used,
          materials: e.materials,
          personal_notes: e.personal_notes ?? "",
          lessons_learned: e.lessons_learned ?? "",
          status: e.status,
          ai_assisted: e.ai_assisted,
        }}
      />
    </div>
  );
}
