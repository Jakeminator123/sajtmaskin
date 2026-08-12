/**
 * Aktivt builder-mål (chatt + version) ur `window.__SITEMASKIN_CONTEXT`,
 * som `BuilderShellContent` håller uppdaterad. Delad ägare för OpenClaw-
 * korten (repair/quick-edit) och send-tidens målbindning i `useOpenClawChat`
 * — flyttad hit från `OpenClawMessage.tsx` när quick-edit-förslag började
 * bindas till versionen modellen faktiskt såg (Bugbot 2026-08-01).
 */
import type { BuilderTurnSnapshot } from "@/lib/openclaw/debug/armed-continuation";

export interface OpenClawBuilderTarget {
  chatId: string;
  versionId: string;
}

export function readActiveBuilderTarget(): OpenClawBuilderTarget | null {
  if (typeof window === "undefined") return null;
  const ctx = window.__SITEMASKIN_CONTEXT;
  const chatId = typeof ctx?.chatId === "string" ? ctx.chatId : null;
  const versionId = typeof ctx?.activeVersionId === "string" ? ctx.activeVersionId : null;
  if (!chatId || !versionId) return null;
  return { chatId, versionId };
}

/**
 * Live builder-turn state for the armed-autonomy handshake. Unlike
 * `readActiveBuilderTarget` this tolerates a missing version id — a turn that
 * has not produced its version yet is exactly what the handshake waits for.
 * Returns null outside the builder so autonomy can never resume on another page.
 */
export function readBuilderTurnSnapshot(): BuilderTurnSnapshot | null {
  if (typeof window === "undefined") return null;
  const ctx = window.__SITEMASKIN_CONTEXT;
  if (!ctx || ctx.page !== "builder") return null;
  return {
    chatId: typeof ctx.chatId === "string" ? ctx.chatId : null,
    activeVersionId: typeof ctx.activeVersionId === "string" ? ctx.activeVersionId : null,
    isStreaming: ctx.isStreaming === true,
    versionStatus: typeof ctx.activeVersionStatus === "string" ? ctx.activeVersionStatus : null,
    // Absent flag ⇒ treat the view as stale rather than current: the handshake
    // then waits instead of resuming on a status it cannot trust.
    versionIsLatest: ctx.activeVersionIsLatest === true,
    chatMessageCount:
      typeof ctx.chatMessageCount === "number" ? ctx.chatMessageCount : null,
    awaitingInput: ctx.awaitingInput === true,
  };
}
