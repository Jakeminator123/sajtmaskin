import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getUserById,
  deductDiamonds,
  isTestUser,
  TransactionType,
} from "@/lib/database";
import {
  runAgent,
  createAgentContext,
  continueConversation,
  getDiamondCost,
  detectTaskType,
  TaskType,
} from "@/lib/openai-agent";
import { getProjectMeta } from "@/lib/redis";

// Allow up to 3 minutes for complex AI code editing (code_refactor needs more time)
export const maxDuration = 180;

/**
 * Agent Edit API
 *
 * Uses OpenAI Responses API with GPT-5/5.1 models for AI code editing.
 * Primary models with automatic fallback to GPT-4o series.
 *
 * TASK TYPES & COSTS:
 * - code_edit: 1 diamond (gpt-5.1-codex-mini → gpt-4o-mini)
 * - copy: 1 diamond (gpt-5-mini → gpt-4o-mini)
 * - image: 3 diamonds (gpt-5 + image_generation tool)
 * - web_search: 2 diamonds (gpt-4o-mini + web_search)
 * - code_refactor: 5 diamonds (gpt-5.1-codex → gpt-4o)
 * - analyze: 3 diamonds (gpt-5 with reasoning)
 *
 * POST /api/agent/edit
 */

interface EditRequest {
  projectId: string;
  instruction: string;
  taskType?: TaskType; // Optional - will be auto-detected if not provided
  previousResponseId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: EditRequest = await request.json();
    const { projectId, instruction, previousResponseId } = body;

    // Auto-detect task type from instruction if not explicitly provided
    const taskType: TaskType = body.taskType || detectTaskType(instruction);

    // Processing agent edit request

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

    // Validate task type - must match MODEL_CONFIGS in openai-agent.ts
    const validTaskTypes: TaskType[] = [
      "code_edit",
      "copy",
      "image",
      "web_search",
      "code_refactor",
      "analyze", // Project analysis and suggestions
    ];
    if (!validTaskTypes.includes(taskType)) {
      return NextResponse.json(
        { success: false, error: `Ogiltig taskType: ${taskType}` },
        { status: 400 }
      );
    }

    // Get diamond cost for this task type
    const diamondCost = getDiamondCost(taskType);
    const transactionTypeMap: Record<TaskType, TransactionType> = {
      code_edit: "agent_code_edit",
      copy: "agent_copy",
      image: "agent_image",
      web_search: "agent_web_search",
      code_refactor: "agent_code_refactor",
      analyze: "agent_analyze",
    };

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

    // Create agent context with task type (before deducting diamonds)
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

    // Run the agent FIRST (before deducting diamonds)

    let result;
    try {
      result = previousResponseId
        ? await continueConversation(instruction, context, previousResponseId)
        : await runAgent(instruction, context);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Okänt fel vid agent-anrop";
      console.error("[Agent/Edit] Agent call failed:", errorMessage);
      return NextResponse.json(
        { success: false, error: errorMessage },
        { status: 500 }
      );
    }

    if (!result.success) {
      console.error("[Agent/Edit] Agent failed:", result.message);
      return NextResponse.json(
        { success: false, error: result.message },
        { status: 500 }
      );
    }

    // Only deduct diamonds AFTER successful agent execution
    const transaction = deductDiamonds(
      user.id,
      diamondCost,
      `AI-${taskType}`,
      transactionTypeMap[taskType] || "generation"
    );
    if (!transaction && !isTestUser(fullUser)) {
      // Agent succeeded but diamond deduction failed - log warning but don't fail request
      console.warn("[Agent/Edit] Agent succeeded but diamond deduction failed");
    }

    console.log(
      `[Agent/Edit] ${diamondCost} diamonds deducted, new balance:`,
      transaction?.balance_after
    );

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
      ...(transaction?.balance_after !== undefined && {
        newBalance: transaction.balance_after,
      }),
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
