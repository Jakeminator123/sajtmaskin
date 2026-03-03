/**
 * API Route: Wizard Enrich
 * POST /api/wizard/enrich
 *
 * Takes wizard step data and returns AI-driven follow-up questions,
 * suggestions, and optionally scraped website data.
 *
 * Optimised for SPEED: uses generateText + JSON parsing instead of
 * generateObject (structured output adds ~10s overhead on some models).
 */

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { generateText, gateway } from "ai";
import OpenAI from "openai";
import { z } from "zod";
import { requireNotBot } from "@/lib/botProtection";
import { withRateLimit } from "@/lib/rateLimit";
import { scrapeWebsite } from "@/lib/webscraper";
import { debugLog, errorLog } from "@/lib/utils/debug";
import { prepareCredits } from "@/lib/credits/server";
import { FEATURES, SECRETS } from "@/lib/config";

export const runtime = "nodejs";
export const maxDuration = 30;

// ── Request schema ──────────────────────────────────────────────────

const MAX_SHORT_TEXT = 300;
const MAX_MEDIUM_TEXT = 3000;
const MAX_LONG_TEXT = 12000;
const MAX_URL_LENGTH = 2048;
const MAX_QUESTION_OPTIONS = 8;
const MAX_UNKNOWNS = 4;
const MAX_FOLLOWUP_QUESTIONS = 4;
const MAX_SUGGESTIONS = 4;

const enrichRequestSchema = z.object({
  mode: z.enum(["step", "final_check"]).optional().default("step"),
  step: z.number().int().min(1).max(5),
  data: z.object({
    companyName: z.string().max(MAX_SHORT_TEXT).optional().default(""),
    industry: z.string().max(MAX_SHORT_TEXT).optional().default(""),
    location: z.string().max(MAX_SHORT_TEXT).optional().default(""),
    existingWebsite: z.string().max(MAX_URL_LENGTH).optional().default(""),
    inspirationSites: z.array(z.string().max(MAX_URL_LENGTH)).max(5).optional().default([]),
    purposes: z.array(z.string().max(MAX_SHORT_TEXT)).max(20).optional().default([]),
    targetAudience: z.string().max(MAX_MEDIUM_TEXT).optional().default(""),
    usp: z.string().max(MAX_MEDIUM_TEXT).optional().default(""),
    selectedVibe: z.string().max(MAX_SHORT_TEXT).optional().default(""),
    specialWishes: z.string().max(MAX_LONG_TEXT).optional().default(""),
    previousFollowUps: z
      .record(z.string().max(MAX_SHORT_TEXT), z.string().max(MAX_MEDIUM_TEXT))
      .optional()
      .default({}),
    companyLookup: z.object({
      found: z.boolean(),
      employees: z.number().optional(),
      revenueKsek: z.number().optional(),
      industries: z.array(z.string()).optional(),
      purpose: z.string().optional(),
    }).optional(),
    competitors: z.array(z.object({
      name: z.string(),
      website: z.string().optional(),
    })).max(6).optional(),
  }),
  scrapeUrl: z.string().max(MAX_URL_LENGTH).optional(),
});

const followUpDependencySchema = z.object({
  answerId: z.string().min(1).max(MAX_SHORT_TEXT),
  includes: z.array(z.string().min(1).max(MAX_SHORT_TEXT)).max(6).optional(),
  excludes: z.array(z.string().min(1).max(MAX_SHORT_TEXT)).max(6).optional(),
});

const followUpQuestionSchema = z.object({
  id: z.string().min(1).max(40),
  text: z.string().min(3).max(220),
  type: z.enum(["text", "select", "chips"]).default("text"),
  options: z.array(z.string().min(1).max(MAX_SHORT_TEXT)).max(MAX_QUESTION_OPTIONS).optional(),
  placeholder: z.string().max(MAX_SHORT_TEXT).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  dependsOn: followUpDependencySchema.optional(),
});

const suggestionSchema = z.object({
  type: z.enum(["audience", "feature", "usp", "palette", "trend"]).default("feature"),
  text: z.string().min(2).max(MAX_SHORT_TEXT),
});

