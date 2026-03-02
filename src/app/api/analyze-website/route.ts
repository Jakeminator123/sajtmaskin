/**
 * API Route: Analyze website with AI Gateway
 * POST /api/analyze-website
 *
 * Scrapes the website first, then feeds the actual content to the AI model
 * for a grounded analysis. Falls back to URL-only analysis if scraping fails.
 */

import { NextRequest, NextResponse } from "next/server";
import { generateText, gateway } from "ai";
import { quickScrapeWebsite } from "@/lib/webscraper";

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

export async function POST(req: NextRequest) {
  console.info("[API/analyze-website] Request received");

  try {
    const body = (await req.json()) as {
      url: string;
      deepAnalysis?: boolean;
      scrapedContent?: {
        title?: string;
        description?: string;
        headings?: string[];
        wordCount?: number;
        textSummary?: string;
      };
    };

    const { url, deepAnalysis = true, scrapedContent } = body;

    if (!url) {
      return NextResponse.json({ success: false, error: "URL is required" }, { status: 400 });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json({ success: false, error: "Invalid URL format" }, { status: 400 });
    }

    const hasGatewayApiKey = Boolean(process.env.AI_GATEWAY_API_KEY?.trim());
    const hasOidcToken = Boolean(process.env.VERCEL_OIDC_TOKEN?.trim());
    const onVercel = process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
    if (!hasGatewayApiKey && !hasOidcToken && !onVercel) {
      console.error("[API/analyze-website] AI Gateway auth not configured");
      return NextResponse.json(
        { success: false, error: "AI Gateway is not configured" },
        { status: 500 },
      );
    }

    console.info("[API/analyze-website] Analyzing URL:", url);

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

    const selectedModel = "openai/gpt-5-mini";

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
      model: gateway(selectedModel),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.5,
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
}
