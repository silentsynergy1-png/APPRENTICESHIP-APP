/** Apprenticeship timeline maths (calendar-based; dates are yyyy-MM-dd). */

const dayMs = 86_400_000;
const parse = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  return Date.UTC(y!, m! - 1, dd!);
};

export interface ApprenticeshipTimeline {
  /** 1-based apprenticeship year (e.g. 2 = second year). */
  year: number;
  totalYears: number;
  /** Time-elapsed % between start and expected completion. */
  timePercent: number;
  daysRemaining: number;
  started: boolean;
  finished: boolean;
}

export function apprenticeshipTimeline(startDate: string, expectedCompletion: string, today: string): ApprenticeshipTimeline {
  const s = parse(startDate);
  const e = parse(expectedCompletion);
  const t = parse(today);
  const total = Math.max(1, e - s);
  const elapsed = Math.min(Math.max(0, t - s), total);
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let years = ty! - sy!;
  if (tm! < sm! || (tm === sm && td! < sd!)) years -= 1;
  const totalYears = Math.max(1, Math.ceil(total / (365.25 * dayMs)));
  return {
    year: t < s ? 0 : Math.min(totalYears, Math.max(1, years + 1)),
    totalYears,
    timePercent: Math.round((elapsed / total) * 1000) / 10,
    daysRemaining: Math.max(0, Math.round((e - t) / dayMs)),
    started: t >= s,
    finished: t >= e,
  };
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]!);
}
