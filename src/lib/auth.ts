import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveEntitlements, type Entitlements, type Feature } from "@/lib/plans";
import type { Profile, WorkRules } from "@/lib/types";

export interface AppContext {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  email: string | null;
  profile: Profile;
  rules: WorkRules;
  entitlements: Entitlements;
}

/**
 * Data access entry point. Verifies the session with Supabase Auth (getUser hits the auth
 * server), then loads profile, rules and plan. Cached per request.
 */
export const getAppContext = cache(async (): Promise<AppContext | null> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const [profileRes, rulesRes, subRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", auth.user.id).single(),
    supabase.from("work_rules").select("*").eq("user_id", auth.user.id).single(),
    supabase.from("subscriptions").select("plan, status").eq("user_id", auth.user.id).maybeSingle(),
  ]);

  if (!profileRes.data || !rulesRes.data) return null;

  return {
    supabase,
    userId: auth.user.id,
    email: auth.user.email ?? null,
    profile: profileRes.data as Profile,
    rules: {
      ...(rulesRes.data as WorkRules),
      daily_ordinary_hours: Number(rulesRes.data.daily_ordinary_hours),
      weekly_ordinary_hours: Number(rulesRes.data.weekly_ordinary_hours),
      forgotten_clock_out_hours: Number(rulesRes.data.forgotten_clock_out_hours),
    },
    entitlements: resolveEntitlements(subRes.data ?? null),
  };
});

/** For pages: redirects to login (or onboarding) when needed. */
export async function requireAppContext(options: { allowIncompleteOnboarding?: boolean } = {}): Promise<AppContext> {
  const ctx = await getAppContext();
  if (!ctx) redirect("/login");
  if (!options.allowIncompleteOnboarding && !ctx.profile.onboarding_completed) redirect("/onboarding");
  return ctx;
}

export class AuthError extends Error {}
export class PlanError extends Error {
  constructor(public feature: Feature) {
    super("This feature is part of Apprentice OS Pro.");
  }
}

/** For server actions / route handlers: throws instead of redirecting. */
export async function requireUserForAction(): Promise<AppContext> {
  const ctx = await getAppContext();
  if (!ctx) throw new AuthError("You're signed out. Please sign in again.");
  return ctx;
}

export function assertFeature(ctx: AppContext, feature: Feature) {
  if (!ctx.entitlements.has(feature)) throw new PlanError(feature);
}