const enrichMetaSchema = z.object({
  confidence: z.number().min(0).max(1).optional(),
  needsClarification: z.boolean().optional(),
  unknowns: z.array(z.string().min(2).max(MAX_SHORT_TEXT)).max(MAX_UNKNOWNS).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
});

const enrichResponseSchema = z.object({
  questions: z.array(followUpQuestionSchema).max(MAX_FOLLOWUP_QUESTIONS).optional().default([]),
  suggestions: z.array(suggestionSchema).max(MAX_SUGGESTIONS).optional().default([]),
  insightSummary: z.string().max(MAX_MEDIUM_TEXT).optional().nullable(),
  meta: enrichMetaSchema.optional(),
});

// ── JSON Schema for Responses API structured output ─────────────────

const ENRICH_JSON_SCHEMA = {
  type: "object" as const,
  properties: {
    questions: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          id: { type: "string" as const },
          text: { type: "string" as const },
          type: { type: "string" as const, enum: ["text", "select", "chips"] },
          options: {
            type: ["array", "null"] as unknown as "array",
            items: { type: "string" as const },
          },
          placeholder: { type: ["string", "null"] as unknown as "string" },
          priority: { type: ["string", "null"] as unknown as "string", enum: ["low", "medium", "high", null] },
        },
        required: ["id", "text", "type", "options", "placeholder", "priority"] as const,
        additionalProperties: false,
      },
    },
    suggestions: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          type: { type: "string" as const, enum: ["audience", "feature", "usp", "palette", "trend"] },
          text: { type: "string" as const },
        },
        required: ["type", "text"] as const,
        additionalProperties: false,
      },
    },
    insightSummary: { type: ["string", "null"] as unknown as "string" },
    meta: {
      type: ["object", "null"] as unknown as "object",
      properties: {
        confidence: { type: "number" as const },
        needsClarification: { type: "boolean" as const },
        unknowns: { type: "array" as const, items: { type: "string" as const } },
        priority: { type: "string" as const, enum: ["low", "medium", "high"] },
      },
      required: ["confidence", "needsClarification", "unknowns", "priority"] as const,
      additionalProperties: false,
    },
  },
  required: ["questions", "suggestions", "insightSummary", "meta"] as const,
  additionalProperties: false,
} as const;

// ── Industry context ────────────────────────────────────────────────

const INDUSTRY_CONTEXT: Record<string, string> = {
  cafe: "Café/konditori",
  restaurant: "Restaurang/bar",
  retail: "Butik/detaljhandel",
  tech: "Tech/IT-företag",
  consulting: "Konsult/tjänster",
  health: "Hälsa/wellness",
  creative: "Kreativ byrå",
  education: "Utbildning",
  ecommerce: "E-handel",
  realestate: "Fastigheter/mäklare",
  other: "Företag",
};

// GPT-5 mini: fast ($0.25/1M in) and good enough for follow-up questions
const ENRICH_MODEL = "openai/gpt-5-mini";

type EnrichResponse = z.infer<typeof enrichResponseSchema>;

function toText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function makeQuestionId(index: number): string {
  return `q${index + 1}`;
}

function sanitizeQuestion(rawQuestion: unknown, index: number): z.infer<typeof followUpQuestionSchema> | null {
  if (!rawQuestion || typeof rawQuestion !== "object") return null;
  const candidate = rawQuestion as Record<string, unknown>;
  const type = toText(candidate.type).toLowerCase();
  const optionsRaw = Array.isArray(candidate.options)
    ? candidate.options.map((opt) => toText(opt)).filter(Boolean).slice(0, MAX_QUESTION_OPTIONS)
    : undefined;
  const normalizedType = type === "select" || type === "chips" ? type : "text";

  const normalized = {
    id: toText(candidate.id) || makeQuestionId(index),
    text: toText(candidate.text),
    type: normalizedType as "text" | "select" | "chips",
    options:
      normalizedType === "text"
        ? undefined
        : optionsRaw && optionsRaw.length > 0
          ? optionsRaw
          : undefined,
    placeholder: toText(candidate.placeholder) || undefined,
    priority: ["low", "medium", "high"].includes(toText(candidate.priority))
      ? (toText(candidate.priority) as "low" | "medium" | "high")
      : undefined,
    dependsOn:
      candidate.dependsOn && typeof candidate.dependsOn === "object"
        ? {
            answerId: toText((candidate.dependsOn as Record<string, unknown>).answerId),
            includes: Array.isArray((candidate.dependsOn as Record<string, unknown>).includes)
              ? ((candidate.dependsOn as Record<string, unknown>).includes as unknown[])
                  .map((item) => toText(item))
                  .filter(Boolean)
                  .slice(0, 6)
              : undefined,
            excludes: Array.isArray((candidate.dependsOn as Record<string, unknown>).excludes)
              ? ((candidate.dependsOn as Record<string, unknown>).excludes as unknown[])
                  .map((item) => toText(item))
                  .filter(Boolean)
                  .slice(0, 6)
              : undefined,
          }
        : undefined,
  };

  const parsed = followUpQuestionSchema.safeParse(normalized);
  if (!parsed.success) return null;
  if ((parsed.data.type === "select" || parsed.data.type === "chips") && !parsed.data.options?.length) {
    return { ...parsed.data, type: "text", options: undefined };
  }
  return parsed.data;
}

