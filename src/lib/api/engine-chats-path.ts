/**
 * Canonical HTTP prefix for own-engine chat APIs (builder core).
 *
 * **Client:** Builder hooks and components must use `ENGINE_CHATS_API_PREFIX`
 * and `engineChatBaseUrl` — never hardcode `/api/...` chat paths.
 * New-chat codegen is `POST /api/engine/chats/stream` only. `POST` on the
 * prefix itself is not a codegen path (`405 use_streaming_create`). Follow-up
 * codegen is `POST /api/engine/chats/[chatId]/stream` only; `POST .../messages`
 * is not a codegen path (`405 use_streaming_send`). `GET` lists chats.
 *
 * **Server (since P29 Fas 1B, 2026-04-20):** All chat routes live exclusively
 * under `src/app/api/engine/chats/**`. The `/api/v0/chats/**` tree was fully
 * removed; the `v0-chats-compat.ts` helper (`logLegacyV0ChatsHit`) is gone.
 *
 * **Other `/api/v0/**` segments are separate versioned boundaries, not chat
 * compatibility.** `deployments/**` and `projects/[projectId]/env-vars`
 * remain active. `projects/instructions` and `init-registry` no longer exist
 * at all — `instructions` kept a 410 tombstone until it was deleted with the
 * dead marketplace/mcp routes (#752), so the path now 404:ar like any other
 * unknown route. Do not infer ownership from the `v0` prefix: inspect the
 * concrete route and its callers before changing it. Historical context lives
 * in git (`git log --diff-filter=D -- src/app/api/v0`).
 */
export const ENGINE_CHATS_API_PREFIX = "/api/engine/chats";

/** Base URL for a chat id segment, e.g. `/api/engine/chats/abc`. */
export function engineChatBaseUrl(chatId: string): string {
  return `${ENGINE_CHATS_API_PREFIX}/${encodeURIComponent(chatId)}`;
}
