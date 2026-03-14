import type { AutoFixPayload } from "./types";

export const AUTO_FIX_EVENT_NAME = "sajtmaskin:auto-fix";

export function dispatchAutoFixEvent(payload: AutoFixPayload): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AUTO_FIX_EVENT_NAME, { detail: payload }));
}

export function readAutoFixEventPayload(event: Event): AutoFixPayload | null {
  const payload = (event as CustomEvent<AutoFixPayload>).detail;
  if (!payload?.chatId || !payload?.versionId) return null;
  return payload;
}
