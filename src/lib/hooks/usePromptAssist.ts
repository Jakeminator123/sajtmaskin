import {
  buildV0PromptFromBrief,
  buildV0RewriteSystemPrompt,
  normalizeAssistModel,
  type PromptAssistProvider,
} from "@/lib/builder/promptAssist";
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
      if (provider === "off") return originalPrompt;

      const normalizedModel = normalizeAssistModel(provider, model);
      const systemPrompt = buildV0RewriteSystemPrompt();

      try {
        const loadingMsg = deep
          ? "Skapar detaljerad brief (kan ta 30-60s)..."
          : "Förbättrar prompt (AI Assist)...";
        toast.loading(loadingMsg, { id: "sajtmaskin:prompt-assist" });

        if (deep) {
          const controller = new AbortController();
          // Deep brief kan ta lång tid med GPT-5, 5 minuter timeout
          const timeoutId = setTimeout(() => controller.abort(), 300_000);
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

          toast.success("Prompt förbättrad (brief)", { id: "sajtmaskin:prompt-assist" });
          return finalPrompt;
        }

        const controller = new AbortController();
        // Normal prompt assist: 5 minuter timeout för att hantera långsamma modeller
        const timeoutId = setTimeout(() => controller.abort(), 300_000);

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
        toast.success("Prompt förbättrad", { id: "sajtmaskin:prompt-assist" });
        return enhanced.length > 0 ? enhanced : originalPrompt;
      } catch (err) {
        console.error("Prompt assist error:", err);

        const rawMessage = err instanceof Error ? err.message : "AI Assist misslyckades";
        const isAbort = err instanceof Error && (err as any).name === "AbortError";
        const isFailedFetch = /Failed to fetch/i.test(rawMessage);

        const betterMessage = (() => {
          if (isAbort) return "AI Assist tog för lång tid (timeout).";
          if (!isFailedFetch) return rawMessage;

          if (provider === "gateway") {
            return (
              "Kunde inte nå AI Gateway. Sätt AI_GATEWAY_API_KEY i .env.local (lokalt), " +
              "eller kör på Vercel för OIDC-autentisering."
            );
          }
          if (provider === "vercel") {
            return "Kunde inte nå v0 Model API. Kontrollera att V0_API_KEY eller VERCEL_API_KEY är satt.";
          }
          if (provider === "openai") {
            return "Kunde inte nå OpenAI. Kontrollera att OPENAI_API_KEY är satt och giltig.";
          }
          if (provider === "anthropic") {
            return "Kunde inte nå Anthropic. Kontrollera att ANTHROPIC_API_KEY är satt och giltig.";
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
