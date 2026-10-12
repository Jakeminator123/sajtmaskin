import { NextResponse } from "next/server";
import { requireNotBot } from "@/lib/bot-protection";
import { withRateLimit } from "@/lib/rate-limit";
import { getRequestUserId } from "@/lib/tenant";
import { debugLog, errorLog } from "@/lib/utils/debug";
import { devLogAppend } from "@/lib/logging/dev-log";
import { flushPendingUsageWrites, getLlmUsageContext, runWithLlmUsageContext, setLlmUsageContext } from "@/lib/observability/llm-usage";
import { normalizeAssistModel } from "@/lib/builder/prompt-assist";
import {
  buildBriefTrace,
  briefRequestSchema,
  generateSiteBriefObject,
  validateBriefModelForHttp,
} from "@/lib/builder/site-brief-generation";
import {
  briefBuildChoicesCacheExtras,
  type BriefBuildChoicesInput,
} from "@/lib/builder/brief-build-choices";
import { formatBriefBuildChoicesForPrompt } from "@/lib/builder/brief-build-choices-format";
import {
  buildBriefCacheKey,
  readBriefCache,
  writeBriefCache,
} from "@/lib/api/ai/brief-cache";
import { omitBriefReasoningSummary } from "@/lib/builder/deep-brief-visibility";
import { FEATURES } from "@/lib/config";
import { incBriefCache } from "@/lib/observability/metrics";
import { hasRecordedBriefUsageClaim } from "@/lib/db/services/llm-usage";

export const runtime = "nodejs";
export const maxDuration = 750;

type CachedBriefPayload = {
  brief: Record<string, unknown>;
  briefQuality: "full" | "server-auto";
  provider: "openai" | "anthropic";
  /** Absent on `brief:v1:` entries written before reasoning was persisted. */
  reasoningSummary?: string | null;
};

function briefResponseBody(
  brief: Record<string, unknown>,
  reasoningSummary: string | null | undefined,
): Record<string, unknown> {
  const clean = omitBriefReasoningSummary(brief) ?? brief;
  if (typeof reasoningSummary === "string" && reasoningSummary.trim()) {
    return { ...clean, reasoningSummary: reasoningSummary.trim() };
  }
  return clean;
}

function buildBriefHeaders(
  payload: CachedBriefPayload,
  cacheState: "hit" | "miss" | "skip",
  trace: ReturnType<typeof buildBriefTrace>,
): Record<string, string> {
  const usageClaimKey = cacheState !== "hit" ? getLlmUsageContext().claimKey : null;
  return {
    "Cache-Control": "no-store",
    "X-Provider": payload.provider === "anthropic" ? "anthropic" : "openai",
    "X-Key-Source":
      payload.provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY",
    "X-Brief-Quality": payload.briefQuality,
    "X-Brief-Cache": cacheState,
    "X-Brief-Trace-Id": trace.traceId,
    "X-Brief-Prompt-Hash": trace.promptHash,
    "X-Brief-Source": trace.source,
    // A cache hit incurs no new call and must not reuse another request's receipt.
    ...(usageClaimKey
      ? { "X-Brief-Usage-Claim-Key": usageClaimKey }
      : {}),
  };
}

