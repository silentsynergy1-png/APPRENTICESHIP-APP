import { TZDate } from "@date-fns/tz";
import { addDays, format, startOfDay } from "date-fns";
import type { OvertimeMode } from "@/lib/types";

/**
 * Pure, timezone-aware working-time calculations.
 *
 * Design:
 *  - Durations are computed on absolute instants (epoch ms), so daylight-saving transitions
 *    are handled automatically (a 00:00–06:00 shift on DST-start night is 5 real hours).
 *  - Worked time = session interval minus UNPAID break intervals (clipped to the session).
 *  - Worked intervals are then split at *local* midnights in the session's IANA timezone,
 *    so overnight shifts land on the correct calendar days.
 *  - Categorisation (ordinary / overtime / weekend / public holiday) follows the user's own
 *    configured rules. Nothing here encodes an award or universal entitlement.
 */

export interface Interval {
  start: number; // epoch ms
  end: number; // epoch ms
}

export interface SessionInput {
  started_at: string;
  ended_at: string | null;
}

export interface BreakInput {
  started_at: string;
  ended_at: string | null;
  kind: "paid" | "unpaid";
}

export interface RulesInput {
  daily_ordinary_hours: number;
  weekly_ordinary_hours: number;
  overtime_mode: OvertimeMode;
  separate_weekend: boolean;
  week_starts_on: number; // 0 = Sunday … 6 = Saturday
}

export interface DayBreakdown {
  date: string; // yyyy-MM-dd (local)
  totalMinutes: number;
  ordinaryMinutes: number;
  overtimeMinutes: number;
  weekendMinutes: number;
  holidayMinutes: number;
}

export const MINUTE = 60_000;

const toMs = (iso: string) => new Date(iso).getTime();

/** Subtract `cuts` from `base`, returning the remaining (sorted, non-overlapping) intervals. */
export function subtractIntervals(base: Interval, cuts: Interval[]): Interval[] {
  const sorted = cuts
    .map((c) => ({ start: Math.max(c.start, base.start), end: Math.min(c.end, base.end) }))
    .filter((c) => c.end > c.start)
    .sort((a, b) => a.start - b.start);

  const out: Interval[] = [];
  let cursor = base.start;
  for (const c of sorted) {
    if (c.start > cursor) out.push({ start: cursor, end: c.start });
    cursor = Math.max(cursor, c.end);
  }
  if (cursor < base.end) out.push({ start: cursor, end: base.end });
  return out;
}

/**
 * Worked intervals for a session. An active session (no end) is measured up to `now`.
 * An open break is treated as running until `now` (or the session end, whichever is first).
 */
export function workedIntervals(session: SessionInput, breaks: BreakInput[], now: number = Date.now()): Interval[] {
  const start = toMs(session.started_at);
  const end = session.ended_at ? toMs(session.ended_at) : now;
  if (!(end > start)) return [];
  const cuts = breaks
    .filter((b) => b.kind === "unpaid")
    .map((b) => ({ start: toMs(b.started_at), end: b.ended_at ? toMs(b.ended_at) : Math.min(now, end) }));
  return subtractIntervals({ start, end }, cuts);
}

export function intervalMinutes(intervals: Interval[]): number {
  return intervals.reduce((sum, i) => sum + (i.end - i.start), 0) / MINUTE;
}

/** Total minutes of breaks (by kind) clipped to the session. */
export function breakMinutes(session: SessionInput, breaks: BreakInput[], now: number = Date.now(), kind?: "paid" | "unpaid"): number {
  const start = toMs(session.started_at);
  const end = session.ended_at ? toMs(session.ended_at) : now;
  return breaks
    .filter((b) => !kind || b.kind === kind)
    .reduce((sum, b) => {
      const s = Math.max(start, toMs(b.started_at));
      const e = Math.min(end, b.ended_at ? toMs(b.ended_at) : now);
      return sum + Math.max(0, e - s) / MINUTE;
    }, 0);
}

export function localDateKey(ms: number, timeZone: string): string {
  return format(new TZDate(ms, timeZone), "yyyy-MM-dd");
}

/** Epoch ms of the next local midnight after `ms` in `timeZone`. */
function nextLocalMidnight(ms: number, timeZone: string): number {
  const local = new TZDate(ms, timeZone);
  return startOfDay(addDays(local, 1)).getTime();
}

/** Split intervals at local midnight; returns minutes per local date. */
export function minutesByLocalDay(intervals: Interval[], timeZone: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const iv of intervals) {
    let cursor = iv.start;
    while (cursor < iv.end) {
      const boundary = Math.min(iv.end, nextLocalMidnight(cursor, timeZone));
      const key = localDateKey(cursor, timeZone);
      out.set(key, (out.get(key) ?? 0) + (boundary - cursor) / MINUTE);
      cursor = boundary;
    }
  }
  return out;
}

/** Day of week (0 = Sunday) for a yyyy-MM-dd key. Calendar maths, timezone-independent. */
export function weekdayOfKey(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
}

export function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + days));
  return dt.toISOString().slice(0, 10);
}

/** The first local date of the week containing `key`. */
export function weekStartKey(key: string, weekStartsOn: number): string {
  const diff = (weekdayOfKey(key) - weekStartsOn + 7) % 7;
  return addDaysToKey(key, -diff);
}

/** Epoch ms of local midnight at the start of the given yyyy-MM-dd in `timeZone`. */
export function localMidnightMs(key: string, timeZone: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return new TZDate(y!, m! - 1, d!, 0, 0, 0, timeZone).getTime();
}

