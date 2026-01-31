import {
  buildV0PromptFromBrief,
  buildV0RewriteSystemPrompt,
  normalizeAssistModel,
  type PromptAssistProvider,
} from "@/lib/builder/promptAssist";
import { debugLog } from "@/lib/utils/debug";
import { useCallback } from "react";
import toast from "react-hot-toast";

type UsePromptAssistParams = {
  provider: PromptAssistProvider;
  model: string;
  deep: boolean;
  imageGenerations: boolean;
};

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
  const { provider, model, deep, imageGenerations } = params;

  const maybeEnhanceInitialPrompt = useCallback(
    async (originalPrompt: string): Promise<string> => {
      if (provider === "off") {
        debugLog("AI", "Prompt assist disabled", { reason: "provider=off" });
        return originalPrompt;
      }

      const normalizedModel = normalizeAssistModel(provider, model);
      const systemPrompt = buildV0RewriteSystemPrompt();
      const startedAt = Date.now();
      const resolvedDeep = provider === "gateway" ? deep : false;

      debugLog("AI", "Prompt assist started", {
        provider,
        model: normalizedModel,
        deep: resolvedDeep,
        imageGenerations,
        promptLength: originalPrompt.length,
      });

      try {
        const loadingMsg = resolvedDeep
          ? "Skapar detaljerad brief (kan ta 30-60s)..."
          : "Förbättrar prompt (AI Assist)...";
        toast.loading(loadingMsg, { id: "sajtmaskin:prompt-assist" });

        if (resolvedDeep) {
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
          return finalPrompt;
        }

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
        return enhanced.length > 0 ? enhanced : originalPrompt;
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
          deep: resolvedDeep,
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
          if (provider === "openai-compat") {
            return "Kunde inte nå v0 Model API. Sätt V0_API_KEY i .env.local.";
          }
          return "Kunde inte nå AI Assist-endpointen. Kontrollera att servern kör.";
        })();

        toast.error(betterMessage, { id: "sajtmaskin:prompt-assist" });
        return originalPrompt;
      }
    },
    [provider, model, deep, imageGenerations],
  );

  return { maybeEnhanceInitialPrompt };
}
