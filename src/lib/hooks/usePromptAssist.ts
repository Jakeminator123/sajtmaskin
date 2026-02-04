import {
  buildV0PromptFromBrief,
  buildV0RewriteSystemPrompt,
  buildDynamicInstructionAddendumFromBrief,
  buildDynamicInstructionAddendumFromPrompt,
  isGatewayAssistModel,
  isPromptAssistModelAllowed,
  normalizeAssistModel,
  resolvePromptAssistProvider,
} from "@/lib/builder/promptAssist";
import type { WebsiteSpec } from "@/lib/builder/promptAssistContext";
import { debugLog } from "@/lib/utils/debug";
import { useCallback } from "react";
import toast from "react-hot-toast";

type UsePromptAssistParams = {
  model: string;
  deep: boolean;
  imageGenerations: boolean;
  codeContext?: string | null;
};

// Token limits - these are defaults; the server can override via env
const PROMPT_ASSIST_MAX_TOKENS = 2200;
const BRIEF_ASSIST_MAX_TOKENS = 2600;

type PromptAssistOptions = {
  forceShallow?: boolean;
};

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

async function readTextResponse(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  out += decoder.decode();
  return out;
}

export function usePromptAssist(params: UsePromptAssistParams) {
  const { model, deep, imageGenerations, codeContext } = params;

  const maybeEnhanceInitialPrompt = useCallback(
    async (originalPrompt: string, options: PromptAssistOptions = {}): Promise<string> => {
      const normalizedModel = normalizeAssistModel(model);
      if (!isPromptAssistModelAllowed(normalizedModel)) {
        toast.error("Ogiltig förbättra‑modell. Välj en giltig modell.");
        return originalPrompt;
      }
      const provider = resolvePromptAssistProvider(normalizedModel);
      const systemPrompt = buildV0RewriteSystemPrompt({ codeContext });
      const startedAt = Date.now();
      const resolvedDeep = isGatewayAssistModel(normalizedModel) ? deep : false;
      const useDeep = resolvedDeep && !options.forceShallow;
      const originalNormalized = originalPrompt.trim();

      const applyGuardrails = (candidate: string, source: "brief" | "shallow"): string => {
        const enhanced = candidate.trim();
        if (!enhanced) {
          debugLog("AI", "Prompt assist guardrail fallback", { source, reason: "empty" });
          return originalPrompt;
        }
        if (enhanced.length < 20 && originalNormalized.length > 60) {
          debugLog("AI", "Prompt assist guardrail fallback", {
            source,
            reason: "too_short",
            originalLength: originalNormalized.length,
            enhancedLength: enhanced.length,
          });
          return originalPrompt;
        }
        if (enhanced.length < originalNormalized.length * 0.15 && originalNormalized.length > 120) {
          debugLog("AI", "Prompt assist guardrail fallback", {
            source,
            reason: "shrunk_too_much",
            originalLength: originalNormalized.length,
            enhancedLength: enhanced.length,
          });
          return originalPrompt;
        }
        if (hasSwedishChars(originalNormalized) && !hasSwedishChars(enhanced)) {
          debugLog("AI", "Prompt assist guardrail fallback", {
            source,
            reason: "language_mismatch",
          });
          return originalPrompt;
        }
        const overlap = computeOverlapRatio(originalNormalized, enhanced);
        if (overlap < 0.2 && originalNormalized.length > 80) {
          debugLog("AI", "Prompt assist guardrail fallback", {
            source,
            reason: "low_overlap",
            overlap,
          });
          return originalPrompt;
        }
        return enhanced;
      };

      debugLog("AI", "Prompt assist started", {
        provider,
        model: normalizedModel,
        deep: useDeep,
        imageGenerations,
        promptLength: originalPrompt.length,
      });

      const runShallow = async (): Promise<string> => {
        const controller = new AbortController();
        // Normal prompt assist: 7 minuter timeout för att hantera långsamma modeller
        const timeoutId = setTimeout(() => controller.abort(), 420_000);

        let res: Response;
        try {
          res = await fetch("/api/ai/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              provider,
              model: normalizedModel,
              temperature: 0.2,
              maxTokens: PROMPT_ASSIST_MAX_TOKENS,
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
            (err && typeof err === "object" && (err as any).error) ||
            `AI Assist failed (HTTP ${res.status})`;
          throw new Error(String(msg));
        }

        const enhanced = (await readTextResponse(res)).trim();
        debugLog("AI", "Prompt assist completed", {
          durationMs: Date.now() - startedAt,
          outputLength: enhanced.length,
        });
        toast.success("Prompt förbättrad", { id: "sajtmaskin:prompt-assist" });
        return applyGuardrails(enhanced, "shallow");
      };

      try {
        const loadingMsg = useDeep
          ? "Skapar detaljerad brief (kan ta 30-60s)..."
          : "Förbättrar prompt...";
        toast.loading(loadingMsg, { id: "sajtmaskin:prompt-assist" });

        if (useDeep) {
          try {
            const controller = new AbortController();
            // Deep brief kan ta lång tid med GPT-5, 7 minuter timeout
            const timeoutId = setTimeout(() => controller.abort(), 420_000);
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
                  maxTokens: BRIEF_ASSIST_MAX_TOKENS,
                  prompt: originalPrompt,
                  imageGenerations,
                }),
              });
            } finally {
              clearTimeout(timeoutId);
            }

            if (!briefRes.ok) {
              const err = await briefRes.json().catch(() => null);
              const msg =
                (err && typeof err === "object" && (err as any).error) ||
                `AI Assist failed (HTTP ${briefRes.status})`;
              throw new Error(String(msg));
            }

            const brief = (await briefRes.json().catch(() => null)) as any;
            if (!brief || typeof brief !== "object") {
              throw new Error("AI Assist brief returned invalid JSON");
            }

            const finalPrompt = buildV0PromptFromBrief({
              brief,
              originalPrompt,
              imageGenerations,
            });

            debugLog("AI", "Prompt assist completed (brief)", {
              durationMs: Date.now() - startedAt,
              outputLength: finalPrompt.length,
            });
            toast.success("Prompt förbättrad (brief)", { id: "sajtmaskin:prompt-assist" });
            return applyGuardrails(finalPrompt, "brief");
          } catch (err) {
            debugLog("AI", "Brief assist failed, falling back to shallow", {
              durationMs: Date.now() - startedAt,
              error: err instanceof Error ? err.message : "Unknown error",
            });
            return await runShallow();
          }
        }

        return await runShallow();
      } catch (err) {
        const rawMessage = err instanceof Error ? err.message : "AI Assist misslyckades";
        const isAbort = err instanceof Error && (err as any).name === "AbortError";
        const isFailedFetch = /Failed to fetch/i.test(rawMessage);
        const isGatewayTimeout =
          /headers timeout|gateway request failed|gatewayresponseerror/i.test(
            rawMessage.toLowerCase(),
          );

        debugLog("AI", "Prompt assist failed", {
          durationMs: Date.now() - startedAt,
          provider,
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
            return "AI Gateway tog för lång tid. Prova igen eller välj en snabbare modell.";
          }
          if (!isFailedFetch) return rawMessage;

          if (provider === "gateway") {
            return (
              "Kunde inte nå AI Gateway. Sätt AI_GATEWAY_API_KEY eller VERCEL_OIDC_TOKEN i .env.local (lokalt), " +
              "eller kör på Vercel för OIDC-autentisering."
            );
          }
          if (provider === "v0") return "Kunde inte nå v0 Model API. Sätt V0_API_KEY i .env.local.";
          return "Kunde inte nå AI Assist-endpointen. Kontrollera att servern kör.";
        })();

        toast.error(betterMessage, { id: "sajtmaskin:prompt-assist" });
        return originalPrompt;
      }
    },
    [model, deep, imageGenerations, codeContext],
  );

  const generateDynamicInstructions = useCallback(
    async (originalPrompt: string, options: PromptAssistOptions = {}): Promise<string> => {
      const normalizedModel = normalizeAssistModel(model);
      if (!isPromptAssistModelAllowed(normalizedModel)) {
        toast.error("Ogiltig förbättra‑modell. Välj en giltig modell.");
        return buildDynamicInstructionAddendumFromPrompt({
          originalPrompt,
          imageGenerations,
        });
      }

      const provider = resolvePromptAssistProvider(normalizedModel);
      const startedAt = Date.now();
      const resolvedDeep = isGatewayAssistModel(normalizedModel) ? deep : false;
      const useDeep = resolvedDeep && !options.forceShallow;

      debugLog("AI", "Dynamic instructions started", {
        provider,
        model: normalizedModel,
        deep: useDeep,
        imageGenerations,
        promptLength: originalPrompt.length,
      });

      if (!useDeep) {
        return buildDynamicInstructionAddendumFromPrompt({
          originalPrompt,
          imageGenerations,
        });
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 420_000);
      try {
        toast.loading("Skapar dynamiska instruktioner...", {
          id: "sajtmaskin:dynamic-instructions",
        });

        const res = await fetch("/api/ai/brief", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            provider,
            model: normalizedModel,
            temperature: 0.2,
            maxTokens: BRIEF_ASSIST_MAX_TOKENS,
            prompt: originalPrompt,
            imageGenerations,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => null);
          const msg =
            (err && typeof err === "object" && (err as any).error) ||
            `Dynamic instructions failed (HTTP ${res.status})`;
          throw new Error(String(msg));
        }

        const brief = (await res.json().catch(() => null)) as any;
        if (!brief || typeof brief !== "object") {
          throw new Error("Dynamic instructions returned invalid JSON");
        }

        const addendum = buildDynamicInstructionAddendumFromBrief({
          brief,
          originalPrompt,
          imageGenerations,
        });

        debugLog("AI", "Dynamic instructions completed", {
          durationMs: Date.now() - startedAt,
          outputLength: addendum.length,
        });

        toast.success("Instruktioner uppdaterade", {
          id: "sajtmaskin:dynamic-instructions",
        });

        return (
          addendum.trim() ||
          buildDynamicInstructionAddendumFromPrompt({
            originalPrompt,
            imageGenerations,
          })
        );
      } catch (err) {
        const rawMessage = err instanceof Error ? err.message : "Dynamic instructions failed";
        const isAbort = err instanceof Error && (err as any).name === "AbortError";
        const normalizedMessage = rawMessage.toLowerCase();
        const isParseError =
          normalizedMessage.includes("no object generated") ||
          normalizedMessage.includes("could not parse");

        debugLog("AI", "Dynamic instructions failed", {
          durationMs: Date.now() - startedAt,
          error: rawMessage,
        });

        if (isAbort) {
          toast.error("Instruktions‑generering tog för lång tid (timeout)", {
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
        });
      } finally {
        clearTimeout(timeoutId);
      }
    },
    [model, deep, imageGenerations],
  );

  /**
   * Generate a structured spec from the user prompt using the spec-first chain.
   * This uses AI to analyze the prompt and create a detailed specification
   * that results in higher quality code generation.
   *
   * @param originalPrompt - The user's original website request
   * @returns Object containing spec and enhanced prompt, or null on failure
   */
  const generateSpecFromPrompt = useCallback(
    async (
      originalPrompt: string,
    ): Promise<{ spec: WebsiteSpec; enhancedPrompt: string } | null> => {
      const startedAt = Date.now();

      debugLog("AI", "Spec-first chain started", {
        promptLength: originalPrompt.length,
      });

      try {
        toast.loading("Analyserar din förfrågan och skapar spec...", {
          id: "sajtmaskin:spec-first",
        });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60_000);

        let res: Response;
        try {
          res = await fetch("/api/ai/spec", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              prompt: originalPrompt,
            }),
          });
        } finally {
          clearTimeout(timeoutId);
        }

        if (!res.ok) {
          const err = await res.json().catch(() => null);
          const msg =
            (err && typeof err === "object" && (err as any).error) ||
            `Spec generation failed (HTTP ${res.status})`;
          throw new Error(String(msg));
        }

        const data = await res.json();
        if (!data.success || !data.spec || !data.enhancedPrompt) {
          throw new Error("Invalid spec response");
        }

        debugLog("AI", "Spec-first chain completed", {
          durationMs: Date.now() - startedAt,
          specPages: data.spec.pages?.length ?? 0,
          enhancedPromptLength: data.enhancedPrompt.length,
        });

        toast.success("Spec skapad - genererar kod...", { id: "sajtmaskin:spec-first" });

        return {
          spec: data.spec as WebsiteSpec,
          enhancedPrompt: data.enhancedPrompt as string,
        };
      } catch (err) {
        const rawMessage = err instanceof Error ? err.message : "Spec generation failed";
        const isAbort = err instanceof Error && (err as any).name === "AbortError";

        debugLog("AI", "Spec-first chain failed", {
          durationMs: Date.now() - startedAt,
          error: rawMessage,
        });

        if (isAbort) {
          toast.error("Spec-generering tog för lång tid (timeout)", {
            id: "sajtmaskin:spec-first",
          });
        } else {
          toast.error(`Spec-generering misslyckades: ${rawMessage}`, {
            id: "sajtmaskin:spec-first",
          });
        }

        return null;
      }
    },
    [],
  );

  return { maybeEnhanceInitialPrompt, generateSpecFromPrompt, generateDynamicInstructions };
}
