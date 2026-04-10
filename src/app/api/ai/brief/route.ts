import { NextResponse } from "next/server";
import { requireNotBot } from "@/lib/botProtection";
import { withRateLimit } from "@/lib/rateLimit";
import { debugLog, errorLog } from "@/lib/utils/debug";
import { devLogAppend } from "@/lib/logging/devLog";
import { normalizeAssistModel, resolvePromptAssistProvider } from "@/lib/builder/promptAssist";
import {
  briefRequestSchema,
  generateSiteBriefObject,
  validateBriefModelForHttp,
} from "@/lib/builder/site-brief-generation";

export const runtime = "nodejs";
export const maxDuration = 600;

export async function POST(req: Request) {
  return withRateLimit(req, "ai:brief", async () => {
    try {
      const botError = requireNotBot(req);
      if (botError) return botError;

      const body = await req.json().catch(() => null);
      const parsed = briefRequestSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Validation failed", details: parsed.error.issues },
          { status: 400 },
        );
      }

      const { prompt, provider, model, temperature, imageGenerations, maxTokens, source } = parsed.data;
      const normalizedModel = normalizeAssistModel(model);
      const resolvedProvider = resolvePromptAssistProvider(normalizedModel);
      const logProvider = resolvedProvider === "gateway" ? "openai" : resolvedProvider;
      const briefSource = source?.trim() || "unspecified_client";

      const validationError = validateBriefModelForHttp(normalizedModel, provider);
      if (validationError) {
        return NextResponse.json(validationError.body, { status: validationError.status });
      }

      debugLog("brief", `start ${normalizedModel} (${prompt.length} chars, images=${imageGenerations})`);

      try {
        const { brief, usedSimplified, provider: briefProvider } = await generateSiteBriefObject({
          prompt,
          normalizedModel,
          imageGenerations,
          temperature,
          maxTokens,
          source: briefSource,
        });

        const headers: Record<string, string> = {
          "Cache-Control": "no-store",
          "X-Provider": briefProvider === "anthropic" ? "anthropic" : "openai",
          "X-Key-Source": briefProvider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY",
          ...(usedSimplified ? { "X-Schema": "simplified" } : {}),
        };
        return NextResponse.json(brief, { headers });
      } catch (simplifiedErr) {
        const errMsg = simplifiedErr instanceof Error ? simplifiedErr.message : String(simplifiedErr);
        return NextResponse.json(
          {
            error: "AI kunde inte generera brief. Försök igen eller förenkla prompten.",
            details: errMsg.includes("could not parse")
              ? "Modellen returnerade ett ogiltigt svar."
              : errMsg,
            suggestion: "Prova att korta ner eller förtydliga din beskrivning.",
          },
          { status: 422 },
        );
      }
    } catch (err) {
      errorLog("AI", "AI brief error", err);
      devLogAppend("latest", {
        type: "assist.brief.error",
        message: err instanceof Error ? err.message : "Unknown error",
      });
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Unknown error" },
        { status: 500 },
      );
    }
  });
}
