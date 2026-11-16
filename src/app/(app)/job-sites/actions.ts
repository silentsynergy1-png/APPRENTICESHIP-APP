"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserForAction } from "@/lib/auth";
import { dbError, fail, formToObject, ok, optionalText, optionalUuid, safeAction, zodFail, type ActionResult } from "@/lib/actions";

const coord = (min: number, max: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? null : Number(v)))
    .refine((v) => v === null || (Number.isFinite(v) && v >= min && v <= max), "Invalid coordinate");

const schema = z
  .object({
    id: z.uuid().optional(),
    name: z.string().trim().min(1, "Give the job site a name").max(160),
    address: optionalText(300),
    employer_id: optionalUuid,
    description: optionalText(2000),
    notes: optionalText(4000),
    latitude: coord(-90, 90),
    longitude: coord(-180, 180),
    match_radius_m: z.coerce.number().int().min(25).max(5000).default(150),
  })
  .refine((v) => (v.latitude === null) === (v.longitude === null), { path: ["latitude"], message: "Location is incomplete" });

function revalidate(id?: string) {
  revalidatePath("/job-sites");
  if (id) revalidatePath(`/job-sites/${id}`);
  revalidatePath("/dashboard");
}

export async function saveJobSite(fd: FormData): Promise<ActionResult<{ id: string }>> {
  return safeAction<{ id: string }>("saveJobSite", async () => {
    const ctx = await requireUserForAction();
    const parsed = schema.safeParse(formToObject(fd));
    if (!parsed.success) return zodFail(parsed.error);
    const { id, ...v } = parsed.data;

    if (id) {
      const { error } = await ctx.supabase.from("job_sites").update(v).eq("id", id);
      if (error) return fail(dbError(error));
      revalidate(id);
      return ok({ id }, "Job site saved");
    }

    const limit = ctx.entitlements.plan.limits.jobSites;
    if (limit !== null) {
      const { count } = await ctx.supabase.from("job_sites").select("id", { count: "exact", head: true }).eq("archived", false);
      if ((count ?? 0) >= limit) return { ok: false, error: `The Free plan includes ${limit} saved job sites.`, upgrade: true };
    }
    const { data, error } = await ctx.supabase.from("job_sites").insert({ ...v, user_id: ctx.userId }).select("id").single();
    if (error) return fail(dbError(error));
    revalidate();
    return ok({ id: data.id }, "Job site added");
  });
}

export async function setJobSiteArchived(id: string, archived: boolean): Promise<ActionResult<null>> {
  return safeAction("archiveJobSite", async () => {
    const ctx = await requireUserForAction();
    if (!z.uuid().safeParse(id).success) return fail("Invalid job site.");
    const { error } = await ctx.supabase.from("job_sites").update({ archived }).eq("id", id);
    if (error) return fail(dbError(error));
    revalidate(id);
    return ok(null, archived ? "Job site archived" : "Job site restored");
  });
}

/** Deleting a site keeps its sessions; they're simply unlinked (FK on delete set null). */
export async function deleteJobSite(id: string): Promise<ActionResult<null>> {
  return safeAction("deleteJobSite", async () => {
    const ctx = await requireUserForAction();
    if (!z.uuid().safeParse(id).success) return fail("Invalid job site.");
    const { error } = await ctx.supabase.from("job_sites").delete().eq("id", id);
    if (error) return fail(dbError(error));
    revalidate();
    return ok(null, "Job site deleted");
  });
}
