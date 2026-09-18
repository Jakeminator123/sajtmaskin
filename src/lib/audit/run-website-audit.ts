import { generateText } from "ai";
import { createDirectModel } from "@/lib/builder/direct-model";
import OpenAI from "openai";
import { scrapeWebsite } from "@/lib/webscraper";
import {
  buildAuditPrompt,
  buildPublicAnalysPrompt,
  extractFirstJsonObject,
  parseJsonWithRepair,
} from "@/lib/audit-prompts";
import { FEATURES, SECRETS } from "@/lib/config";
import type { AuditMode, AuditResult } from "@/types/audit";
import {
  AUDIT_PUBLIC_STRUCTURED_DEFAULT_MODEL,
  AUDIT_STRUCTURED_DEFAULT_MODEL,
} from "@/lib/gen/defaults";
import {
  AUDIT_MODEL_CANDIDATES,
  PUBLIC_AUDIT_MODEL_CANDIDATES,
  toResponsesModelId,
  AUDIT_AI_SCHEMA,
} from "@/app/api/audit/modules/schema";
import {
  USD_TO_SEK,
  createFallbackResult,
  validateAuditResult,
  estimateWordCountFromSiteContent,
  getPricingForModel,
  messageLooksLikeHttp5xx,
} from "@/app/api/audit/modules/analysis";

export type AuditPromptKind = "product" | "public";

export type RunWebsiteAuditSuccess = {
  ok: true;
  result: AuditResult;
  usedFallback: boolean;
  usedModel: string;
};

export type RunWebsiteAuditFailure = {
  ok: false;
  status: number;
  error: string;
};

const SCORE_KEYS = [
  "seo",
  "technical_seo",
  "ux",
  "content",
  "performance",
  "accessibility",
  "security",
  "mobile",
] as const;

function scrapeErrorStatus(errorMessage: string): number {
  if (errorMessage.includes("403") || errorMessage.includes("Forbidden")) return 403;
  if (errorMessage.includes("401") || errorMessage.includes("Unauthorized")) return 401;
  if (errorMessage.includes("404") || errorMessage.includes("Not Found")) return 404;
  if (errorMessage.includes("Timeout")) return 408;
  if (errorMessage.includes("Serverfel") || messageLooksLikeHttp5xx(errorMessage)) return 502;
  return 400;
}

function scrapeErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Kunde inte hämta hemsidan. Kontrollera URL:en och försök igen.";
}

/**
 * Shared scrape → LLM → AuditResult pipeline.
 * Product audit (`/api/audit`) and public `/analys` share this; credits and
 * guest quotas stay in the route handlers.
 */
