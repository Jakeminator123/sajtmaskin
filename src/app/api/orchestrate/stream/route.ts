import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import {
  getUserById,
  getProjectById,
  deductDiamonds,
  isTestUser,
  canUserGenerate,
  canUserRefine,
  incrementDailyGenerations,
  incrementDailyRefines,
  DAILY_RATE_LIMITS,
  saveProjectData,
  saveProjectFilesToDb,
} from "@/lib/data/database";
import { deleteCache } from "@/lib/data/redis";
import { orchestrateWorkflowStreaming } from "@/lib/ai/orchestrator-agent";
import { logSSE } from "@/lib/utils/file-logger";
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
  projectId?: string;
  projectFiles?: Array<{ name: string; content: string }>;
  mediaLibrary?: Array<{ url: string; filename: string; description?: string }>;
  categoryType?: string;
  previousClarify?: {
    originalPrompt: string;
    clarifyQuestion: string;
    userResponse: string;
  };
}

async function persistResultToProject(opts: {
  projectId: string;
  userId: string;
  result: {
    chatId?: string | null;
    demoUrl?: string | null;
    code?: string | null;
    files?: Array<{ name?: string; content?: string }> | null;
  };
}): Promise<void> {
  const { projectId, userId, result } = opts;
  const project = getProjectById(projectId);
  if (!project) return;

  // Only allow saving to user's own project (or unowned projects)
  if (project.user_id && project.user_id !== userId) return;

  const files = Array.isArray(result.files)
    ? (result.files
        .map((f) => {
          const name = typeof f?.name === "string" ? f.name : null;
          const content = typeof f?.content === "string" ? f.content : null;
          if (!name || !content) return null;
          return { name, content };
        })
        .filter(Boolean) as Array<{ name: string; content: string }>)
    : [];

  saveProjectData({
    project_id: projectId,
    chat_id: result.chatId || undefined,
    demo_url: result.demoUrl || undefined,
    current_code: result.code || undefined,
    files,
    messages: [],
  });

  if (files.length > 0) {
    saveProjectFilesToDb(
      projectId,
      files.map((f) => ({
        path: f.name,
        content: f.content,
        mime_type: "text/plain",
      }))
    );
  }

  await Promise.all([
    deleteCache(`project:${projectId}`),
    deleteCache("projects:list"),
  ]);
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  // Track controller state to prevent "Controller is already closed" errors
  let isControllerClosed = false;

  // Helper to check if controller is still writable
  const isControllerOpen = (
    controller: ReadableStreamDefaultController
  ): boolean => {
    if (isControllerClosed) return false;
    // desiredSize is null when the stream is closed or errored
    try {
      return controller.desiredSize !== null;
    } catch {
      return false;
    }
  };

  // Helper to safely send SSE event (guards against closed controller)
  const sendEvent = (
    controller: ReadableStreamDefaultController,
    eventType: string,
    data: unknown
  ) => {
    if (!isControllerOpen(controller)) {
      // Silent skip - client disconnected, this is normal behavior
      return;
    }
    try {
      const event = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
      controller.enqueue(encoder.encode(event));
    } catch {
      // Controller was closed between our check and the enqueue - this is fine
      isControllerClosed = true;
    }
  };

  // Helper to safely close controller
  const safeClose = (controller: ReadableStreamDefaultController) => {
    if (isControllerClosed) return;
    try {
      controller.close();
    } catch {
      // Already closed - this is fine
    }
    isControllerClosed = true;
  };

  const stream = new ReadableStream({
    cancel() {
      // Called when client disconnects - mark as closed so callbacks stop sending
      isControllerClosed = true;
    },
    async start(controller) {
      const startTime = Date.now();
      let eventCount = 0;

      // Log SSE start
      logSSE({ event: "start" });

      try {
        const body: StreamingOrchestrateRequest = await request.json();
        const {
          prompt,
          quality = "standard",
          existingChatId,
          existingCode,
          projectId,
          projectFiles,
          mediaLibrary,
          categoryType,
          previousClarify,
        } = body;

        if (!prompt || prompt.trim().length === 0) {
          sendEvent(controller, "error", { error: "Prompt saknas" });
          safeClose(controller);
          return;
        }

        // Get current user
        const user = await getCurrentUser(request);
        if (!user) {
          sendEvent(controller, "error", {
            error: "Du måste vara inloggad",
            requireAuth: true,
          });
          safeClose(controller);
          return;
        }

        // Get full user data
        const fullUser = getUserById(user.id);
        if (!fullUser) {
          sendEvent(controller, "error", { error: "Användare hittades inte" });
          safeClose(controller);
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
          safeClose(controller);
          return;
        }

        // Send initial thinking event
        sendEvent(controller, "thinking", {
          step: "start",
          message: "Analyserar din förfrågan...",
        });

        // Start heartbeat interval to keep connection alive during long v0 generations
        // Browsers and proxies often close connections after 30-60 seconds of inactivity
        const HEARTBEAT_INTERVAL_MS = 15 * 1000; // 15 seconds
        const heartbeatInterval = setInterval(() => {
          sendEvent(controller, "heartbeat", { timestamp: Date.now() });
        }, HEARTBEAT_INTERVAL_MS);

        // Run orchestrator with streaming callbacks (AI SDK 6)
        let result;
        try {
          result = await orchestrateWorkflowStreaming(
            prompt,
            {
              userId: user.id,
              quality,
              existingChatId,
              existingCode,
              projectFiles,
              mediaLibrary,
              categoryType,
              previousClarify,
            },
            {
              onThinking: (thought: string) => {
                sendEvent(controller, "thinking", { message: thought });
              },
              onProgress: (
                step: string,
                stepNumber?: number,
                totalSteps?: number
              ) => {
                sendEvent(controller, "progress", {
                  step,
                  message: step,
                  stepNumber,
                  totalSteps,
                });
              },
              onEnhancement: (original: string, enhanced: string) => {
                sendEvent(controller, "enhancement", { original, enhanced });
              },
            }
          );
        } finally {
          // Always clear heartbeat interval when done
          clearInterval(heartbeatInterval);
        }

        if (!result.success) {
          sendEvent(controller, "error", {
            error: result.error || "Orchestrator misslyckades",
          });
          safeClose(controller);
          return;
        }

        // Persist result to project even if the streaming client disconnects.
        // This prevents the UI from getting stuck when the SSE connection closes early.
        if (projectId && result.chatId && result.demoUrl) {
          try {
            await persistResultToProject({
              projectId,
              userId: user.id,
              result: {
                chatId: result.chatId,
                demoUrl: result.demoUrl,
                code: result.code || null,
                files:
                  (result.files as Array<{
                    name?: string;
                    content?: string;
                  }>) || null,
              },
            });
          } catch (e) {
            console.error("[Stream] Failed to persist project result:", e);
          }
        }

        // Calculate diamond cost based on intent
        const freeIntents = ["chat_response", "clarify"];
        const cheapIntents = [
          "image_gen",
          "web_search",
          "simple_code",
          "needs_code_context",
        ];

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
          safeClose(controller);
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
          "simple_code",
          "needs_code_context",
          "image_and_code",
          "web_and_code",
        ];
        if (codeIntents.includes(result.intent || "")) {
          if (isRefinement) {
            incrementDailyRefines(user.id);
          } else {
            incrementDailyGenerations(user.id);
          }
        }

        // Send complete event with full result
        eventCount++;
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

        // Log SSE completion
        logSSE({
          event: "complete",
          durationMs: Date.now() - startTime,
          eventCount,
        });

        safeClose(controller);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        console.error("[API:Orchestrate:Stream] Error:", error);
        sendEvent(controller, "error", { error: errorMessage });

        // Log SSE error
        logSSE({
          event: "error",
          durationMs: Date.now() - startTime,
          errorMessage,
        });

        safeClose(controller);
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
