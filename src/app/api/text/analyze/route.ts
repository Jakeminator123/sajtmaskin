import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import OpenAI from "openai";
import { SECRETS } from "@/lib/config";

/**
 * Text Analysis API
 * =================
 *
 * Analyzes text content and suggests how to use it in a website.
 * Uses GPT-4o-mini (fast & cheap) instead of v0 API.
 *
 * This is a "pre-processor" that helps users formulate better prompts
 * for v0 without wasting expensive API calls.
 *
 * POST /api/text/analyze
 * Body: { content: string, filename: string, contentType: string }
 * Returns: { summary: string, suggestions: TextSuggestion[] }
 */

interface TextSuggestion {
  id: string;
  label: string;
  description: string;
  prompt: string;
}

// Use the cheapest/fastest model
const ANALYSIS_MODEL = "gpt-4o-mini";

export async function POST(request: NextRequest) {
  try {
    // Optional auth - allow guests to use this
    await getCurrentUser(request);

    const body = await request.json();
    const { content, filename, contentType } = body;

    if (!content || typeof content !== "string") {
      return NextResponse.json(
        { success: false, error: "Inget innehåll att analysera" },
        { status: 400 }
      );
    }

    // Check if OpenAI is configured
    if (!SECRETS.openaiApiKey) {
      console.log("[Text/Analyze] OpenAI not configured, using defaults");
      return NextResponse.json({
        success: true,
        summary: `${filename || "Textfil"} (${content.length} tecken)`,
        suggestions: getDefaultSuggestions(content, contentType),
      });
    }

    const openai = new OpenAI({
      apiKey: SECRETS.openaiApiKey,
    });

    // Truncate content for analysis (save tokens)
    const truncatedContent = content.substring(0, 4000);

    // Use Responses API with structured outputs (text.format)
    const response = await openai.responses.create({
      model: ANALYSIS_MODEL,
      instructions: `Du är en webbutvecklare som hjälper användare lägga till textinnehåll på webbplatser.

Analysera texten och föreslå 3-4 sätt att använda den i en modern webbdesign.

VIKTIGT:
- Gör förslagen plats-specifika (t.ex. hero, om oss, CTA, FAQ, footer, bloggsektion).
- Inkludera MINST ett alternativ som bara sparar texten i användarens textlager/lagring utan att rendera den på sidan ännu.
- Prompterna ska vara kompletta och inkludera själva texten.

Regler:
- Anpassa förslagen efter innehållets typ (JSON → tabeller/kort, About-text → hero/sektion)
- Prompterna ska vara specifika och inkludera den faktiska texten
- Svara på svenska
- Ge 3-4 varierande förslag`,
      input: `Filnamn: ${filename || "textfil.txt"}
Filtyp: ${contentType || "text"}

Innehåll:
${truncatedContent}

Svara ENDAST med giltig JSON i detta format:
{
  "summary": "Kort beskrivning av vad texten handlar om (max 50 ord)",
  "suggestions": [
    {
      "id": "unique-id",
      "label": "Kort etikett (2-4 ord)",
      "description": "Kort beskrivning av vad detta alternativ gör",
      "prompt": "Den fullständiga prompten som ska skickas till AI:n. Ange även var innehållet ska placeras på sidan eller om det bara ska sparas."
    }
  ]
}`,
      // Note: TypeScript SDK doesn't fully support text.format yet, so we parse JSON from output_text
      // This is still better than Chat Completions as we use Responses API
      store: false, // No need to store for this analysis
    });

    // Use output_text helper from Responses API
    let responseText = response.output_text || "";

    // Parse JSON response
    try {
      // Extract JSON if wrapped in markdown code blocks
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        responseText = jsonMatch[1];
      }
      const parsed = JSON.parse(responseText.trim());

      // Validate structure
      if (!parsed.suggestions || !Array.isArray(parsed.suggestions)) {
        throw new Error("Invalid response structure");
      }

      // Ensure each suggestion has required fields
      const validSuggestions = parsed.suggestions
        .filter(
          (
            s: unknown
          ): s is {
            id: string;
            label: string;
            description: string;
            prompt: string;
          } =>
            typeof s === "object" &&
            s !== null &&
            "id" in s &&
            "label" in s &&
            "description" in s &&
            "prompt" in s &&
            typeof (s as { id: unknown }).id === "string" &&
            typeof (s as { label: unknown }).label === "string" &&
            typeof (s as { description: unknown }).description === "string" &&
            typeof (s as { prompt: unknown }).prompt === "string"
        )
        .map(
          (
            s: {
              id: string;
              label: string;
              description: string;
              prompt: string;
            },
            index: number
          ) => ({
            id: s.id || `suggestion-${index}`,
            label: s.label,
            description: s.description,
            prompt: s.prompt,
          })
        );

      if (validSuggestions.length === 0) {
        throw new Error("No valid suggestions");
      }

      console.log(
        `[Text/Analyze] Generated ${validSuggestions.length} suggestions for ${filename}`
      );

      return NextResponse.json({
        success: true,
        summary: parsed.summary || `${filename} analyserad`,
        suggestions: validSuggestions,
      });
    } catch (parseError) {
      console.error("[Text/Analyze] Failed to parse AI response:", parseError);
      // Fall back to defaults
      return NextResponse.json({
        success: true,
        summary: `${filename || "Textfil"} (${content.length} tecken)`,
        suggestions: getDefaultSuggestions(content, contentType),
      });
    }
  } catch (error: unknown) {
    console.error("[API/Text/Analyze] Error:", error);

    // Return defaults on error instead of failing
    return NextResponse.json({
      success: true,
      summary: "Kunde inte analysera filen automatiskt",
      suggestions: getDefaultSuggestions("", "text"),
    });
  }
}

