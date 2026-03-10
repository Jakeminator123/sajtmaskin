import { useCallback, useEffect, useRef } from "react";
import type { AutoFixPayload, MessageOptions } from "./types";
import { buildAutoFixPrompt } from "./helpers";

const MAX_ATTEMPTS_PER_KEY = 2;
const DEDUPE_TTL_MS = 5 * 60 * 1000;

type AttemptEntry = { count: number; ts: number };

type PersistedVersionLog = {
  category?: string | null;
  message?: string | null;
};

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

async function loadVersionErrorSummary(chatId: string, versionId: string): Promise<string[]> {
  try {
    const response = await fetch(
      `/api/v0/chats/${encodeURIComponent(chatId)}/versions/${encodeURIComponent(versionId)}/error-log`,
      { method: "GET" },
    );
    if (!response.ok) return [];
    const data = (await response.json().catch(() => null)) as
      | { logs?: PersistedVersionLog[] }
      | null;
    const logs = Array.isArray(data?.logs) ? data.logs : [];
    return logs
      .slice(0, 6)
      .map((log) => {
        const message = typeof log.message === "string" ? log.message.trim() : "";
        const category = typeof log.category === "string" ? log.category.trim() : "";
        if (!message) return "";
        return category ? `[${category}] ${message}` : message;
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function enrichAutoFixPayload(payload: AutoFixPayload): Promise<AutoFixPayload> {
  const previousVersionId =
    typeof payload.meta?.previousVersionId === "string" ? payload.meta.previousVersionId : null;

  const [currentVersionErrors, previousVersionErrors] = await Promise.all([
    loadVersionErrorSummary(payload.chatId, payload.versionId),
    previousVersionId ? loadVersionErrorSummary(payload.chatId, previousVersionId) : Promise.resolve([]),
  ]);

  if (currentVersionErrors.length === 0 && previousVersionErrors.length === 0) {
    return payload;
  }

  return {
    ...payload,
    meta: {
      ...(payload.meta ?? {}),
      currentVersionErrors,
      previousVersionErrors,
    },
  };
}

export function useAutoFix(
  sendMessage: (messageText: string, options?: MessageOptions) => Promise<void>,
) {
  const autoFixAttemptsRef = useRef<Record<string, AttemptEntry>>({});
  const autoFixHandlerRef = useRef<(payload: AutoFixPayload) => void>(() => {});
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleAutoFix = useCallback(
    (payload: AutoFixPayload) => {
      void (async () => {
        const now = Date.now();
        pruneStale(autoFixAttemptsRef.current, now);

        const key = makeDedupeKey(payload);
        const entry = autoFixAttemptsRef.current[key];
        const attempts = entry?.count ?? 0;
        if (attempts >= MAX_ATTEMPTS_PER_KEY) return;

        autoFixAttemptsRef.current[key] = { count: attempts + 1, ts: now };

        const enrichedPayload = await enrichAutoFixPayload(payload);
        const prompt = buildAutoFixPrompt(enrichedPayload);
        const delayMs = attempts === 0 ? 1500 : 4000;
        pendingTimerRef.current = setTimeout(() => {
          pendingTimerRef.current = null;
          void sendMessage(prompt);
        }, delayMs);
      })();
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
    return () => {
      window.removeEventListener("sajtmaskin:auto-fix", handler as EventListener);
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    };
  }, [handleAutoFix]);

  return { autoFixHandlerRef };
}
