import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getUserById,
  deductGenerationDiamond,
  isTestUser,
} from "@/lib/database";
import { runAgent, continueConversation } from "@/lib/openai-agent";

/**
 * Agent Edit API
 *
 * Uses OpenAI Responses API to edit code in GitHub repositories.
 * This is the alternative to v0 refinement for "taken over" projects.
 *
 * Cost: 1 diamond per request
 *
 * POST /api/agent/edit
 * Body: {
 *   instruction: string      - What the user wants to change
 *   repoFullName: string     - GitHub repo (e.g. "username/repo-name")
 *   previousResponseId?: string - For multi-turn conversations
 * }
 */

interface EditRequest {
  instruction: string;
  repoFullName: string;
  previousResponseId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: EditRequest = await request.json();
    const { instruction, repoFullName, previousResponseId } = body;

    console.log("[Agent/Edit] Request received for repo:", repoFullName);

    // Validate input
    if (!instruction || instruction.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "Instruktion saknas" },
        { status: 400 }
      );
    }

    if (!repoFullName || !repoFullName.includes("/")) {
      return NextResponse.json(
        { success: false, error: "Ogiltigt repo-namn" },
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

    // Get full user data including GitHub token
    const fullUser = getUserById(user.id);
    if (!fullUser) {
      return NextResponse.json(
        { success: false, error: "Användare hittades inte" },
        { status: 404 }
      );
    }

    // Check if user has GitHub connected
    if (!fullUser.github_token || !fullUser.github_username) {
      return NextResponse.json(
        {
          success: false,
          error: "Du måste ansluta ditt GitHub-konto först",
          requireGitHub: true,
        },
        { status: 400 }
      );
    }

    // Verify user owns this repo (basic check)
    const [repoOwner] = repoFullName.split("/");
    if (repoOwner.toLowerCase() !== fullUser.github_username.toLowerCase()) {
      return NextResponse.json(
        {
          success: false,
          error: "Du kan bara redigera dina egna repos",
        },
        { status: 403 }
      );
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

    // Run the agent
    console.log(
      "[Agent/Edit] Running agent with instruction:",
      instruction.substring(0, 100)
    );

    const result = previousResponseId
      ? await continueConversation(
          instruction,
          {
            githubToken: fullUser.github_token,
            repoFullName,
          },
          previousResponseId
        )
      : await runAgent(instruction, {
          githubToken: fullUser.github_token,
          repoFullName,
        });

    if (!result.success) {
      console.error("[Agent/Edit] Agent failed:", result.message);
      // Note: Diamond already deducted, we don't refund on agent errors
      return NextResponse.json(
        {
          success: false,
          error: result.message,
        },
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
