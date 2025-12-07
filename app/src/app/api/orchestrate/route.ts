import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getUserById, deductDiamonds, isTestUser } from "@/lib/database";
import { orchestrateWorkflow } from "@/lib/orchestrator-agent";
import type { QualityLevel } from "@/lib/api-client";

// Allow up to 10 minutes for complex workflows
export const maxDuration = 600;

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
}

export async function POST(request: NextRequest) {
  try {
    const body: OrchestrateRequest = await request.json();
    const { prompt, quality = "standard", existingChatId, existingCode } = body;

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

    // Check credits - orchestrator uses 2 diamonds (web search + generation)
    const diamondCost = 2;
    if (!isTestUser(fullUser) && fullUser.diamonds < diamondCost) {
      return NextResponse.json(
        {
          success: false,
          error: `Du behöver minst ${diamondCost} diamanter för orchestrator. Du har ${fullUser.diamonds}.`,
          requireCredits: true,
          requiredDiamonds: diamondCost,
          currentDiamonds: fullUser.diamonds,
        },
        { status: 402 }
      );
    }

    console.log("[API:Orchestrate] Starting workflow for user:", user.id);

    // Run orchestrator
    const result = await orchestrateWorkflow(prompt, {
      userId: user.id,
      quality,
      existingChatId,
      existingCode,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Orchestrator misslyckades" },
        { status: 500 }
      );
    }

    // Deduct diamonds on success
    const transaction = deductDiamonds(
      user.id,
      diamondCost,
      "Orchestrator workflow",
      "orchestrator"
    );

    console.log("[API:Orchestrate] Workflow complete, diamonds deducted:", diamondCost);

    return NextResponse.json({
      success: true,
      message: result.message,
      code: result.code,
      files: result.files,
      chatId: result.chatId,
      demoUrl: result.demoUrl,
      versionId: result.versionId,
      webSearchResults: result.webSearchResults,
      generatedImages: result.generatedImages,
      workflowSteps: result.workflowSteps,
      balance: transaction?.balance_after,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[API:Orchestrate] Error:", error);
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
