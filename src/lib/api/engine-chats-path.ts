/**
 * Canonical HTTP prefix for own-engine chat APIs (builder core).
 *
 * **Client:** Builder hooks and components should use `ENGINE_CHATS_API_PREFIX` and `engineChatBaseUrl`
 * — not hardcoded `/api/v0/chats/...`.
 *
 * **Server split (current):**
 * - New-chat stream + shared sync-adapter live under `src/lib/api/engine/chats/`; `/api/engine/chats/stream`
 *   calls the lib handler; `/api/v0/chats/stream` wraps the same handler with legacy telemetry.
 * - Many routes under `src/app/api/engine/chats/**` still re-export handlers from `src/app/api/v0/chats/**`
 *   (thin alias until handlers move into lib).
 *
 * Legacy `/api/v0/chats/*` remains for external/older clients until usage is zero.
 */
export const ENGINE_CHATS_API_PREFIX = "/api/engine/chats";

/** Base URL for a chat id segment, e.g. `/api/engine/chats/abc`. */
export function engineChatBaseUrl(chatId: string): string {
  return `${ENGINE_CHATS_API_PREFIX}/${encodeURIComponent(chatId)}`;
}
