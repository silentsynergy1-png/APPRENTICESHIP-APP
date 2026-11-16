"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserForAction } from "@/lib/auth";
import { dbError, fail, formToObject, ok, optionalText, safeAction, zodFail, type ActionResult } from "@/lib/actions";
import { TIMEZONES } from "@/lib/constants";

const onOff = z.enum(["on", "off"]).default("off").transform((v) => v === "on");

/* --------------------------------- profile -------------------------------- */
const profileSchema = z.object({
  full_name: z.string().trim().min(1, "Enter your name").max(120),
  trade: z.enum(["electrical", "plumbing", "carpentry", "automotive", "refrigeration", "other"]),
  state: z.enum(["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"]),
  timezone: z.string().refine((t) => TIMEZONES.includes(t), "Choose a timezone"),
  location_enabled: onOff,
});

export async function updateProfile(fd: FormData): Promise<ActionResult<null>> {
  return safeAction("updateProfile", async () => {
    const ctx = await requireUserForAction();
    const parsed = profileSchema.safeParse(formToObject(fd));
    if (!parsed.success) return zodFail(parsed.error);
    const { error } = await ctx.supabase.from("profiles").update(parsed.data).eq("id", ctx.userId);
    if (error) return fail(dbError(error));
    revalidatePath("/", "layout");
    return ok(null, "Profile saved");
  });
}

/* ------------------------------- work rules ------------------------------- */
const rulesSchema = z.object({
  daily_ordinary_hours: z.coerce.number().min(0, "0–24 hours").max(24, "0–24 hours"),
  weekly_ordinary_hours: z.coerce.number().min(0, "0–168 hours").max(168, "0–168 hours"),
  overtime_mode: z.enum(["none", "daily", "weekly", "daily_and_weekly"]),
  separate_weekend: onOff,
  week_starts_on: z.coerce.number().int().min(0).max(6),
  forgotten_clock_out_hours: z.coerce.number().min(1, "1–24 hours").max(24, "1–24 hours"),
  timesheet_due_weekday: z
    .string()
    .transform((v) => (v === "" ? null : Number(v)))
    .refine((v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 6), "Choose a day"),
});

export async function updateWorkRules(fd: FormData): Promise<ActionResult<null>> {
  return safeAction("updateRules", async () => {
    const ctx = await requireUserForAction();
    const parsed = rulesSchema.safeParse(formToObject(fd));
    if (!parsed.success) return zodFail(parsed.error);
    const { error } = await ctx.supabase.from("work_rules").update(parsed.data).eq("user_id", ctx.userId);
    if (error) return fail(dbError(error));
    revalidatePath("/", "layout");
    return ok(null, "Work rules saved");
  });
}

const holidaySchema = z.object({
  holiday_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  name: z.string().trim().min(1, "Name the holiday").max(120),
});

export async function addHoliday(fd: FormData): Promise<ActionResult<null>> {
  return safeAction("addHoliday", async () => {
    const ctx = await requireUserForAction();
    const parsed = holidaySchema.safeParse(formToObject(fd));
    if (!parsed.success) return zodFail(parsed.error);
    const { error } = await ctx.supabase.from("public_holidays").insert({ ...parsed.data, user_id: ctx.userId });
    if (error) return fail(error.code === "23505" ? "That date is already marked as a public holiday." : dbError(error));
    revalidatePath("/settings/work");
    revalidatePath("/timesheets");
    return ok(null, "Public holiday added");
  });
}

export async function deleteHoliday(id: string): Promise<ActionResult<null>> {
  return safeAction("deleteHoliday", async () => {
    const ctx = await requireUserForAction();
    if (!z.uuid().safeParse(id).success) return fail("Invalid holiday.");
    const { error } = await ctx.supabase.from("public_holidays").delete().eq("id", id);
    if (error) return fail(dbError(error));
    revalidatePath("/settings/work");
    revalidatePath("/timesheets");
    return ok(null, "Removed");
  });
}

/* -------------------------------- employers ------------------------------- */
const employerSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, "Enter the business name").max(160),
  abn: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v.replace(/\s/g, "")))
    .refine((v) => v === null || /^\d{11}$/.test(v), "An ABN has 11 digits")
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  phone: optionalText(40),
  email: optionalText(200).refine((v) => v === null || z.email().safeParse(v).success, "Enter a valid email"),
  address: optionalText(300),
  supervisor_name: optionalText(120),
  supervisor_phone: optionalText(40),
  supervisor_email: optionalText(200).refine((v) => v === null || z.email().safeParse(v).success, "Enter a valid email"),
  supervisor_licence: optionalText(60),
  notes: optionalText(4000),
  is_primary: onOff,
});

export async function saveEmployer(fd: FormData): Promise<ActionResult<{ id: string }>> {
  return safeAction<{ id: string }>("saveEmployer", async () => {
    const ctx = await requireUserForAction();
    const parsed = employerSchema.safeParse(formToObject(fd));
    if (!parsed.success) return zodFail(parsed.error);
    const { id, ...v } = parsed.data;
    if (v.is_primary) {
      await ctx.supabase.from("employers").update({ is_primary: false }).eq("is_primary", true);
    }
    if (id) {
      const { error } = await ctx.supabase.from("employers").update(v).eq("id", id);
      if (error) return fail(dbError(error));
      revalidatePath("/", "layout");
      return ok({ id }, "Employer saved");
    }
    const { data, error } = await ctx.supabase.from("employers").insert({ ...v, user_id: ctx.userId }).select("id").single();
    if (error) return fail(dbError(error));
    revalidatePath("/", "layout");
    return ok({ id: data.id }, "Employer added");
  });
}

export async function archiveEmployer(id: string, archived: boolean): Promise<ActionResult<null>> {
  return safeAction("archiveEmployer", async () => {
    const ctx = await requireUserForAction();
    if (!z.uuid().safeParse(id).success) return fail("Invalid employer.");
    const { error } = await ctx.supabase.from("employers").update({ archived, ...(archived ? { is_primary: false } : {}) }).eq("id", id);
    if (error) return fail(dbError(error));
    revalidatePath("/", "layout");
    return ok(null, archived ? "Employer archived" : "Employer restored");
  });
}

/* ------------------------------ notifications ----------------------------- */
const PREF_KEYS = ["assessments", "timesheets", "milestones", "warranties", "documents", "goals", "forgotten_clock_out"] as const;

export async function updateNotificationPrefs(fd: FormData): Promise<ActionResult<null>> {
  return safeAction("notificationPrefs", async () => {
    const ctx = await requireUserForAction();
    const obj = formToObject(fd);
    const prefs = Object.fromEntries(PREF_KEYS.map((k) => [k, obj[k] === "on"]));
    const { error } = await ctx.supabase.from("profiles").update({ notification_prefs: prefs }).eq("id", ctx.userId);
    if (error) return fail(dbError(error));
    revalidatePath("/settings/notifications");
    return ok(null, "Notification preferences saved");
  });
}
