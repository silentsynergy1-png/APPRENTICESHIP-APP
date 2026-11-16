import "server-only";

/**
 * Reverse-geocoding behind a provider interface so the vendor can be swapped by config.
 *   GEOCODER_PROVIDER = "mapbox" | "google" | "nominatim" | "none"
 * Keys never leave the server. Results are approximate addresses, not verified properties.
 */
export interface ReverseGeocodeResult {
  label: string; // e.g. "12 Example St, Parramatta NSW 2150"
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  provider: string;
}

export interface ReverseGeocoder {
  readonly name: string;
  reverse(lat: number, lng: number): Promise<ReverseGeocodeResult | null>;
}

const TIMEOUT_MS = 6000;

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  if (!res.ok) throw new Error(`geocoder http ${res.status}`);
  return res.json();
}

const STATE_ABBR: Record<string, string> = {
  "New South Wales": "NSW",
  Victoria: "VIC",
  Queensland: "QLD",
  "Western Australia": "WA",
  "South Australia": "SA",
  Tasmania: "TAS",
  "Australian Capital Territory": "ACT",
  "Northern Territory": "NT",
};
const abbr = (s: string | null | undefined) => (s ? (STATE_ABBR[s] ?? s) : null);

function compose(parts: { street?: string | null; suburb?: string | null; state?: string | null; postcode?: string | null }) {
  const locality = [parts.suburb, parts.state, parts.postcode].filter(Boolean).join(" ");
  return [parts.street, locality].filter(Boolean).join(", ");
}

class NominatimGeocoder implements ReverseGeocoder {
  readonly name = "nominatim";
  constructor(private baseUrl: string, private userAgent: string) {}
  async reverse(lat: number, lng: number) {
    const url = `${this.baseUrl}/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${lat}&lon=${lng}`;
    const data = (await fetchJson(url, { headers: { "User-Agent": this.userAgent, "Accept-Language": "en-AU" } })) as {
      address?: Record<string, string>;
      display_name?: string;
    };
    if (!data?.address) return null;
    const a = data.address;
    const street = [a.house_number, a.road].filter(Boolean).join(" ") || a.building || null;
    const suburb = a.suburb ?? a.town ?? a.city_district ?? a.village ?? a.city ?? null;
    const state = abbr(a.state);
    const label = compose({ street, suburb, state, postcode: a.postcode }) || data.display_name || "";
    return label ? { label, suburb, state, postcode: a.postcode ?? null, provider: this.name } : null;
  }
}

class MapboxGeocoder implements ReverseGeocoder {
  readonly name = "mapbox";
  constructor(private token: string) {}
  async reverse(lat: number, lng: number) {
    const url = `https://api.mapbox.com/search/geocode/v6/reverse?longitude=${lng}&latitude=${lat}&country=au&limit=1&access_token=${encodeURIComponent(this.token)}`;
    const data = (await fetchJson(url)) as {
      features?: { properties?: { full_address?: string; name?: string; context?: Record<string, { name?: string; region_code?: string }> } }[];
    };
    const p = data.features?.[0]?.properties;
    if (!p) return null;
    const ctx = p.context ?? {};
    const suburb = ctx.locality?.name ?? ctx.place?.name ?? null;
    const state = ctx.region?.region_code ?? abbr(ctx.region?.name) ?? null;
    const postcode = ctx.postcode?.name ?? null;
    const label = compose({ street: ctx.address?.name ?? p.name ?? null, suburb, state, postcode }) || p.full_address || "";
    return label ? { label, suburb, state, postcode, provider: this.name } : null;
  }
}

class GoogleGeocoder implements ReverseGeocoder {
  readonly name = "google";
  constructor(private key: string) {}
  async reverse(lat: number, lng: number) {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&region=au&key=${encodeURIComponent(this.key)}`;
    const data = (await fetchJson(url)) as {
      results?: { formatted_address: string; address_components: { long_name: string; short_name: string; types: string[] }[] }[];
    };
    const r = data.results?.[0];
    if (!r) return null;
    const get = (t: string, short = false) => {
      const c = r.address_components.find((c) => c.types.includes(t));
      return c ? (short ? c.short_name : c.long_name) : null;
    };
    const street = [get("street_number"), get("route")].filter(Boolean).join(" ") || null;
    const suburb = get("locality");
    const state = get("administrative_area_level_1", true);
    const postcode = get("postal_code");
    const label = compose({ street, suburb, state, postcode }) || r.formatted_address.replace(/, Australia$/, "");
    return { label, suburb, state, postcode, provider: this.name };
  }
}

let cached: ReverseGeocoder | null | undefined;

/** Returns the configured provider, or null when address lookup isn't set up. */
export function getGeocoder(): ReverseGeocoder | null {
  if (cached !== undefined) return cached;
  const provider = (process.env.GEOCODER_PROVIDER ?? "none").toLowerCase();
  if (provider === "mapbox" && process.env.MAPBOX_ACCESS_TOKEN) {
    cached = new MapboxGeocoder(process.env.MAPBOX_ACCESS_TOKEN);
  } else if (provider === "google" && process.env.GOOGLE_MAPS_API_KEY) {
    cached = new GoogleGeocoder(process.env.GOOGLE_MAPS_API_KEY);
  } else if (provider === "nominatim") {
    cached = new NominatimGeocoder(
      process.env.NOMINATIM_BASE_URL ?? "https://nominatim.openstreetmap.org",
      process.env.NOMINATIM_USER_AGENT ?? "ApprenticeOS/0.1 (self-hosted)",
    );
  } else {
    cached = null;
  }
  return cached;
}

/* Small in-memory cache: repeated clock-ins at the same site shouldn't re-query the provider. */
const memo = new Map<string, { at: number; value: ReverseGeocodeResult | null }>();
const MEMO_TTL = 1000 * 60 * 60 * 6;

export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult | null> {
  const geocoder = getGeocoder();
  if (!geocoder) return null;
  // ~11 m grid: fine enough for an approximate street address, coarse enough to cache.
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < MEMO_TTL) return hit.value;
  const value = await geocoder.reverse(lat, lng);
  if (memo.size > 2000) memo.clear();
  memo.set(key, { at: Date.now(), value });
  return value;
}
