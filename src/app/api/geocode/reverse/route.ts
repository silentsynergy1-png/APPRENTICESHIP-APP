import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAppContext } from "@/lib/auth";
import { reverseGeocode } from "@/lib/geo/geocoder";
import { rateLimit } from "@/lib/rate-limit";

const body = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) });

/** Server-side reverse geocoding so provider keys never reach the browser. Coordinates are not logged. */
export async function POST(request: NextRequest) {
  const ctx = await getAppContext();
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!rateLimit(`geo:${ctx.userId}`, 30, 60_000)) {
    return NextResponse.json({ error: "Too many lookups. Try again in a minute." }, { status: 429 });
  }
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  try {
    const result = await reverseGeocode(parsed.data.latitude, parsed.data.longitude);
    return NextResponse.json({ configured: Boolean(process.env.GEOCODER_PROVIDER && process.env.GEOCODER_PROVIDER !== "none"), result });
  } catch {
    return NextResponse.json({ error: "Address lookup failed" }, { status: 502 });
  }
}
