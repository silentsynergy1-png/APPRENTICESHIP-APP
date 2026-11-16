"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, CloudOff, Loader2, MessageCircleQuestion, RotateCcw, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Alert, Badge } from "@/components/ui/misc";
import { Card, CardContent } from "@/components/ui/card";
import { TagInput } from "@/components/ui/tag-input";
import { queueDraft } from "@/lib/offline/diary-queue";
import { useOnline } from "@/hooks/use-geolocation";
import { saveDiaryEntry, type DiaryInput } from "./actions";

type Option = { id: string; name: string };

export interface DiaryFormValues {
  id?: string;
  session_id: string | null;
  employer_id: string | null;
  job_site_id: string | null;
  entry_date: string;
  start_time: string | null;
  end_time: string | null;
  title: string;
  raw_notes: string;
  description: string;
  tasks: string[];
  skills: string[];
  tools_used: string[];
  materials: string[];
  personal_notes: string;
  lessons_learned: string;
  status: "draft" | "final";
  ai_assisted: boolean;
}

interface AiResult {
  title: string;
  description: string;
  tasks: string[];
  skills: string[];
  tools_used: string[];
  materials: string[];
  lessons_learned: string;
  clarifying_questions: string[];
}

export function DiaryForm({
  userId,
  initial,
  employers,
  jobSites,
  sessionSummary,
  aiAvailable,
  skillSuggestions,
  toolSuggestions,
}: {
  userId: string;
  initial: DiaryFormValues;
  employers: Option[];
  jobSites: Option[];
  sessionSummary?: string | null;
  aiAvailable: boolean;
  skillSuggestions: string[];
  toolSuggestions: string[];
}) {
  const router = useRouter();
  const online = useOnline();
  const [v, setV] = useState<DiaryFormValues>(initial);
  const [saving, startSaving] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<{ message: string; upgrade?: boolean } | null>(null);
  const [ai, setAi] = useState<{ loading: boolean; result: AiResult | null; error: string | null; upgrade?: boolean }>({ loading: false, result: null, error: null });
  const [before, setBefore] = useState<DiaryFormValues | null>(null);
  const [offlineSaved, setOfflineSaved] = useState(false);

  const set = <K extends keyof DiaryFormValues>(k: K, val: DiaryFormValues[K]) => setV((p) => ({ ...p, [k]: val }));
  const employerName = employers.find((e) => e.id === v.employer_id)?.name;
  const siteName = jobSites.find((s) => s.id === v.job_site_id)?.name;

  async function improve() {
    const notes = [v.raw_notes, v.description].filter(Boolean).join("\n\n").trim();
    if (notes.length < 5) {
      setAi({ loading: false, result: null, error: "Write a few rough notes first. Plain words are fine." });
      return;
    }
    setAi({ loading: true, result: null, error: null });
    try {
      const res = await fetch("/api/ai/diary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes,
          context: {
            date: v.entry_date,
            jobSite: siteName,
            employer: employerName,
            hours: v.start_time && v.end_time ? `${v.start_time.slice(0, 5)}–${v.end_time.slice(0, 5)}` : undefined,
          },
        }),
      });
      const json = (await res.json()) as { result?: AiResult; error?: string };
      if (!res.ok || !json.result) {
        setAi({ loading: false, result: null, error: json.error ?? "AI isn't available right now.", upgrade: res.status === 402 });
        return;
      }
      setAi({ loading: false, result: json.result, error: null });
    } catch {
      setAi({ loading: false, result: null, error: "Couldn't reach the AI service. Check your connection." });
    }
  }

  function applyAi(r: AiResult) {
    setBefore(v);
    setV((p) => ({
      ...p,
      title: r.title || p.title,
      description: r.description || p.description,
      tasks: r.tasks.length ? r.tasks : p.tasks,
      skills: r.skills.length ? r.skills : p.skills,
      tools_used: r.tools_used.length ? r.tools_used : p.tools_used,
      materials: r.materials.length ? r.materials : p.materials,
      lessons_learned: r.lessons_learned || p.lessons_learned,
      ai_assisted: true,
    }));
    setAi({ loading: false, result: null, error: null });
    toast.success("Applied. Review and edit anything before saving.");
  }

  function toInput(): DiaryInput {
    return {
      ...(v.id ? { id: v.id } : {}),
      session_id: v.session_id ?? "",
      employer_id: v.employer_id ?? "",
      job_site_id: v.job_site_id ?? "",
      entry_date: v.entry_date,
      start_time: v.start_time ?? "",
      end_time: v.end_time ?? "",
      title: v.title,
      raw_notes: v.raw_notes,
      description: v.description,
      tasks: v.tasks,
      skills: v.skills,
      tools_used: v.tools_used,
      materials: v.materials,
      personal_notes: v.personal_notes,
      lessons_learned: v.lessons_learned,
      status: v.status,
      ai_assisted: v.ai_assisted,
    };
  }

  async function saveOffline() {
    await queueDraft(userId, toInput());
    // Stay on this screen: the diary list can't load without a connection.
    setOfflineSaved(true);
    setV({ ...initial, entry_date: v.entry_date });
    setBefore(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    if (!v.id && !navigator.onLine) {
      void saveOffline();
      return;
    }
    startSaving(async () => {
      try {
        const res = await saveDiaryEntry(toInput());
        if (!res.ok) {
          setError({ message: res.error, upgrade: res.upgrade });
          setFieldErrors(res.fieldErrors ?? {});
          return;
        }
        toast.success(v.id ? "Entry updated" : "Entry saved");
        if (v.id) router.refresh();
        else router.push(`/diary/${res.data.id}?new=1`);
      } catch {
        if (!v.id) await saveOffline();
        else setError({ message: "You seem to be offline. Your changes haven't been saved yet." });
      }
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-5" noValidate>
      {error ? (
        <Alert tone={error.upgrade ? "primary" : "danger"}>
          {error.message}{" "}
          {error.upgrade ? (
            <Link href="/settings/plan" className="font-medium text-primary underline">
              See Pro
            </Link>
          ) : null}
        </Alert>
      ) : null}
      {offlineSaved ? (
        <Alert tone="success" icon={<CloudOff />} title="Saved on this device">
          This entry isn&apos;t on the server yet. It&apos;ll sync automatically when you&apos;re back online, and you&apos;ll get a confirmation then. You can write another entry in the meantime.
        </Alert>
      ) : null}
      {!online && !v.id ? (
        <Alert tone="warning" icon={<CloudOff />} title="You're offline">
          You can still write this entry. It&apos;ll be kept on this device and synced when you reconnect. Photos can be added after it syncs.
        </Alert>
      ) : null}

      <Card>
        <CardContent className="grid gap-4">
          <Field label="What did you do today?" htmlFor="raw_notes" hint="Rough notes are fine, e.g. “helped install lights, ran cable through ceiling, drilled holes, assisted with testing”." error={fieldErrors.raw_notes}>
            <Textarea id="raw_notes" value={v.raw_notes} onChange={(e) => set("raw_notes", e.target.value)} rows={4} maxLength={8000} placeholder="Jot down the day in your own words…" />
          </Field>

          <div className="flex flex-wrap items-center gap-2">
            {aiAvailable ? (
              <Button type="button" variant="subtle" onClick={improve} disabled={ai.loading}>
                {ai.loading ? <Loader2 className="animate-spin" /> : <Sparkles />} {ai.loading ? "Writing…" : "Improve with AI"}
              </Button>
            ) : (
              <Button asChild type="button" variant="outline">
                <Link href="/settings/plan">
                  <Sparkles /> Improve with AI <Badge tone="primary">Pro</Badge>
                </Link>
              </Button>
            )}
            {before ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setV(before);
                  setBefore(null);
                }}
              >
                <RotateCcw /> Undo AI changes
              </Button>
            ) : null}
            <span className="text-[12px] text-muted-foreground">AI only reorganises what you wrote. It won&apos;t add work you didn&apos;t do.</span>
          </div>

          {ai.error ? (
            <Alert tone={ai.upgrade ? "primary" : "warning"}>
              {ai.error}{" "}
              {ai.upgrade ? (
                <Link href="/settings/plan" className="font-medium text-primary underline">
                  See Pro
                </Link>
              ) : null}
            </Alert>
          ) : null}

          {ai.result ? (
            <div className="rounded-2xl border border-primary/25 bg-primary-soft/30 p-4">
              <div className="mb-3 flex items-center gap-2 text-[13px] font-medium text-primary">
                <Sparkles className="size-4" /> Suggested entry. Check it matches what you actually did.
              </div>
              <div className="space-y-3 text-[14px]">
                <div className="font-semibold">{ai.result.title}</div>
                <p className="whitespace-pre-line leading-relaxed">{ai.result.description}</p>
                <PreviewList label="Tasks" items={ai.result.tasks} />
                <PreviewList label="Skills practised" items={ai.result.skills} />
                <PreviewList label="Tools" items={ai.result.tools_used} />
                <PreviewList label="Materials" items={ai.result.materials} />
                {ai.result.lessons_learned ? (
                  <div>
                    <div className="text-[12px] font-medium text-muted-foreground">Lessons learned</div>
                    <p>{ai.result.lessons_learned}</p>
                  </div>
                ) : null}
                {ai.result.clarifying_questions.length ? (
                  <div className="rounded-xl bg-card p-3">
                    <div className="mb-1 flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
                      <MessageCircleQuestion className="size-3.5" /> Worth adding if you can:
                    </div>
                    <ul className="list-disc space-y-0.5 pl-5 text-[13px] text-muted-foreground">
                      {ai.result.clarifying_questions.map((q) => (
                        <li key={q}>{q}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
              <div className="mt-4 flex gap-2">
                <Button type="button" onClick={() => applyAi(ai.result!)}>
                  <Check /> Use this
                </Button>
                <Button type="button" variant="ghost" onClick={() => setAi({ loading: false, result: null, error: null })}>
                  <X /> Discard
                </Button>
              </div>
            </div>
          ) : null}

          <Field label="Title" htmlFor="title">
            <Input id="title" value={v.title} onChange={(e) => set("title", e.target.value)} maxLength={200} placeholder="e.g. Lighting rough-in, Level 2" />
          </Field>
          <Field label="Description" htmlFor="description">
            <Textarea id="description" value={v.description} onChange={(e) => set("description", e.target.value)} rows={5} maxLength={12000} placeholder="A clear account of the work you did." />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-4">
          {sessionSummary ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-subtle px-3.5 py-2.5 text-[13px]">
              <Badge tone="primary">Linked session</Badge>
              <span className="text-muted-foreground">{sessionSummary}</span>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="Date" htmlFor="entry_date" className="col-span-2 sm:col-span-1">
              <Input id="entry_date" type="date" value={v.entry_date} onChange={(e) => set("entry_date", e.target.value)} required />
            </Field>
            <Field label="Start" htmlFor="start_time">
              <Input id="start_time" type="time" value={v.start_time?.slice(0, 5) ?? ""} onChange={(e) => set("start_time", e.target.value || null)} />
            </Field>
            <Field label="Finish" htmlFor="end_time">
              <Input id="end_time" type="time" value={v.end_time?.slice(0, 5) ?? ""} onChange={(e) => set("end_time", e.target.value || null)} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Employer" htmlFor="employer_id">
              <NativeSelect id="employer_id" value={v.employer_id ?? ""} onChange={(e) => set("employer_id", e.target.value || null)}>
                <option value="">None</option>
                {employers.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Job site" htmlFor="job_site_id">
              <NativeSelect id="job_site_id" value={v.job_site_id ?? ""} onChange={(e) => set("job_site_id", e.target.value || null)}>
                <option value="">None</option>
                {jobSites.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Tasks performed" htmlFor="tasks">
            <TagInput id="tasks" value={v.tasks} onChange={(x) => set("tasks", x)} placeholder="Add a task, then press Enter" />
          </Field>
          <Field label="Skills practised" htmlFor="skills">
            <TagInput id="skills" value={v.skills} onChange={(x) => set("skills", x)} placeholder="e.g. Cable installation" suggestions={skillSuggestions} />
          </Field>
          <Field label="Tools used" htmlFor="tools_used">
            <TagInput id="tools_used" value={v.tools_used} onChange={(x) => set("tools_used", x)} placeholder="e.g. Cordless drill" suggestions={toolSuggestions} />
          </Field>
          <Field label="Materials used" htmlFor="materials">
            <TagInput id="materials" value={v.materials} onChange={(x) => set("materials", x)} placeholder="e.g. 2.5mm TPS cable" />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-4">
          <Field label="Lessons learned" htmlFor="lessons_learned">
            <Textarea id="lessons_learned" value={v.lessons_learned} onChange={(e) => set("lessons_learned", e.target.value)} rows={3} maxLength={8000} placeholder="Something new you picked up today?" />
          </Field>
          <Field label="Personal notes" htmlFor="personal_notes" hint="Private to you.">
            <Textarea id="personal_notes" value={v.personal_notes} onChange={(e) => set("personal_notes", e.target.value)} rows={2} maxLength={8000} />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <NativeSelect aria-label="Status" value={v.status} onChange={(e) => set("status", e.target.value as "draft" | "final")} className="w-40">
              <option value="final">Complete</option>
              <option value="draft">Draft</option>
            </NativeSelect>
            {v.ai_assisted ? <Badge tone="primary"><Sparkles /> AI-assisted</Badge> : null}
          </div>
        </CardContent>
      </Card>

      <div className="sticky bottom-16 z-10 -mx-4 flex justify-end gap-2 border-t border-border bg-background/90 px-4 py-3 backdrop-blur-md sm:mx-0 sm:rounded-2xl sm:border sm:px-3 lg:bottom-4">
        <Button type="button" variant="ghost" size="lg" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" size="lg" disabled={saving} className="flex-1 sm:flex-none">
          {saving ? <Loader2 className="animate-spin" /> : null} {v.id ? "Save changes" : "Save entry"}
        </Button>
      </div>
    </form>
  );
}

function PreviewList({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <div className="text-[12px] font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {items.map((i) => (
          <span key={i} className="rounded-md bg-card px-2 py-0.5 text-[12.5px]">
            {i}
          </span>
        ))}
      </div>
    </div>
  );
}
