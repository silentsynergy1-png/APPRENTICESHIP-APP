import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Clock3, MapPin, Pencil, Sparkles } from "lucide-react";
import { z } from "zod";
import { requireAppContext } from "@/lib/auth";
import { signedUrls } from "@/lib/data/files";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Badge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { formatLocal } from "@/lib/time/calc";
import type { DiaryEntry, DiaryPhoto } from "@/lib/types";
import { PhotoGrid, PhotoUploader } from "../photos";
import { DeleteEntryButton } from "./delete-entry";

export const metadata: Metadata = { title: "Diary entry" };

export default async function DiaryEntryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();
  const ctx = await requireAppContext();

  const [{ data: entry }, { data: photos }] = await Promise.all([
    ctx.supabase.from("work_diary_entries").select("*, employers(name), job_sites(name, address)").eq("id", id).maybeSingle(),
    ctx.supabase.from("diary_photos").select("*").eq("entry_id", id).order("created_at"),
  ]);
  if (!entry) notFound();
  const e = entry as DiaryEntry & { employers: { name: string } | null; job_sites: { name: string; address: string | null } | null };
  const urls = await signedUrls(ctx, (photos ?? []).map((p) => p.storage_path as string));
  const photoViews = ((photos ?? []) as DiaryPhoto[]).map((p) => ({ id: p.id, url: urls[p.storage_path] ?? null, caption: p.caption, mime: p.mime_type }));

  const chips = (label: string, items: string[]) =>
    items.length ? (
      <div>
        <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="flex flex-wrap gap-1.5">
          {items.map((i) => (
            <span key={i} className="rounded-lg bg-muted px-2.5 py-1 text-[13px]">
              {i}
            </span>
          ))}
        </div>
      </div>
    ) : null;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/diary" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Work diary
      </Link>

      {sp.new ? (
        <Alert tone="success" className="mb-5" title="Entry saved">
          Add photos of the work below. They&apos;re stored privately and only you can see them.
        </Alert>
      ) : null}

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-[13px] text-muted-foreground">{formatLocal(`${e.entry_date}T12:00:00Z`, "UTC", "EEEE d MMMM yyyy")}</div>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">{e.title || "Diary entry"}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
            {e.start_time ? (
              <span className="inline-flex items-center gap-1">
                <Clock3 className="size-3.5" /> {e.start_time.slice(0, 5)}
                {e.end_time ? `–${e.end_time.slice(0, 5)}` : ""}
              </span>
            ) : null}
            {e.job_sites ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" /> {e.job_sites.name}
              </span>
            ) : null}
            {e.employers ? <span>{e.employers.name}</span> : null}
            {e.status === "draft" ? <Badge tone="warning">Draft</Badge> : null}
            {e.ai_assisted ? (
              <Badge tone="primary">
                <Sparkles /> AI-assisted
              </Badge>
            ) : null}
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={`/diary/${e.id}/edit`}>
              <Pencil /> Edit
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-5">
        <Card>
          <CardContent className="grid gap-5">
            {e.description ? <p className="whitespace-pre-line text-[15px] leading-relaxed">{e.description}</p> : null}
            {e.raw_notes && e.raw_notes !== e.description ? (
              <div>
                <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Original notes</div>
                <p className="whitespace-pre-line text-[14px] text-muted-foreground">{e.raw_notes}</p>
              </div>
            ) : null}
            {chips("Tasks", e.tasks)}
            {chips("Skills practised", e.skills)}
            {chips("Tools", e.tools_used)}
            {chips("Materials", e.materials)}
            {e.lessons_learned ? (
              <div>
                <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Lessons learned</div>
                <p className="whitespace-pre-line text-[14px]">{e.lessons_learned}</p>
              </div>
            ) : null}
            {e.personal_notes ? (
              <div>
                <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Personal notes</div>
                <p className="whitespace-pre-line text-[14px] text-muted-foreground">{e.personal_notes}</p>
              </div>
            ) : null}
            {e.session_id ? (
              <Link href={`/timesheets/${e.session_id}`} className="text-[13px] text-primary hover:underline">
                View linked timesheet session →
              </Link>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Photos & attachments</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <PhotoGrid photos={photoViews} editable />
            {!photoViews.length ? <p className="text-[13px] text-muted-foreground">No photos yet. Snap the finished work for your records.</p> : null}
            <PhotoUploader userId={ctx.userId} entryId={e.id} />
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <DeleteEntryButton id={e.id} />
        </div>
      </div>
    </div>
  );
}
