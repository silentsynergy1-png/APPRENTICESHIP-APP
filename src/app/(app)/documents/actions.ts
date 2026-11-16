"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertFeature, requireUserForAction } from "@/lib/auth";
import { dbError, fail, formToObject, ok, optionalDate, optionalText, safeAction, zodFail, type ActionResult } from "@/lib/actions";

const TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];

export async function saveDocument(fd: FormData): Promise<ActionResult<{ id: string }>> {
  return safeAction<{ id: string }>("saveDocument", async () => {
    const ctx = await requireUserForAction();
    assertFeature(ctx, "documents");
    const schema = z
      .object({
        id: z.uuid().optional(),
        title: z.string().trim().min(1, "Give the document a name").max(200),
        category: z.enum(["licence", "certificate", "training_record", "employment", "assessment", "other"]),
        issued_on: optionalDate,
        expires_on: optionalDate,
        notes: optionalText(2000),
        storage_path: z.string().max(500).optional(),
        mime_type: z.string().optional(),
        size_bytes: z.coerce.number().int().optional(),
      })
      .refine((v) => !v.issued_on || !v.expires_on || v.expires_on >= v.issued_on, { path: ["expires_on"], message: "Expiry is before the issue date" });
    const parsed = schema.safeParse(formToObject(fd));
    if (!parsed.success) return zodFail(parsed.error);
    const { id, storage_path, mime_type, size_bytes, ...meta } = parsed.data;

    if (id) {
      const { error } = await ctx.supabase.from("documents").update(meta).eq("id", id);
      if (error) return fail(dbError(error));
      revalidatePath("/documents");
      return ok({ id }, "Document updated");
    }
    if (!storage_path || !mime_type || !size_bytes) return fail("Choose a file to upload.", { file: "Choose a file" });
    if (!storage_path.startsWith(`${ctx.userId}/documents/`)) return fail("Invalid file location.");
    if (!TYPES.includes(mime_type)) return fail("Upload a PDF or an image.");
    if (size_bytes > 25 * 1024 * 1024) return fail("Files must be under 25 MB.");
    const { data, error } = await ctx.supabase
      .from("documents")
      .insert({ ...meta, storage_path, mime_type, size_bytes, user_id: ctx.userId })
      .select("id")
      .single();
    if (error) {
      await ctx.supabase.storage.from("user-files").remove([storage_path]);
      return fail(dbError(error));
    }
    revalidatePath("/documents");
    return ok({ id: data.id }, "Document saved");
  });
}

export async function deleteDocument(id: string): Promise<ActionResult<null>> {
  return safeAction("deleteDocument", async () => {
    const ctx = await requireUserForAction();
    if (!z.uuid().safeParse(id).success) return fail("Invalid document.");
    const { data: doc } = await ctx.supabase.from("documents").select("storage_path").eq("id", id).maybeSingle();
    const { error } = await ctx.supabase.from("documents").delete().eq("id", id);
    if (error) return fail(dbError(error));
    if (doc) await ctx.supabase.storage.from("user-files").remove([doc.storage_path]);
    revalidatePath("/documents");
    return ok(null, "Document deleted");
  });
}