export async function POST(req: Request) {
  return withRateLimit(req, "ai:brief", async () =>
    runWithLlmUsageContext({}, async () => {
    try {
      const botError = requireNotBot(req);
      if (botError) return botError;

      // Same auth gate as other paid LLM routes: this endpoint runs full LLM
      // generation against paid provider keys, so anonymous and guest
      // sessions must not be able to consume it. Discovered in Wave 5
      // security audit (2026-04-24).
      const userId = await getRequestUserId(req);
      if (!userId || userId.startsWith("guest:")) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Skapa ett konto eller logga in för att generera. Ditt konto får en kostnadsfri första generering.",
            code: "auth_required",
            requiresAuth: true,
          },
          { status: 401 },
        );
      }
      // Klient-triggad Deep Brief är en egen request: utan eget scope skulle
      // brief-anropets tokenrad sakna ägare.
      setLlmUsageContext({ userId });

      const body = await req.json().catch(() => null);
      const parsed = briefRequestSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Validation failed", details: parsed.error.issues },
          { status: 400 },
        );
      }

      const {
        prompt,
        provider,
        model,
        temperature,
        imageGenerations,
        maxTokens,
        source,
        buildIntent,
        scaffoldId,
        pageCountHint,
        styleChoiceHint,
        styleKeywordsHint,
        toneKeywordsHint,
        colorModeHint,
        complexityHint,
      } = parsed.data;
      const normalizedModel = normalizeAssistModel(model);
      const briefSource = source?.trim() || "unspecified_client";
      const buildChoices: BriefBuildChoicesInput = {
        buildIntent,
        scaffoldId,
        pageCountHint,
        styleChoiceHint,
        styleKeywordsHint,
        toneKeywordsHint,
        colorModeHint,
        complexityHint,
      };
      const buildChoicesExtras = briefBuildChoicesCacheExtras(buildChoices);
      const buildChoicesHints = formatBriefBuildChoicesForPrompt(buildChoices);
      const trace = buildBriefTrace({
        source: briefSource,
        prompt,
        modelId: normalizedModel,
        imageGenerations,
        temperature,
        maxTokens,
        extraHashFields: buildChoicesExtras,
      });

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
          ...buildChoicesExtras,
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
              source: trace.source,
              traceId: trace.traceId,
              promptHash: trace.promptHash,
            });
            return NextResponse.json(
              briefResponseBody(payload.brief, payload.reasoningSummary),
              {
                headers: buildBriefHeaders(payload, "hit", trace),
              },
            );
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
          variantHints: buildChoicesHints,
          extraHashFields: buildChoicesExtras,
        });
        if (!result) {
          return NextResponse.json(
            {
              error: "AI kunde inte generera brief. Försök igen eller förenkla prompten.",
              details: "Model output could not be parsed against the brief schema.",
              suggestion: "Prova att korta ner eller förtydliga din beskrivning.",
            },
            { status: 422 },
          );
        }
        const { brief, provider: briefProvider, reasoningSummary } = result;
        // `/api/ai/brief` is always triggered explicitly by the client (via
        // useInitBrief), so the output quality is always "full". The
        // alternative "server-auto" value is reserved for implicit briefs
        // generated server-side inside create-chat when the client did not
        // ship a brief. We do not read usedSimplified here — the cache
        // consumer treats both schema variants as a "full" brief.
        const briefQuality: "full" | "server-auto" = "full";
        const payload: CachedBriefPayload = {
          brief: omitBriefReasoningSummary(brief) ?? brief,
          briefQuality,
          provider: briefProvider,
          ...(reasoningSummary ? { reasoningSummary } : {}),
        };

        const cacheState = FEATURES.useRedisCache ? "miss" : "skip";
        // The next request can start immediately; its exact receipt must already
        // exist before it can be attached to the version's billing marker.
        await flushPendingUsageWrites();
        let usageRecorded = false;
        try {
          const claimKey = getLlmUsageContext().claimKey;
          usageRecorded = Boolean(claimKey && await hasRecordedBriefUsageClaim(userId, claimKey));
        } catch { /* Return a visible failure, never a fabricated receipt. */ }
        if (!usageRecorded) {
          return NextResponse.json({
            error: "Briefens kostnadskvitto kunde inte sparas. Sajtbygget har inte startats.",
            code: "brief_usage_unavailable",
          }, { status: 503 });
        }
        if (FEATURES.useRedisCache) {
          incBriefCache("miss");
          devLogAppend("latest", {
            type: "brief-cache.miss",
            chatId: cacheKey.chatId,
            modelId: cacheKey.modelId,
            source: result.trace.source,
            traceId: result.trace.traceId,
            promptHash: result.trace.promptHash,
          });
          // A failed receipt confirmation must not become a successful cache hit.
          await writeBriefCache(cacheKey, payload);
        }
        return NextResponse.json(briefResponseBody(brief, reasoningSummary), {
          headers: buildBriefHeaders(payload, cacheState, result.trace),
        });
      } catch (briefErr) {
        const errMsg = briefErr instanceof Error ? briefErr.message : String(briefErr);
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
    }),
  );
}
