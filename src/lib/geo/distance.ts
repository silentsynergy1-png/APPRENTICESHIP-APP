export interface LatLng {
  latitude: number;
  longitude: number;
}

/** Great-circle distance in metres (haversine). */
export function distanceMetres(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface SiteCandidate extends LatLng {
  id: string;
  name: string;
  match_radius_m: number;
}

/**
 * Finds the saved job site the user is most likely at.
 * A site matches if the reading is within its radius, widened by the GPS accuracy
 * (capped so a very poor fix can't match everything nearby).
 */
export function matchJobSite<T extends SiteCandidate>(
  point: LatLng & { accuracy?: number | null },
  sites: T[],
): { site: T; distance: number } | null {
  const slack = Math.min(point.accuracy ?? 0, 250);
  let best: { site: T; distance: number } | null = null;
  for (const site of sites) {
    const distance = distanceMetres(point, site);
    if (distance <= site.match_radius_m + slack && (!best || distance < best.distance)) {
      best = { site, distance };
    }
  }
  return best;
}

export interface PastSession extends LatLng {
  job_site_id: string | null;
  address: string | null;
}

/**
 * Detects a frequently visited, not-yet-saved location: returns how many previous sessions
 * without a job site started within `radius` metres of this point.
 */
export function countRepeatVisits(point: LatLng, past: PastSession[], radius = 150): { count: number; address: string | null } {
  let count = 0;
  let address: string | null = null;
  for (const p of past) {
    if (p.job_site_id) continue;
    if (distanceMetres(point, p) <= radius) {
      count++;
      address ??= p.address;
    }
  }
  return { count, address };
}

/** Human description of GPS quality, so approximate readings are never presented as exact. */
export function accuracyLabel(accuracy: number | null | undefined): { label: string; tone: "success" | "warning" | "danger" | "neutral" } {
  if (accuracy == null) return { label: "Accuracy unknown", tone: "neutral" };
  if (accuracy <= 30) return { label: `±${Math.round(accuracy)} m · good`, tone: "success" };
  if (accuracy <= 100) return { label: `±${Math.round(accuracy)} m · fair`, tone: "warning" };
  return { label: `±${Math.round(accuracy)} m · approximate`, tone: "danger" };
}
