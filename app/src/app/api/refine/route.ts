// API Route: Refine existing code
// POST /api/refine

import { NextRequest, NextResponse } from "next/server";

// Allow 5 minutes for v0 API responses
export const maxDuration = 300;
import {
  refineCode,
  sanitizeCode,
  type QualityLevel,
} from "@/lib/v0-generator";
import { getCurrentUser } from "@/lib/auth";
import { getSessionIdFromRequest } from "@/lib/session";
import {
  getOrCreateGuestUsage,
  incrementGuestRefines,
  deductRefineDiamond,
} from "@/lib/database";

// Refinement response messages in Swedish
const REFINEMENT_MESSAGES = [
  "Klart! Jag har uppdaterat designen enligt dina önskemål.",
  "Ändringarna är gjorda! Kolla förhandsvisningen till höger.",
  "Perfekt, jag har justerat koden. Vad tycker du?",
  "Uppdaterat! Säg till om du vill ändra något mer.",
  "Klar med ändringarna! Behöver du justera något ytterligare?",
];

function getRandomMessage(): string {
  return REFINEMENT_MESSAGES[
    Math.floor(Math.random() * REFINEMENT_MESSAGES.length)
  ];
}

export async function POST(req: NextRequest) {
  console.log("[API/refine] Request received");

  try {
    const body = await req.json();
    let {
      existingCode,
      chatId,
      instruction,
      quality = "standard",
    } = body as {
      existingCode?: string;
      chatId?: string;
      instruction?: string;
      quality?: QualityLevel;
    };

    console.log("[API/refine] Params:", {
      chatId,
      instruction: instruction?.substring(0, 50),
      quality,
      hasExistingCode: !!existingCode,
    });

    // Validate input
    if (!instruction || instruction.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "Instruction is required" },
        { status: 400 }
      );
    }

    if (!existingCode || existingCode.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "Existing code is required for refinement" },
        { status: 400 }
      );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CREDIT CHECK: Verify user has credits or guest can refine
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
      console.log("[API/refine] User has", user.diamonds, "diamonds");
    } else {
      // Guest user - check usage limits
      if (sessionId) {
        const guestUsage = getOrCreateGuestUsage(sessionId);
        if (guestUsage.refines_used >= 1) {
          return NextResponse.json(
            {
              success: false,
              error:
                "Du har använt din gratis förfining. Skapa ett konto för att fortsätta!",
              requireAuth: true,
            },
            { status: 402 }
          );
        }
        console.log(
          "[API/refine] Guest has used",
          guestUsage.refines_used,
          "refines"
        );
      }
      // Force standard quality for guests
      quality = "standard";
    }

    // Check for API key
    if (!process.env.V0_API_KEY) {
      console.error("[API/refine] V0_API_KEY is not configured");
      return NextResponse.json(
        {
          success: false,
          error: "AI service is not configured. Please try again later.",
        },
        { status: 500 }
      );
    }

    console.log("[API/refine] Calling v0 API...");

    // Refine code using v0 API (with optional chatId for conversation continuation)
    const result = await refineCode(
      chatId || null,
      existingCode,
      instruction,
      quality as QualityLevel
    );

    console.log(
      "[API/refine] Response received, code length:",
      result.code?.length || 0
    );
    console.log("[API/refine] Files count:", result.files?.length || 0);
    console.log("[API/refine] Chat ID:", result.chatId);

    // Sanitize the code (remove v0/Vercel references)
    const cleanedCode = sanitizeCode(result.code);

    // Sanitize files too
    const cleanedFiles = result.files?.map((file) => ({
      name: file.name,
      content: sanitizeCode(file.content),
    }));

    // ═══════════════════════════════════════════════════════════════════════════
    // DEDUCT CREDITS after successful refinement
    // ═══════════════════════════════════════════════════════════════════════════
    if (user) {
      // Deduct diamond from authenticated user
      const transaction = deductRefineDiamond(user.id);
      if (transaction) {
        newBalance = transaction.balance_after;
        console.log(
          "[API/refine] Deducted 1 diamond, new balance:",
          newBalance
        );
      }
    } else if (sessionId) {
      // Increment guest usage
      incrementGuestRefines(sessionId);
      console.log("[API/refine] Incremented guest refine count");
    }

    return NextResponse.json({
      success: true,
      message: getRandomMessage(),
      code: cleanedCode,
      files: cleanedFiles,
      chatId: result.chatId,
      demoUrl: result.demoUrl,
      screenshotUrl: result.screenshotUrl,
      versionId: result.versionId,
      model: result.model,
      // Include updated balance for authenticated users
      ...(newBalance !== null && { balance: newBalance }),
    });
  } catch (error) {
    console.error("[API/refine] Error:", error);

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
        error: "Något gick fel vid uppdatering. Försök igen.",
      },
      { status: 500 }
    );
  }
}
