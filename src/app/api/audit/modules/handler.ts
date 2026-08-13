import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { createDirectModel } from "@/lib/builder/direct-model";
import OpenAI from "openai";
import { prepareCredits } from "@/lib/credits/server";
import { getCreditCost, type CreditAction } from "@/lib/credits/pricing";
import { scrapeWebsite, validateAndNormalizeUrl, getCanonicalUrlKey } from "@/lib/webscraper";
import { buildAuditPrompt, extractFirstJsonObject, parseJsonWithRepair } from "@/lib/audit-prompts";
import { FEATURES, SECRETS } from "@/lib/config";
import { withRateLimit } from "@/lib/rate-limit";
import type { AuditMode, AuditResult, AuditRequest } from "@/types/audit";
import { AUDIT_STRUCTURED_DEFAULT_MODEL } from "@/lib/gen/defaults";
import { inFlightAudits } from "./in-flight";
import { AUDIT_MODEL_CANDIDATES, toResponsesModelId, AUDIT_AI_SCHEMA } from "./schema";
import {
  USD_TO_SEK,
  createFallbackResult,
  validateAuditResult,
  estimateWordCountFromSiteContent,
  getPricingForModel,
  messageLooksLikeHttp5xx,
} from "./analysis";

export async function POST(request: NextRequest) {
  return withRateLimit(request, "audit:create", async () => {
    const requestId = `audit_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const requestStartTime = Date.now();

    // Track in-flight key for cleanup (set after user auth succeeds)
    let inFlightKey: string | null = null;

    try {
      // Parse request body
      let body: AuditRequest;
      try {
        body = await request.json();
      } catch {
        return NextResponse.json(
          { success: false, error: "Ogiltig JSON i förfrågan" },
          { status: 400 },
        );
      }

      const { url, auditMode } = body;
      const resolvedAuditMode: AuditMode = auditMode === "advanced" ? "advanced" : "basic";
      const auditAction: CreditAction =
        resolvedAuditMode === "advanced" ? "audit.advanced" : "audit.basic";
      const auditCost = getCreditCost(auditAction);

      // Validate URL
      let normalizedUrl: string;
      try {
        normalizedUrl = validateAndNormalizeUrl(url);
      } catch (error) {
        return NextResponse.json(
          {
            success: false,
            error:
              error instanceof Error ? error.message : "Ogiltig URL. Ange en giltig webbadress.",
          },
          { status: 400 },
        );
      }

      console.info(`[${requestId}] Audit request for: ${normalizedUrl}`);

      // Get canonical key for duplicate detection
      const canonicalKey = getCanonicalUrlKey(normalizedUrl);

      const creditCheck = await prepareCredits(request, auditAction);
      if (!creditCheck.ok) {
        return creditCheck.response;
      }

      const user = creditCheck.user;
      if (!user) {
        return NextResponse.json(
          { success: false, error: "Användare hittades inte." },
          { status: 404 },
        );
      }

      console.info(
        `[${requestId}] User ${user.id} has ${user.diamonds} diamonds (test: ${creditCheck.isTest})`,
      );

      // Check for duplicate in-flight audit (same user + URL)
      inFlightKey = `${user.id}:${canonicalKey}`;
      const existingAudit = inFlightAudits.get(inFlightKey);
      if (existingAudit) {
        const ageMs = Date.now() - existingAudit.startTime;
        console.info(
          `[${requestId}] Duplicate audit request detected (in-flight for ${Math.round(
            ageMs / 1000,
          )}s)`,
        );
        // Return 409 Conflict to indicate a duplicate request
        return NextResponse.json(
          {
            success: false,
            error: `En audit för denna URL pågår redan. Vänta tills den är klar (startat för ${Math.round(
              ageMs / 1000,
            )} sekunder sedan).`,
            duplicate: true,
          },
          { status: 409 },
        );
      }

      // Mark this audit as in-flight (will be cleaned up in finally block)
      // We use a placeholder promise here - actual result tracking would require refactoring
      inFlightAudits.set(inFlightKey, {
        startTime: Date.now(),
        userId: user.id,
        promise: Promise.resolve({} as AuditResult), // Placeholder
      });

      try {
        // Scrape website content
        console.info(`[${requestId}] Scraping website...`);
        let websiteContent;
        try {
          websiteContent = await scrapeWebsite(normalizedUrl);
          console.info(`[${requestId}] Scraping completed:`, {
            title: websiteContent.title?.substring(0, 50),
            wordCount: websiteContent.wordCount,
            headingsCount: websiteContent.headings.length,
            pagesSampled: websiteContent.sampledUrls?.length || 1,
          });
        } catch (error) {
          console.error(`[${requestId}] Scraping failed:`, error);
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Kunde inte hämta hemsidan. Kontrollera URL:en och försök igen.";

          // Return appropriate status code based on error type
          let statusCode = 400;
          if (errorMessage.includes("403") || errorMessage.includes("Forbidden")) {
            statusCode = 403;
          } else if (errorMessage.includes("401") || errorMessage.includes("Unauthorized")) {
            statusCode = 401;
          } else if (errorMessage.includes("404") || errorMessage.includes("Not Found")) {
            statusCode = 404;
          } else if (errorMessage.includes("Timeout")) {
            statusCode = 408;
          } else if (errorMessage.includes("Serverfel") || messageLooksLikeHttp5xx(errorMessage)) {
            statusCode = 502;
          }

          return NextResponse.json(
            {
              success: false,
              error: errorMessage,
            },
            { status: statusCode },
          );
        }

        const isJsRendered = websiteContent.wordCount < 50;

        const prompt = buildAuditPrompt(websiteContent, normalizedUrl, resolvedAuditMode);
        const promptMessages = prompt.map((message) => ({
          role: message.role,
          content: message.content.map((part) => part.text).join("\n"),
        }));

        // ── AI call: Responses API (structured output) or legacy fallback ──
        let auditResult: Partial<AuditResult> = {};
        let usedFallback = false;
        let webSearchCallCount = 0;
        let inputTokens = 0;
        let outputTokens = 0;
        let usedModel: string = AUDIT_MODEL_CANDIDATES[0];

        if (FEATURES.useResponsesApi) {
          // ── Responses API path ──────────────────────────────────────
          const RESPONSES_MODEL = toResponsesModelId(AUDIT_STRUCTURED_DEFAULT_MODEL);
          usedModel = AUDIT_STRUCTURED_DEFAULT_MODEL;

          const openai = new OpenAI({ apiKey: SECRETS.openaiApiKey });

          const tools: OpenAI.Responses.Tool[] = FEATURES.useAuditWebSearch
            ? [{ type: "web_search_preview" as const, search_context_size: "low" as const }]
            : [];

          const promptContent = promptMessages
            .map((m) => `${m.role === "system" ? "[System]\n" : ""}${m.content}`)
            .join("\n\n");

          console.info(
            `[${requestId}] Calling Responses API (${RESPONSES_MODEL}, web_search=${FEATURES.useAuditWebSearch})`,
          );

          const response = await openai.responses.create({
            model: RESPONSES_MODEL,
            input: [{ role: "user", content: promptContent }],
            tools: tools.length > 0 ? tools : undefined,
            text: {
              format: {
                type: "json_schema",
                name: "website_audit",
                schema: AUDIT_AI_SCHEMA,
                strict: true,
              },
            },
            store: false,
          });

          const apiDuration = Date.now() - requestStartTime;

          webSearchCallCount = response.output.filter(
            (item) => item.type === "web_search_call",
          ).length;

          if (response.usage) {
            inputTokens = response.usage.input_tokens ?? 0;
            outputTokens = response.usage.output_tokens ?? 0;
          }

          console.info(
            `[${requestId}] Responses API completed in ${apiDuration}ms (web_searches=${webSearchCallCount})`,
          );

          if (!response.output_text || response.output_text.trim().length === 0) {
            console.error(`[${requestId}] Empty response from Responses API`);
            return NextResponse.json(
              { success: false, error: "Tom respons från AI. Försök igen." },
              { status: 500 },
            );
          }

          try {
            auditResult = JSON.parse(response.output_text);
            console.info(`[${requestId}] Structured output parsed successfully`);
          } catch (parseErr) {
            console.error(`[${requestId}] Structured output parse failed (unexpected):`, parseErr);
            auditResult = createFallbackResult(websiteContent, normalizedUrl, resolvedAuditMode);
            usedFallback = true;
          }
        } else {
          // ── Legacy fallback path: AI SDK direct model chain ─────────

          let aiResult: Awaited<ReturnType<typeof generateText>> | null = null;
          let lastFallbackError: unknown = null;
          for (const candidateModel of AUDIT_MODEL_CANDIDATES) {
            usedModel = candidateModel;
            console.info(`[${requestId}] Calling fallback model (${usedModel})`);
            try {
              const candidateResult = await generateText({
                model: createDirectModel(usedModel),
                messages: promptMessages,
                maxOutputTokens: 16000,
              });
              const candidateText = candidateResult.text || "";
              if (candidateText.trim().length === 0) {
                console.warn(
                  `[${requestId}] Empty response from ${usedModel}, trying next fallback`,
                );
                continue;
              }
              aiResult = candidateResult;
              break;
            } catch (fallbackError) {
              lastFallbackError = fallbackError;
              console.warn(
                `[${requestId}] Fallback model call failed for ${usedModel}:`,
                fallbackError,
              );
            }
          }

          if (!aiResult) {
            console.error(
              `[${requestId}] All configured audit fallback models failed`,
              lastFallbackError,
            );
            return NextResponse.json(
              { success: false, error: "Auditens fallback-kedja kunde inte generera ett svar." },
              { status: 502 },
            );
          }

          const apiDuration = Date.now() - requestStartTime;
          console.info(
            `[${requestId}] Fallback chain completed in ${apiDuration}ms using ${usedModel}`,
          );

          const usage = aiResult.usage ?? {};
          inputTokens =
            (usage as { inputTokens?: number }).inputTokens ??
            (usage as { promptTokens?: number }).promptTokens ??
            0;
          outputTokens =
            (usage as { outputTokens?: number }).outputTokens ??
            (usage as { completionTokens?: number }).completionTokens ??
            0;

          const outputText = aiResult.text || "";

          if (!outputText || outputText.trim().length === 0) {
            console.error(`[${requestId}] Empty response from API`);
            console.error(`[${requestId}] Full response keys:`, Object.keys(aiResult || {}));
            console.error(
              `[${requestId}] Response preview:`,
              JSON.stringify(aiResult).substring(0, 500),
            );
            return NextResponse.json(
              { success: false, error: "Tom respons från AI. Försök igen." },
              { status: 500 },
            );
          }

          let cleanedOutput = outputText.trim();

          const jsonBlockMatch = cleanedOutput.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
          if (jsonBlockMatch) {
            cleanedOutput = jsonBlockMatch[1].trim();
            console.info(`[${requestId}] Removed markdown code block wrapper`);
          }

          const firstBrace = cleanedOutput.indexOf("{");
          const lastBrace = cleanedOutput.lastIndexOf("}");
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            const beforeJson = cleanedOutput.substring(0, firstBrace).trim();
            const afterJson = cleanedOutput.substring(lastBrace + 1).trim();
            if (beforeJson || afterJson) {
              cleanedOutput = cleanedOutput.substring(firstBrace, lastBrace + 1);
              console.info(`[${requestId}] Trimmed text before/after JSON`);
            }
          }

          const parseResult = parseJsonWithRepair(cleanedOutput);

          if (parseResult.success && parseResult.data) {
            auditResult = parseResult.data;
            console.info(`[${requestId}] JSON parse succeeded`);
          } else {
            console.info(
              `[${requestId}] Direct parse failed, trying extraction:`,
              parseResult.error || "unknown",
            );
            const jsonString = extractFirstJsonObject(outputText);
            if (!jsonString) {
              console.error(
                `[${requestId}] Could not find JSON in response. Full output (first 2000 chars):`,
                outputText.substring(0, 2000),
              );
              console.info(
                `[${requestId}] Falling back to scraped-data audit (AI response invalid JSON)`,
              );
              auditResult = createFallbackResult(websiteContent, normalizedUrl, resolvedAuditMode);
              usedFallback = true;
            } else {
              console.info(`[${requestId}] Extracted JSON length: ${jsonString.length} chars`);

              const extractParseResult = parseJsonWithRepair(jsonString);
              if (extractParseResult.success && extractParseResult.data) {
                auditResult = extractParseResult.data;
                console.info(`[${requestId}] Extracted JSON parse succeeded`);
              } else {
                const errorPos = extractParseResult.error?.match(/position (\d+)/)?.[1];
                const startPos = errorPos ? Math.max(0, parseInt(errorPos) - 500) : 0;
                const endPos = errorPos
                  ? Math.min(jsonString.length, parseInt(errorPos) + 500)
                  : 1000;
                console.error(
                  `[${requestId}] Failed to parse extracted JSON:`,
                  extractParseResult.error,
                );
                console.error(
                  `[${requestId}] Problematic JSON section (chars ${startPos}-${endPos}):`,
                  jsonString.substring(startPos, endPos),
                );
                console.info(
                  `[${requestId}] Falling back to scraped-data audit (AI JSON parse failed)`,
                );
                auditResult = createFallbackResult(
                  websiteContent,
                  normalizedUrl,
                  resolvedAuditMode,
                );
                usedFallback = true;
              }
            }
          }
        }

        // Audit result parsed successfully

        // Special case: sometimes the model only returns audit_scores as root object.
        // If the parsed object ONLY contains score keys, wrap it in a fallback result
        // so the UI still gets a full audit payload instead of failing validation.
        const scoreKeys = [
          "seo",
          "technical_seo",
          "ux",
          "content",
          "performance",
          "accessibility",
          "security",
          "mobile",
        ];
        const auditObj = auditResult as Record<string, unknown>;
        const auditObjKeys = Object.keys(auditObj || {});
        const isScoreOnly =
          auditObjKeys.length > 0 &&
          auditObjKeys.every((k) => scoreKeys.includes(k) && typeof auditObj[k] === "number");

        if (isScoreOnly) {
          console.warn(
            `[${requestId}] Parsed JSON is score-only. Wrapping into fallback audit result. Keys: ${auditObjKeys.join(
              ", ",
            )}`,
          );
          const fallback = createFallbackResult(
            websiteContent,
            normalizedUrl,
            resolvedAuditMode,
          ) as {
            audit_scores: Record<string, number>;
            [key: string]: unknown;
          };
          fallback.audit_scores = {
            ...fallback.audit_scores,
            ...(auditObj as Record<string, number>),
          };
          auditResult = fallback;
          usedFallback = true;
        }

        // Check if result is nested inside another object (e.g. { result: {...} } or { audit: {...} })
        const possibleNestedKeys = ["result", "audit", "data", "response", "audit_result"];
        for (const key of possibleNestedKeys) {
          const nested = (auditResult as Record<string, unknown>)?.[key];
          if (nested && typeof nested === "object" && !Array.isArray(nested)) {
            // Check if nested object has more audit-like fields
            const nestedObj = nested as Record<string, unknown>;
            if (
              nestedObj.company ||
              nestedObj.audit_scores ||
              nestedObj.improvements ||
              nestedObj.strengths
            ) {
              console.info(`[${requestId}] Found nested audit result under key "${key}"`);
              auditResult = nested;
              break;
            }
          }
        }

        // Validate result (more lenient - just check it's an object with some data)
        if (!validateAuditResult(auditResult)) {
          const ar = auditResult as Record<string, unknown>;
          console.error(
            `[${requestId}] Invalid audit result. Has fields:`,
            JSON.stringify({
              hasCompany: typeof ar?.company === "string" && ar.company,
              hasImprovements: Array.isArray(ar?.improvements) && ar.improvements.length > 0,
              hasScores: ar?.audit_scores && typeof ar.audit_scores === "object",
              hasStrengths: Array.isArray(ar?.strengths) && ar.strengths.length > 0,
              hasIssues: Array.isArray(ar?.issues) && ar.issues.length > 0,
            }),
          );
          console.error(`[${requestId}] Actual keys present:`, Object.keys(ar || {}));
          console.error(
            `[${requestId}] Sample values:`,
            JSON.stringify({
              company: ar?.company,
              strengths: Array.isArray(ar?.strengths) ? ar.strengths.slice(0, 2) : ar?.strengths,
              issues: Array.isArray(ar?.issues) ? ar.issues.slice(0, 2) : ar?.issues,
            }),
          );

          // Try to return partial result anyway if it has ANYTHING useful
          if (auditResult && typeof auditResult === "object" && Object.keys(ar).length > 0) {
            console.info(
              `[${requestId}] Returning partial result despite validation failure (${
                Object.keys(ar).length
              } keys)`,
            );
          } else {
            // Create a minimal fallback result based on scraped data
            console.info(`[${requestId}] Creating fallback result from scraped data`);
            auditResult = createFallbackResult(websiteContent, normalizedUrl, resolvedAuditMode);
          }
        }

        // Calculate cost (for display)
        const pricing = getPricingForModel(usedModel);
        const costUSD = (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
        const costSEK = costUSD * USD_TO_SEK;
        console.info(
          `[${requestId}] Audit cost summary: mode=${resolvedAuditMode}, diamonds=${auditCost}, tokens=${
            inputTokens + outputTokens
          }, usd=${costUSD.toFixed(4)}, sek=${costSEK.toFixed(2)}, model=${usedModel || "unknown"}`,
        );

        // Add metadata to result
        const domain = new URL(normalizedUrl).hostname;
        const estimatedWordCount = estimateWordCountFromSiteContent(auditResult.site_content);
        const useEstimatedWordCount =
          estimatedWordCount > 0 &&
          (isJsRendered || websiteContent.wordCount < 50 || webSearchCallCount > 0);
        const aggregatedWordCount = useEstimatedWordCount
          ? Math.max(websiteContent.wordCount, estimatedWordCount)
          : websiteContent.wordCount;
        const wordCountSource = useEstimatedWordCount ? "ai_estimate" : "scraper";

        const scrapeSummaryNotes: string[] = [
          useEstimatedWordCount
            ? `Scraper: ${websiteContent.sampledUrls?.length || 1} sida(or), ${
                websiteContent.wordCount
              } ord. AI-estimerat innehåll: ${aggregatedWordCount} ord. ${
                websiteContent.headings.length
              } rubriker.`
            : `Scraper: ${
                websiteContent.sampledUrls?.length || 1
              } sida(or), ${aggregatedWordCount} ord (agg), ${
                websiteContent.headings.length
              } rubriker.`,
          isJsRendered
            ? "Indikation: sidan verkar JavaScript-renderad (scraper kan missa text)."
            : "Indikation: sidan verkar server-renderad (scraper fångar normalt text bra).",
          `Web search: ${webSearchCallCount > 0 ? "användes" : "användes inte"}.`,
          "Begränsningar: scraper hämtar max 4 sidor och aggregerar max ~2000 ord.",
        ];
        if (usedFallback) {
          scrapeSummaryNotes.push(
            "Obs: AI-resultatet kunde inte valideras fullt ut och rapporten innehåller fallback-bedömningar.",
          );
        }

        const result: AuditResult = {
          ...auditResult,
          audit_mode: resolvedAuditMode,
          audit_type: "website_audit",
          domain,
          timestamp: new Date().toISOString(),
          cost: {
            tokens: inputTokens + outputTokens,
            sek: parseFloat(costSEK.toFixed(2)),
            usd: parseFloat(costUSD.toFixed(4)),
          },
          scrape_summary: {
            sampled_urls: websiteContent.sampledUrls?.length
              ? websiteContent.sampledUrls
              : [websiteContent.url],
            pages_sampled: websiteContent.sampledUrls?.length || 1,
            aggregated_word_count: aggregatedWordCount,
            word_count_source: wordCountSource,
            headings_count: websiteContent.headings.length,
            images_count: websiteContent.images,
            response_time_ms: websiteContent.responseTime,
            is_js_rendered: isJsRendered,
            web_search_calls: webSearchCallCount,
            notes: scrapeSummaryNotes,
          },
        };

        try {
          await creditCheck.commit();
          if (creditCheck.isTest) {
            console.info(`[${requestId}] Test user - no diamonds deducted`);
          } else {
            console.info(`[${requestId}] Deducted ${auditCost} diamonds from user ${user.id}`);
          }
        } catch (txError) {
          console.error(`[${requestId}] Failed to deduct diamonds:`, txError);
          return NextResponse.json(
            {
              success: false,
              error: "Debiteringen misslyckades. Försök igen om en stund.",
            },
            {
              status: 500,
              headers: {
                "X-Request-ID": requestId,
                "X-Response-Time": `${Date.now() - requestStartTime}ms`,
              },
            },
          );
        }

        const totalDuration = Date.now() - requestStartTime;
        console.info(`[${requestId}] Audit completed in ${totalDuration}ms`);

        return NextResponse.json(
          {
            success: true,
            result,
          },
          {
            headers: {
              "X-Request-ID": requestId,
              "X-Response-Time": `${totalDuration}ms`,
              ...(usedFallback ? { "X-Audit-Fallback": "true" } : {}),
            },
          },
        );
      } finally {
        if (inFlightKey) {
          inFlightAudits.delete(inFlightKey);
        }
      }
    } catch (error: unknown) {
      const totalDuration = Date.now() - requestStartTime;
      const err = error as { message?: string; status?: number; code?: string };

      console.error(`[${requestId}] Audit error after ${totalDuration}ms:`, {
        message: err.message,
        status: err.status,
        code: err.code,
      });

      // Provide user-friendly error messages
      let errorMessage = "Ett fel uppstod vid analysen. Försök igen senare.";

      if (
        err.status === 401 ||
        err.message?.includes("OPENAI_API_KEY") ||
        err.message?.includes("ANTHROPIC_API_KEY")
      ) {
        errorMessage =
          "AI-provider saknas eller är felkonfigurerad (OPENAI_API_KEY / ANTHROPIC_API_KEY).";
      } else if (err.status === 429) {
        errorMessage = "För många förfrågningar. Vänta en stund och försök igen.";
      } else if (err.message?.includes("timeout")) {
        errorMessage = "Analysen tog för lång tid. Försök med en enklare sida.";
      } else if (err.message?.includes("ENOTFOUND")) {
        errorMessage = "Kunde inte nå webbplatsen. Kontrollera URL:en.";
      }

      // Prefer returning the upstream status when it makes sense, but avoid
      // clashing with our own auth semantics (401 is reserved for user auth).
      let statusCode = 500;
      if (
        typeof err.status === "number" &&
        err.status >= 400 &&
        err.status < 600 &&
        err.status !== 401
      ) {
        statusCode = err.status;
      }

      return NextResponse.json(
        { success: false, error: errorMessage },
        {
          status: statusCode,
          headers: {
            "X-Request-ID": requestId,
            "X-Response-Time": `${totalDuration}ms`,
          },
        },
      );
    }
  });
}
