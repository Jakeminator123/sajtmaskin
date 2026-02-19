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
import { generateText, gateway } from "ai";
import { z } from "zod";
import { requireNotBot } from "@/lib/botProtection";
import { withRateLimit } from "@/lib/rateLimit";
import { scrapeWebsite } from "@/lib/webscraper";
import { debugLog, errorLog } from "@/lib/utils/debug";
import { prepareCredits } from "@/lib/credits/server";

export const runtime = "nodejs";
export const maxDuration = 30;

// ── Request schema ──────────────────────────────────────────────────

const MAX_SHORT_TEXT = 300;
const MAX_MEDIUM_TEXT = 3000;
const MAX_LONG_TEXT = 12000;
const MAX_URL_LENGTH = 2048;

const enrichRequestSchema = z.object({
  step: z.number().int().min(1).max(5),
  data: z.object({
    companyName: z.string().max(MAX_SHORT_TEXT).optional().default(""),
    industry: z.string().max(MAX_SHORT_TEXT).optional().default(""),
    location: z.string().max(MAX_SHORT_TEXT).optional().default(""),
    existingWebsite: z.string().max(MAX_URL_LENGTH).optional().default(""),
    purposes: z.array(z.string().max(MAX_SHORT_TEXT)).max(20).optional().default([]),
    targetAudience: z.string().max(MAX_MEDIUM_TEXT).optional().default(""),
    usp: z.string().max(MAX_MEDIUM_TEXT).optional().default(""),
    selectedVibe: z.string().max(MAX_SHORT_TEXT).optional().default(""),
    specialWishes: z.string().max(MAX_LONG_TEXT).optional().default(""),
    previousFollowUps: z
      .record(z.string().max(MAX_SHORT_TEXT), z.string().max(MAX_MEDIUM_TEXT))
      .optional()
      .default({}),
  }),
  scrapeUrl: z.string().max(MAX_URL_LENGTH).optional(),
});

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

      const { step, data, scrapeUrl } = parsed.data;

      debugLog("WIZARD", "Enrich request", { step, industry: data.industry, scrapeUrl });

      // Check credits (wizard enrich costs 11 credits)
      const creditCheck = await prepareCredits(req, "wizard.enrich");
      if (!creditCheck.ok) {
        return creditCheck.response;
      }

      // Check gateway auth
      const hasGatewayApiKey = Boolean(process.env.AI_GATEWAY_API_KEY?.trim());
      const hasOidcToken = Boolean(process.env.VERCEL_OIDC_TOKEN?.trim());
      const onVercel = process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);

      if (!hasGatewayApiKey && !hasOidcToken && !onVercel) {
        return NextResponse.json(
          { error: "AI Gateway auth missing" },
          { status: 503 },
        );
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

      const contextLines = [
        `Bransch: ${industryLabel}`,
        data.companyName ? `Företag: ${data.companyName}` : null,
        data.location ? `Plats: ${data.location}` : null,
        data.purposes.length ? `Mål: ${data.purposes.join(", ")}` : null,
        data.targetAudience ? `Målgrupp: ${data.targetAudience}` : null,
        data.usp ? `USP: ${data.usp}` : null,
        scrapedData?.title ? `Befintlig sajt: "${scrapedData.title}" (${scrapedData.wordCount || 0} ord)` : null,
      ].filter(Boolean).join(". ");

      const stepFocus: Record<number, string> = {
        1: "företagets storlek, unikhet och verksamhet",
        2: "konkurrenter, USP och kundproblem de löser",
        3: "vad de gillar/ogillar med konkurrenters sajter, funktioner de saknar",
        4: "varumärkespersonlighet, visuella element, foto vs illustration",
        5: "tidsplan, integrationer (bokning, betalning, e-post), budget",
      };

      // Single compact prompt -- no system message for speed
      const prompt = `Du hjälper en svensk företagare bygga hemsida. Svara BARA med JSON.

Kontext: ${contextLines}
Steg ${step}/5 - fokus: ${stepFocus[step] || ""}

Ge exakt detta JSON-format (inget annat):
{"questions":[{"id":"q1","text":"Fråga på svenska","type":"text"},{"id":"q2","text":"Fråga 2","type":"select","options":["Alt 1","Alt 2","Alt 3"]}],"suggestions":[{"type":"feature","text":"Förslag på svenska"}]}

Regler:
- 2 frågor max, korta och specifika för ${industryLabel}
- 1-2 förslag (type: feature/usp/trend)
- Allt på svenska
- Bara JSON, inget annat`;

      const result = await generateText({
        model: gateway(ENRICH_MODEL),
        prompt,
        maxRetries: 1,
        providerOptions: {
          gateway: {
            models: ["openai/gpt-5.2", "anthropic/claude-sonnet-4.5"],
          } as any,
        },
        maxOutputTokens: 400,
      });

      // Parse JSON from response
      let parsed_response: {
        questions?: Array<{
          id: string;
          text: string;
          type: string;
          options?: string[];
          placeholder?: string;
        }>;
        suggestions?: Array<{ type: string; text: string }>;
        insightSummary?: string;
      } = { questions: [], suggestions: [] };

      try {
        const text = result.text?.trim() || "";
        // Extract JSON from response (handle markdown code fences)
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed_response = JSON.parse(jsonMatch[0]);
        }
      } catch {
        debugLog("WIZARD", "Failed to parse enrich JSON, using empty response");
      }

      debugLog("WIZARD", "Enrich response generated", {
        questionCount: parsed_response.questions?.length || 0,
        suggestionCount: parsed_response.suggestions?.length || 0,
      });

      // Charge credits after successful generation
      try {
        await creditCheck.commit();
      } catch (error) {
        console.error("[credits] Failed to charge wizard enrich:", error);
      }

      return NextResponse.json({
        questions: parsed_response.questions || [],
        suggestions: parsed_response.suggestions || [],
        insightSummary: parsed_response.insightSummary || null,
        scrapedData,
      });
    } catch (err) {
      errorLog("WIZARD", "Enrich error", err);
      return NextResponse.json(
        {
          error: err instanceof Error ? err.message : "Unknown error",
          questions: [],
          suggestions: [],
        },
        { status: 500 },
      );
    }
  });
}
