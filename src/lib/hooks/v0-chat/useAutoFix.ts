import { useCallback, useEffect, useRef } from "react";
import type { AutoFixPayload, MessageOptions } from "./types";
import { buildAutoFixPrompt } from "./helpers";

export function useAutoFix(
  sendMessage: (messageText: string, options?: MessageOptions) => Promise<void>,
) {
  const autoFixAttemptsRef = useRef<Record<string, number>>({});
  const autoFixHandlerRef = useRef<(payload: AutoFixPayload) => void>(() => {});

  const handleAutoFix = useCallback(
    (payload: AutoFixPayload) => {
      const attemptKey = payload.chatId;
      const attempts = autoFixAttemptsRef.current[attemptKey] ?? 0;
      if (attempts >= 2) return;
      autoFixAttemptsRef.current[attemptKey] = attempts + 1;

      const prompt = buildAutoFixPrompt(payload);
      const delayMs = attempts === 0 ? 1500 : 4000;
      setTimeout(() => {
        void sendMessage(prompt);
      }, delayMs);
    },
    [sendMessage],
  );

  useEffect(() => {
    autoFixHandlerRef.current = handleAutoFix;
  });

  useEffect(() => {
    const handler = (event: Event) => {
      const payload = (event as CustomEvent<AutoFixPayload>).detail;
      if (!payload?.chatId || !payload?.versionId) return;
      handleAutoFix(payload);
    };
    window.addEventListener("sajtmaskin:auto-fix", handler as EventListener);
    return () => window.removeEventListener("sajtmaskin:auto-fix", handler as EventListener);
  }, [handleAutoFix]);

  return { autoFixHandlerRef };
}
