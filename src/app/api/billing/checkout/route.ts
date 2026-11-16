import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getAppContext } from "@/lib/auth";
import { paymentsEnabled } from "@/lib/plans";
import { publicEnv } from "@/lib/env";

/**
 * Starts a Stripe Checkout session for Pro. Disabled unless STRIPE_ENABLED=true and keys
 * are set, so no real payment can happen before the product is fully tested.
 */
export async function POST() {
  const ctx = await getAppContext();
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!paymentsEnabled()) {
    return NextResponse.json({ error: "Payments aren't enabled yet." }, { status: 503 });
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const { data: sub } = await ctx.supabase.from("subscriptions").select("stripe_customer_id").eq("user_id", ctx.userId).maybeSingle();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: process.env.STRIPE_PRICE_PRO_MONTHLY!, quantity: 1 }],
    client_reference_id: ctx.userId,
    customer: sub?.stripe_customer_id ?? undefined,
    customer_email: sub?.stripe_customer_id ? undefined : (ctx.email ?? undefined),
    subscription_data: { metadata: { user_id: ctx.userId } },
    metadata: { user_id: ctx.userId },
    success_url: `${publicEnv.siteUrl}/settings/plan?upgraded=1`,
    cancel_url: `${publicEnv.siteUrl}/settings/plan`,
    allow_promotion_codes: true,
  });
  return NextResponse.json({ url: session.url });
}
