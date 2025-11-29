// API Route: Refine existing code
// POST /api/refine

import { NextRequest, NextResponse } from "next/server";
import {
  refineCode,
  sanitizeCode,
  type QualityLevel,
} from "@/lib/v0-generator";

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
  try {
    const body = await req.json();
    const {
      existingCode,
      instruction,
      quality = "standard",
    } = body as {
      existingCode?: string;
      instruction?: string;
      quality?: QualityLevel;
    };

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

    // Refine code using v0 API
    const result = await refineCode(
      existingCode,
      instruction,
      quality as QualityLevel
    );

    // Sanitize the code (remove v0/Vercel references)
    const cleanedCode = sanitizeCode(result.code);

    return NextResponse.json({
      success: true,
      message: getRandomMessage(),
      code: cleanedCode,
      model: result.model,
    });
  } catch (error) {
    console.error("Refinement error:", error);

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
        error: "Något gick fel vid uppdatering. Försök igen.",
      },
      { status: 500 }
    );
  }
}

