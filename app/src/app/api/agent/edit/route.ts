import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getUserById,
  deductGenerationDiamond,
  isTestUser,
} from "@/lib/database";
import {
  runAgent,
  createAgentContext,
  continueConversation,
} from "@/lib/openai-agent";
import { getProjectMeta } from "@/lib/redis";

/**
 * Agent Edit API
 *
 * Uses OpenAI Responses API to edit code in taken-over projects.
 * Supports both Redis (simple) and GitHub (full ownership) storage.
 *
 * Cost: 1 diamond per request
 *
 * POST /api/agent/edit
 * Body: {
 *   projectId: string           - The project to edit
 *   instruction: string         - What the user wants to change
 *   previousResponseId?: string - For multi-turn conversations
 * }
 */

interface EditRequest {
  projectId: string;
  instruction: string;
  previousResponseId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: EditRequest = await request.json();
    const { projectId, instruction, previousResponseId } = body;

    console.log("[Agent/Edit] Request for project:", projectId);

    // Validate input
    if (!instruction || instruction.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "Instruktion saknas" },
        { status: 400 }
      );
    }

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: "Projekt-ID saknas" },
        { status: 400 }
      );
    }

    // Get current user
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "Du måste vara inloggad för att använda AI-redigering",
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

    // Get project metadata to check ownership and storage type
    const projectMeta = await getProjectMeta(projectId);
    if (!projectMeta) {
      return NextResponse.json(
        { success: false, error: "Projektet har inte tagits över ännu" },
        { status: 404 }
      );
    }

    // Verify user owns this project
    if (projectMeta.userId !== user.id) {
      return NextResponse.json(
        { success: false, error: "Du kan bara redigera dina egna projekt" },
        { status: 403 }
      );
    }

    // For GitHub mode, check if user has GitHub connected
    if (projectMeta.storageType === "github") {
      if (!fullUser.github_token || !fullUser.github_username) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Du måste ansluta ditt GitHub-konto för att redigera detta projekt",
            requireGitHub: true,
          },
          { status: 400 }
        );
      }
    }

    // Check credits (1 diamond per edit)
    if (!isTestUser(fullUser) && fullUser.diamonds < 1) {
      return NextResponse.json(
        {
          success: false,
          error: "Du har slut på diamanter. Köp fler för att fortsätta.",
          requireCredits: true,
        },
        { status: 402 }
      );
    }

    // Deduct diamond
    const transaction = deductGenerationDiamond(user.id);
    if (!transaction && !isTestUser(fullUser)) {
      return NextResponse.json(
        {
          success: false,
          error: "Kunde inte dra diamant. Försök igen.",
        },
        { status: 500 }
      );
    }

    console.log(
      "[Agent/Edit] Diamond deducted, new balance:",
      transaction?.balance_after
    );

    // Create agent context (handles both Redis and GitHub)
    const context = await createAgentContext(
      projectId,
      fullUser.github_token || undefined
    );

    if (!context) {
      return NextResponse.json(
        { success: false, error: "Kunde inte ladda projektdata" },
        { status: 500 }
      );
    }

    // Run the agent
    console.log(
      "[Agent/Edit] Running agent (storage:",
      context.storageType,
      ") with instruction:",
      instruction.substring(0, 100)
    );

    const result = previousResponseId
      ? await continueConversation(instruction, context, previousResponseId)
      : await runAgent(instruction, context);

    if (!result.success) {
      console.error("[Agent/Edit] Agent failed:", result.message);
      return NextResponse.json(
        { success: false, error: result.message },
        { status: 500 }
      );
    }

    console.log(
      "[Agent/Edit] Agent completed, updated files:",
      result.updatedFiles.length
    );

    return NextResponse.json({
      success: true,
      message: result.message,
      updatedFiles: result.updatedFiles,
      responseId: result.responseId,
      tokensUsed: result.tokensUsed,
      newBalance: transaction?.balance_after,
      storageType: context.storageType,
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[Agent/Edit] Error:", error);
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
