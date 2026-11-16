import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Stripe webhook → subscriptions table. The only writer of plan/status (service role).
 * Configure the endpoint in Stripe with: checkout.session.completed,
 * customer.subscription.created, customer.subscription.updated, customer.subscription.deleted.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!secret || !key) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });

  const stripe = new Stripe(key);
  const signature = request.headers.get("stripe-signature");
  const payload = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature ?? "", secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const admin = createAdminClient();

  async function syncSubscription(sub: Stripe.Subscription, userIdHint?: string | null) {
    const userId = (sub.metadata?.user_id as string | undefined) ?? userIdHint;
    if (!userId) return;
    const item = sub.items?.data?.[0] as (Stripe.SubscriptionItem & { current_period_end?: number }) | undefined;
    const periodEnd = item?.current_period_end ?? (sub as unknown as { current_period_end?: number }).current_period_end;
    const active = ["active", "trialing", "past_due"].includes(sub.status);
    const status = (["active", "trialing", "past_due", "canceled", "incomplete"] as const).includes(sub.status as never)
      ? sub.status
      : "canceled";
    await admin.from("subscriptions").upsert(
      {
        user_id: userId,
        plan: active ? "pro" : "free",
        status,
        stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
        stripe_subscription_id: sub.id,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      },
      { onConflict: "user_id" },
    );
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object;
      if (s.mode === "subscription" && s.subscription) {
        const sub = await stripe.subscriptions.retrieve(typeof s.subscription === "string" ? s.subscription : s.subscription.id);
        await syncSubscription(sub, s.client_reference_id);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await syncSubscription(event.data.object);
      break;
    default:
      break;
  }
  return NextResponse.json({ received: true });
}
