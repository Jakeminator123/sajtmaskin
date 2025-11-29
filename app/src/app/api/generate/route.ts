// API Route: Generate website code
// POST /api/generate

import { NextRequest, NextResponse } from "next/server";
import {
  generateCode,
  sanitizeCode,
  type QualityLevel,
} from "@/lib/v0-generator";

// Category names in Swedish for response messages
const CATEGORY_MESSAGES: Record<string, string> = {
  "landing-page":
    "Här är din landing page! Jag har skapat en modern design med hero-sektion, funktioner, prissättning och kontaktformulär. Du kan förfina den genom att beskriva ändringar i chatten.",
  website:
    "Jag har skapat en komplett hemsida med navigation och flera sektioner. Säg till om du vill ändra färger, layout eller lägga till fler sidor!",
  dashboard:
    "Din dashboard är klar! Den innehåller statistikkort, ett diagram och en tabell. Vill du lägga till fler widgets eller ändra layouten?",
  ecommerce:
    "Här är din webbshop! Jag har skapat en produktlista med filter. Du kan be mig lägga till kundvagn, produktsidor eller ändra designen.",
  blog: "Din blogg är redo! Den har en artikellista och sidebar. Säg till om du vill ha kategorier, sökfunktion eller nyhetsbrev-signup!",
  portfolio:
    "Portfolion är skapad! Den visar dina projekt i ett snyggt galleri. Vill du ändra layouten eller lägga till en om mig-sektion?",
  webapp:
    "Din web app är redo! Jag har skapat ett grundläggande gränssnitt. Beskriv vilka funktioner du vill ha så bygger jag vidare!",
};

const DEFAULT_MESSAGE =
  "Jag har skapat en design baserat på din beskrivning. Du kan förfina den genom att ge mig mer specifika instruktioner!";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      prompt,
      categoryType,
      quality = "standard",
    } = body as {
      prompt?: string;
      categoryType?: string;
      quality?: QualityLevel;
    };

    // Validate input
    if (!prompt && !categoryType) {
      return NextResponse.json(
        { success: false, error: "Prompt or category type is required" },
        { status: 400 }
      );
    }

    // Check for API key
    if (!process.env.V0_API_KEY) {
      console.error("V0_API_KEY is not configured");
      return NextResponse.json(
        {
          success: false,
          error: "AI service is not configured. Please try again later.",
        },
        { status: 500 }
      );
    }

    // Generate code using v0 API
    const result = await generateCode(
      prompt || "",
      quality as QualityLevel,
      categoryType
    );

    // Sanitize the code (remove v0/Vercel references)
    const cleanedCode = sanitizeCode(result.code);

    // Get appropriate response message
    const message =
      categoryType && CATEGORY_MESSAGES[categoryType]
        ? CATEGORY_MESSAGES[categoryType]
        : DEFAULT_MESSAGE;

    return NextResponse.json({
      success: true,
      message,
      code: cleanedCode,
      model: result.model,
    });
  } catch (error) {
    console.error("Generation error:", error);

    // Generic error message (don't expose v0 details)
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    // Check for specific error types
    if (errorMessage.includes("rate limit")) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Vår AI är upptagen just nu. Vänta en stund och försök igen.",
        },
        { status: 429 }
      );
    }

    if (errorMessage.includes("API key")) {
      return NextResponse.json(
        {
          success: false,
          error: "AI-tjänsten är inte konfigurerad korrekt.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Något gick fel vid generering. Försök igen.",
      },
      { status: 500 }
    );
  }
}

