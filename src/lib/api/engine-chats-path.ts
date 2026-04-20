/**
 * Canonical HTTP prefix for own-engine chat APIs (builder core).
 *
 * **Client:** Builder hooks and components must use `ENGINE_CHATS_API_PREFIX`
 * and `engineChatBaseUrl` — never hardcode `/api/...` chat paths.
 *
 * **Server (since P29 Fas 1B, 2026-04-20):** All chat routes live exclusively
 * under `src/app/api/engine/chats/**`. The legacy `/api/v0/chats/**` tree was
 * fully removed; the `v0-chats-compat.ts` helper (`logLegacyV0ChatsHit`) is
 * gone. Other `/api/v0/**` segments (deployments, projects, integrations)
 * remain as Class C legacy with real client callsites — see
 * `docs/plans/active/P29-v0-engine-consolidation.md` Fas 2.
 */
export const ENGINE_CHATS_API_PREFIX = "/api/engine/chats";

/** Base URL for a chat id segment, e.g. `/api/engine/chats/abc`. */
export function engineChatBaseUrl(chatId: string): string {
  return `${ENGINE_CHATS_API_PREFIX}/${encodeURIComponent(chatId)}`;
}
