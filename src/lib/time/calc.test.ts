import { describe, expect, it } from "vitest";
import {
  breakMinutes,
  categoriseDays,
  formatMinutes,
  isoToLocalInput,
  localInputToIso,
  localMidnightMs,
  minutesByLocalDay,
  sessionWorkedMinutes,
  subtractIntervals,
  summariseSessions,
  totals,
  weekStartKey,
  workedIntervals,
  type RulesInput,
} from "./calc";

const SYD = "Australia/Sydney";
const PER = "Australia/Perth";
const rules: RulesInput = {
  daily_ordinary_hours: 7.6,
  weekly_ordinary_hours: 38,
  overtime_mode: "daily_and_weekly",
  separate_weekend: true,
  week_starts_on: 1,
};

/** Local Sydney wall time → ISO. */
const syd = (local: string) => localInputToIso(local, SYD)!;

describe("intervals & breaks", () => {
  it("subtracts overlapping and out-of-range cuts", () => {
    const base = { start: 0, end: 100 };
    expect(subtractIntervals(base, [{ start: 10, end: 20 }, { start: 15, end: 30 }, { start: 90, end: 200 }])).toEqual([
      { start: 0, end: 10 },
      { start: 30, end: 90 },
    ]);
  });

  it("deducts unpaid breaks but not paid ones", () => {
    const s = { started_at: syd("2026-11-16T07:00"), ended_at: syd("2026-11-16T15:30") };
    const breaks = [
      { started_at: syd("2026-11-16T12:00"), ended_at: syd("2026-11-16T12:30"), kind: "unpaid" as const },
      { started_at: syd("2026-11-16T09:30"), ended_at: syd("2026-11-16T09:45"), kind: "paid" as const },
    ];
    expect(sessionWorkedMinutes(s, breaks)).toBe(480);
    expect(breakMinutes(s, breaks, Date.now(), "unpaid")).toBe(30);
    expect(breakMinutes(s, breaks, Date.now(), "paid")).toBe(15);
  });

  it("clips breaks that extend past the session", () => {
    const s = { started_at: syd("2026-11-16T07:00"), ended_at: syd("2026-11-16T12:00") };
    const b = [{ started_at: syd("2026-11-16T11:30"), ended_at: syd("2026-11-16T13:00"), kind: "unpaid" as const }];
    expect(sessionWorkedMinutes(s, b)).toBe(270);
  });

  it("measures an active session (and open break) up to now", () => {
    const now = new Date(syd("2026-11-16T10:00")).getTime();
    const s = { started_at: syd("2026-11-16T07:00"), ended_at: null };
    const b = [{ started_at: syd("2026-11-16T09:30"), ended_at: null, kind: "unpaid" as const }];
    expect(sessionWorkedMinutes(s, b, now)).toBe(150);
  });

  it("returns zero for inverted sessions", () => {
    expect(workedIntervals({ started_at: syd("2026-11-16T10:00"), ended_at: syd("2026-11-16T09:00") }, [])).toEqual([]);
  });
});

describe("local day splitting", () => {
  it("splits an overnight shift at local midnight", () => {
    const iv = workedIntervals({ started_at: syd("2026-11-16T20:00"), ended_at: syd("2026-11-17T04:00") }, []);
    const days = minutesByLocalDay(iv, SYD);
    expect(Object.fromEntries(days)).toEqual({ "2026-11-16": 240, "2026-11-17": 240 });
  });

  it("uses the session's timezone, not UTC", () => {
    // 06:00–14:00 Perth is 22:00–06:00 UTC: still one Perth day.
    const start = localInputToIso("2026-11-16T06:00", PER)!;
    const end = localInputToIso("2026-11-16T14:00", PER)!;
    const days = minutesByLocalDay(workedIntervals({ started_at: start, ended_at: end }, []), PER);
    expect(Object.fromEntries(days)).toEqual({ "2026-11-16": 480 });
  });
});

describe("daylight saving (Australia/Sydney)", () => {
  it("DST start (4 Oct 2026, 02:00→03:00): 00:00–06:00 is 5 real hours", () => {
    const s = { started_at: syd("2026-10-04T00:00"), ended_at: syd("2026-10-04T06:00") };
    expect(sessionWorkedMinutes(s, [])).toBe(300);
    expect(Object.fromEntries(minutesByLocalDay(workedIntervals(s, []), SYD))).toEqual({ "2026-10-04": 300 });
  });

  it("DST end (5 Apr 2026, 03:00→02:00): 00:00–06:00 is 7 real hours", () => {
    const s = { started_at: syd("2026-04-05T00:00"), ended_at: syd("2026-04-05T06:00") };
    expect(sessionWorkedMinutes(s, [])).toBe(420);
  });

  it("overnight shift across DST start is split correctly", () => {
    const s = { started_at: syd("2026-10-03T22:00"), ended_at: syd("2026-10-04T06:00") };
    const days = Object.fromEntries(minutesByLocalDay(workedIntervals(s, []), SYD));
    expect(days).toEqual({ "2026-10-03": 120, "2026-10-04": 300 });
  });

  it("local midnight on DST days is a real instant", () => {
    const a = localMidnightMs("2026-10-04", SYD);
    const b = localMidnightMs("2026-10-05", SYD);
    expect((b - a) / 3_600_000).toBe(23);
    const c = localMidnightMs("2026-04-05", SYD);
    const d = localMidnightMs("2026-04-06", SYD);
    expect((d - c) / 3_600_000).toBe(25);
  });

  it("round-trips datetime-local values through DST", () => {
    const iso = syd("2026-10-04T03:30");
    expect(isoToLocalInput(iso, SYD)).toBe("2026-10-04T03:30");
  });
});

