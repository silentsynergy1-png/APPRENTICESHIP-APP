import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { getAppContext } from "@/lib/auth";
import { AI_MODEL, FALLBACK_BETA, SAFETY_FOOTER, guardAi, toAiError, tradeLabel } from "@/lib/ai/client";
import { apprenticeshipTimeline, ordinal } from "@/lib/apprenticeship";
import { todayKey } from "@/lib/time/calc";

export const maxDuration = 120;

const MODES = {
  chat: "",
  explain: "Explain the concept in plain language first, then add technical detail. Use a short real-world site example.",
  quiz: "Write a short practice quiz (5 questions unless asked otherwise) with a mix of multiple choice and short answer. Put an answer key with brief explanations at the end, under a heading 'Answers'.",
  flashcards: "Create flashcards as a Markdown table with columns 'Front' and 'Back'. Keep each side short.",
  notes: "Write concise, well-structured revision notes with headings and bullet points, ending with 3 key takeaways.",
  summarise: "Summarise the material the user provides. Keep the user's facts; don't add new claims. Use headings and bullets.",
  tafe: "Help the apprentice plan and organise their TAFE study: break work into steps with suggested timing. Don't write assessment answers for them to submit as their own. Coach them instead.",
} as const;

const body = z.object({
  conversationId: z.uuid().optional(),
  message: z.string().trim().min(1).max(8000),
  mode: z.enum(Object.keys(MODES) as [keyof typeof MODES, ...(keyof typeof MODES)[]]).default("chat"),
});

export async function POST(request: NextRequest) {
  const ctx = await getAppContext();
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Write a message first." }, { status: 400 });
  const { message, mode } = parsed.data;

  let ai: Anthropic;
  try {
    ai = await guardAi(ctx, "ai_assistant");
  } catch (e) {
    const err = toAiError(e);
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
  }

  // Conversation (created on first message; RLS guarantees ownership on reuse).
  let conversationId = parsed.data.conversationId;
  if (conversationId) {
    const { data } = await ctx.supabase.from("ai_conversations").select("id").eq("id", conversationId).maybeSingle();
    if (!data) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  } else {
    const title = message.replace(/\s+/g, " ").slice(0, 60) + (message.length > 60 ? "…" : "");
    const { data, error } = await ctx.supabase.from("ai_conversations").insert({ user_id: ctx.userId, title }).select("id").single();
    if (error) return NextResponse.json({ error: "Couldn't start a conversation." }, { status: 500 });
    conversationId = data.id;
  }

  const { data: history } = await ctx.supabase
    .from("ai_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(30);
  await ctx.supabase.from("ai_messages").insert({ user_id: ctx.userId, conversation_id: conversationId, role: "user", content: message });

  const { data: app } = await ctx.supabase.from("apprenticeships").select("start_date, expected_completion_date, qualification").eq("is_current", true).maybeSingle();
  const tl = app ? apprenticeshipTimeline(app.start_date, app.expected_completion_date, todayKey(ctx.profile.timezone)) : null;
  const trade = tradeLabel(ctx.profile.trade);
  const profileLine = [
    `${trade} apprentice`,
    tl?.started ? `${ordinal(tl.year)} year` : null,
    ctx.profile.state ? `in ${ctx.profile.state}` : null,
    app?.qualification ? `studying ${app.qualification}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const system = `You are the Apprentice OS assistant: a patient, practical mentor for Australian trade apprentices.
The user is a ${profileLine}. Pitch explanations at their level, use Australian English and Australian trade terminology, and keep answers focused and scannable (Markdown headings, short paragraphs, bullet points).
For electrical apprentices, use Australian terms (e.g. GPO, RCD, TPS cable, MEN system, switchboard, isolation and lockout) and refer to the Wiring Rules (AS/NZS 3000) and related standards only at the level you're confident of. Never quote clause numbers unless you are certain, and tell the user to confirm against the current edition.

${SAFETY_FOOTER}
- Don't help with live work outside what an apprentice may legally do under supervision. Point them to their supervisor.
- Don't write TAFE assessment answers for submission. Explain and coach instead.`;

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...((history ?? []) as { role: "user" | "assistant"; content: string }[]).reverse().map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: MODES[mode] ? `${message}\n\n(Format: ${MODES[mode]})` : message },
  ];

  const encoder = new TextEncoder();
  const convId = conversationId!;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let text = "";
      try {
        const s = ai.beta.messages.stream({
          model: AI_MODEL,
          max_tokens: 8000,
          betas: [FALLBACK_BETA],
          fallbacks: "default",
          output_config: { effort: "medium" },
          system,
          messages,
        });
        for await (const event of s) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            text += event.delta.text;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        const final = await s.finalMessage();
        if (final.stop_reason === "refusal") {
          const note = "\n\n_I can't help with that one. Please ask your supervisor or trainer._";
          text = text ? text + note : note.trim();
          controller.enqueue(encoder.encode(note));
        } else if (final.stop_reason === "max_tokens") {
          const note = "\n\n_…the answer was cut short. Ask me to continue._";
          text += note;
          controller.enqueue(encoder.encode(note));
        }
      } catch (e) {
        const err = toAiError(e);
        const note = `\n\n_${err.message}_`;
        text += note;
        controller.enqueue(encoder.encode(note));
      } finally {
        if (text.trim()) {
          await ctx.supabase.from("ai_messages").insert({ user_id: ctx.userId, conversation_id: convId, role: "assistant", content: text.slice(0, 60000) });
        }
        await ctx.supabase.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Conversation-Id": convId,
    },
  });
}
