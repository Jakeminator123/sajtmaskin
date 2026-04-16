import {
  buildDynamicInstructionAddendumFromBrief,
  buildDynamicInstructionAddendumFromPrompt,
  isOpenAIAssistModel,
  isPromptAssistModelAllowed,
  isPromptAssistOff,
  normalizeAssistModel,
  resolvePromptAssistProvider,
} from "@/lib/builder/promptAssist";
import { ASSIST_MODEL } from "@/lib/gen/defaults";
import { debugLog } from "@/lib/utils/debug";
import { useCallback } from "react";
import { toast } from "sonner";
import type { PromptAssistConfig, InitBriefOptions } from "./prompt-assist-types";
import {
  extractErrorMessage,
  isAbortError,
  promptAssistDebugFields,
  PROMPT_ASSIST_TIMEOUT_MS,
} from "./prompt-assist-utils";

const BRIEF_SOURCE_DYNAMIC_INSTRUCTIONS = "dynamic_instructions";

export function useInitBrief(params: PromptAssistConfig) {
  const { model, deep, imageGenerations, buildIntent, themeColors } = params;

  const generateDynamicInstructions = useCallback(
    async (originalPrompt: string, options: InitBriefOptions = {}): Promise<string> => {
      const normalizedModel = normalizeAssistModel(options.modelOverride ?? model);
      if (isPromptAssistOff(normalizedModel)) {
        debugLog("AI", "Prompt assist off – skipping dynamic instructions", {
          model: normalizedModel,
        });
        return buildDynamicInstructionAddendumFromPrompt({
          originalPrompt,
          imageGenerations,
          buildIntent,
          themeOverride: themeColors,
        });
      }
      if (!isPromptAssistModelAllowed(normalizedModel)) {
        toast.error("Ogiltig förbättra‑modell. Välj en giltig modell.");
        return buildDynamicInstructionAddendumFromPrompt({
          originalPrompt,
          imageGenerations,
          buildIntent,
          themeOverride: themeColors,
        });
      }

      const provider = resolvePromptAssistProvider(normalizedModel);
      const startedAt = Date.now();
      const resolvedOpenAIDeep = isOpenAIAssistModel(normalizedModel) ? deep : false;
      const useDeepBrief =
        !options.forceShallow &&
        (options.forceDeepBrief === true || resolvedOpenAIDeep);
      const briefUsesOpenAI =
        options.forceDeepBrief === true && !isOpenAIAssistModel(normalizedModel)
          ? true
          : provider !== "anthropic";
      const briefProvider = briefUsesOpenAI ? "openai" : "anthropic";
      const briefModel = briefUsesOpenAI
        ? isOpenAIAssistModel(normalizedModel)
          ? normalizedModel
          : normalizeAssistModel(ASSIST_MODEL)
        : normalizedModel;

      debugLog("AI", "Dynamic instructions started", {
        ...promptAssistDebugFields(provider),
        flow: useDeepBrief ? BRIEF_SOURCE_DYNAMIC_INSTRUCTIONS : "dynamic_instructions_prompt_only",
        briefProvider: useDeepBrief ? briefProvider : null,
        briefModel: useDeepBrief ? briefModel : null,
        model: normalizedModel,
        deep: useDeepBrief,
        imageGenerations,
        promptLength: originalPrompt.length,
      });

      if (!useDeepBrief) {
        return buildDynamicInstructionAddendumFromPrompt({
          originalPrompt,
          imageGenerations,
          buildIntent,
          themeOverride: themeColors,
        });
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), PROMPT_ASSIST_TIMEOUT_MS);
      try {
        const res = await fetch("/api/ai/brief", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            provider: briefProvider,
            model: briefModel,
            temperature: 0.2,
            prompt: originalPrompt,
            imageGenerations,
            source: BRIEF_SOURCE_DYNAMIC_INSTRUCTIONS,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => null);
          const msg =
            extractErrorMessage(err) ||
            `Dynamic instructions failed (HTTP ${res.status})`;
          throw new Error(String(msg));
        }

        const brief = (await res.json().catch(() => null)) as Record<string, unknown> | null;
        if (!brief || typeof brief !== "object") {
          throw new Error("Dynamic instructions returned invalid JSON");
        }

        if (options.onBrief) {
          try {
            options.onBrief(brief);
          } catch {
            // non-critical
          }
        }

        if (options.skipAddendum) {
          debugLog("AI", "Dynamic instructions completed (brief only, addendum skipped)", {
            durationMs: Date.now() - startedAt,
          });
          return "";
        }

        const addendum = buildDynamicInstructionAddendumFromBrief({
          brief,
          originalPrompt,
          imageGenerations,
          buildIntent,
          themeOverride: themeColors,
        });

        debugLog("AI", "Dynamic instructions completed", {
          durationMs: Date.now() - startedAt,
          outputLength: addendum.length,
        });

        return (
          addendum.trim() ||
          buildDynamicInstructionAddendumFromPrompt({
            originalPrompt,
            imageGenerations,
            buildIntent,
            themeOverride: themeColors,
          })
        );
      } catch (err) {
        const rawMessage = err instanceof Error ? err.message : "Dynamic instructions failed";
        const isAbort = isAbortError(err);
        const normalizedMessage = rawMessage.toLowerCase();
        const isParseError =
          normalizedMessage.includes("no object generated") ||
          normalizedMessage.includes("could not parse");

        debugLog("AI", "Dynamic instructions failed", {
          durationMs: Date.now() - startedAt,
          error: rawMessage,
        });

        return buildDynamicInstructionAddendumFromPrompt({
          originalPrompt,
          imageGenerations,
          buildIntent,
          themeOverride: themeColors,
        });
      } finally {
        clearTimeout(timeoutId);
      }
    },
    [model, deep, imageGenerations, buildIntent, themeColors],
  );

  return { generateDynamicInstructions };
}
