import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { AppContext } from "@/lib/auth";
import type { Feature } from "@/lib/plans";
import { TRADES } from "@/lib/constants";

/**
 * Shared AI plumbing. All AI calls run server-side; the API key never reaches the browser.
 * Model is configurable (ANTHROPIC_MODEL), defaulting to Claude Opus 5.5.
 */
export const AI_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

/** Server-side refusal fallback: if the main model declines, the API retries on a suitable model. */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01" as const;

let client: Anthropic | null | undefined;
export function getAnthropic(): Anthropic | null {
  if (client !== undefined) return client;
  client = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
  return client;
}

export class AiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: "not_configured" | "plan" | "quota" | "refused" | "upstream" | "invalid",
  ) {
    super(message);
  }
}

/** Plan + configuration + per-user daily quota check. Call before every AI request. */
export async function guardAi(ctx: AppContext, feature: Feature): Promise<Anthropic> {
  if (!ctx.entitlements.has(feature)) {
    throw new AiError("AI features are part of Apprentice OS Pro.", 402, "plan");
  }
  const ai = getAnthropic();
  if (!ai) {
    throw new AiError("AI isn't set up on this server yet (ANTHROPIC_API_KEY is missing).", 503, "not_configured");
  }
  const { data: allowed, error } = await ctx.supabase.rpc("consume_ai_quota", {
    p_limit: ctx.entitlements.plan.limits.aiRequestsPerDay,
  });
  if (error) throw new AiError("Couldn't check your AI usage. Please try again.", 500, "upstream");
  if (!allowed) throw new AiError("You've reached today's AI limit. It resets at midnight.", 429, "quota");
  return ai;
}

export function tradeLabel(trade: string): string {
  return TRADES.find((t) => t.value === trade)?.label ?? "trade";
}

/** Converts SDK errors into user-safe messages. Never echoes prompts or user content. */
export function toAiError(e: unknown): AiError {
  if (e instanceof AiError) return e;
  if (e instanceof Anthropic.RateLimitError) return new AiError("The AI service is busy. Try again in a moment.", 503, "upstream");
  if (e instanceof Anthropic.AuthenticationError) return new AiError("AI isn't configured correctly on this server.", 503, "not_configured");
  if (e instanceof Anthropic.BadRequestError) return new AiError("That request couldn't be processed.", 400, "invalid");
  if (e instanceof Anthropic.APIError) return new AiError("The AI service had a problem. Please try again.", 502, "upstream");
  return new AiError("Something went wrong with the AI request.", 500, "upstream");
}

export const SAFETY_FOOTER = `Rules you always follow:
- Never invent facts about the user's work, qualifications, sign-offs or results.
- Never fabricate Australian Standards, clause numbers, regulations or compliance requirements. If you mention a standard (for example AS/NZS 3000), only name ones you are confident exist, and tell the user to check the current edition and their state's requirements. If unsure, say so.
- AI guidance never replaces qualified supervision, official training, the standards themselves, or a professional safety assessment. For anything involving live electrical work, gas, refrigerants, heights or other hazards, remind the apprentice to follow site procedures and their supervisor.
- Use Australian English and Australian trade terminology.`;
