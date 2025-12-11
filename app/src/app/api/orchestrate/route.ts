import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getUserById, deductDiamonds, isTestUser } from "@/lib/database";
import { orchestrateWorkflow } from "@/lib/orchestrator-agent";
import type { QualityLevel } from "@/lib/api-client";

// Allow up to 5 minutes for complex workflows (Vercel Pro max is 300s)
// Orchestrator may run: image generation + v0 generation = 2-4 min typically
export const maxDuration = 300;

/**
 * Orchestrator API Endpoint
 * =========================
 *
 * Koordinerar komplexa arbetsflöden som involverar:
 * - Web search (crawla webbplatser)
 * - Image generation
 * - v0 kod-generering
 *
 * POST /api/orchestrate
 * {
 *   prompt: string,
 *   quality?: "standard" | "premium",
 *   existingChatId?: string,
 *   existingCode?: string
 * }
 */

interface OrchestrateRequest {
  prompt: string;
  quality?: QualityLevel;
  existingChatId?: string;
  existingCode?: string;
  mediaLibrary?: Array<{
    url: string;
    filename: string;
    description?: string;
  }>;
}

export async function POST(request: NextRequest) {
  try {
    const body: OrchestrateRequest = await request.json();
    const {
      prompt,
      quality = "standard",
      existingChatId,
      existingCode,
      mediaLibrary,
    } = body;

    if (!prompt || prompt.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "Prompt saknas" },
        { status: 400 }
      );
    }

    // Get current user
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "Du måste vara inloggad för att använda orchestrator",
          requireAuth: true,
        },
        { status: 401 }
      );
    }

    // Get full user data
    const fullUser = getUserById(user.id);
    if (!fullUser) {
      return NextResponse.json(
        { success: false, error: "Användare hittades inte" },
        { status: 404 }
      );
    }

    // Debug: Log all incoming parameters
    console.log("[API:Orchestrate] Starting workflow:", {
      userId: user.id,
      promptLength: prompt.length,
      promptPreview: prompt.slice(0, 100) + (prompt.length > 100 ? "..." : ""),
      quality,
      existingChatId: existingChatId || "(NEW CHAT)",
      hasExistingCode: !!existingCode,
      existingCodeLength: existingCode?.length || 0,
      mediaLibraryCount: mediaLibrary?.length || 0,
    });

    // Run orchestrator first to determine intent
    const result = await orchestrateWorkflow(prompt, {
      userId: user.id,
      quality,
      existingChatId,
      existingCode,
      mediaLibrary,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Orchestrator misslyckades" },
        { status: 500 }
      );
    }

    // Determine diamond cost based on intent
    // Some intents don't cost anything (chat_response, clarify)
    // Some cost less (image_only, web_search_only = 1 diamond)
    // Full workflows cost more (image_and_code, web_search_and_code = 2 diamonds)
    const freeIntents = ["chat_response", "clarify"];
    const cheapIntents = ["image_only", "web_search_only", "code_only"];

    let diamondCost = 0;
    if (freeIntents.includes(result.intent || "")) {
      diamondCost = 0;
    } else if (cheapIntents.includes(result.intent || "")) {
      diamondCost = 1;
    } else {
      diamondCost = 2; // image_and_code, web_search_and_code
    }

    // Check credits (only if cost > 0)
    if (
      diamondCost > 0 &&
      !isTestUser(fullUser) &&
      fullUser.diamonds < diamondCost
    ) {
      return NextResponse.json(
        {
          success: false,
          error: `Du behöver minst ${diamondCost} diamanter. Du har ${fullUser.diamonds}.`,
          requireCredits: true,
          requiredDiamonds: diamondCost,
          currentDiamonds: fullUser.diamonds,
        },
        { status: 402 }
      );
    }

    // Deduct diamonds on success (only if cost > 0)
    let transaction = null;
    if (diamondCost > 0) {
      transaction = deductDiamonds(
        user.id,
        diamondCost,
        `Orchestrator: ${result.intent}`,
        "orchestrator"
      );
      console.log(
        "[API:Orchestrate] Workflow complete, diamonds deducted:",
        diamondCost
      );
    } else {
      console.log(
        "[API:Orchestrate] Workflow complete (free intent):",
        result.intent
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message,
      intent: result.intent,
      code: result.code,
      files: result.files,
      chatId: result.chatId,
      demoUrl: result.demoUrl,
      versionId: result.versionId,
      webSearchResults: result.webSearchResults,
      generatedImages: result.generatedImages,
      workflowSteps: result.workflowSteps,
      clarifyQuestion: result.clarifyQuestion,
      chatResponse: result.chatResponse,
      balance: transaction?.balance_after ?? fullUser.diamonds,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[API:Orchestrate] Error:", error);
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
