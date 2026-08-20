import { generateText } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import { createDirectModel } from "@/lib/builder/direct-model";
import {
  buildPromptAssistMessages,
  buildPromptAssistModelOptions,
  parsePromptAssistResponse,
  PROMPT_ASSIST_DRAFT_MAX_CHARS,
  resolvePromptRewriteModel,
} from "@/lib/builder/prompt-assist-pre-send";
import { requireNotBot } from "@/lib/bot-protection";
import { withRateLimit } from "@/lib/rate-limit";
import { getRequestUserId } from "@/lib/tenant";

export const runtime = "nodejs";
export const maxDuration = 30;

const requestSchema = z.object({
  draft: z.string().trim().min(1).max(PROMPT_ASSIST_DRAFT_MAX_CHARS),
});

export async function POST(req: Request) {
  return withRateLimit(req, "ai:prompt-assist", async () => {
    const botError = requireNotBot(req);
    if (botError) return botError;

    const userId = await getRequestUserId(req);
    if (!userId || userId.startsWith("guest:")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const modelId = resolvePromptRewriteModel();
    const messages = buildPromptAssistMessages(parsed.data.draft);

    try {
      const result = await generateText({
        model: createDirectModel(modelId),
        messages: [
          { role: "system", content: messages.system },
          { role: "user", content: messages.user },
        ],
        ...buildPromptAssistModelOptions(modelId),
      });
      // The 3,072-token ceiling is an intentional cost guard. A long or
      // token-dense draft may reach it; fail closed instead of writing a
      // syntactically valid but incomplete rewrite back into the editor.
      if (result.finishReason === "length") {
        return NextResponse.json({ error: "rewrite_output_limit" }, { status: 502 });
      }
      const text = parsePromptAssistResponse(result.text ?? "");
      if (!text) {
        return NextResponse.json({ error: "empty_rewrite" }, { status: 502 });
      }
      return NextResponse.json({ text, model: modelId });
    } catch (error) {
      return NextResponse.json(
        {
          error: "rewrite_failed",
          details: error instanceof Error ? error.message : String(error),
        },
        { status: 502 },
      );
    }
  });
}
