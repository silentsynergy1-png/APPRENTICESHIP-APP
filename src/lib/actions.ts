import "server-only";
import { z } from "zod";
import { AuthError, PlanError } from "@/lib/auth";

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string>; upgrade?: boolean };

export function ok<T>(data: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

export function fail(error: string, fieldErrors?: Record<string, string>): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

export function zodFail(err: z.ZodError): ActionResult<never> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".");
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return { ok: false, error: "Please check the highlighted fields.", fieldErrors };
}

/**
 * Wraps a server action so unexpected errors never leak internals (or user data) to the client.
 * Logs only the error message and a short tag — never request payloads.
 */
export async function safeAction<T>(tag: string, fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    if (e instanceof PlanError) return { ok: false, error: e.message, upgrade: true };
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) {
      throw e;
    }
    console.error(`[action:${tag}]`, e instanceof Error ? e.message : "unknown error");
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/** Maps common Postgres errors from Supabase to friendly messages. */
export function dbError(error: { code?: string; message: string } | null, fallback = "Couldn't save. Please try again."): string {
  if (!error) return fallback;
  switch (error.code) {
    case "23505":
      return "That already exists.";
    case "23514":
      return "Some values are outside the allowed range.";
    case "23503":
      return "A linked record no longer exists.";
    case "42501":
      return "You don't have access to that record.";
    default:
      return fallback;
  }
}

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters`)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null);

export const optionalUuid = z
  .string()
  .trim()
  .transform((v) => (v === "" || v === "none" ? null : v))
  .nullable()
  .optional()
  .transform((v) => v ?? null)
  .refine((v) => v === null || z.uuid().safeParse(v).success, "Invalid selection");

export const optionalDate = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional()
  .transform((v) => v ?? null)
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Use a valid date");

export const optionalMoney = z
  .union([z.string(), z.number()])
  .optional()
  .nullable()
  .transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(/[$,\s]/g, ""));
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
  })
  .refine((v) => v === null || (!Number.isNaN(v) && v >= 0 && v < 100_000_000), "Enter a valid amount");

/** Last value wins, so a hidden "off" followed by a checked checkbox's "on" yields "on". */
export function formToObject(fd: FormData): Record<string, string> {
  const obj: Record<string, string> = {};
  fd.forEach((value, key) => {
    if (typeof value === "string") obj[key] = value;
  });
  return obj;
}
