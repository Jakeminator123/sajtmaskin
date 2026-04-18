import { NextResponse } from "next/server";
import { requireNotBot } from "@/lib/botProtection";
import { withRateLimit } from "@/lib/rateLimit";
import { debugLog, errorLog } from "@/lib/utils/debug";
import { devLogAppend } from "@/lib/logging/devLog";
import { normalizeAssistModel } from "@/lib/builder/promptAssist";
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
      const briefSource = source?.trim() || "unspecified_client";

      const validationError = validateBriefModelForHttp(normalizedModel, provider);
      if (validationError) {
        return NextResponse.json(validationError.body, { status: validationError.status });
      }

      debugLog("brief", `start ${normalizedModel} (${prompt.length} chars, images=${imageGenerations})`);

      try {
        const result = await generateSiteBriefObject({
          prompt,
          normalizedModel,
          imageGenerations,
          temperature,
          maxTokens,
          source: briefSource,
        });
        if (!result) {
          errorLog("AI", "brief 422 (empty result)", {
            model: normalizedModel,
            promptLength: prompt.length,
            source: briefSource,
          });
          devLogAppend("latest", {
            type: "assist.brief.422",
            reason: "empty_result",
            model: normalizedModel,
            promptLength: prompt.length,
            source: briefSource,
          });
          return NextResponse.json(
            {
              error: "AI kunde inte generera brief. Försök igen eller förenkla prompten.",
              details: "Model output could not be parsed against the brief schema.",
              suggestion: "Prova att korta ner eller förtydliga din beskrivning.",
            },
            { status: 422 },
          );
        }
        const { brief, briefQuality, provider: briefProvider } = result;

        const headers: Record<string, string> = {
          "Cache-Control": "no-store",
          "X-Provider": briefProvider === "anthropic" ? "anthropic" : "openai",
          "X-Key-Source": briefProvider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY",
          "X-Brief-Quality": briefQuality,
        };
        return NextResponse.json(brief, { headers });
      } catch (briefErr) {
        const errMsg = briefErr instanceof Error ? briefErr.message : String(briefErr);
        errorLog("AI", "brief 422 (exception)", {
          model: normalizedModel,
          promptLength: prompt.length,
          source: briefSource,
          error: errMsg,
        });
        devLogAppend("latest", {
          type: "assist.brief.422",
          reason: errMsg.includes("could not parse") ? "parse_error" : "exception",
          model: normalizedModel,
          promptLength: prompt.length,
          source: briefSource,
          message: errMsg,
        });
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
