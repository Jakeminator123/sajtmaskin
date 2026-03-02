import { useCallback, useEffect, useRef } from "react";
import type { AutoFixPayload, MessageOptions } from "./types";
import { buildAutoFixPrompt } from "./helpers";

const MAX_ATTEMPTS_PER_KEY = 2;
const DEDUPE_TTL_MS = 5 * 60 * 1000;

type AttemptEntry = { count: number; ts: number };

function makeDedupeKey(payload: AutoFixPayload): string {
  const reasonHash = payload.reasons.slice().sort().join("|");
  return `${payload.chatId}:${payload.versionId}:${reasonHash}`;
}

function pruneStale(map: Record<string, AttemptEntry>, now: number) {
  for (const key of Object.keys(map)) {
    if (now - map[key].ts > DEDUPE_TTL_MS) {
      delete map[key];
    }
  }
}

export function useAutoFix(
  sendMessage: (messageText: string, options?: MessageOptions) => Promise<void>,
) {
  const autoFixAttemptsRef = useRef<Record<string, AttemptEntry>>({});
  const autoFixHandlerRef = useRef<(payload: AutoFixPayload) => void>(() => {});

  const handleAutoFix = useCallback(
    (payload: AutoFixPayload) => {
      const now = Date.now();
      pruneStale(autoFixAttemptsRef.current, now);

      const key = makeDedupeKey(payload);
      const entry = autoFixAttemptsRef.current[key];
      const attempts = entry?.count ?? 0;
      if (attempts >= MAX_ATTEMPTS_PER_KEY) return;

      autoFixAttemptsRef.current[key] = { count: attempts + 1, ts: now };

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
