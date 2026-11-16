import { describe, expect, it } from "vitest";
import { apprenticeshipTimeline, ordinal } from "./apprenticeship";

describe("apprenticeship timeline", () => {
  it("computes year and progress", () => {
    const t = apprenticeshipTimeline("2025-02-03", "2029-02-03", "2026-11-16");
    expect(t.year).toBe(2);
    expect(t.totalYears).toBe(4);
    expect(t.timePercent).toBeGreaterThan(40);
    expect(t.timePercent).toBeLessThan(50);
    expect(t.finished).toBe(false);
  });

  it("year rolls over on the anniversary", () => {
    expect(apprenticeshipTimeline("2025-11-16", "2029-11-16", "2026-11-15").year).toBe(1);
    expect(apprenticeshipTimeline("2025-11-16", "2029-11-16", "2026-11-16").year).toBe(2);
  });

  it("handles not-yet-started and finished", () => {
    expect(apprenticeshipTimeline("2027-01-01", "2031-01-01", "2026-11-16")).toMatchObject({ year: 0, started: false, timePercent: 0 });
    expect(apprenticeshipTimeline("2020-01-01", "2024-01-01", "2026-11-16")).toMatchObject({ finished: true, timePercent: 100, year: 4 });
  });

  it("ordinals", () => {
    expect([1, 2, 3, 4, 11, 22].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "22nd"]);
  });
});
