/**
 * API Route: Analyze website with AI Gateway
 * POST /api/analyze-website
 *
 * Takes a URL and uses AI to provide a high-level analysis.
 * Web search is not used; analysis is based on the URL and inferred context.
 */

import { NextRequest, NextResponse } from "next/server";
import { generateText, gateway } from "ai";

// Allow 90 seconds for web search + analysis
export const maxDuration = 90;

const ANALYSIS_PROMPT = `Du är en expert på webbdesign, UX och digital marknadsföring.
Analysera en webbplats utifrån URL:en och ge en kvalificerad bedömning.

GE EN ANALYS PÅ SVENSKA (max 200 ord) med:

**Om företaget:**
- Vad de gör och vilken bransch
- Deras huvudsakliga tjänster/produkter
- Geografiskt område (om relevant)

**Designanalys:**
- Generellt intryck av sajten
- Vad som fungerar bra
- 2-3 konkreta förbättringsförslag

**Marknadstips:**
- Hur de kan sticka ut mot konkurrenter
- Förslag på funktioner som kan öka konvertering

Var konstruktiv, positiv och ge KONKRETA, HANDLINGSBARA råd!`;

interface AnalysisResponse {
  success: boolean;
  analysis: string;
  sources?: Array<{ url: string; title: string }>;
  model: string;
  usedWebSearch: boolean;
}

export async function POST(req: NextRequest) {
  console.log("[API/analyze-website] Request received");

  try {
    const { url, deepAnalysis = true } = (await req.json()) as {
      url: string;
      deepAnalysis?: boolean;
    };

    if (!url) {
      return NextResponse.json({ success: false, error: "URL is required" }, { status: 400 });
    }

    // Validate URL
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

    console.log("[API/analyze-website] Analyzing URL:", url);

    const userPrompt = `Analysera denna webbplats grundligt: ${url}

Domän: ${parsedUrl.hostname}
Sökord att undersöka: "${parsedUrl.hostname.replace("www.", "").split(".")[0]}" företag`;

    // GPT-5-mini: fast and cheap, good quality for website analysis summaries
    const selectedModel = "openai/gpt-5-mini";
    const promptSuffix = deepAnalysis
      ? "\n\nVar extra konkret och ge tydliga förbättringsförslag."
      : "";

    const result = await generateText({
      model: gateway(selectedModel),
      messages: [
        { role: "system", content: ANALYSIS_PROMPT },
        { role: "user", content: `${userPrompt}${promptSuffix}` },
      ],
      temperature: 0.7,
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
      usedWebSearch: false,
      sources: [],
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