function normalizeResponse(raw: unknown): EnrichResponse {
  const parsed = enrichResponseSchema.safeParse(raw);
  if (parsed.success) return parsed.data;

  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const questions = Array.isArray(obj.questions)
    ? obj.questions
        .map((q, index) => sanitizeQuestion(q, index))
        .filter((q): q is z.infer<typeof followUpQuestionSchema> => Boolean(q))
        .slice(0, MAX_FOLLOWUP_QUESTIONS)
    : [];
  const suggestions = Array.isArray(obj.suggestions)
    ? obj.suggestions
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const candidate = item as Record<string, unknown>;
          const parsedSuggestion = suggestionSchema.safeParse({
            type: toText(candidate.type).toLowerCase() || "feature",
            text: toText(candidate.text),
          });
          return parsedSuggestion.success ? parsedSuggestion.data : null;
        })
        .filter((entry): entry is z.infer<typeof suggestionSchema> => Boolean(entry))
        .slice(0, MAX_SUGGESTIONS)
    : [];
  const insightSummary = toText(obj.insightSummary) || null;
  const metaParsed = enrichMetaSchema.safeParse(obj.meta);

  return {
    questions,
    suggestions,
    insightSummary,
    meta: metaParsed.success ? metaParsed.data : undefined,
  };
}

function contextHash(payload: unknown): string {
  return createHash("sha1").update(JSON.stringify(payload)).digest("hex").slice(0, 12);
}

// ── Main handler ────────────────────────────────────────────────────

