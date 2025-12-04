/**
 * API Route: Expand prompt using OpenAI
 * POST /api/expand-prompt
 *
 * Takes wizard data and generates a detailed prompt for v0 API.
 * Uses gpt-5-mini with Responses API (new GPT-5 API format) with fallback to gpt-4o-mini via Chat Completions.
 *
 * Also fetches relevant stock photos from Pexels with markers (P1, P2, etc.)
 * for easy replacement later.
 *
 * Note: v0 does the heavy lifting with v0-1.5-md/lg models.
 * We use GPT-5 with medium reasoning and high verbosity for detailed, well-structured prompts.
 */

import { NextRequest, NextResponse } from "next/server";
import { MarkedImage } from "../pexels/route";

// Allow 60 seconds for OpenAI response
export const maxDuration = 60;

// OpenAI Responses API (new API for GPT-5 models)
const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const PRIMARY_MODEL = "gpt-5-mini"; // Cost-optimized reasoning model
const FALLBACK_MODEL = "gpt-4o-mini"; // Fallback via chat completions if gpt-5-mini unavailable

// System prompt for expanding user input
const SYSTEM_PROMPT = `Du är en expert på att skriva detaljerade prompts för webbplatsgenerering med AI (v0/Vercel).

Din uppgift är att ta användarens information (inklusive eventuell affärsanalys) och omvandla det till en professionell, detaljerad prompt som genererar en fantastisk webbplats.

REGLER:
1. Skriv alltid på ENGELSKA (v0 API förstår engelska bäst)
2. Var specifik med sektioner, komponenter och layout
3. Inkludera de valda färgerna som hex-koder i Tailwind-format
4. Anpassa tonen och stilen efter företaget, branschen och målgruppen
5. Föreslå lämpliga sektioner baserat på syftet
6. Om befintlig sajt nämnts, inkludera förbättringsförslag
7. Om inspirationssajter nämnts, ta inspiration från dem
8. Om plats nämnts, inkludera lokalt anpassade element
9. Håll prompten under 2500 tecken men var detaljerad
10. Använd React/Next.js och Tailwind CSS terminologi
11. Om bildförslag ges (P1, P2...), använd dessa URL:er i relevanta sektioner
12. Märk bilderna i prompten med kommentarer som {/* Image P1 */} så de enkelt kan bytas

VIKTIGT FÖR BRANSCHSPECIFIKA SAJTER:
- Café/Restaurang: Inkludera meny, öppettider, bildgalleri, bordbokning
- Butik: Produktvisning, erbjudanden, butikslokalisering
- Konsult: Case studies, tjänster, kontaktformulär, testimonials
- Tech: Modern/minimalistisk design, features, pricing, dokumentation
- Hälsa: Lugn design, tjänster, bokning, team

OUTPUT-FORMAT:
Returnera ENDAST den expanderade prompten, ingen annan text.
Börja direkt med "Create a..." eller "Build a...".`;

// Purpose mapping to English
const PURPOSE_MAP: Record<string, string> = {
  sell: "sell products/services online",
  leads: "generate leads and contact inquiries",
  portfolio: "showcase portfolio and work",
  inform: "inform and educate visitors",
  brand: "build brand awareness",
  booking: "accept bookings and reservations",
};

// Industry mapping to English
const INDUSTRY_MAP: Record<string, string> = {
  cafe: "café/coffee shop",
  restaurant: "restaurant/bar",
  retail: "retail store",
  tech: "technology company",
  consulting: "consulting firm",
  health: "health/wellness business",
  creative: "creative agency",
  education: "education/courses",
  ecommerce: "e-commerce",
  nonprofit: "nonprofit organization",
  realestate: "real estate agency",
  other: "business",
};

// Category type mapping
const CATEGORY_MAP: Record<string, string> = {
  "landing-page": "landing page",
  website: "multi-page website",
  dashboard: "admin dashboard",
};

