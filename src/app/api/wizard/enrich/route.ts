/**
 * API Route: Wizard Enrich
 * POST /api/wizard/enrich
 *
 * Takes wizard step data and returns AI-driven follow-up questions,
 * suggestions, and optionally scraped website data.
 *
 * Used by the prompt wizard modal to create adaptive, business-specific
 * questions based on what the user has already answered.
 */

import { NextResponse } from "next/server";
import { generateObject, gateway } from "ai";
import { z } from "zod";
import { requireNotBot } from "@/lib/botProtection";
import { withRateLimit } from "@/lib/rateLimit";
import { scrapeWebsite } from "@/lib/webscraper";
import { debugLog, errorLog } from "@/lib/utils/debug";

export const runtime = "nodejs";
export const maxDuration = 30;

// ── Request schema ──────────────────────────────────────────────────

const enrichRequestSchema = z.object({
  step: z.number().int().min(1).max(5),
  data: z.object({
    companyName: z.string().optional().default(""),
    industry: z.string().optional().default(""),
    location: z.string().optional().default(""),
    existingWebsite: z.string().optional().default(""),
    purposes: z.array(z.string()).optional().default([]),
    targetAudience: z.string().optional().default(""),
    usp: z.string().optional().default(""),
    selectedVibe: z.string().optional().default(""),
    specialWishes: z.string().optional().default(""),
    previousFollowUps: z.record(z.string(), z.string()).optional().default({}),
  }),
  scrapeUrl: z.string().optional(),
});

// ── Response schema for AI-generated follow-ups ─────────────────────

const followUpSchema = z.object({
  questions: z
    .array(
      z.object({
        id: z.string().describe("Unique ID for this question (e.g. 'q_employees')"),
        text: z.string().describe("The question to ask the user, in Swedish"),
        type: z
          .enum(["text", "select", "chips"])
          .describe("Input type: text for free input, select for single choice, chips for multi"),
        options: z
          .array(z.string())
          .optional()
          .describe("Options for select/chips types"),
        placeholder: z.string().optional().describe("Placeholder text for text inputs"),
      }),
    )
    .min(1)
    .max(3)
    .describe("1-3 follow-up questions tailored to the user's business"),
  suggestions: z
    .array(
      z.object({
        type: z
          .enum(["audience", "feature", "usp", "palette", "trend"])
          .describe("What this suggestion is for"),
        text: z.string().describe("The suggestion text, in Swedish"),
      }),
    )
    .max(5)
    .describe("Contextual suggestions based on input"),
  insightSummary: z
    .string()
    .optional()
    .describe("A brief insight about the business based on available data, in Swedish"),
});

// ── Industry context for better follow-up generation ────────────────

const INDUSTRY_CONTEXT: Record<string, string> = {
  cafe: "Swedish café/bakery. Think fika culture, cozy atmosphere, seasonal menus.",
  restaurant: "Restaurant or bar. Dining experiences, reservations, seasonal menus, events.",
  retail: "Retail/physical store. Product display, opening hours, loyalty programs.",
  tech: "Tech/IT company. SaaS, digital services, case studies, integrations.",
  consulting: "Consulting/services firm. Expertise, team, client testimonials, processes.",
  health: "Healthcare/wellness. Treatments, booking, trust signals, certifications.",
  creative: "Creative agency. Portfolio-driven, visual impact, process showcase.",
  education: "Education. Courses, schedules, enrollment, instructor profiles.",
  ecommerce: "E-commerce. Product catalog, checkout flow, reviews, shipping.",
  realestate: "Real estate. Property listings, search/filter, valuations, agent profiles.",
  other: "General business website.",
};

// ── Gateway config ──────────────────────────────────────────────────

const ENRICH_MODEL = "openai/gpt-5.2";

function defaultFallbackModels(): string[] {
  return [
    "openai/gpt-5.2-pro",
    "anthropic/claude-sonnet-4.5",
  ];
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

      const { step, data, scrapeUrl } = parsed.data;

      debugLog("WIZARD", "Enrich request", { step, industry: data.industry, scrapeUrl });

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

      // ── Build system prompt ─────────────────────────────────────
      const industryContext = INDUSTRY_CONTEXT[data.industry] || INDUSTRY_CONTEXT.other;

      const contextParts = [
        `Industry: ${data.industry || "unknown"} - ${industryContext}`,
        data.companyName ? `Company: ${data.companyName}` : null,
        data.location ? `Location: ${data.location}` : null,
        data.purposes.length ? `Goals: ${data.purposes.join(", ")}` : null,
        data.targetAudience ? `Target audience: ${data.targetAudience}` : null,
        data.usp ? `USP: ${data.usp}` : null,
        scrapedData
          ? `Existing website data: Title="${scrapedData.title}", ${scrapedData.wordCount} words, headings: ${scrapedData.headings?.join(", ")}`
          : null,
        Object.keys(data.previousFollowUps).length
          ? `Previous answers: ${JSON.stringify(data.previousFollowUps)}`
          : null,
      ].filter(Boolean);

      const stepInstructions: Record<number, string> = {
        1: "The user just entered their company info (name, industry, location). Generate follow-up questions that dig deeper into their specific business: number of employees, physical vs online, what makes them unique, years in business, etc. Tailor to their industry.",
        2: "The user has defined their goals and audience. Generate follow-ups about their competitive landscape, key differentiators (USP), brand values, and what specific problems they solve for their customers.",
        3: "The user is looking at inspiration and their existing site. Generate follow-ups about what specifically they like/dislike about competitors, what features they've seen that they want, and any content gaps on their current site.",
        4: "The user is choosing design preferences. Generate follow-ups about brand personality traits, any existing brand guidelines or assets, and specific visual elements they want (animations, illustrations, photography style).",
        5: "Final step. Generate follow-ups about launch timeline, any specific integrations needed (booking, payment, email), and budget expectations.",
      };

      const systemPrompt = [
        "You are a smart business consultant helping a Swedish business owner plan their new website.",
        "Generate thoughtful, specific follow-up questions based on what they've told you so far.",
        "All questions and suggestions MUST be in Swedish.",
        "Make questions feel conversational and genuinely interested in their business.",
        "Avoid generic questions -- be specific to their industry and situation.",
        "",
        `Current wizard step: ${step}/5`,
        stepInstructions[step] || "",
        "",
        "Business context:",
        ...contextParts,
      ].join("\n");

      // ── Generate follow-ups via AI Gateway ──────────────────────
      const result = await generateObject({
        model: gateway(ENRICH_MODEL),
        schema: followUpSchema,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Generate follow-up questions for step ${step}. Context: ${contextParts.join(". ")}`,
          },
        ],
        maxRetries: 1,
        providerOptions: {
          gateway: {
            models: defaultFallbackModels(),
          } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        },
        maxOutputTokens: 1200,
      });

      debugLog("WIZARD", "Enrich response generated", {
        questionCount: result.object.questions.length,
        suggestionCount: result.object.suggestions.length,
      });

      return NextResponse.json({
        ...result.object,
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
