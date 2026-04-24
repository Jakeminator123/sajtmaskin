import { NextResponse } from "next/server";
import { requireNotBot } from "@/lib/botProtection";
import { withRateLimit } from "@/lib/rateLimit";
import { getRequestUserId } from "@/lib/tenant";
import { debugLog, errorLog } from "@/lib/utils/debug";
import { devLogAppend } from "@/lib/logging/devLog";
import { normalizeAssistModel } from "@/lib/builder/promptAssist";
import {
  briefRequestSchema,
  generateSiteBriefObject,
  validateBriefModelForHttp,
} from "@/lib/builder/site-brief-generation";
import {
  buildBriefCacheKey,
  readBriefCache,
  writeBriefCache,
} from "@/lib/api/ai/brief-cache";
import { FEATURES } from "@/lib/config";
import { incBriefCache } from "@/lib/observability/metrics";

export const runtime = "nodejs";
export const maxDuration = 600;

type CachedBriefPayload = {
  brief: Record<string, unknown>;
  briefQuality: "full" | "server-auto";
  provider: "openai" | "anthropic";
};

function buildBriefHeaders(payload: CachedBriefPayload, cacheState: "hit" | "miss" | "skip"): Record<string, string> {
  return {
    "Cache-Control": "no-store",
    "X-Provider": payload.provider === "anthropic" ? "anthropic" : "openai",
    "X-Key-Source":
      payload.provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY",
    "X-Brief-Quality": payload.briefQuality,
    "X-Brief-Cache": cacheState,
  };
}

export async function POST(req: Request) {
  return withRateLimit(req, "ai:brief", async () => {
    try {
      const botError = requireNotBot(req);
      if (botError) return botError;

      // Same auth gate as `/api/ai/chat`: this endpoint runs full LLM
      // generation against paid provider keys, so anonymous and guest
      // sessions must not be able to consume it. Discovered in Wave 5
      // security audit (2026-04-24).
      const userId = await getRequestUserId(req);
      if (!userId || userId.startsWith("guest:")) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      }

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

      const cacheKey = buildBriefCacheKey({
        chatId: null,
        prompt,
        modelId: normalizedModel,
        extraInputsForHash: {
          imageGenerations,
          temperature: typeof temperature === "number" ? temperature : null,
          maxTokens: typeof maxTokens === "number" ? maxTokens : null,
        },
      });

      if (FEATURES.useRedisCache) {
        const cached = await readBriefCache(cacheKey);
        if (cached && cached.json && typeof cached.json === "object") {
          const payload = cached.json as CachedBriefPayload;
          if (
            payload.brief &&
            typeof payload.brief === "object" &&
            (payload.briefQuality === "full" || payload.briefQuality === "server-auto") &&
            (payload.provider === "openai" || payload.provider === "anthropic")
          ) {
            incBriefCache("hit");
            devLogAppend("latest", {
              type: "brief-cache.hit",
              chatId: cacheKey.chatId,
              modelId: cacheKey.modelId,
            });
            return NextResponse.json(payload.brief, {
              headers: buildBriefHeaders(payload, "hit"),
            });
          }
        }
      } else {
        incBriefCache("skip");
      }

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
        const { brief, provider: briefProvider } = result;
        // `/api/ai/brief` is always triggered explicitly by the client (via
        // useInitBrief), so the output quality is always "full". The
        // alternative "server-auto" value is reserved for implicit briefs
        // generated server-side inside create-chat when the client did not
        // ship a brief. We do not read usedSimplified here — the cache
        // consumer treats both schema variants as a "full" brief.
        const briefQuality: "full" | "server-auto" = "full";
        const payload: CachedBriefPayload = {
          brief: brief as Record<string, unknown>,
          briefQuality,
          provider: briefProvider,
        };

        if (FEATURES.useRedisCache) {
          incBriefCache("miss");
          devLogAppend("latest", {
            type: "brief-cache.miss",
            chatId: cacheKey.chatId,
            modelId: cacheKey.modelId,
          });
          await writeBriefCache(cacheKey, payload);
        }

        const cacheState = FEATURES.useRedisCache ? "miss" : "skip";
        return NextResponse.json(brief, {
          headers: buildBriefHeaders(payload, cacheState),
        });
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