/**
 * Categorise per-day minutes using the user's rules.
 *  - Public holidays (user-defined dates): all minutes → holiday.
 *  - Weekends (Sat/Sun) when `separate_weekend`: all minutes → weekend.
 *  - Otherwise ordinary, capped per day (daily modes) and per week (weekly modes),
 *    with the excess as overtime. Weekly caps are applied in chronological order.
 */
export function categoriseDays(
  perDay: Map<string, number>,
  rules: RulesInput,
  holidays: Set<string> = new Set(),
): DayBreakdown[] {
  const keys = [...perDay.keys()].sort();
  const dailyCap = rules.daily_ordinary_hours * 60;
  const weeklyCap = rules.weekly_ordinary_hours * 60;
  const useDaily = rules.overtime_mode === "daily" || rules.overtime_mode === "daily_and_weekly";
  const useWeekly = rules.overtime_mode === "weekly" || rules.overtime_mode === "daily_and_weekly";
  const weeklyOrdinary = new Map<string, number>();

  return keys.map((date) => {
    const total = round2(perDay.get(date) ?? 0);
    const base: DayBreakdown = {
      date,
      totalMinutes: total,
      ordinaryMinutes: 0,
      overtimeMinutes: 0,
      weekendMinutes: 0,
      holidayMinutes: 0,
    };
    if (holidays.has(date)) return { ...base, holidayMinutes: total };
    const dow = weekdayOfKey(date);
    if (rules.separate_weekend && (dow === 0 || dow === 6)) return { ...base, weekendMinutes: total };

    let ordinary = total;
    let overtime = 0;
    if (useDaily && ordinary > dailyCap) {
      overtime += ordinary - dailyCap;
      ordinary = dailyCap;
    }
    if (useWeekly) {
      const wk = weekStartKey(date, rules.week_starts_on);
      const soFar = weeklyOrdinary.get(wk) ?? 0;
      const room = Math.max(0, weeklyCap - soFar);
      if (ordinary > room) {
        overtime += ordinary - room;
        ordinary = room;
      }
      weeklyOrdinary.set(wk, soFar + ordinary);
    }
    return { ...base, ordinaryMinutes: round2(ordinary), overtimeMinutes: round2(overtime) };
  });
}

export interface SessionWithBreaksInput extends SessionInput {
  timezone: string;
  breaks: BreakInput[];
}

/** Aggregate many sessions into categorised day breakdowns. */
export function summariseSessions(
  sessions: SessionWithBreaksInput[],
  rules: RulesInput,
  holidays: Set<string> = new Set(),
  now: number = Date.now(),
  timeZone?: string,
): DayBreakdown[] {
  const perDay = new Map<string, number>();
  for (const s of sessions) {
    const tz = timeZone ?? s.timezone;
    for (const [k, v] of minutesByLocalDay(workedIntervals(s, s.breaks, now), tz)) {
      perDay.set(k, (perDay.get(k) ?? 0) + v);
    }
  }
  return categoriseDays(perDay, rules, holidays);
}

export function totals(days: DayBreakdown[]) {
  return days.reduce(
    (t, d) => ({
      totalMinutes: t.totalMinutes + d.totalMinutes,
      ordinaryMinutes: t.ordinaryMinutes + d.ordinaryMinutes,
      overtimeMinutes: t.overtimeMinutes + d.overtimeMinutes,
      weekendMinutes: t.weekendMinutes + d.weekendMinutes,
      holidayMinutes: t.holidayMinutes + d.holidayMinutes,
    }),
    { totalMinutes: 0, ordinaryMinutes: 0, overtimeMinutes: 0, weekendMinutes: 0, holidayMinutes: 0 },
  );
}

/** Minutes worked by a single session (unpaid breaks deducted). */
export function sessionWorkedMinutes(session: SessionInput, breaks: BreakInput[], now: number = Date.now()): number {
  return intervalMinutes(workedIntervals(session, breaks, now));
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/* ------------------------------- formatting ------------------------------- */

export function formatMinutes(mins: number, opts: { compact?: boolean } = {}): string {
  const m = Math.max(0, Math.round(mins));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (opts.compact) return `${h}:${String(r).padStart(2, "0")}`;
  if (h === 0) return `${r}m`;
  return r === 0 ? `${h}h` : `${h}h ${String(r).padStart(2, "0")}m`;
}

export function toHours(mins: number, digits = 2): number {
  return Math.round((mins / 60) * 10 ** digits) / 10 ** digits;
}

export function formatLocal(iso: string | number, timeZone: string, pattern: string): string {
  return format(new TZDate(typeof iso === "number" ? iso : new Date(iso).getTime(), timeZone), pattern);
}

/** Converts a local "yyyy-MM-ddTHH:mm" (datetime-local input) in `timeZone` to an ISO instant. */
export function localInputToIso(value: string, timeZone: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number) as unknown as number[];
  const dt = new TZDate(y!, mo! - 1, d!, h!, mi!, 0, timeZone);
  if (Number.isNaN(dt.getTime())) return null;
  return new Date(dt.getTime()).toISOString();
}

/** ISO instant → "yyyy-MM-ddTHH:mm" in `timeZone` for datetime-local inputs. */
export function isoToLocalInput(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return "";
  return formatLocal(iso, timeZone, "yyyy-MM-dd'T'HH:mm");
}

export function todayKey(timeZone: string, now: number = Date.now()): string {
  return localDateKey(now, timeZone);
}

/**
 * The current instant for a server render. Server components render once per request,
 * so reading the clock here is intentional (and keeps "now" consistent within a page).
 */
export function requestNow(): number {
  return Date.now();
}
