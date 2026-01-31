/**
 * API Route: Analyze website with AI + Web Search
 * POST /api/analyze-website
 *
 * Takes a URL and uses AI with Web Search to ACTUALLY analyze the website's
 * content, design, and structure by crawling/searching the site.
 *
 * Uses Responses API with web_search tool for real website analysis.
 * Web search works with gpt-4o and gpt-4o-mini.
 *
 * API Format (Responses API):
 * - instructions: System prompt
 * - input: User message (string)
 * - tools: [{ type: "web_search" }]
 */

import { NextRequest, NextResponse } from "next/server";
import { OPENAI_MODELS } from "@/lib/ai/openai-models";

// Allow 90 seconds for web search + analysis
export const maxDuration = 90;

// OpenAI Responses API with Web Search
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
// Model that supports the web_search tool (Responses API)
const WEB_SEARCH_MODEL = OPENAI_MODELS.webSearch;
const FALLBACK_MODEL = OPENAI_MODELS.webSearch;

// System prompt for website analysis with web search
const ANALYSIS_PROMPT_WITH_SEARCH = `Du är en expert på webbdesign, UX och digital marknadsföring. 
Din uppgift är att analysera en webbplats genom att SÖKA och UNDERSÖKA den på webben.

INSTRUKTIONER:
1. Använd web search för att besöka och analysera webbplatsen
2. Hitta information om företaget, deras tjänster/produkter
3. Leta efter recensioner, omdömen eller social media-närvaro
4. Analysera konkurrenter om möjligt

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

Var konstruktiv, positiv och ge KONKRETA, HANDLINGSBARA råd!
Inkludera källor där relevant.`;

// Simpler prompt without web search
const ANALYSIS_PROMPT_SIMPLE = `Du är en expert på webbdesign och UX. 

Baserat på URL:en, gör en kvalificerad bedömning och ge konstruktiva råd.
Om du kan gissa företagstyp från URL:en (t.ex. "cafesvensson.se" = café), anpassa råden.

Ge en kort analys på SVENSKA (max 150 ord) med:
1. Vad sajten troligen handlar om
2. 2-3 vanliga styrkor för denna typ av sajt
3. 2-3 konkreta förbättringsförslag

Var konstruktiv, positiv och inspirerande!`;

interface WebSearchAnnotation {
  type: string;
  url?: string;
  title?: string;
}

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

    // Get OpenAI API key
    const openaiApiKey = process.env.OPENAI_API_KEY;

    if (!openaiApiKey) {
      console.error("[API/analyze-website] OpenAI API key not configured");
      return NextResponse.json(
        { success: false, error: "OpenAI API is not configured" },
        { status: 500 },
      );
    }

    console.log("[API/analyze-website] Analyzing URL:", url);

    const userPrompt = `Analysera denna webbplats grundligt: ${url}
    
Domän: ${parsedUrl.hostname}
Sökord att undersöka: "${parsedUrl.hostname.replace("www.", "").split(".")[0]}" företag`;

    let analysis: string | undefined;
    const sources: Array<{ url: string; title: string }> = [];
    let usedModel = WEB_SEARCH_MODEL;
    let usedWebSearch = false;

    // Try with Web Search first (if deepAnalysis is enabled)
    if (deepAnalysis) {
      console.log(`[API/analyze-website] Trying ${WEB_SEARCH_MODEL} with Web Search...`);

      try {
        // Responses API format: instructions (system) + input (user string) + tools
        const webSearchResponse = await fetch(OPENAI_RESPONSES_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openaiApiKey}`,
          },
          body: JSON.stringify({
            model: WEB_SEARCH_MODEL,
            instructions: ANALYSIS_PROMPT_WITH_SEARCH, // System prompt
            input: userPrompt, // User message as string
            tools: [{ type: "web_search" }], // Enable web search
          }),
        });

        if (webSearchResponse.ok) {
          const data = await webSearchResponse.json();

          // Extract text from output_text (primary) or output array (fallback)
          analysis = data.output_text?.trim();

          // If output_text not available, parse the output array
          if (!analysis && data.output && Array.isArray(data.output)) {
            for (const item of data.output) {
              if (item.type === "message" && item.content && Array.isArray(item.content)) {
                for (const content of item.content) {
                  if (content.type === "output_text" || content.type === "text") {
                    analysis = content.text?.trim();
                    if (analysis) break;
                  }
                }
              }
              if (analysis) break;
            }
          }

          // Extract sources from annotations in output array
          if (data.output && Array.isArray(data.output)) {
            for (const item of data.output) {
              if (item.content && Array.isArray(item.content)) {
                for (const content of item.content) {
                  if (content.annotations && Array.isArray(content.annotations)) {
                    for (const annotation of content.annotations as WebSearchAnnotation[]) {
                      if (annotation.type === "url_citation" && annotation.url) {
                        sources.push({
                          url: annotation.url,
                          title: annotation.title || annotation.url,
                        });
                      }
                    }
                  }
                }
              }
            }
          }

          if (analysis) {
            usedWebSearch = true;
            console.log(
              `[API/analyze-website] Web Search success, found ${sources.length} sources, length: ${analysis.length}`,
            );
          } else {
            console.log(
              "[API/analyze-website] Web Search returned empty analysis, falling back...",
            );
          }
        } else {
          const errorData = await webSearchResponse.json().catch(() => ({}));
          console.log(
            `[API/analyze-website] Web Search failed (${webSearchResponse.status}):`,
            errorData.error?.message || "unknown error",
          );
        }
      } catch (webSearchError) {
        console.error("[API/analyze-website] Web Search error:", webSearchError);
      }
    }

    // Fallback to simple analysis without web search
    if (!analysis) {
      console.log(`[API/analyze-website] Falling back to ${FALLBACK_MODEL} without Web Search...`);
      usedModel = FALLBACK_MODEL;

      const simplePrompt = `Analysera och ge förbättringsförslag för denna webbplats: ${url}`;

      const fallbackResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiApiKey}`,
        },
        body: JSON.stringify({
          model: FALLBACK_MODEL,
          messages: [
            { role: "system", content: ANALYSIS_PROMPT_SIMPLE },
            { role: "user", content: simplePrompt },
          ],
          temperature: 0.7,
          max_tokens: 500,
        }),
      });

      if (!fallbackResponse.ok) {
        const errorData = await fallbackResponse.json().catch(() => ({}));
        console.error("[API/analyze-website] Fallback failed:", errorData);

        if (fallbackResponse.status === 429) {
          return NextResponse.json(
            { success: false, error: "Rate limit exceeded. Try again later." },
            { status: 429 },
          );
        }

        return NextResponse.json(
          { success: false, error: "Failed to analyze website" },
          { status: 500 },
        );
      }

      const fallbackData = await fallbackResponse.json();
      analysis = fallbackData.choices?.[0]?.message?.content?.trim();
    }

    if (!analysis) {
      console.error("[API/analyze-website] No content in response");
      return NextResponse.json({ success: false, error: "No analysis generated" }, { status: 500 });
    }

    console.log(
      `[API/analyze-website] Success with ${usedModel}, web search: ${usedWebSearch}, length:`,
      analysis.length,
    );

    const result: AnalysisResponse = {
      success: true,
      analysis,
      model: usedModel,
      usedWebSearch,
    };

    // Include sources if we have any
    if (sources.length > 0) {
      result.sources = sources.slice(0, 5); // Max 5 sources
    }

    return NextResponse.json(result);
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