describe("categorisation", () => {
  it("daily overtime beyond the configured ordinary hours", () => {
    const [d] = categoriseDays(new Map([["2026-11-16", 600]]), rules);
    expect(d).toMatchObject({ ordinaryMinutes: 456, overtimeMinutes: 144 });
  });

  it("weekly overtime once the week's ordinary hours are used", () => {
    const weeklyOnly = { ...rules, overtime_mode: "weekly" as const };
    const perDay = new Map([
      ["2026-11-16", 480],
      ["2026-11-17", 480],
      ["2026-11-18", 480],
      ["2026-11-19", 480],
      ["2026-11-20", 480],
    ]);
    const days = categoriseDays(perDay, weeklyOnly);
    expect(days.slice(0, 4).every((d) => d.overtimeMinutes === 0)).toBe(true);
    expect(days[4]).toMatchObject({ ordinaryMinutes: 360, overtimeMinutes: 120 });
    expect(totals(days)).toMatchObject({ ordinaryMinutes: 2280, overtimeMinutes: 120 });
  });

  it("weekly caps reset at the configured week start", () => {
    const weeklyOnly = { ...rules, overtime_mode: "weekly" as const, weekly_ordinary_hours: 8 };
    const days = categoriseDays(new Map([["2026-11-22", 480], ["2026-11-23", 480]]), { ...weeklyOnly, separate_weekend: false });
    // 22 Nov is a Sunday (previous week when weeks start Monday)
    expect(days.map((d) => d.overtimeMinutes)).toEqual([0, 0]);
  });

  it("weekend and public holiday minutes are kept separate", () => {
    const days = categoriseDays(
      new Map([
        ["2026-11-21", 300], // Saturday
        ["2026-12-25", 240], // user-marked public holiday
      ]),
      rules,
      new Set(["2026-12-25"]),
    );
    expect(days[0]).toMatchObject({ weekendMinutes: 300, ordinaryMinutes: 0 });
    expect(days[1]).toMatchObject({ holidayMinutes: 240, ordinaryMinutes: 0 });
  });

  it("no overtime when the user turns it off", () => {
    const [d] = categoriseDays(new Map([["2026-11-16", 720]]), { ...rules, overtime_mode: "none" });
    expect(d).toMatchObject({ ordinaryMinutes: 720, overtimeMinutes: 0 });
  });

  it("weekend counted as ordinary when not separated", () => {
    const [d] = categoriseDays(new Map([["2026-11-21", 300]]), { ...rules, separate_weekend: false });
    expect(d).toMatchObject({ ordinaryMinutes: 300, weekendMinutes: 0 });
  });

  it("summarises multiple sessions on one day (multiple job sites)", () => {
    const days = summariseSessions(
      [
        { started_at: syd("2026-11-16T07:00"), ended_at: syd("2026-11-16T11:00"), timezone: SYD, breaks: [] },
        { started_at: syd("2026-11-16T11:30"), ended_at: syd("2026-11-16T17:30"), timezone: SYD, breaks: [] },
      ],
      rules,
    );
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({ totalMinutes: 600, ordinaryMinutes: 456, overtimeMinutes: 144 });
  });
});

describe("helpers", () => {
  it("formats minutes", () => {
    expect(formatMinutes(0)).toBe("0m");
    expect(formatMinutes(456)).toBe("7h 36m");
    expect(formatMinutes(480)).toBe("8h");
    expect(formatMinutes(456, { compact: true })).toBe("7:36");
  });

  it("finds week start", () => {
    expect(weekStartKey("2026-11-19", 1)).toBe("2026-11-16");
    expect(weekStartKey("2026-11-16", 1)).toBe("2026-11-16");
    expect(weekStartKey("2026-11-22", 1)).toBe("2026-11-16");
    expect(weekStartKey("2026-11-22", 0)).toBe("2026-11-22");
  });

  it("rejects malformed local input", () => {
    expect(localInputToIso("2026-13-45", SYD)).toBeNull();
    expect(localInputToIso("garbage", SYD)).toBeNull();
  });
});