/**
 * Default suggestions when AI analysis fails
 */
function getDefaultSuggestions(
  content: string,
  contentType: string
): TextSuggestion[] {
  const textSnippet = content.substring(0, 2000);

  if (contentType === "json") {
    return [
      {
        id: "json-table",
        label: "Visa som tabell",
        description: "Skapa en snygg tabell av JSON-datan",
        prompt: `Skapa en modern, responsiv tabell som visar följande JSON-data med zebra-striping och hover-effekter:\n\n${textSnippet}`,
      },
      {
        id: "json-cards",
        label: "Visa som kort",
        description: "Skapa ett grid av kort från datan",
        prompt: `Skapa ett responsivt grid av snygga kort från följande JSON-data:\n\n${textSnippet}`,
      },
    ];
  }

  if (contentType === "markdown") {
    return [
      {
        id: "md-styled",
        label: "Med styling",
        description: "Behåll struktur, lägg till styling",
        prompt: `Lägg till följande markdown-innehåll med snygg typografi och spacing:\n\n${textSnippet}`,
      },
      {
        id: "md-hero",
        label: "Som hero-sektion",
        description: "Förvandla till en hero",
        prompt: `Skapa en hero-sektion baserad på denna text:\n\n${textSnippet}`,
      },
    ];
  }

  // Default for plain text
  return [
    {
      id: "text-section",
      label: "Innehållssektion",
      description: "En ren innehållssektion med texten",
      prompt: `Lägg till följande text som en snygg innehållssektion med bra typografi:\n\n${textSnippet}`,
    },
    {
      id: "text-about",
      label: "Om oss-sektion",
      description: "Skapa en About-sektion",
      prompt: `Skapa en "Om oss"-sektion med följande text:\n\n${textSnippet}`,
    },
    {
      id: "text-cta",
      label: "CTA/erbjudande",
      description: "Placera som call-to-action sektion",
      prompt: `Skapa en tydlig CTA-sektion (rubrik, kort text, knapp) och använd denna text som underlag. Placera sektionen nära toppen eller efter hero:\n\n${textSnippet}`,
    },
    {
      id: "text-faq",
      label: "FAQ/accordion",
      description: "Gör frågor och svar",
      prompt: `Omvandla följande text till en FAQ/accordion-sektion med 4-6 frågor/svar. Lägg sektionen i mitten av sidan:\n\n${textSnippet}`,
    },
    {
      id: "text-footer",
      label: "Footer-info",
      description: "Placera i sidfoten",
      prompt: `Extrahera den viktigaste info och placera den i sidfoten (kontakt, kort tagline) utan att göra footern för hög. Utgå från texten:\n\n${textSnippet}`,
    },
    {
      id: "text-store",
      label: "Spara i textlager",
      description: "Lagra texten för senare, rendera inte nu",
      prompt: `Spara följande text i projektets textlager/lagring för senare användning. Rendera inte på sidan nu, men bekräfta lagringsplats och hur den kan återanvändas:\n\n${textSnippet}`,
    },
  ];
}
