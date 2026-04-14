import {
  buildPromptFromBrief,
  buildPolishSystemPrompt,
  buildRewriteSystemPrompt,
  isGatewayAssistModel,
  isPromptAssistModelAllowed,
  isPromptAssistOff,
  normalizeAssistModel,
  resolvePromptAssistProvider,
} from "@/lib/builder/promptAssist";
import { DEFAULT_PROMPT_POLISH_MODEL } from "@/lib/builder/defaults";
import { debugLog } from "@/lib/utils/debug";
import { useCallback } from "react";
import { toast } from "sonner";
import type { PromptAssistConfig, PromptAssistMode, PromptRewriteOptions } from "./prompt-assist-types";
import {
  extractErrorMessage,
  isAbortError,
  readStreamText,
  computeOverlapRatio,
  hasSwedishChars,
  promptAssistDebugFields,
  PROMPT_ASSIST_TIMEOUT_MS,
} from "./prompt-assist-utils";

type UsePromptRewriteParams = PromptAssistConfig & {
  codeContext?: string | null;
};

// maxTokens is intentionally NOT sent from the client.
// The model uses its own maximum when omitted, avoiding validation failures when the cap is lower than expected.
const BRIEF_SOURCE_DEEP_PROMPT_ASSIST = "deep_prompt_assist";

