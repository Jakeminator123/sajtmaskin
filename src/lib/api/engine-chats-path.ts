/**
 * Canonical HTTP prefix for own-engine chat APIs (builder core).
 *
 * **Client:** Builder hooks and components must use `ENGINE_CHATS_API_PREFIX`
 * and `engineChatBaseUrl` — never hardcode `/api/...` chat paths.
 *
 * **Server (since P29 Fas 1B, 2026-04-20):** All chat routes live exclusively
 * under `src/app/api/engine/chats/**`. The `/api/v0/chats/**` tree was fully
 * removed; the `v0-chats-compat.ts` helper (`logLegacyV0ChatsHit`) is gone.
 *
 * **Other `/api/v0/**` segments are separate versioned boundaries, not chat
 * compatibility.** `deployments/**` and `projects/[projectId]/env-vars`
 * remain active. `projects/instructions` is a 410 tombstone and
 * `init-registry` no longer exists. Do not infer ownership from the `v0`
 * prefix: inspect the concrete route and its callers before changing it. See
 * `docs/plans/avklarat/P29-v0-engine-consolidation.md` for historical context.
 */
export const ENGINE_CHATS_API_PREFIX = "/api/engine/chats";

/** Base URL for a chat id segment, e.g. `/api/engine/chats/abc`. */
export function engineChatBaseUrl(chatId: string): string {
  return `${ENGINE_CHATS_API_PREFIX}/${encodeURIComponent(chatId)}`;
}
