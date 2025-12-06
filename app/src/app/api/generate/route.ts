// API Route: Generate website code
// POST /api/generate

import { NextRequest, NextResponse } from "next/server";

// Allow 10 minutes for v0 API responses (complex sites can take 5+ minutes)
export const maxDuration = 600;
import {
  generateCode,
  sanitizeCode,
  type QualityLevel,
} from "@/lib/v0-generator";
import { getCurrentUser } from "@/lib/auth";
import { getSessionIdFromRequest } from "@/lib/session";
import {
  getOrCreateGuestUsage,
  incrementGuestGenerations,
  deductGenerationDiamond,
} from "@/lib/database";

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
  console.log("[API/generate] Request received");

  try {
    const body = await req.json();
    let {
      prompt,
      categoryType,
      quality = "standard",
    } = body as {
      prompt?: string;
      categoryType?: string;
      quality?: QualityLevel;
    };

    console.log("[API/generate] Params:", {
      prompt: prompt?.substring(0, 50),
      categoryType,
      quality,
    });

    // Validate input
    if (!prompt && !categoryType) {
      console.log("[API/generate] Missing prompt and categoryType");
      return NextResponse.json(
        { success: false, error: "Prompt or category type is required" },
        { status: 400 }
      );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CREDIT CHECK: Verify user has credits or guest can generate
    // ═══════════════════════════════════════════════════════════════════════════
    const user = await getCurrentUser(req);
    const sessionId = getSessionIdFromRequest(req);
    let newBalance: number | null = null;

    if (user) {
      // Authenticated user - check diamonds
      if (user.diamonds < 1) {
        return NextResponse.json(
          {
            success: false,
            error: "Du har slut på diamanter. Köp fler för att fortsätta.",
            requireCredits: true,
          },
          { status: 402 }
        );
      }
      console.log("[API/generate] User has", user.diamonds, "diamonds");
    } else {
      // Guest user - check usage limits
      if (sessionId) {
        const guestUsage = getOrCreateGuestUsage(sessionId);
        if (guestUsage.generations_used >= 1) {
          return NextResponse.json(
            {
              success: false,
              error:
                "Du har använt din gratis generation. Skapa ett konto för att fortsätta bygga!",
              requireAuth: true,
            },
            { status: 402 }
          );
        }
        console.log(
          "[API/generate] Guest has used",
          guestUsage.generations_used,
          "generations"
        );
      }
      // Force standard quality for guests
      quality = "standard";
    }

    // Check for API key using centralized config
    const { FEATURES } = await import("@/lib/config");
    if (!FEATURES.useV0Api) {
      console.error("[API/generate] V0_API_KEY is not configured");
      return NextResponse.json(
        {
          success: false,
          error: "AI service is not configured. Please try again later.",
        },
        { status: 500 }
      );
    }

    console.log("[API/generate] Calling v0 API...");

    // Generate code using v0 API
    const result = await generateCode(
      prompt || "",
      quality as QualityLevel,
      categoryType
    );

    console.log(
      "[API/generate] v0 API response received, code length:",
      result.code?.length || 0
    );
    console.log("[API/generate] Files count:", result.files?.length || 0);
    console.log("[API/generate] Chat ID:", result.chatId);
    console.log("[API/generate] Demo URL:", result.demoUrl);

    // Sanitize the code (remove v0/Vercel references)
    const cleanedCode = sanitizeCode(result.code);

    // Sanitize files too
    const cleanedFiles = result.files?.map((file) => ({
      name: file.name,
      content: sanitizeCode(file.content),
    }));

    // Get appropriate response message
    const message =
      categoryType && CATEGORY_MESSAGES[categoryType]
        ? CATEGORY_MESSAGES[categoryType]
        : DEFAULT_MESSAGE;

    // ═══════════════════════════════════════════════════════════════════════════
    // DEDUCT CREDITS after successful generation
    // ═══════════════════════════════════════════════════════════════════════════
    if (user) {
      // Deduct diamond from authenticated user
      const transaction = deductGenerationDiamond(user.id);
      if (transaction) {
        newBalance = transaction.balance_after;
        console.log(
          "[API/generate] Deducted 1 diamond, new balance:",
          newBalance
        );
      }
    } else if (sessionId) {
      // Increment guest usage
      incrementGuestGenerations(sessionId);
      console.log("[API/generate] Incremented guest generation count");
    }

    console.log("[API/generate] Success, returning response");

    return NextResponse.json({
      success: true,
      message,
      code: cleanedCode,
      files: cleanedFiles,
      chatId: result.chatId,
      demoUrl: result.demoUrl,
      screenshotUrl: result.screenshotUrl,
      versionId: result.versionId,
      model: result.model,
      // Include updated balance for authenticated users (only if transaction succeeded)
      ...(newBalance !== null && newBalance !== undefined && { balance: newBalance }),
    });
  } catch (error) {
    console.error("[API/generate] Error:", error);

    // Generic error message (don't expose v0 details)
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    // Check for specific error types
    if (errorMessage.includes("rate limit")) {
      return NextResponse.json(
        {
          success: false,
          error: "Vår AI är upptagen just nu. Vänta en stund och försök igen.",
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
