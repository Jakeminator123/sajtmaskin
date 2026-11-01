/**
 * API Route: Analyze website
 * POST /api/analyze-website
 *
 * Scrapes the website first, then feeds the actual content to the AI model
 * for a grounded analysis. Falls back to URL-only analysis if scraping fails.
 */

import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { getCurrentUser } from "@/lib/auth/auth";
import { createDirectModel, getTemperatureConfig } from "@/lib/builder/direct-model";
import { workloadOpenAIProviderOptions } from "@/lib/ai-models/workload-reasoning";
import { quickScrapeWebsite } from "@/lib/webscraper";
import { withRateLimit } from "@/lib/rate-limit";
import { getWorkloadDefaultModelFromManifest } from "@/lib/ai-models/load-manifest";
import { urlForLog } from "@/lib/utils/url-for-log";

export const maxDuration = 60;

const ANALYSIS_PROMPT = `Du är en expert på webbdesign, UX och digital marknadsföring.
Analysera webbplatsens FAKTISKA innehåll nedan och ge en kvalificerad bedömning.

GE EN ANALYS PÅ SVENSKA (max 250 ord) med:

**Om företaget:**
- Vad de gör och vilken bransch (baserat på det du ser i innehållet)
- Deras huvudsakliga tjänster/produkter
- Geografiskt område (om det framgår)

**Designanalys:**
- Generellt intryck baserat på innehåll och struktur
- Vad som fungerar bra
- 2-3 konkreta förbättringsförslag

**Marknadstips:**
- Hur de kan sticka ut mot konkurrenter
- Förslag på funktioner som kan öka konvertering

Var konstruktiv, positiv och ge KONKRETA, HANDLINGSBARA råd!
Basera analysen ENBART på det faktiska innehållet du får -- gissa inte.`;

const FALLBACK_ANALYSIS_PROMPT = `Du är en expert på webbdesign, UX och digital marknadsföring.
Webbplatsen kunde inte skrapas (troligtvis pga JavaScript-rendering, bot-skydd eller timeout).
Ge en KORT analys (max 100 ord) på svenska baserat på domännamnet.

VIKTIGT: Var ärlig om att du inte kunde läsa sidan och att analysen är begränsad.
Ge generella tips som passar de flesta företagswebbplatser.`;

interface AnalysisResponse {
  success: boolean;
  analysis: string;
  model: string;
  scraped: boolean;
}

type ScrapedContent = {
  title?: string;
  description?: string;
  headings?: string[];
  wordCount?: number;
  textSummary?: string;
};

const MAX_SCRAPED_SUMMARY_CHARS = 12_000;

function normalizeScrapedContent(value: unknown): ScrapedContent | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  const textSummary =
    typeof input.textSummary === "string"
      ? input.textSummary
          .trim()
          .split(/\s+/)
          .slice(0, 200)
          .join(" ")
          .slice(0, MAX_SCRAPED_SUMMARY_CHARS)
      : "";
  if (!textSummary) return undefined;

  const title = typeof input.title === "string" ? input.title.trim().slice(0, 300) : "";
  const description =
    typeof input.description === "string" ? input.description.trim().slice(0, 1_000) : "";
  const headings = Array.isArray(input.headings)
    ? input.headings
        .filter((heading): heading is string => typeof heading === "string")
        .map((heading) => heading.trim().slice(0, 300))
        .filter(Boolean)
        .slice(0, 20)
    : [];
  const wordCount =
    typeof input.wordCount === "number" && Number.isFinite(input.wordCount) && input.wordCount >= 0
      ? Math.trunc(input.wordCount)
      : undefined;

  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(headings.length > 0 ? { headings } : {}),
    ...(wordCount !== undefined ? { wordCount } : {}),
    textSummary,
  };
}

function hasOpenAIApiKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  return withRateLimit(
    req,
    "analyze:website",
    async () => {
    console.info("[API/analyze-website] Request received");

    try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
    }
    const payload = body as Record<string, unknown>;
    const url = typeof payload.url === "string" ? payload.url.trim() : "";
    const deepAnalysis = typeof payload.deepAnalysis === "boolean" ? payload.deepAnalysis : true;
    const scrapedContent = normalizeScrapedContent(payload.scrapedContent);

    if (!url || url.length > 2_048) {
      return NextResponse.json({ success: false, error: "URL is required" }, { status: 400 });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json({ success: false, error: "Invalid URL format" }, { status: 400 });
    }
    if (
      !["http:", "https:"].includes(parsedUrl.protocol) ||
      parsedUrl.username ||
      parsedUrl.password
    ) {
      return NextResponse.json({ success: false, error: "Invalid URL format" }, { status: 400 });
    }

    if (!hasOpenAIApiKey()) {
      console.error("[API/analyze-website] OPENAI_API_KEY not configured");
      return NextResponse.json(
        { success: false, error: "OPENAI_API_KEY saknas" },
        { status: 500 },
      );
    }

    console.info("[API/analyze-website] Analyzing URL:", urlForLog(parsedUrl));

    let scraped = false;
    let contentForAnalysis = scrapedContent;

    if (!contentForAnalysis?.textSummary) {
      try {
        const data = await quickScrapeWebsite(url);
        contentForAnalysis = {
          title: data.title,
          description: data.description,
          headings: data.headings,
          wordCount: data.wordCount,
          textSummary: data.textSummary,
        };
        scraped = true;
        console.info("[API/analyze-website] Scraped successfully:", {
          title: data.title,
          wordCount: data.wordCount,
        });
      } catch (err) {
        console.warn("[API/analyze-website] Scrape failed, using fallback:", err instanceof Error ? err.message : err);
      }
    } else {
      scraped = true;
    }

    const hasContent = contentForAnalysis?.textSummary && contentForAnalysis.textSummary.length > 20;

    const selectedModel =
      getWorkloadDefaultModelFromManifest("analyze_website") ?? "openai/gpt-6.1-sol";

    let userPrompt: string;
    let systemPrompt: string;

    if (hasContent) {
      systemPrompt = ANALYSIS_PROMPT;
      const contentLines = [
        `URL: ${url}`,
        `Domän: ${parsedUrl.hostname}`,
        contentForAnalysis!.title ? `Titel: ${contentForAnalysis!.title}` : null,
        contentForAnalysis!.description ? `Beskrivning: ${contentForAnalysis!.description}` : null,
        contentForAnalysis!.headings?.length ? `Rubriker: ${contentForAnalysis!.headings.join(", ")}` : null,
        contentForAnalysis!.wordCount ? `Ordantal: ${contentForAnalysis!.wordCount}` : null,
        contentForAnalysis!.textSummary ? `\nInnehåll från sidan:\n${contentForAnalysis!.textSummary}` : null,
      ].filter(Boolean).join("\n");
      userPrompt = `Analysera denna webbplats baserat på det skrapade innehållet:\n\n${contentLines}`;
    } else {
      systemPrompt = FALLBACK_ANALYSIS_PROMPT;
      userPrompt = `Webbplatsen ${url} (domän: ${parsedUrl.hostname}) kunde inte skrapas. Ge en begränsad analys baserat på domännamnet.`;
    }

    if (deepAnalysis) {
      userPrompt += "\n\nVar extra konkret och ge tydliga förbättringsförslag.";
    }

    const result = await generateText({
      model: createDirectModel(selectedModel),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      maxOutputTokens: 8_192,
      ...getTemperatureConfig(selectedModel, 0.5),
      ...workloadOpenAIProviderOptions("analyze_website", selectedModel),
    });

    const analysis = result.text?.trim();
    if (!analysis) {
      console.error("[API/analyze-website] No content in response");
      return NextResponse.json({ success: false, error: "No analysis generated" }, { status: 500 });
    }

    const response: AnalysisResponse = {
      success: true,
      analysis,
      model: selectedModel,
      scraped,
    };

    return NextResponse.json(response);
    } catch (error) {
      console.error("[API/analyze-website] Error:", error);

      return NextResponse.json(
        {
          success: false,
          error: "Failed to analyze website. Please try again.",
        },
        { status: 500 },
      );
    }
  },
    { userId: user.id },
  );
}
