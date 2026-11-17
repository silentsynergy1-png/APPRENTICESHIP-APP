/**
 * AI is switched on purely by configuration: with no ANTHROPIC_API_KEY the app runs in
 * "no AI" mode — AI buttons, pages and marketing copy are hidden, and nothing calls an AI
 * service. Add the key later and every AI feature appears automatically.
 * Server-side only (reads a secret env var's presence, never its value).
 */
export function isAiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY) && process.env.AI_DISABLED !== "true";
}
