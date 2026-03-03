import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import OpenAI from "openai";
import { FEATURES, SECRETS } from "@/lib/config";
import { withRateLimit } from "@/lib/rateLimit";

/**
 * Text Analysis API
 * =================
 *
 * Analyzes text content and suggests how to use it in a website.
 * Uses Responses API with structured output for guaranteed JSON.
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

const ANALYSIS_MODEL = "gpt-5-nano";

const TEXT_ANALYZE_SCHEMA = {
  type: "object" as const,
  properties: {
    summary: { type: "string" as const },
    suggestions: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          id: { type: "string" as const },
          label: { type: "string" as const },
          description: { type: "string" as const },
          prompt: { type: "string" as const },
        },
        required: ["id", "label", "description", "prompt"] as const,
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "suggestions"] as const,
  additionalProperties: false,
};

function getGatewayApiKey(): string | null {
  const apiKey = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  return apiKey && apiKey.trim() ? apiKey : null;
}

export async function POST(request: NextRequest) {
  return withRateLimit(request, "text:analyze", async () => {
    try {
      await getCurrentUser(request);

    const body = await request.json();
    const { content, filename, contentType } = body;

    if (!content || typeof content !== "string") {
      return NextResponse.json(
        { success: false, error: "Inget innehåll att analysera" },
        { status: 400 },
      );
    }

    // Gate: need either OPENAI_API_KEY (Responses API) or gateway key
    if (!SECRETS.openaiApiKey && !getGatewayApiKey()) {
      console.info("[Text/Analyze] No AI keys configured, using defaults");
      return NextResponse.json({
        success: true,
        summary: `${filename || "Textfil"} (${content.length} tecken)`,
        suggestions: getDefaultSuggestions(content, contentType),
      });
    }

    const truncatedContent = content.substring(0, 4000);

    const instructions = `Du är en webbutvecklare som hjälper användare lägga till textinnehåll på webbplatser.

Analysera texten och föreslå 3-4 sätt att använda den i en modern webbdesign.

VIKTIGT:
- Gör förslagen plats-specifika (t.ex. hero, om oss, CTA, FAQ, footer, bloggsektion).
- Inkludera MINST ett alternativ som bara sparar texten i användarens textlager/lagring utan att rendera den på sidan ännu.
- Prompterna ska vara kompletta och inkludera själva texten.

Regler:
- Anpassa förslagen efter innehållets typ (JSON → tabeller/kort, About-text → hero/sektion)
- Prompterna ska vara specifika och inkludera den faktiska texten
- Svara på svenska
- Ge 3-4 varierande förslag`;

    const inputText = `Filnamn: ${filename || "textfil.txt"}
Filtyp: ${contentType || "text"}

Innehåll:
${truncatedContent}`;

    // ── Responses API path (structured output) ──────────────────
    if (FEATURES.useResponsesApi) {
      const openai = new OpenAI({ apiKey: SECRETS.openaiApiKey });

      const response = await openai.responses.create({
        model: ANALYSIS_MODEL,
        instructions,
        input: inputText,
        text: {
          format: {
            type: "json_schema",
            name: "text_analysis",
            schema: TEXT_ANALYZE_SCHEMA,
            strict: true,
          },
        },
        store: false,
      });

      const parsed: { summary: string; suggestions: TextSuggestion[] } = JSON.parse(
        response.output_text,
      );

      console.info(
        `[Text/Analyze] Responses API: ${parsed.suggestions.length} suggestions for ${filename}`,
      );

      return NextResponse.json({
        success: true,
        summary: parsed.summary,
        suggestions: parsed.suggestions,
      });
    }

    // ── Gateway fallback path (old behaviour) ───────────────────
    const openai = new OpenAI({
      apiKey: getGatewayApiKey() ?? "",
      baseURL: "https://ai-gateway.vercel.sh/v1",
    });

    const response = await openai.responses.create({
      model: `openai/${ANALYSIS_MODEL}`,
      instructions,
      input: `${inputText}

Svara ENDAST med giltig JSON i detta format:
{
  "summary": "Kort beskrivning av vad texten handlar om (max 50 ord)",
  "suggestions": [
    {
      "id": "unique-id",
      "label": "Kort etikett (2-4 ord)",
      "description": "Kort beskrivning av vad detta alternativ gör",
      "prompt": "Den fullständiga prompten som ska skickas till AI:n."
    }
  ]
}`,
      store: false,
    });

    let responseText = response.output_text || "";

    try {
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        responseText = jsonMatch[1];
      }
      const parsed = JSON.parse(responseText.trim());

      if (!parsed.suggestions || !Array.isArray(parsed.suggestions)) {
        throw new Error("Invalid response structure");
      }

      const validSuggestions = parsed.suggestions
        .filter(
          (
            s: unknown,
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
            typeof (s as { prompt: unknown }).prompt === "string",
        )
        .map(
          (
            s: {
              id: string;
              label: string;
              description: string;
              prompt: string;
            },
            index: number,
          ) => ({
            id: s.id || `suggestion-${index}`,
            label: s.label,
            description: s.description,
            prompt: s.prompt,
          }),
        );

      if (validSuggestions.length === 0) {
        throw new Error("No valid suggestions");
      }

      console.info(
        `[Text/Analyze] Gateway: ${validSuggestions.length} suggestions for ${filename}`,
      );

      return NextResponse.json({
        success: true,
        summary: parsed.summary || `${filename} analyserad`,
        suggestions: validSuggestions,
      });
    } catch (parseError) {
      console.error("[Text/Analyze] Failed to parse gateway AI response:", parseError);
      return NextResponse.json({
        success: true,
        summary: `${filename || "Textfil"} (${content.length} tecken)`,
        suggestions: getDefaultSuggestions(content, contentType),
      });
    }
    } catch (error: unknown) {
      console.error("[API/Text/Analyze] Error:", error);

      return NextResponse.json({
        success: false,
        summary: "Kunde inte analysera filen automatiskt",
        suggestions: getDefaultSuggestions("", "text"),
      });
    }
  });
}

/**
 * Default suggestions when AI analysis fails
 */
function getDefaultSuggestions(content: string, contentType: string): TextSuggestion[] {
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
