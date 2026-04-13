import {
  buildPromptFromBrief,
  buildPolishSystemPrompt,
  buildRewriteSystemPrompt,
  buildDynamicInstructionAddendumFromBrief,
  buildDynamicInstructionAddendumFromPrompt,
  isGatewayAssistModel,
  isPromptAssistModelAllowed,
  isPromptAssistOff,
  normalizeAssistModel,
  resolvePromptAssistProvider,
  type PromptAssistProvider,
} from "@/lib/builder/promptAssist";
import { DEFAULT_PROMPT_POLISH_MODEL } from "@/lib/builder/defaults";
import { ASSIST_MODEL } from "@/lib/gen/defaults";
import type { ThemeColors } from "@/lib/builder/theme-presets";
import type { BuildIntent } from "@/lib/builder/build-intent";
import { debugLog } from "@/lib/utils/debug";
import { useCallback } from "react";
import { toast } from "sonner";

function extractErrorMessage(value: unknown): string | null {
  if (value && typeof value === "object" && "error" in value) {
    const msg = (value as Record<string, unknown>).error;
    return typeof msg === "string" ? msg : null;
  }
  return null;
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

type UsePromptAssistParams = {
  model: string;
  deep: boolean;
  imageGenerations: boolean;
  codeContext?: string | null;
  buildIntent?: BuildIntent;
  themeColors?: ThemeColors | null;
};

// maxTokens is intentionally NOT sent from the client.
// The model uses its own maximum when omitted, avoiding validation failures when the cap is lower than expected.
// 10 minutes to accommodate slow models or upstream delays
const PROMPT_ASSIST_TIMEOUT_MS = 600_000;
const BRIEF_SOURCE_DEEP_PROMPT_ASSIST = "deep_prompt_assist";
const BRIEF_SOURCE_DYNAMIC_INSTRUCTIONS = "dynamic_instructions";

type PromptAssistMode = "rewrite" | "polish";

export type PromptAssistOptions = {
  forceShallow?: boolean;
  /** First-chat path: always run structured brief (OpenAI brief path + ASSIST_MODEL if assist tier is non–OpenAI-class). */
  forceDeepBrief?: boolean;
  /** When true the brief object is fetched but the expensive addendum string is not built. Use for init where only `onBrief` matters. */
  skipAddendum?: boolean;
  mode?: PromptAssistMode;
  forceEnglish?: boolean;
  modelOverride?: string;
  /** Called with the raw brief object when deep brief is generated (for spec file) */
  onBrief?: (brief: Record<string, unknown>) => void;
};

/**
 * Internal `PromptAssistProvider` still uses the label `"gateway"` for OpenAI-class models.
 * Server routes call OpenAI/Anthropic directly (`createDirectModel` + API keys).
 */
function promptAssistDebugFields(provider: PromptAssistProvider) {
  const directProvider = provider === "gateway" ? "openai" : "anthropic";
  return {
    provider: directProvider,
    transport: "direct_provider_api" as const,
    sdk: "ai" as const,
    ...(provider === "gateway" ? { internalProviderLabel: "gateway" as const } : {}),
  };
}

const STOPWORDS = new Set([
  "och",
  "att",
  "som",
  "det",
  "den",
  "detta",
  "med",
  "for",
  "the",
  "and",
  "you",
  "your",
  "this",
  "that",
  "from",
  "into",
  "with",
  "utan",
  "inte",
  "ska",
  "måste",
  "will",
]);

function extractTokens(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9åäö]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !STOPWORDS.has(token));
}

function computeOverlapRatio(original: string, enhanced: string): number {
  const originalTokens = extractTokens(original);
  const enhancedTokens = extractTokens(enhanced);
  if (originalTokens.length < 6) return 1;
  const originalSet = new Set(originalTokens);
  let overlap = 0;
  enhancedTokens.forEach((token) => {
    if (originalSet.has(token)) overlap += 1;
  });
  return overlap / Math.max(1, originalSet.size);
}

function hasSwedishChars(value: string): boolean {
  return /[åäö]/i.test(value);
}

async function readStreamText(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return text;
}

export function usePromptAssist(params: UsePromptAssistParams) {
  const { model, deep, imageGenerations, codeContext, buildIntent, themeColors } = params;

  const maybeEnhanceInitialPrompt = useCallback(
    async (originalPrompt: string, options: PromptAssistOptions = {}): Promise<string> => {
      const mode = options.mode ?? "rewrite";
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
        // Normal prompt assist: längre timeout för att hantera långsamma modeller
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
            // Deep brief kan ta lång tid med GPT-5, längre timeout
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

  const generateDynamicInstructions = useCallback(
    async (originalPrompt: string, options: PromptAssistOptions = {}): Promise<string> => {
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
      const resolvedGatewayDeep = isGatewayAssistModel(normalizedModel) ? deep : false;
      const useDeepBrief =
        !options.forceShallow &&
        (options.forceDeepBrief === true || resolvedGatewayDeep);
      const briefUsesGateway =
        options.forceDeepBrief === true && !isGatewayAssistModel(normalizedModel)
          ? true
          : provider !== "anthropic";
      const briefProvider = briefUsesGateway ? "gateway" : "anthropic";
      const briefModel = briefUsesGateway
        ? isGatewayAssistModel(normalizedModel)
          ? normalizedModel
          : normalizeAssistModel(ASSIST_MODEL)
        : normalizedModel;

      debugLog("AI", "Dynamic instructions started", {
        ...promptAssistDebugFields(provider),
        flow: useDeepBrief ? BRIEF_SOURCE_DYNAMIC_INSTRUCTIONS : "dynamic_instructions_prompt_only",
        briefProvider: useDeepBrief ? (briefProvider === "gateway" ? "openai" : "anthropic") : null,
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
        toast.loading("Skapar brief och dynamiska instruktioner innan own-engine startar...", {
          id: "sajtmaskin:dynamic-instructions",
        });

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
          toast.success("Brief klar — own-engine kan starta.", {
            id: "sajtmaskin:dynamic-instructions",
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

        toast.success("Brief klar — own-engine kan starta.", {
          id: "sajtmaskin:dynamic-instructions",
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

        if (isAbort) {
          toast.error("Brief/instruktions-generering tog för lång tid (timeout)", {
            id: "sajtmaskin:dynamic-instructions",
          });
        } else if (isParseError) {
          toast("Instruktions‑generering misslyckades, använder snabbare variant.", {
            id: "sajtmaskin:dynamic-instructions",
            icon: "⚠️",
          });
        } else {
          toast.error(`Instruktions‑generering misslyckades: ${rawMessage}`, {
            id: "sajtmaskin:dynamic-instructions",
          });
        }

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

  return { maybeEnhanceInitialPrompt, generateDynamicInstructions };
}
