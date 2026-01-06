/**
 * useStreamingGeneration Hook
 * ===========================
 *
 * React hook för att hantera streaming generation från v0.
 * Visar thinking/reasoning, progress och partial results i realtid.
 */

import { useState, useCallback, useRef } from "react";
import type { QualityLevel } from "./api-client";
import type { GeneratedFile } from "./v0-generator";

// Event types from streaming API
export interface StreamEvent {
  type: "thinking" | "progress" | "code" | "complete" | "error";
  data: ThinkingData | ProgressData | CodeData | CompleteData | ErrorData;
}

export interface ThinkingData {
  text?: string;
  message?: string;
  step?: string;
}

export interface ProgressData {
  step: string;
  message: string;
  stepNumber?: number;
  totalSteps?: number;
}

export interface CodeData {
  partial: string;
}

export interface CompleteData {
  success: boolean;
  chatId: string;
  code: string;
  files: GeneratedFile[];
  demoUrl?: string;
  screenshotUrl?: string;
  versionId?: string;
  balance?: number;
  message: string;
}

export interface ErrorData {
  message: string;
  requireAuth?: boolean;
  requireCredits?: boolean;
  details?: string;
}

export interface StreamingState {
  isStreaming: boolean;
  thinking: string[];
  currentStep: string;
  stepMessage: string;
  currentStepNumber: number;
  totalSteps: number;
  partialCode: string;
  enhancedPrompt: string | null;
  result: CompleteData | null;
  error: ErrorData | null;
}

export interface UseStreamingGenerationOptions {
  onThinking?: (text: string) => void;
  onProgress?: (
    step: string,
    message: string,
    stepNumber?: number,
    totalSteps?: number
  ) => void;
  onEnhancement?: (original: string, enhanced: string) => void;
  onComplete?: (result: CompleteData) => void;
  onError?: (error: ErrorData) => void;
}

export function useStreamingGeneration(
  options: UseStreamingGenerationOptions = {}
) {
  const [state, setState] = useState<StreamingState>({
    isStreaming: false,
    thinking: [],
    currentStep: "",
    stepMessage: "",
    currentStepNumber: 0,
    totalSteps: 5,
    partialCode: "",
    enhancedPrompt: null,
    result: null,
    error: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const startGeneration = useCallback(
    async (params: {
      prompt: string;
      quality?: QualityLevel;
      existingChatId?: string;
      existingCode?: string;
      projectFiles?: GeneratedFile[];
    }) => {
      // Reset state
      setState({
        isStreaming: true,
        thinking: [],
        currentStep: "starting",
        stepMessage: "Startar...",
        currentStepNumber: 0,
        totalSteps: 5,
        partialCode: "",
        enhancedPrompt: null,
        result: null,
        error: null,
      });

      // Create abort controller for cancellation
      abortControllerRef.current = new AbortController();

      try {
        const response = await fetch("/api/orchestrate/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No response body");
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();

          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process complete events in buffer
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // Keep incomplete line in buffer

          let currentEvent = "";
          let currentData = "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              currentData = line.slice(6);

              // Process event inline to avoid circular dependency
              if (currentEvent && currentData) {
                try {
                  const data = JSON.parse(currentData);

                  // Handle different event types
                  switch (currentEvent) {
                    case "thinking": {
                      const thinkingData = data as ThinkingData;
                      const thought =
                        thinkingData.message || thinkingData.text || "";
                      if (thought) {
                        setState((prev) => ({
                          ...prev,
                          thinking: [...prev.thinking, thought],
                        }));
                        optionsRef.current.onThinking?.(thought);
                      }
                      break;
                    }
                    case "progress": {
                      const progressData = data as ProgressData;
                      setState((prev) => ({
                        ...prev,
                        currentStep: progressData.step || "",
                        stepMessage:
                          progressData.message || progressData.step || "",
                        currentStepNumber:
                          progressData.stepNumber || prev.currentStepNumber,
                        totalSteps: progressData.totalSteps || prev.totalSteps,
                      }));
                      optionsRef.current.onProgress?.(
                        progressData.step || "",
                        progressData.message || "",
                        progressData.stepNumber,
                        progressData.totalSteps
                      );
                      break;
                    }
                    case "enhancement": {
                      const enhancementData = data as {
                        original: string;
                        enhanced: string;
                      };
                      setState((prev) => ({
                        ...prev,
                        enhancedPrompt: enhancementData.enhanced,
                      }));
                      optionsRef.current.onEnhancement?.(
                        enhancementData.original,
                        enhancementData.enhanced
                      );
                      break;
                    }
                    case "code": {
                      const codeData = data as CodeData;
                      setState((prev) => ({
                        ...prev,
                        partialCode: prev.partialCode + codeData.partial,
                      }));
                      break;
                    }
                    case "complete": {
                      const completeData = data as CompleteData;
                      setState((prev) => ({
                        ...prev,
                        isStreaming: false,
                        result: completeData,
                      }));
                      optionsRef.current.onComplete?.(completeData);
                      break;
                    }
                    case "error": {
                      const errData = data as ErrorData;
                      setState((prev) => ({
                        ...prev,
                        isStreaming: false,
                        error: errData,
                      }));
                      optionsRef.current.onError?.(errData);
                      break;
                    }
                  }
                } catch {
                  console.warn(
                    "[Streaming] Failed to parse event:",
                    currentData
                  );
                }
                currentEvent = "";
                currentData = "";
              }
            }
          }
        }
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          console.log("[Streaming] Generation cancelled");
          return;
        }

        // Parse specific errors for better UX
        let userMessage = "Ett oväntat fel uppstod. Försök igen.";

        if (error instanceof Error) {
          const msg = error.message.toLowerCase();
          if (msg.includes("http 401") || msg.includes("unauthorized")) {
            userMessage = "Din session har gått ut. Ladda om sidan.";
          } else if (msg.includes("http 402") || msg.includes("payment")) {
            userMessage = "Du behöver fler diamanter för att fortsätta.";
          } else if (msg.includes("http 429") || msg.includes("rate")) {
            userMessage = "För många förfrågningar. Vänta en stund.";
          } else if (msg.includes("http 5") || msg.includes("server")) {
            userMessage = "Serverfel. Försök igen om en stund.";
          } else if (
            msg.includes("network") ||
            msg.includes("fetch") ||
            msg.includes("failed")
          ) {
            userMessage = "Nätverksfel. Kontrollera din anslutning.";
          }
        }

        const errorData: ErrorData = {
          message: userMessage,
        };

        setState((prev) => ({
          ...prev,
          isStreaming: false,
          error: errorData,
        }));

        optionsRef.current.onError?.(errorData);
      }
    },
    []
  );

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
    setState((prev) => ({
      ...prev,
      isStreaming: false,
    }));
  }, []);

  const reset = useCallback(() => {
    setState({
      isStreaming: false,
      thinking: [],
      currentStep: "",
      stepMessage: "",
      currentStepNumber: 0,
      totalSteps: 5,
      partialCode: "",
      enhancedPrompt: null,
      result: null,
      error: null,
    });
  }, []);

  return {
    ...state,
    startGeneration,
    cancel,
    reset,
  };
}
