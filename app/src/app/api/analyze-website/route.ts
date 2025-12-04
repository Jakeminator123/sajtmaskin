/**
 * API Route: Analyze website with AI
 * POST /api/analyze-website
 *
 * Takes a URL and uses AI to analyze the website's design,
 * colors, and structure based on the URL pattern.
 *
 * Uses gpt-5-mini with Responses API (low reasoning, medium verbosity for fast, concise analysis)
 * with fallback to gpt-4o-mini via Chat Completions.
 */

import { NextRequest, NextResponse } from "next/server";

// Allow 60 seconds for analysis
export const maxDuration = 60;

// OpenAI Responses API (new API for GPT-5 models)
const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const PRIMARY_MODEL = "gpt-5-mini";
const FALLBACK_MODEL = "gpt-4o-mini";

// System prompt for website analysis
const ANALYSIS_PROMPT = `Du är en expert på webbdesign och UX. Användaren vill förbättra sin webbplats.

Baserat på URL:en, gör en kvalificerad bedömning och ge konstruktiva råd.
Om du kan gissa företagstyp från URL:en (t.ex. "cafesvensson.se" = café), anpassa råden.

Ge en kort analys på SVENSKA (max 120 ord) med:
1. Vad sajten troligen handlar om
2. 2-3 vanliga styrkor för denna typ av sajt
3. 2-3 konkreta förbättringsförslag

Var konstruktiv, positiv och inspirerande!`;

export async function POST(req: NextRequest) {
  console.log("[API/analyze-website] Request received");

  try {
    const { url } = (await req.json()) as { url: string };

    if (!url) {
      return NextResponse.json(
        { success: false, error: "URL is required" },
        { status: 400 }
      );
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid URL format" },
        { status: 400 }
      );
    }

    // Get OpenAI API key
    const openaiApiKey = process.env.OPENAI_API_KEY || process.env.OPEN_AI_API;

    if (!openaiApiKey) {
      console.error("[API/analyze-website] OpenAI API key not configured");
      return NextResponse.json(
        { success: false, error: "OpenAI API is not configured" },
        { status: 500 }
      );
    }

    console.log("[API/analyze-website] Analyzing URL:", url);

    const userPrompt = `Analysera och ge förbättringsförslag för denna webbplats: ${url}`;

    // Try primary model first, fallback if needed
    let usedModel = PRIMARY_MODEL;
    let analysis: string | undefined;

    console.log(`[API/analyze-website] Trying ${PRIMARY_MODEL} with Responses API...`);
    let response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: PRIMARY_MODEL,
        instructions: ANALYSIS_PROMPT,
        input: userPrompt,
        reasoning: { effort: "low" }, // Low reasoning for fast analysis
        text: { verbosity: "medium" }, // Medium verbosity for concise analysis
        max_output_tokens: 500,
      }),
    });

    // If primary model fails, try fallback via chat completions
    if (!response.ok) {
      console.log(`[API/analyze-website] ${PRIMARY_MODEL} failed, trying ${FALLBACK_MODEL} via Chat Completions...`);
      usedModel = FALLBACK_MODEL;
      
      // Fallback to chat completions for older models
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiApiKey}`,
        },
        body: JSON.stringify({
          model: FALLBACK_MODEL,
          messages: [
            { role: "system", content: ANALYSIS_PROMPT },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.7,
          max_tokens: 500,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("[API/analyze-website] Both models failed:", errorData);

        if (response.status === 429) {
          return NextResponse.json(
            { success: false, error: "Rate limit exceeded. Try again later." },
            { status: 429 }
          );
        }

        return NextResponse.json(
          { success: false, error: "Failed to analyze website" },
          { status: 500 }
        );
      }
    }

    const data = await response.json();
    
    // Parse response based on API type
    if (usedModel === PRIMARY_MODEL) {
      // Responses API format
      analysis = data.output_text?.trim();
    } else {
      // Chat Completions API format (fallback)
      analysis = data.choices?.[0]?.message?.content?.trim();
    }

    if (!analysis) {
      console.error("[API/analyze-website] No content in response");
      return NextResponse.json(
        { success: false, error: "No analysis generated" },
        { status: 500 }
      );
    }

    console.log(
      `[API/analyze-website] Success with ${usedModel}, length:`,
      analysis.length
    );

    return NextResponse.json({
      success: true,
      analysis,
      model: usedModel,
    });
  } catch (error) {
    console.error("[API/analyze-website] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to analyze website. Please try again.",
      },
      { status: 500 }
    );
  }
}
