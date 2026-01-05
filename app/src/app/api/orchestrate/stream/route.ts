import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getUserById,
  deductDiamonds,
  isTestUser,
  canUserGenerate,
  canUserRefine,
  incrementDailyGenerations,
  incrementDailyRefines,
  DAILY_RATE_LIMITS,
} from "@/lib/database";
import { orchestrateWorkflowStreaming } from "@/lib/orchestrator-agent";
import type { QualityLevel } from "@/lib/api-client";

// Allow up to 5 minutes for complex workflows
export const maxDuration = 300;

/**
 * Streaming Orchestrator API Endpoint (SSE)
 * =========================================
 * 
 * Server-Sent Events endpoint for streaming orchestrator progress.
 * Returns events for:
 * - thinking: AI reasoning steps
 * - progress: Workflow progress updates
 * - code: Generated code chunks
 * - complete: Final result
 * - error: Error messages
 */

interface StreamingOrchestrateRequest {
  prompt: string;
  quality?: QualityLevel;
  existingChatId?: string;
  existingCode?: string;
  projectFiles?: Array<{ name: string; content: string }>;
  mediaLibrary?: Array<{ url: string; filename: string; description?: string }>;
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  // Helper to send SSE event
  const sendEvent = (
    controller: ReadableStreamDefaultController,
    eventType: string,
    data: unknown
  ) => {
    const event = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    controller.enqueue(encoder.encode(event));
  };

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const body: StreamingOrchestrateRequest = await request.json();
        const {
          prompt,
          quality = "standard",
          existingChatId,
          existingCode,
          projectFiles,
          mediaLibrary,
        } = body;

        if (!prompt || prompt.trim().length === 0) {
          sendEvent(controller, "error", { error: "Prompt saknas" });
          controller.close();
          return;
        }

        // Get current user
        const user = await getCurrentUser(request);
        if (!user) {
          sendEvent(controller, "error", {
            error: "Du måste vara inloggad",
            requireAuth: true,
          });
          controller.close();
          return;
        }

        // Get full user data
        const fullUser = getUserById(user.id);
        if (!fullUser) {
          sendEvent(controller, "error", { error: "Användare hittades inte" });
          controller.close();
          return;
        }

        // Check daily rate limits
        const isRefinement = !!(existingChatId && existingCode);
        const rateCheck = isRefinement
          ? canUserRefine(user.id)
          : canUserGenerate(user.id);

        if (!rateCheck.allowed) {
          const limit = isRefinement
            ? DAILY_RATE_LIMITS.refines
            : DAILY_RATE_LIMITS.generations;
          sendEvent(controller, "error", {
            error: `Dagsgräns nådd (${limit}/dag). Försök igen imorgon.`,
            rateLimited: true,
            remaining: 0,
            limit,
          });
          controller.close();
          return;
        }

        // Send initial thinking event
        sendEvent(controller, "thinking", {
          step: "start",
          message: "Analyserar din förfrågan...",
        });

        // Run orchestrator with streaming callbacks
        const result = await orchestrateWorkflowStreaming(
          prompt,
          {
            userId: user.id,
            quality,
            existingChatId,
            existingCode,
            projectFiles,
            mediaLibrary,
          },
          {
            onThinking: (thought: string) => {
              sendEvent(controller, "thinking", { message: thought });
            },
            onProgress: (step: string) => {
              sendEvent(controller, "progress", { step });
            },
          }
        );

        if (!result.success) {
          sendEvent(controller, "error", {
            error: result.error || "Orchestrator misslyckades",
          });
          controller.close();
          return;
        }

        // Calculate diamond cost based on intent
        const freeIntents = ["chat_response", "clarify"];
        const cheapIntents = ["image_only", "web_search_only", "code_only"];

        let diamondCost = 0;
        if (freeIntents.includes(result.intent || "")) {
          diamondCost = 0;
        } else if (cheapIntents.includes(result.intent || "")) {
          diamondCost = 1;
        } else {
          diamondCost = 2;
        }

        // Check and deduct credits
        if (
          diamondCost > 0 &&
          !isTestUser(fullUser) &&
          fullUser.diamonds < diamondCost
        ) {
          sendEvent(controller, "error", {
            error: `Du behöver ${diamondCost} diamanter. Du har ${fullUser.diamonds}.`,
            requireCredits: true,
          });
          controller.close();
          return;
        }

        let balance = fullUser.diamonds;
        if (diamondCost > 0) {
          const transaction = deductDiamonds(
            user.id,
            diamondCost,
            `Orchestrator: ${result.intent}`,
            "orchestrator"
          );
          balance = transaction?.balance_after ?? fullUser.diamonds;
        }

        // Increment daily usage
        const codeIntents = [
          "code_only",
          "simple_code",
          "image_and_code",
          "web_search_and_code",
          "needs_code_context",
        ];
        if (codeIntents.includes(result.intent || "")) {
          if (isRefinement) {
            incrementDailyRefines(user.id);
          } else {
            incrementDailyGenerations(user.id);
          }
        }

        // Send complete event with full result
        sendEvent(controller, "complete", {
          success: true,
          message: result.message,
          intent: result.intent,
          code: result.code,
          files: result.files,
          chatId: result.chatId,
          demoUrl: result.demoUrl,
          screenshotUrl: result.screenshotUrl,
          versionId: result.versionId,
          webSearchResults: result.webSearchResults,
          generatedImages: result.generatedImages,
          workflowSteps: result.workflowSteps,
          clarifyQuestion: result.clarifyQuestion,
          chatResponse: result.chatResponse,
          balance,
        });

        controller.close();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        console.error("[API:Orchestrate:Stream] Error:", error);
        sendEvent(controller, "error", { error: errorMessage });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
