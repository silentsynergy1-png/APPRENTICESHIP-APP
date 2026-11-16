import "server-only";

/**
 * Simple fixed-window limiter keyed per user + action. In-memory, so it limits per server
 * instance — enough to stop accidental hammering of third-party APIs (geocoding).
 * AI usage is additionally limited by the database (consume_ai_quota), which is global.
 */
const windows = new Map<string, { start: number; count: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const w = windows.get(key);
  if (!w || now - w.start > windowMs) {
    windows.set(key, { start: now, count: 1 });
    if (windows.size > 10_000) {
      for (const [k, v] of windows) if (now - v.start > windowMs) windows.delete(k);
    }
    return true;
  }
  if (w.count >= limit) return false;
  w.count++;
  return true;
}
