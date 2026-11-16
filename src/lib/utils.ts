import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const aud = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });
export function formatCurrency(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (n == null || Number.isNaN(n)) return "—";
  return aud.format(n);
}

export function initials(name: string | null | undefined): string {
  if (!name) return "A";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function firstName(name: string | null | undefined): string | null {
  if (!name) return null;
  return name.trim().split(/\s+/)[0] ?? null;
}

/** Splits a comma/newline separated string into a clean, de-duplicated list. */
export function splitList(value: FormDataEntryValue | string | null | undefined, max = 100): string[] {
  if (typeof value !== "string") return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value.split(/[\n,]/)) {
    const item = raw.trim().slice(0, 200);
    const key = item.toLowerCase();
    if (item && !seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
    if (out.length >= max) break;
  }
  return out;
}

export function emptyToNull(value: FormDataEntryValue | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v === "" ? null : v;
}
