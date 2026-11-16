import type { PlanTier } from "@/lib/types";

/**
 * Feature entitlements per plan. This is the single source of truth: change limits or move
 * features between tiers here, and every gate in the app follows.
 */
export type Feature =
  | "unlimited_records"
  | "advanced_timesheets"
  | "ai_diary"
  | "ai_assistant"
  | "expenses"
  | "receipt_scanning"
  | "advanced_analytics"
  | "pdf_reports"
  | "documents"
  | "weekly_recap";

export interface PlanDefinition {
  tier: PlanTier;
  name: string;
  priceMonthlyAud: number;
  tagline: string;
  features: Feature[];
  limits: {
    diaryEntriesPerMonth: number | null; // null = unlimited
    tools: number | null;
    jobSites: number | null;
    aiRequestsPerDay: number;
  };
  highlights: string[];
}

export const PLANS: Record<PlanTier, PlanDefinition> = {
  free: {
    tier: "free",
    name: "Free",
    priceMonthlyAud: 0,
    tagline: "Everything you need to log your hours and days.",
    features: [],
    limits: { diaryEntriesPerMonth: 20, tools: 25, jobSites: 5, aiRequestsPerDay: 0 },
    highlights: [
      "Clock in / out with location",
      "Basic timesheets & CSV export",
      "Work diary (20 entries a month)",
      "Basic progress tracking",
      "Tool inventory (up to 25 tools)",
    ],
  },
  pro: {
    tier: "pro",
    name: "Pro",
    priceMonthlyAud: 7.99,
    tagline: "The full apprenticeship toolkit.",
    features: [
      "unlimited_records",
      "advanced_timesheets",
      "ai_diary",
      "ai_assistant",
      "expenses",
      "receipt_scanning",
      "advanced_analytics",
      "pdf_reports",
      "documents",
      "weekly_recap",
    ],
    limits: { diaryEntriesPerMonth: null, tools: null, jobSites: null, aiRequestsPerDay: 150 },
    highlights: [
      "Unlimited diary entries, tools & job sites",
      "AI diary writing & apprentice assistant",
      "Expenses with AI receipt scanning",
      "PDF timesheet & expense reports",
      "Document vault with expiry reminders",
      "Weekly AI recap & advanced analytics",
    ],
  },
};

export const FEATURE_LABELS: Record<Feature, string> = {
  unlimited_records: "Unlimited records",
  advanced_timesheets: "Advanced timesheets",
  ai_diary: "AI diary writing",
  ai_assistant: "AI apprentice assistant",
  expenses: "Expense tracking",
  receipt_scanning: "Receipt scanning",
  advanced_analytics: "Advanced analytics",
  pdf_reports: "PDF reports",
  documents: "Document vault",
  weekly_recap: "Weekly AI recap",
};

export interface Entitlements {
  tier: PlanTier;
  plan: PlanDefinition;
  has: (feature: Feature) => boolean;
  /** True when access comes from the beta override rather than a paid subscription. */
  betaOverride: boolean;
}

export function resolveEntitlements(subscription: { plan: PlanTier; status: string } | null): Entitlements {
  // During closed beta every account can be granted Pro without payments being live.
  const betaOverride = process.env.BETA_ALL_PRO === "true";
  const paidPro =
    subscription?.plan === "pro" && ["active", "trialing", "past_due"].includes(subscription.status);
  const tier: PlanTier = paidPro || betaOverride ? "pro" : "free";
  const plan = PLANS[tier];
  return {
    tier,
    plan,
    has: (f) => plan.features.includes(f),
    betaOverride: betaOverride && !paidPro,
  };
}

export const paymentsEnabled = () =>
  process.env.STRIPE_ENABLED === "true" && Boolean(process.env.STRIPE_SECRET_KEY) && Boolean(process.env.STRIPE_PRICE_PRO_MONTHLY);