export function usePromptRewrite(params: UsePromptRewriteParams) {
  const { model, deep, imageGenerations, codeContext, buildIntent, themeColors } = params;

  const maybeEnhanceInitialPrompt = useCallback(
    async (originalPrompt: string, options: PromptRewriteOptions = {}): Promise<string> => {
      const mode: PromptAssistMode = options.mode ?? "rewrite";
      const polishModelOverride = mode === "polish" ? DEFAULT_PROMPT_POLISH_MODEL : undefined;
      const normalizedModel = normalizeAssistModel(options.modelOverride ?? polishModelOverride ?? model);
      if (isPromptAssistOff(normalizedModel)) {
        debugLog("AI", "Prompt assist off – skipping", { model: normalizedModel });
        return originalPrompt;
      }
      if (!isPromptAssistModelAllowed(normalizedModel)) {
        toast.error("Ogiltig förbättra‑modell. Välj en giltig modell.");
        return originalPrompt;
      }
      const provider = resolvePromptAssistProvider(normalizedModel);
      const wantsEnglish =
        options.forceEnglish ??
        /\b(english|in english|på engelska|engelska)\b/i.test(originalPrompt);
      const systemPrompt =
        mode === "polish"
          ? buildPolishSystemPrompt({ buildIntent, forceEnglish: wantsEnglish })
          : buildRewriteSystemPrompt({ codeContext, buildIntent });
      const startedAt = Date.now();
      const resolvedDeep = isGatewayAssistModel(normalizedModel) ? deep : false;
      const allowDeep = mode !== "polish";
      const useDeep = allowDeep && resolvedDeep && !options.forceShallow;
      const originalNormalized = originalPrompt.trim();

      const applyGuardrails = (
        candidate: string,
        source: "brief" | "shallow",
        allowLanguageSwitch: boolean,
      ): string => {
        const guardFallback = (reason: string, extra?: Record<string, unknown>): string => {
          debugLog("AI", "Prompt assist guardrail fallback", { source, reason, ...extra });
          toast("Prompten skickades oförändrad (guardrail).", {
            id: "sajtmaskin:prompt-assist-guardrail",
            icon: "ℹ️",
          });
          return originalPrompt;
        };

        const enhanced = candidate.trim();
        if (!enhanced) {
          return guardFallback("empty");
        }
        if (enhanced.length < 20 && originalNormalized.length > 60) {
          return guardFallback("too_short", {
            originalLength: originalNormalized.length,
            enhancedLength: enhanced.length,
          });
        }
        const minLengthRatio = mode === "polish" ? 0.65 : 0.15;
        if (enhanced.length < originalNormalized.length * minLengthRatio && originalNormalized.length > 120) {
          return guardFallback("shrunk_too_much", {
            originalLength: originalNormalized.length,
            enhancedLength: enhanced.length,
          });
        }
        const maxLengthRatio = mode === "polish" ? 1.45 : 999;
        if (
          mode === "polish" &&
          originalNormalized.length > 80 &&
          enhanced.length > originalNormalized.length * maxLengthRatio
        ) {
          return guardFallback("grew_too_much", {
            originalLength: originalNormalized.length,
            enhancedLength: enhanced.length,
          });
        }
        if (
          source !== "brief" &&
          hasSwedishChars(originalNormalized) &&
          !hasSwedishChars(enhanced) &&
          !allowLanguageSwitch
        ) {
          return guardFallback("language_mismatch");
        }
        const overlap = computeOverlapRatio(originalNormalized, enhanced);
        const minOverlap = mode === "polish" ? 0.55 : 0.2;
        if (overlap < minOverlap && originalNormalized.length > 80) {
          return guardFallback("low_overlap", { overlap });
        }
        return enhanced;
      };

      debugLog("AI", "Prompt assist started", {
        ...promptAssistDebugFields(provider),
        mode,
        flow: useDeep ? BRIEF_SOURCE_DEEP_PROMPT_ASSIST : `${mode}_shallow`,
        model: normalizedModel,
        deep: useDeep,
        imageGenerations,
        promptLength: originalPrompt.length,
      });

      const runShallow = async (): Promise<string> => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), PROMPT_ASSIST_TIMEOUT_MS);

        let res: Response;
        try {
          res = await fetch("/api/ai/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              provider,
              model: normalizedModel,
              temperature: mode === "polish" ? 0.1 : 0.2,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: originalPrompt },
              ],
            }),
          });
        } finally {
          clearTimeout(timeoutId);
        }

        if (!res.ok) {
          const err = await res.json().catch(() => null);
          const msg =
            extractErrorMessage(err) ||
            `AI Assist failed (HTTP ${res.status})`;
          throw new Error(String(msg));
        }

        const enhanced = (await readStreamText(res)).trim();
        debugLog("AI", "Prompt assist completed", {
          durationMs: Date.now() - startedAt,
          outputLength: enhanced.length,
        });
        toast.success(mode === "polish" ? "Prompt rättad" : "Prompt förbättrad", {
          id: "sajtmaskin:prompt-assist",
        });
        return applyGuardrails(enhanced, "shallow", Boolean(wantsEnglish));
      };

      try {
        const loadingMsg = useDeep
          ? "Skapar detaljerad brief (kan ta 30-60s)..."
          : mode === "polish"
            ? "Rättar prompt..."
            : "Förbättrar prompt...";
        toast.loading(loadingMsg, { id: "sajtmaskin:prompt-assist" });

        if (useDeep && allowDeep) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), PROMPT_ASSIST_TIMEOUT_MS);
            let briefRes: Response;
            try {
              briefRes = await fetch("/api/ai/brief", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                signal: controller.signal,
                body: JSON.stringify({
                  provider,
                  model: normalizedModel,
                  temperature: 0.2,
                  prompt: originalPrompt,
                  imageGenerations,
                  source: BRIEF_SOURCE_DEEP_PROMPT_ASSIST,
                }),
              });
            } finally {
              clearTimeout(timeoutId);
            }

            if (!briefRes.ok) {
              const err = await briefRes.json().catch(() => null);
              const msg =
                extractErrorMessage(err) ||
                `AI Assist failed (HTTP ${briefRes.status})`;
              throw new Error(String(msg));
            }

            const brief = (await briefRes.json().catch(() => null)) as Record<string, unknown> | null;
            if (!brief || typeof brief !== "object") {
              throw new Error("AI Assist brief returned invalid JSON");
            }

            const finalPrompt = buildPromptFromBrief({
              brief,
              originalPrompt,
              imageGenerations,
              buildIntent,
              themeOverride: themeColors,
            });

            debugLog("AI", "Prompt assist completed (deep brief -> build prompt)", {
              durationMs: Date.now() - startedAt,
              outputLength: finalPrompt.length,
            });
            toast.success("Prompt förbättrad (brief)", { id: "sajtmaskin:prompt-assist" });
            return applyGuardrails(finalPrompt, "brief", Boolean(wantsEnglish));
          } catch (err) {
            debugLog("AI", "Deep brief failed; falling back to shallow prompt assist", {
              durationMs: Date.now() - startedAt,
              error: err instanceof Error ? err.message : "Unknown error",
            });
            toast("Deep brief misslyckades, använde enkel förbättring istället.", {
              id: "sajtmaskin:prompt-assist",
              icon: "⚠️",
            });
            return await runShallow();
          }
        }

        return await runShallow();
      } catch (err) {
        const rawMessage = err instanceof Error ? err.message : "AI Assist misslyckades";
        const isAbort = isAbortError(err);
        const isFailedFetch = /Failed to fetch/i.test(rawMessage);
        const isGatewayTimeout =
          /headers timeout|gateway request failed|gatewayresponseerror/i.test(
            rawMessage.toLowerCase(),
          );

        debugLog("AI", "Prompt assist failed", {
          durationMs: Date.now() - startedAt,
          ...promptAssistDebugFields(provider),
          model: normalizedModel,
          deep: useDeep,
          error: rawMessage,
        });

        if (isAbort) {
          console.warn("Prompt assist timeout:", err);
        } else {
          console.error("Prompt assist error:", err);
        }

        const betterMessage = (() => {
          if (isAbort) return "AI Assist tog för lång tid (timeout).";
          if (isGatewayTimeout) {
            return "Prompt-assist-anropet tog för lång tid. Prova igen eller välj en snabbare modell.";
          }
          if (!isFailedFetch) return rawMessage;

          if (provider === "gateway") {
            return "Kunde inte nå OpenAI för prompt-assist. Sätt OPENAI_API_KEY i .env.local (eller motsvarande i Vercel).";
          }
          if (provider === "anthropic") {
            return "Kunde inte nå Anthropic för prompt-assist. Sätt ANTHROPIC_API_KEY i .env.local (eller motsvarande i Vercel).";
          }
          return "Kunde inte nå AI Assist-endpointen. Kontrollera att servern kör.";
        })();

        toast.error(betterMessage, { id: "sajtmaskin:prompt-assist" });
        return originalPrompt;
      }
    },
    [model, deep, imageGenerations, codeContext, buildIntent, themeColors],
  );

  return { maybeEnhanceInitialPrompt };
}