export async function runWebsiteAudit(input: {
  normalizedUrl: string;
  auditMode: AuditMode;
  promptKind: AuditPromptKind;
  requestId: string;
  requestStartTime: number;
}): Promise<RunWebsiteAuditSuccess | RunWebsiteAuditFailure> {
  const { normalizedUrl, promptKind, requestId, requestStartTime } = input;
  const resolvedAuditMode: AuditMode =
    promptKind === "public" ? "basic" : input.auditMode === "advanced" ? "advanced" : "basic";
  const modelCandidates =
    promptKind === "public" ? PUBLIC_AUDIT_MODEL_CANDIDATES : AUDIT_MODEL_CANDIDATES;
  const primaryModel =
    promptKind === "public"
      ? AUDIT_PUBLIC_STRUCTURED_DEFAULT_MODEL
      : AUDIT_STRUCTURED_DEFAULT_MODEL;
  const allowWebSearch = promptKind === "product" && FEATURES.useAuditWebSearch;

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
    const errorMessage = scrapeErrorMessage(error);
    return { ok: false, status: scrapeErrorStatus(errorMessage), error: errorMessage };
  }

  const isJsRendered = websiteContent.wordCount < 50;
  const prompt =
    promptKind === "public"
      ? buildPublicAnalysPrompt(websiteContent, normalizedUrl)
      : buildAuditPrompt(websiteContent, normalizedUrl, resolvedAuditMode);
  const promptMessages = prompt.map((message) => ({
    role: message.role,
    content: message.content.map((part) => part.text).join("\n"),
  }));

  let auditResult: Partial<AuditResult> = {};
  let usedFallback = false;
  let webSearchCallCount = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let usedModel: string = modelCandidates[0] ?? primaryModel;

  if (FEATURES.useResponsesApi) {
    const RESPONSES_MODEL = toResponsesModelId(primaryModel);
    usedModel = primaryModel;

    const openai = new OpenAI({ apiKey: SECRETS.openaiApiKey });

    const tools: OpenAI.Responses.Tool[] = allowWebSearch
      ? [{ type: "web_search_preview" as const, search_context_size: "low" as const }]
      : [];

    const promptContent = promptMessages
      .map((m) => `${m.role === "system" ? "[System]\n" : ""}${m.content}`)
      .join("\n\n");

    console.info(
      `[${requestId}] Calling Responses API (${RESPONSES_MODEL}, web_search=${allowWebSearch}, prompt=${promptKind})`,
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

    webSearchCallCount = response.output.filter((item) => item.type === "web_search_call").length;

    if (response.usage) {
      inputTokens = response.usage.input_tokens ?? 0;
      outputTokens = response.usage.output_tokens ?? 0;
    }

    console.info(
      `[${requestId}] Responses API completed in ${apiDuration}ms (web_searches=${webSearchCallCount})`,
    );

    if (!response.output_text || response.output_text.trim().length === 0) {
      console.error(`[${requestId}] Empty response from Responses API`);
      return { ok: false, status: 500, error: "Tom respons från AI. Försök igen." };
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
    let aiResult: Awaited<ReturnType<typeof generateText>> | null = null;
    let lastFallbackError: unknown = null;
    for (const candidateModel of modelCandidates) {
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
          console.warn(`[${requestId}] Empty response from ${usedModel}, trying next fallback`);
          continue;
        }
        aiResult = candidateResult;
        break;
      } catch (fallbackError) {
        lastFallbackError = fallbackError;
        console.warn(`[${requestId}] Fallback model call failed for ${usedModel}:`, fallbackError);
      }
    }

    if (!aiResult) {
      console.error(`[${requestId}] All configured audit fallback models failed`, lastFallbackError);
      return {
        ok: false,
        status: 502,
        error: "Auditens fallback-kedja kunde inte generera ett svar.",
      };
    }

    const apiDuration = Date.now() - requestStartTime;
    console.info(`[${requestId}] Fallback chain completed in ${apiDuration}ms using ${usedModel}`);

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
      return { ok: false, status: 500, error: "Tom respons från AI. Försök igen." };
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
        auditResult = createFallbackResult(websiteContent, normalizedUrl, resolvedAuditMode);
        usedFallback = true;
      } else {
        const extractParseResult = parseJsonWithRepair(jsonString);
        if (extractParseResult.success && extractParseResult.data) {
          auditResult = extractParseResult.data;
          console.info(`[${requestId}] Extracted JSON parse succeeded`);
        } else {
          console.error(
            `[${requestId}] Failed to parse extracted JSON:`,
            extractParseResult.error,
          );
          auditResult = createFallbackResult(websiteContent, normalizedUrl, resolvedAuditMode);
          usedFallback = true;
        }
      }
    }
  }

  const auditObj = auditResult as Record<string, unknown>;
  const auditObjKeys = Object.keys(auditObj || {});
  const isScoreOnly =
    auditObjKeys.length > 0 &&
    auditObjKeys.every((k) => SCORE_KEYS.includes(k as (typeof SCORE_KEYS)[number]) && typeof auditObj[k] === "number");

  if (isScoreOnly) {
    console.warn(
      `[${requestId}] Parsed JSON is score-only. Wrapping into fallback audit result. Keys: ${auditObjKeys.join(
        ", ",
      )}`,
    );
    const fallback = createFallbackResult(websiteContent, normalizedUrl, resolvedAuditMode) as {
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

  const possibleNestedKeys = ["result", "audit", "data", "response", "audit_result"];
  for (const key of possibleNestedKeys) {
    const nested = (auditResult as Record<string, unknown>)?.[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
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

  if (!validateAuditResult(auditResult)) {
    const ar = auditResult as Record<string, unknown>;
    console.error(`[${requestId}] Invalid audit result. Has fields:`, Object.keys(ar || {}));

    if (auditResult && typeof auditResult === "object" && Object.keys(ar).length > 0) {
      console.info(
        `[${requestId}] Returning partial result despite validation failure (${Object.keys(ar).length} keys)`,
      );
    } else {
      auditResult = createFallbackResult(websiteContent, normalizedUrl, resolvedAuditMode);
    }
  }

  const pricing = getPricingForModel(usedModel);
  const costUSD = (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
  const costSEK = costUSD * USD_TO_SEK;
  console.info(
    `[${requestId}] Audit cost summary: mode=${resolvedAuditMode}, prompt=${promptKind}, tokens=${
      inputTokens + outputTokens
    }, usd=${costUSD.toFixed(4)}, sek=${costSEK.toFixed(2)}, model=${usedModel || "unknown"}`,
  );

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
        } sida(or), ${aggregatedWordCount} ord (agg), ${websiteContent.headings.length} rubriker.`,
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
      images: websiteContent.imageCandidates,
      response_time_ms: websiteContent.responseTime,
      is_js_rendered: isJsRendered,
      web_search_calls: webSearchCallCount,
      notes: scrapeSummaryNotes,
    },
  };

  return { ok: true, result, usedFallback, usedModel };
}

export function mapWebsiteAuditException(error: unknown): RunWebsiteAuditFailure {
  const err = error as { message?: string; status?: number; code?: string };
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

  let status = 500;
  if (typeof err.status === "number" && err.status >= 400 && err.status < 600 && err.status !== 401) {
    status = err.status;
  }

  return { ok: false, status, error: errorMessage };
}
