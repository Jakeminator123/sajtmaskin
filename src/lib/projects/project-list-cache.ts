/**
 * Redis-cachen för ägarens projektlista (`GET /api/projects`, 120 s).
 *
 * Nyckeln är per ägare: inloggad med gästcookie, bara inloggad, bara gäst. Ett
 * projekt kommer in i listan när det slutar vara tomt (SM-133,
 * `startedProjectCondition`), i praktiken när första chatten skapas. Därför
 * nollar både `POST /api/projects` och chattskapandet i
 * `create-chat-stream-post.ts` cachen här, så att ett nytt bygge syns direkt.
 */
import { deleteCache } from "@/lib/data/redis";

const LIST_PREFIX = "projects:list";

/** Ägarsegmentet i nyckeln, exakt som listan läser det. */
export function projectListOwnerSegment(userId: string | null, sessionId: string | null): string {
  if (userId && sessionId) return `user:${userId}:session:${sessionId}`;
  if (userId) return `user:${userId}`;
  if (sessionId) return `session:${sessionId}`;
  return "anonymous";
}

/** Varje segment en ändring kan ha gjort inaktuellt (kombinerat, användare, session). */
export function projectListOwnerSegments(userId: string | null, sessionId: string | null): string[] {
  return Array.from(
    new Set(
      [
        projectListOwnerSegment(userId, sessionId),
        userId ? `user:${userId}` : null,
        sessionId ? `session:${sessionId}` : null,
      ].filter((value): value is string => Boolean(value)),
    ),
  );
}

export function projectListCacheKey(userId: string | null, sessionId: string | null): string {
  return `${LIST_PREFIX}:${projectListOwnerSegment(userId, sessionId)}`;
}

/** Nollar ägarens listcache. Kastar aldrig: `deleteCache` sväljer Redis-fel. */
export async function invalidateProjectListCache(
  userId: string | null,
  sessionId: string | null,
): Promise<void> {
  await Promise.all([
    deleteCache(LIST_PREFIX),
    ...projectListOwnerSegments(userId, sessionId).map((segment) =>
      deleteCache(`${LIST_PREFIX}:${segment}`),
    ),
  ]);
}
