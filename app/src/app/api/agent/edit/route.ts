import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getUserById, deductDiamonds, isTestUser } from "@/lib/database";
import {
  runAgent,
  createAgentContext,
  continueConversation,
  getDiamondCost,
  TaskType,
} from "@/lib/openai-agent";
import { getProjectMeta } from "@/lib/redis";

// Allow up to 2 minutes for complex AI code editing
export const maxDuration = 120;

/**
 * Agent Edit API
 *
 * Uses OpenAI API with GPT-4o models to edit code in taken-over projects.
 * Supports multiple task types with different models and costs.
 *
 * TASK TYPES & COSTS:
 * - code_edit: 1 diamond (gpt-4o-mini, fast editing)
 * - copy: 1 diamond (gpt-4o-mini, text generation)
 * - image: 3 diamonds (gpt-4o + dall-e-3)
 * - web_search: 2 diamonds (gpt-4o-mini + web_search)
 * - code_refactor: 5 diamonds (gpt-4o, complex reasoning)
 *
 * POST /api/agent/edit
 */

interface EditRequest {
  projectId: string;
  instruction: string;
  taskType?: TaskType;
  previousResponseId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: EditRequest = await request.json();
    const {
      projectId,
      instruction,
      taskType = "code_edit",
      previousResponseId,
    } = body;

    console.log("[Agent/Edit] Request:", { projectId, taskType });

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

    // Validate task type
    const validTaskTypes: TaskType[] = [
      "code_edit",
      "copy",
      "image",
      "web_search",
      "code_refactor",
    ];
    if (!validTaskTypes.includes(taskType)) {
      return NextResponse.json(
        { success: false, error: `Ogiltig taskType: ${taskType}` },
        { status: 400 }
      );
    }

    // Get diamond cost for this task type
    const diamondCost = getDiamondCost(taskType);

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

    // Check credits (dynamic cost based on task type)
    if (!isTestUser(fullUser) && fullUser.diamonds < diamondCost) {
      return NextResponse.json(
        {
          success: false,
          error: `Du behöver ${diamondCost} diamanter för denna åtgärd. Du har ${fullUser.diamonds}.`,
          requireCredits: true,
          requiredDiamonds: diamondCost,
          currentDiamonds: fullUser.diamonds,
        },
        { status: 402 }
      );
    }

    // Deduct diamonds (dynamic amount)
    const transaction = deductDiamonds(user.id, diamondCost);
    if (!transaction && !isTestUser(fullUser)) {
      return NextResponse.json(
        {
          success: false,
          error: "Kunde inte dra diamanter. Försök igen.",
        },
        { status: 500 }
      );
    }

    console.log(
      `[Agent/Edit] ${diamondCost} diamonds deducted, new balance:`,
      transaction?.balance_after
    );

    // Create agent context with task type
    const context = await createAgentContext(
      projectId,
      fullUser.github_token || undefined,
      taskType
    );

    if (!context) {
      return NextResponse.json(
        { success: false, error: "Kunde inte ladda projektdata" },
        { status: 500 }
      );
    }

    // Run the agent
    console.log("[Agent/Edit] Running agent:", {
      storage: context.storageType,
      taskType,
      instruction: instruction.substring(0, 100),
    });

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

    console.log("[Agent/Edit] Agent completed:", {
      updatedFiles: result.updatedFiles.length,
      generatedImages: result.generatedImages?.length || 0,
      webSearchSources: result.webSearchSources?.length || 0,
    });

    return NextResponse.json({
      success: true,
      message: result.message,
      updatedFiles: result.updatedFiles,
      generatedImages: result.generatedImages,
      webSearchSources: result.webSearchSources,
      responseId: result.responseId,
      tokensUsed: result.tokensUsed,
      newBalance: transaction?.balance_after,
      storageType: context.storageType,
      taskType,
      diamondCost,
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
