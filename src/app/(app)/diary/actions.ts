"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserForAction, type AppContext } from "@/lib/auth";
import { dbError, fail, ok, optionalText, optionalUuid, safeAction, zodFail, type ActionResult } from "@/lib/actions";
import { splitList } from "@/lib/utils";

const listField = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => (Array.isArray(v) ? v.map((x) => x.trim().slice(0, 200)).filter(Boolean).slice(0, 100) : splitList(v ?? "")));

const timeField = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^\d{2}:\d{2}(:\d{2})?$/.test(v), "Use a valid time");

const diarySchema = z.object({
  id: z.uuid().optional(),
  client_id: z.uuid().optional(),
  session_id: optionalUuid,
  employer_id: optionalUuid,
  job_site_id: optionalUuid,
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  start_time: timeField,
  end_time: timeField,
  title: optionalText(200),
  raw_notes: optionalText(8000),
  description: optionalText(12000),
  tasks: listField,
  skills: listField,
  tools_used: listField,
  materials: listField,
  personal_notes: optionalText(8000),
  lessons_learned: optionalText(8000),
  status: z.enum(["draft", "final"]).default("final"),
  ai_assisted: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .optional()
    .transform((v) => v === true || v === "true"),
});

export type DiaryInput = z.input<typeof diarySchema>;

async function checkMonthlyLimit(ctx: AppContext, entryDate: string): Promise<ActionResult<never> | null> {
  const limit = ctx.entitlements.plan.limits.diaryEntriesPerMonth;
  if (limit === null) return null;
  const month = entryDate.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const next = new Date(Date.UTC(y!, m!, 1)).toISOString().slice(0, 10);
  const { count } = await ctx.supabase
    .from("work_diary_entries")
    .select("id", { count: "exact", head: true })
    .gte("entry_date", `${month}-01`)
    .lt("entry_date", next);
  if ((count ?? 0) >= limit) {
    return { ok: false, error: `The Free plan includes ${limit} diary entries a month. Upgrade for unlimited entries.`, upgrade: true };
  }
  return null;
}

function revalidate(id?: string) {
  revalidatePath("/diary");
  revalidatePath("/dashboard");
  if (id) revalidatePath(`/diary/${id}`);
}

/**
 * Creates (or, for an offline draft that already synced, returns) a diary entry.
 * Idempotent on client_id so re-sending a queued offline draft never duplicates it.
 */
export async function saveDiaryEntry(input: DiaryInput): Promise<ActionResult<{ id: string; duplicate?: boolean }>> {
  return safeAction<{ id: string; duplicate?: boolean }>("saveDiary", async () => {
    const ctx = await requireUserForAction();
    const parsed = diarySchema.safeParse(input);
    if (!parsed.success) return zodFail(parsed.error);
    const { id, ...v } = parsed.data;
    const hasContent = v.title || v.raw_notes || v.description || v.tasks.length || v.lessons_learned || v.personal_notes;
    if (!hasContent) return fail("Write at least a few words about the day.", { raw_notes: "Add some notes or a description" });

    if (id) {
      const { error } = await ctx.supabase.from("work_diary_entries").update(v).eq("id", id);
      if (error) return fail(dbError(error));
      revalidate(id);
      return ok({ id }, "Diary entry saved");
    }

    if (v.client_id) {
      const { data: existing } = await ctx.supabase.from("work_diary_entries").select("id").eq("client_id", v.client_id).maybeSingle();
      if (existing) return ok({ id: existing.id, duplicate: true });
    }
    const limited = await checkMonthlyLimit(ctx, v.entry_date);
    if (limited) return limited;

    const { data, error } = await ctx.supabase.from("work_diary_entries").insert({ ...v, user_id: ctx.userId }).select("id").single();
    if (error) {
      if (error.code === "23505" && v.client_id) {
        const { data: existing } = await ctx.supabase.from("work_diary_entries").select("id").eq("client_id", v.client_id).single();
        return ok({ id: existing!.id, duplicate: true });
      }
      return fail(dbError(error));
    }
    revalidate();
    return ok({ id: data.id }, "Diary entry saved");
  });
}

export async function deleteDiaryEntry(id: string): Promise<ActionResult<null>> {
  return safeAction("deleteDiary", async () => {
    const ctx = await requireUserForAction();
    if (!z.uuid().safeParse(id).success) return fail("Invalid entry.");
    const { data: photos } = await ctx.supabase.from("diary_photos").select("storage_path").eq("entry_id", id);
    const { error } = await ctx.supabase.from("work_diary_entries").delete().eq("id", id);
    if (error) return fail(dbError(error));
    const paths = (photos ?? []).map((p) => p.storage_path as string);
    if (paths.length) await ctx.supabase.storage.from("user-files").remove(paths);
    revalidate();
    return ok(null, "Entry deleted");
  });
}

/* ---------------------------------- photos --------------------------------- */
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];

const photoSchema = z.object({
  entryId: z.uuid(),
  path: z.string().max(500),
  mime: z.string().refine((m) => ALLOWED.includes(m), "Unsupported file type"),
  size: z.number().int().positive().max(15 * 1024 * 1024, "Files must be under 15 MB"),
  caption: optionalText(300),
});

/** Records a file the browser already uploaded to the user's own storage folder. */
export async function addDiaryPhoto(input: z.input<typeof photoSchema>): Promise<ActionResult<{ id: string }>> {
  return safeAction<{ id: string }>("addDiaryPhoto", async () => {
    const ctx = await requireUserForAction();
    const parsed = photoSchema.safeParse(input);
    if (!parsed.success) return zodFail(parsed.error);
    const v = parsed.data;
    if (!v.path.startsWith(`${ctx.userId}/diary/${v.entryId}/`)) return fail("Invalid file location.");
    const { data, error } = await ctx.supabase
      .from("diary_photos")
      .insert({
        user_id: ctx.userId,
        entry_id: v.entryId,
        storage_path: v.path,
        mime_type: v.mime,
        size_bytes: v.size,
        caption: v.caption,
        is_attachment: v.mime === "application/pdf",
      })
      .select("id")
      .single();
    if (error) {
      await ctx.supabase.storage.from("user-files").remove([v.path]);
      return fail(dbError(error));
    }
    revalidate(v.entryId);
    revalidatePath("/diary");
    return ok({ id: data.id });
  });
}

export async function deleteDiaryPhoto(id: string): Promise<ActionResult<null>> {
  return safeAction("deleteDiaryPhoto", async () => {
    const ctx = await requireUserForAction();
    if (!z.uuid().safeParse(id).success) return fail("Invalid photo.");
    const { data: photo } = await ctx.supabase.from("diary_photos").select("storage_path, entry_id").eq("id", id).maybeSingle();
    if (!photo) return fail("Photo not found.");
    const { error } = await ctx.supabase.from("diary_photos").delete().eq("id", id);
    if (error) return fail(dbError(error));
    await ctx.supabase.storage.from("user-files").remove([photo.storage_path]);
    revalidate(photo.entry_id);
    return ok(null, "Photo removed");
  });
}

export async function updatePhotoCaption(id: string, caption: string): Promise<ActionResult<null>> {
  return safeAction("photoCaption", async () => {
    const ctx = await requireUserForAction();
    const parsed = z.object({ id: z.uuid(), caption: z.string().trim().max(300) }).safeParse({ id, caption });
    if (!parsed.success) return fail("Invalid caption.");
    const { error } = await ctx.supabase.from("diary_photos").update({ caption: parsed.data.caption || null }).eq("id", id);
    if (error) return fail(dbError(error));
    return ok(null);
  });
}
