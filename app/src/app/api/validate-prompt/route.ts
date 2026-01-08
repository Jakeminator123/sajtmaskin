import { NextRequest, NextResponse } from "next/server";
import { routePrompt } from "@/lib/semantic-router";

/**
 * Validate Prompt API Endpoint
 * =============================
 *
 * Snabb pre-validering som bara kör Semantic Router för att avgöra
 * om prompten behöver förtydligande FÖRE generationen börjar.
 *
 * POST /api/validate-prompt
 * {
 *   prompt: string,
 *   hasExistingCode?: boolean
 * }
 *
 * Returns:
 * {
 *   intent: SemanticIntent,
 *   needsClarification: boolean,
 *   clarifyQuestion?: string,
 *   clarifyOptions?: string[]
 * }
 */

interface ValidatePromptRequest {
  prompt: string;
  hasExistingCode?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body: ValidatePromptRequest = await request.json();
    const { prompt, hasExistingCode = false } = body;

    if (!prompt || prompt.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "Prompt saknas" },
        { status: 400 }
      );
    }

    // Run Semantic Router to check intent
    const routerResult = await routePrompt(prompt, hasExistingCode);

    // Return validation result
    return NextResponse.json({
      success: true,
      intent: routerResult.intent,
      needsClarification: routerResult.intent === "clarify",
      clarifyQuestion: routerResult.clarifyQuestion,
      confidence: routerResult.confidence,
      reasoning: routerResult.reasoning,
    });
  } catch (error) {
    console.error("[ValidatePrompt] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Okänt fel vid validering",
      },
      { status: 500 }
    );
  }
}

