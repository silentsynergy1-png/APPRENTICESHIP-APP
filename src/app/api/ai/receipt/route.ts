import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type Anthropic from "@anthropic-ai/sdk";
import { getAppContext } from "@/lib/auth";
import { AI_MODEL, FALLBACK_BETA, guardAi, toAiError } from "@/lib/ai/client";

const ReceiptOutput = z.object({
  is_receipt: z.boolean().describe("False if the image is not a purchase receipt or invoice"),
  merchant: z.string().nullable().describe("Business name as printed, or null if not legible"),
  purchase_date: z.string().nullable().describe("Date of purchase as YYYY-MM-DD, or null if not shown"),
  total: z.number().nullable().describe("Total amount paid in AUD including GST, or null if unclear"),
  gst: z.number().nullable().describe("GST amount if printed on the receipt, otherwise null. Never calculate it."),
  items: z
    .array(z.object({ description: z.string(), amount: z.number().nullable() }))
    .describe("Line items as printed (max 30). Empty if not legible."),
  suggested_category: z.enum(["tools", "ppe", "fuel", "training", "equipment", "other"]).describe("Best-fit category for the purchase"),
  uncertain_fields: z.array(z.string()).describe("Names of fields you were unsure about"),
});

/** Reads a receipt the user uploaded and returns extracted values for them to confirm. Never saves an expense. */
export async function POST(request: NextRequest) {
  const ctx = await getAppContext();
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const parsed = z.object({ receiptId: z.uuid() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  try {
    const ai = await guardAi(ctx, "receipt_scanning");
    const { data: receipt } = await ctx.supabase.from("receipts").select("id, storage_path, mime_type, size_bytes").eq("id", parsed.data.receiptId).maybeSingle();
    if (!receipt) return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    if (receipt.mime_type === "image/heic" || receipt.mime_type === "image/heif") {
      return NextResponse.json({ error: "HEIC photos can't be scanned yet. Please enter the details manually, or take the photo as JPEG." }, { status: 415 });
    }
    const { data: blob, error } = await ctx.supabase.storage.from("user-files").download(receipt.storage_path);
    if (error || !blob) return NextResponse.json({ error: "Couldn't read the receipt file." }, { status: 500 });
    const data = Buffer.from(await blob.arrayBuffer()).toString("base64");

    const fileBlock: Anthropic.Beta.BetaContentBlockParam =
      receipt.mime_type === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
        : { type: "image", source: { type: "base64", media_type: receipt.mime_type as "image/jpeg" | "image/png" | "image/webp", data } };

    const response = await ai.beta.messages.parse({
      model: AI_MODEL,
      max_tokens: 3000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(ReceiptOutput) },
      system:
        "You extract details from Australian purchase receipts for an apprentice's expense records. Only report what is printed. If a value is unclear or missing, return null and list it in uncertain_fields. Never guess, never calculate GST, and never comment on tax deductibility.",
      messages: [{ role: "user", content: [fileBlock, { type: "text", text: "Extract the receipt details." }] }],
    });

    if (response.stop_reason === "refusal" || !response.parsed_output) {
      return NextResponse.json({ error: "Couldn't read that receipt. Please enter the details manually." }, { status: 422 });
    }
    const out = response.parsed_output;
    await ctx.supabase.from("receipts").update({ extraction: out }).eq("id", receipt.id);
    return NextResponse.json({ result: out });
  } catch (e) {
    const err = toAiError(e);
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
  }
}
