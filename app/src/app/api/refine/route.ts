// API Route: Refine existing code
// POST /api/refine

import { getCurrentUser } from "@/lib/auth";
import {
  deductRefineDiamond,
  getOrCreateGuestUsage,
  incrementGuestRefines,
} from "@/lib/database";
import type { MediaLibraryItem } from "@/lib/prompt-utils";
import { getSessionIdFromRequest } from "@/lib/session";
import {
  refineCode,
  sanitizeCode,
  type QualityLevel,
} from "@/lib/v0-generator";
import { NextRequest, NextResponse } from "next/server";

// Allow up to 5 minutes for v0 API responses (Vercel Pro max is 300s)
// Refinements typically take 1-3 minutes
export const maxDuration = 300;

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
    const {
      existingCode,
      chatId,
      instruction,
      quality: initialQuality = "premium", // Default to premium for better understanding and code quality
      mediaLibrary,
    } = body as {
      existingCode?: string;
      chatId?: string;
      instruction?: string;
      quality?: QualityLevel;
      mediaLibrary?: MediaLibraryItem[];
    };
    let quality = initialQuality;

    // ENHANCED LOGGING: Show full instruction for debugging
    console.log("[API/refine] ═══════════════════════════════════════════════════");
    console.log("[API/refine] REQUEST PARAMS:");
    console.log("[API/refine]   ChatId:", chatId || "(new conversation)");
    console.log("[API/refine]   Quality:", quality);
    console.log("[API/refine]   HasExistingCode:", !!existingCode);
    console.log("[API/refine]   Instruction length:", instruction?.length || 0);
    console.log("[API/refine] ───────────────────────────────────────────────────");
    console.log("[API/refine] FULL INSTRUCTION:");
    console.log(instruction);
    console.log("[API/refine] ═══════════════════════════════════════════════════");

    // Validate input
    if (!instruction || instruction.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "Instruction is required" },
        { status: 400 }
      );
    }

    // OPTIMIZATION: existingCode is only required if NO chatId
    // When chatId exists, v0 maintains the code state server-side
    // This reduces payload from ~100KB+ to just the instruction
    if (!chatId && (!existingCode || existingCode.trim().length === 0)) {
      return NextResponse.json(
        {
          success: false,
          error: "Either chatId or existingCode is required for refinement",
        },
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

    // Check for API key using centralized config
    const { FEATURES } = await import("@/lib/config");
    if (!FEATURES.useV0Api) {
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
    console.log("[API/refine] ChatId provided:", !!chatId);
    console.log(
      "[API/refine] Code provided:",
      existingCode ? `${existingCode.length} chars` : "(using v0 state)"
    );

    // Refine code using v0 API (with optional chatId for conversation continuation)
    // When chatId exists, v0 maintains state server-side - we don't need to send code
    // When no chatId, we must send code so v0 has context
    const result = await refineCode(
      chatId || null,
      existingCode || "", // Empty string when using chatId (v0 has the code)
      instruction,
      quality as QualityLevel,
      mediaLibrary
    );

    // ENHANCED LOGGING: Show detailed response info
    console.log("[API/refine] ═══════════════════════════════════════════════════");
    console.log("[API/refine] RESPONSE RECEIVED:");
    console.log("[API/refine]   Chat ID:", result.chatId);
    console.log("[API/refine]   Demo URL:", result.demoUrl);
    console.log("[API/refine]   Version ID:", result.versionId);
    console.log("[API/refine]   Files count:", result.files?.length || 0);
    console.log("[API/refine]   Main code length:", result.code?.length || 0);
    if (result.files && result.files.length > 0) {
      console.log("[API/refine] ───────────────────────────────────────────────────");
      console.log("[API/refine] FILES RETURNED:");
      result.files.slice(0, 10).forEach((file, i) => {
        console.log(`[API/refine]   ${i + 1}. ${file.name} (${file.content?.length || 0} chars)`);
      });
      if (result.files.length > 10) {
        console.log(`[API/refine]   ... and ${result.files.length - 10} more files`);
      }
    }
    console.log("[API/refine] ═══════════════════════════════════════════════════");

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
      // Include updated balance for authenticated users (only if transaction succeeded)
      ...(newBalance !== null &&
        newBalance !== undefined && { balance: newBalance }),
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

    // Handle timeout errors specifically
    if (
      errorMessage.includes("timeout") ||
      errorMessage.includes("TIMEOUT") ||
      errorMessage.includes("fetch failed")
    ) {
      console.error("[API/refine] Timeout error - v0 API took too long");
      return NextResponse.json(
        {
          success: false,
          error:
            "AI:n tog för lång tid att svara. Prova en enklare ändring eller försök igen.",
        },
        { status: 504 }
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
