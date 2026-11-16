import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { getAppContext } from "@/lib/auth";
import { AI_MODEL, FALLBACK_BETA, SAFETY_FOOTER, guardAi, toAiError, tradeLabel } from "@/lib/ai/client";

const requestSchema = z.object({
  notes: z.string().trim().min(5, "Write a few words about what you did first.").max(6000),
  context: z
    .object({
      date: z.string().max(40).optional(),
      jobSite: z.string().max(160).optional(),
      employer: z.string().max(160).optional(),
      hours: z.string().max(40).optional(),
    })
    .optional(),
});

const DiaryOutput = z.object({
  title: z.string().describe("Short title, max ~8 words, describing the main work"),
  description: z
    .string()
    .describe("A clear, professional first-person paragraph (or two) describing ONLY the work in the notes"),
  tasks: z.array(z.string()).describe("Distinct tasks performed, each as a short phrase. Only tasks stated or directly implied."),
  skills: z.array(z.string()).describe("Skills practised, phrased generically (e.g. 'Cable installation'). Only from the notes."),
  tools_used: z.array(z.string()).describe("Tools explicitly mentioned. Empty if none were mentioned."),
  materials: z.array(z.string()).describe("Materials explicitly mentioned. Empty if none were mentioned."),
  lessons_learned: z.string().describe("Only if the notes mention something learned; otherwise an empty string"),
  clarifying_questions: z
    .array(z.string())
    .describe("Up to 3 short questions about details that are missing and would make the entry better (never assume the answers)"),
});

export type DiaryAiResult = z.infer<typeof DiaryOutput>;

export async function POST(request: NextRequest) {
  const ctx = await getAppContext();
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });

  try {
    const ai = await guardAi(ctx, "ai_diary");
    const trade = tradeLabel(ctx.profile.trade);
    const c = parsed.data.context ?? {};
    const contextLines = [
      c.date && `Date: ${c.date}`,
      c.jobSite && `Job site: ${c.jobSite}`,
      c.employer && `Employer: ${c.employer}`,
      c.hours && `Hours: ${c.hours}`,
    ]
      .filter(Boolean)
      .join("\n");

    const response = await ai.beta.messages.parse({
      model: AI_MODEL,
      max_tokens: 4000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(DiaryOutput) },
      system: `You turn an Australian ${trade} apprentice's rough notes into a structured, professional work diary entry.

Faithfulness is the most important rule:
- Include ONLY work, tools, materials and skills that the notes state or directly imply. Do not add steps, quantities, tools, safety checks, test results or outcomes that weren't mentioned.
- If the apprentice "assisted" or "helped", keep that wording. Never upgrade it to doing the work independently.
- Keep numbers exactly as written. Don't guess locations, brands or standards.
- If something useful is missing, ask about it in clarifying_questions instead of filling it in.
- Write in first person, past tense, plain professional language. No marketing tone.

${SAFETY_FOOTER}`,
      messages: [
        {
          role: "user",
          content: `${contextLines ? `Context from the timesheet:\n${contextLines}\n\n` : ""}My rough notes:\n"""\n${parsed.data.notes}\n"""`,
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json({ error: "The AI couldn't help with that entry. Please write it manually." }, { status: 422 });
    }
    if (!response.parsed_output) {
      return NextResponse.json({ error: "The AI response couldn't be read. Please try again." }, { status: 502 });
    }
    return NextResponse.json({ result: response.parsed_output satisfies DiaryAiResult });
  } catch (e) {
    const err = toAiError(e);
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
  }
}