export async function POST(req: Request) {
  return withRateLimit(req, "ai:chat", async () => {
    try {
      const botError = requireNotBot(req);
      if (botError) return botError;

      const body = await req.json().catch(() => null);
      const parsed = enrichRequestSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Validation failed", details: parsed.error.issues },
          { status: 400 },
        );
      }

      const { mode, step, data, scrapeUrl } = parsed.data;

      debugLog("WIZARD", "Enrich request", { mode, step, industry: data.industry, scrapeUrl });

      // Check credits (wizard enrich costs 11 credits)
      const creditCheck = await prepareCredits(req, "wizard.enrich");
      if (!creditCheck.ok) {
        return creditCheck.response;
      }

      if (!FEATURES.useResponsesApi) {
        const hasGatewayApiKey = Boolean(process.env.AI_GATEWAY_API_KEY?.trim());
        const hasOidcToken = Boolean(process.env.VERCEL_OIDC_TOKEN?.trim());
        const onVercel = process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);

        if (!hasGatewayApiKey && !hasOidcToken && !onVercel) {
          return NextResponse.json(
            { error: "AI Gateway auth missing" },
            { status: 503 },
          );
        }
      }

      // ── Optional scraping ───────────────────────────────────────
      let scrapedData: {
        title?: string;
        description?: string;
        headings?: string[];
        wordCount?: number;
        hasImages?: boolean;
        textSummary?: string;
      } | null = null;

      if (scrapeUrl) {
        try {
          debugLog("WIZARD", "Scraping website", { url: scrapeUrl });
          const scraped = await scrapeWebsite(scrapeUrl);
          scrapedData = {
            title: scraped.title || undefined,
            description: scraped.description || undefined,
            headings: scraped.headings?.slice(0, 10),
            wordCount: scraped.wordCount,
            hasImages: (scraped.images ?? 0) > 0,
            textSummary: scraped.text?.slice(0, 500),
          };
          debugLog("WIZARD", "Scrape successful", {
            title: scrapedData.title,
            wordCount: scrapedData.wordCount,
          });
        } catch (err) {
          debugLog("WIZARD", "Scrape failed (non-fatal)", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // ── Build compact prompt ────────────────────────────────────
      const industryLabel = INDUSTRY_CONTEXT[data.industry] || data.industry || "företag";
      const followUpContext = Object.entries(data.previousFollowUps)
        .filter(([, value]) => value.trim().length > 0)
        .slice(0, 8)
        .map(([key, value]) => `${key}: ${value.trim()}`);

      const companyLookupContext = data.companyLookup?.found
        ? [
            data.companyLookup.employees ? `~${data.companyLookup.employees} anställda` : null,
            data.companyLookup.revenueKsek ? `omsättning ${Math.round(data.companyLookup.revenueKsek / 1000)} MSEK` : null,
            data.companyLookup.industries?.length ? `NACE: ${data.companyLookup.industries.join(", ")}` : null,
            data.companyLookup.purpose ? `Verksamhet: ${data.companyLookup.purpose.slice(0, 120)}` : null,
          ].filter(Boolean).join(", ")
        : null;

      const competitorsContext = data.competitors?.length
        ? `Konkurrenter: ${data.competitors.slice(0, 4).map((c) => c.name).join(", ")}`
        : null;

      const contextLines = [
        `Bransch: ${industryLabel}`,
        data.companyName ? `Företag: ${data.companyName}` : null,
        data.location ? `Plats: ${data.location}` : null,
        companyLookupContext ? `Bolagsdata: ${companyLookupContext}` : null,
        competitorsContext,
        data.inspirationSites.length ? `Inspiration: ${data.inspirationSites.join(", ")}` : null,
        data.purposes.length ? `Mål: ${data.purposes.join(", ")}` : null,
        data.targetAudience ? `Målgrupp: ${data.targetAudience}` : null,
        data.usp ? `USP: ${data.usp}` : null,
        scrapedData?.title ? `Befintlig sajt: "${scrapedData.title}" (${scrapedData.wordCount || 0} ord)` : null,
        followUpContext.length ? `Tidigare följdsvar: ${followUpContext.join(" | ")}` : null,
      ].filter(Boolean).join(". ");

      const stepFocus: Record<number, string> = {
        1: "företagets storlek, unikhet och verksamhet",
        2: "målgrupp, konkurrenter, USP och kundproblem de löser",
        3: "konkurrentlandskapet, vad som saknas jämfört med toppkonkurrenter, SEO-möjligheter",
        4: "varumärkespersonlighet, visuella element, foto vs illustration",
        5: "tidsplan, integrationer (bokning, betalning, e-post), budget",
      };

      const suggestionRule = step === 2 && !data.targetAudience
        ? `- 1-2 förslag. Inkludera ALLTID en suggestion med type:"audience" som beskriver den mest sannolika målgruppen baserat på bransch, företagsnamn, plats och eventuell bolagsdata. Övriga förslag: type: usp/feature/trend`
        : `- 1-2 förslag (type: feature/usp/trend)`;

      const prompt =
        mode === "final_check"
          ? `Du hjälper en svensk företagare bygga hemsida. Svara BARA med JSON.

Kontext: ${contextLines}
Läge: Slutkontroll före slutprompt. Fokusera på oklarheter och risker.

Ge exakt detta JSON-format (inget annat):
{"questions":[{"id":"clarify1","text":"Fråga på svenska","type":"text","priority":"high"}],"suggestions":[],"insightSummary":"Kort summering","meta":{"confidence":0.0,"needsClarification":true,"unknowns":["oklarhet"],"priority":"high"}}

Regler:
- 0-3 frågor, bara om något är oklart
- Frågor ska vara korta, konkreta och direkt avgörande
- Om underlaget är tydligt: returnera questions:[] och needsClarification:false
- Bara JSON, inget annat`
          : `Du hjälper en svensk företagare bygga hemsida. Svara BARA med JSON.

Kontext: ${contextLines}
Steg ${step}/5 - fokus: ${stepFocus[step] || ""}

Ge exakt detta JSON-format (inget annat):
{"questions":[{"id":"q1","text":"Fråga på svenska","type":"text","priority":"medium"},{"id":"q2","text":"Fråga 2","type":"select","options":["Alt 1","Alt 2","Alt 3"]}],"suggestions":[{"type":"audience","text":"Beskriv målgrupp"},{"type":"feature","text":"Förslag på svenska"}],"insightSummary":"Kort sammanfattning","meta":{"confidence":0.0,"needsClarification":false,"unknowns":[],"priority":"medium"}}

Regler:
- 2 frågor max, korta och specifika för ${industryLabel}
${suggestionRule}
- Använd previousFollowUps för att undvika upprepade frågor
- Allt på svenska
- Bara JSON, inget annat`;

      let normalized: EnrichResponse;

      if (FEATURES.useResponsesApi) {
        // ── Responses API path (structured output) ──────────────
        const openai = new OpenAI({ apiKey: SECRETS.openaiApiKey });
        const RESPONSES_MODEL = "gpt-5-mini";

        const response = await openai.responses.create({
          model: RESPONSES_MODEL,
          instructions: prompt,
          input: "Generera svaret baserat på instruktionerna.",
          text: {
            format: {
              type: "json_schema",
              name: "wizard_enrich",
              schema: ENRICH_JSON_SCHEMA,
              strict: true,
            },
          },
          store: false,
        });

        const rawParsed = JSON.parse(response.output_text);
        normalized = normalizeResponse(rawParsed);
        debugLog("WIZARD", "Responses API enrich completed", { model: RESPONSES_MODEL });
      } else {
        // ── Gateway fallback path ───────────────────────────────
        const result = await generateText({
          model: gateway(ENRICH_MODEL),
          prompt,
          maxRetries: 1,
          providerOptions: {
            gateway: {
              models: ["openai/gpt-5.2", "anthropic/claude-sonnet-4.5"],
            },
          },
          maxOutputTokens: mode === "final_check" ? 520 : 420,
        });

        let parsedResponse: unknown = {};

        try {
          const text = result.text?.trim() || "";
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsedResponse = JSON.parse(jsonMatch[0]);
          }
        } catch {
          debugLog("WIZARD", "Failed to parse enrich JSON, using empty response");
        }

        normalized = normalizeResponse(parsedResponse);
      }
      const responsePayload = {
        questions: normalized.questions || [],
        suggestions: normalized.suggestions || [],
        insightSummary: normalized.insightSummary || null,
        meta: normalized.meta || {
          confidence: normalized.questions?.length ? 0.55 : 0.8,
          needsClarification: mode === "final_check" ? normalized.questions.length > 0 : false,
          unknowns: [],
          priority: normalized.questions.some((q) => q.priority === "high") ? "high" : "medium",
        },
        scrapedData,
        contextHash: contextHash({
          mode,
          step,
          industry: data.industry,
          purposes: data.purposes,
          previousFollowUps: Object.keys(data.previousFollowUps).length,
          scrapeUrl: scrapeUrl || null,
        }),
      };

      debugLog("WIZARD", "Enrich response generated", {
        mode,
        questionCount: responsePayload.questions.length,
        suggestionCount: responsePayload.suggestions.length,
        needsClarification: responsePayload.meta?.needsClarification || false,
      });

      // Charge credits after successful generation
      try {
        await creditCheck.commit();
      } catch (error) {
        console.error("[credits] Failed to charge wizard enrich:", error);
      }

      return NextResponse.json(responsePayload);
    } catch (err) {
      errorLog("WIZARD", "Enrich error", err);
      return NextResponse.json(
        {
          error: err instanceof Error ? err.message : "Unknown error",
          questions: [],
          suggestions: [],
          meta: {
            confidence: 0.4,
            needsClarification: false,
            unknowns: [],
            priority: "medium",
          },
        },
        { status: 500 },
      );
    }
  });
}