// Fetch images from Pexels API
async function fetchPexelsImages(industry: string): Promise<MarkedImage[]> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const response = await fetch(`${baseUrl}/api/pexels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ industry, count: 5 }),
    });

    if (!response.ok) {
      console.log("[API/expand-prompt] Pexels fetch failed, using fallback");
      return [];
    }

    const data = await response.json();
    return data.images || [];
  } catch (error) {
    console.error("[API/expand-prompt] Error fetching Pexels images:", error);
    return [];
  }
}

// Format images for prompt inclusion
function formatImagesForPrompt(images: MarkedImage[]): string {
  if (images.length === 0) return "";

  const imageList = images
    .map((img) => `  - ${img.marker}: ${img.url} (${img.alt})`)
    .join("\n");

  return `
STOCK PHOTOS (use these URLs in relevant sections, mark with {/* Image ${images[0]?.marker} */} comments for easy replacement):
${imageList}

Image placement suggestions:
- P1: Hero section background or main visual
- P2: About section or feature highlight
- P3: Services/Products section
- P4: Team or testimonials section
- P5: Secondary visual or footer`;
}

// Research industry trends with Web Search (optional enhancement)
async function researchIndustryTrends(
  industry: string,
  location: string | undefined,
  apiKey: string
): Promise<{ trends: string; sources: Array<{ url: string; title: string }> }> {
  const industryName = INDUSTRY_MAP[industry] || industry;
  const locationStr = location ? ` i ${location}` : " i Sverige";

  const prompt = `Sök efter de senaste trenderna inom ${industryName}${locationStr}.

Hitta:
1. Aktuella designtrender för webbplatser inom denna bransch
2. Vad kunderna förväntar sig av moderna ${industryName}-sajter
3. Funktioner som ökar konvertering för denna typ av verksamhet

Ge en KORT sammanfattning (max 100 ord) på ENGELSKA med konkreta förslag för webbdesign.`;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        input: prompt,
        tools: [{ type: "web_search" }],
        max_output_tokens: 500,
      }),
    });

    if (!response.ok) {
      return { trends: "", sources: [] };
    }

    const data = await response.json();
    const trends = data.output_text?.trim() || "";

    // Extract sources
    const sources: Array<{ url: string; title: string }> = [];
    if (data.output && Array.isArray(data.output)) {
      for (const item of data.output) {
        if (item.content && Array.isArray(item.content)) {
          for (const content of item.content) {
            if (content.annotations && Array.isArray(content.annotations)) {
              for (const annotation of content.annotations) {
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

    return { trends, sources: sources.slice(0, 3) };
  } catch (error) {
    console.error("[API/expand-prompt] Industry research error:", error);
    return { trends: "", sources: [] };
  }
}

// Site feedback mapping
const SITE_LIKES_MAP: Record<string, string> = {
  design: "design/appearance",
  navigation: "navigation/structure",
  content: "content",
  speed: "speed/performance",
  mobile: "mobile responsiveness",
};

const SITE_DISLIKES_MAP: Record<string, string> = {
  outdated: "looks outdated",
  confusing: "confusing navigation",
  slow: "slow/sluggish",
  not_mobile: "poor mobile experience",
  boring: "boring/uninspiring",
  hard_to_update: "difficult to update",
};

interface ExpandPromptRequest {
  companyName: string;
  industry?: string;
  location?: string;
  existingWebsite?: string;
  siteLikes?: string[];
  siteDislikes?: string[];
  siteOtherFeedback?: string;
  inspirationSites?: string[];
  purposes: string[];
  targetAudience: string;
  specialWishes: string;
  palette: {
    name: string;
    primary: string;
    secondary: string;
    accent: string;
  } | null;
  customColors: {
    primary: string;
    secondary: string;
    accent: string;
  } | null;
  categoryType: string;
  initialPrompt: string;
  websiteAnalysis?: string; // AI analysis of existing website
}

export async function POST(req: NextRequest) {
  console.log("[API/expand-prompt] Request received");

  try {
    const body: ExpandPromptRequest = await req.json();

    const {
      companyName,
      industry,
      location,
      existingWebsite,
      siteLikes,
      siteDislikes,
      siteOtherFeedback,
      inspirationSites,
      purposes,
      targetAudience,
      specialWishes,
      palette,
      customColors,
      categoryType,
      initialPrompt,
      websiteAnalysis,
    } = body;

    // Get OpenAI API key
    const openaiApiKey = process.env.OPENAI_API_KEY || process.env.OPEN_AI_API;

    if (!openaiApiKey) {
      console.error("[API/expand-prompt] OpenAI API key not configured");
      return NextResponse.json(
        { success: false, error: "OpenAI API is not configured" },
        { status: 500 }
      );
    }

    // Build the colors string
    const colors = customColors || palette;
    const colorString = colors
      ? `Primary: ${colors.primary}, Secondary: ${colors.secondary}, Accent: ${colors.accent}`
      : "Professional blue theme";

    // Build purposes string
    const purposesString = purposes.map((p) => PURPOSE_MAP[p] || p).join(", ");

    // Build site feedback string
    let siteFeedbackString = "";
    if (existingWebsite) {
      const likes = (siteLikes || [])
        .map((l) => SITE_LIKES_MAP[l] || l)
        .join(", ");
      const dislikes = (siteDislikes || [])
        .map((d) => SITE_DISLIKES_MAP[d] || d)
        .join(", ");

      siteFeedbackString = `
BEFINTLIG SAJT: ${existingWebsite}
${likes ? `Vad de gillar: ${likes}` : ""}
${dislikes ? `Vad de vill ändra: ${dislikes}` : ""}
${siteOtherFeedback ? `Övrig feedback: ${siteOtherFeedback}` : ""}
${websiteAnalysis ? `AI-ANALYS AV BEFINTLIG SAJT: ${websiteAnalysis}` : ""}`;
    }

    // Build inspiration string
    const validInspiration = (inspirationSites || []).filter((s) => s.trim());
    const inspirationString =
      validInspiration.length > 0
        ? `INSPIRATIONSSAJTER: ${validInspiration.join(", ")}`
        : "";

    // Build the user message for OpenAI
    const userMessage = `
FÖRETAG: ${companyName}
${industry ? `BRANSCH: ${INDUSTRY_MAP[industry] || industry}` : ""}
${location ? `PLATS: ${location}` : ""}
TYP: ${CATEGORY_MAP[categoryType] || categoryType}
SYFTEN: ${purposesString}
MÅLGRUPP: ${targetAudience}
FÄRGER: ${colorString}
${siteFeedbackString}
${inspirationString}
${specialWishes ? `SPECIELLA ÖNSKEMÅL: ${specialWishes}` : ""}
${initialPrompt ? `URSPRUNGLIG BESKRIVNING: ${initialPrompt}` : ""}

Skapa en detaljerad prompt för att generera denna webbplats.
Inkludera specifika sektioner, funktioner och designelement som passar branschen och syftet.
`.trim();

    // Fetch Pexels images based on industry
    console.log(
      "[API/expand-prompt] Fetching Pexels images for industry:",
      industry
    );
    const pexelsImages = await fetchPexelsImages(industry || "other");
    const imagesString = formatImagesForPrompt(pexelsImages);

    // Optional: Research industry trends with Web Search (for better prompts)
    let trendsString = "";
    if (industry && industry !== "other") {
      console.log("[API/expand-prompt] Researching industry trends...");
      const { trends } = await researchIndustryTrends(
        industry,
        location,
        openaiApiKey
      );
      if (trends) {
        trendsString = `\n\nINDUSTRY TRENDS & BEST PRACTICES (from web research):\n${trends}`;
        console.log("[API/expand-prompt] Got industry trends");
      }
    }

    // Add images and trends to user message
    const userMessageWithImages = `${userMessage}
${imagesString}${trendsString}`.trim();

    console.log(
      "[API/expand-prompt] User message length:",
      userMessageWithImages.length
    );

    // Try primary model first, fallback if needed
    let usedModel = PRIMARY_MODEL;
    let expandedPrompt: string | undefined;

    // Try gpt-5-mini with Responses API first
    console.log(
      `[API/expand-prompt] Trying ${PRIMARY_MODEL} with Responses API...`
    );
    let response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: PRIMARY_MODEL,
        input: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessageWithImages },
        ],
        reasoning: { effort: "medium" }, // Medium reasoning for balanced quality/speed
        text: { verbosity: "high" }, // High verbosity for detailed prompts
        max_output_tokens: 2500, // Allow longer prompts
      }),
    });

    // If primary model fails (not found or other error), try fallback via chat completions
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.log(
        `[API/expand-prompt] ${PRIMARY_MODEL} failed, trying ${FALLBACK_MODEL} via Chat Completions...`
      );

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
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userMessageWithImages },
          ],
          temperature: 0.7,
          max_tokens: 1500,
        }),
      });

      if (!response.ok) {
        const fallbackError = await response.json().catch(() => ({}));
        console.error("[API/expand-prompt] Both models failed:", fallbackError);

        if (response.status === 429) {
          return NextResponse.json(
            { success: false, error: "Rate limit exceeded. Try again later." },
            { status: 429 }
          );
        }

        return NextResponse.json(
          { success: false, error: "Failed to expand prompt" },
          { status: 500 }
        );
      }
    }

    const data = await response.json();

    // Parse response based on API type
    if (usedModel === PRIMARY_MODEL) {
      // Responses API format
      expandedPrompt = data.output_text?.trim();
    } else {
      // Chat Completions API format (fallback)
      expandedPrompt = data.choices?.[0]?.message?.content?.trim();
    }

    if (!expandedPrompt) {
      console.error("[API/expand-prompt] No content in response");
      return NextResponse.json(
        { success: false, error: "No response from AI" },
        { status: 500 }
      );
    }

    console.log(
      `[API/expand-prompt] Success with ${usedModel}, length:`,
      expandedPrompt.length
    );

    return NextResponse.json({
      success: true,
      expandedPrompt,
      model: usedModel,
      images: pexelsImages, // Include images for frontend reference
    });
  } catch (error) {
    console.error("[API/expand-prompt] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to expand prompt. Please try again.",
      },
      { status: 500 }
    );
  }
}
