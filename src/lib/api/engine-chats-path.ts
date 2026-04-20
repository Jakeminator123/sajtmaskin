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
 * **Other `/api/v0/**` segments are NOT chat-compat — they are the canonical
 * permanent URL for those features.** Specifically (P29 Fas 2 decision
 * 2026-04-20): `init-registry`, `integrations/vercel/projects`,
 * `projects/instructions`, `projects/[projectId]/env-vars`, and
 * `deployments/**` live on `/api/v0/` because they have no engine equivalent
 * and renaming them to `/api/legacy/v0/*` would be cosmetic-only with real
 * client-deploy coordination cost. Treat the `/api/v0/` prefix as canonical
 * for those routes; do not migrate them. See
 * `docs/plans/avklarat/P29-v0-engine-consolidation.md` for full motivation.
 */
export const ENGINE_CHATS_API_PREFIX = "/api/engine/chats";

/** Base URL for a chat id segment, e.g. `/api/engine/chats/abc`. */
export function engineChatBaseUrl(chatId: string): string {
  return `${ENGINE_CHATS_API_PREFIX}/${encodeURIComponent(chatId)}`;
}
