/**
 * One-time guest reconnect after a verified `__Host-` login.
 *
 * On HTTPS the unprefixed `sajtmaskin_session` cookie is not an identity — a
 * subdomain on `Domain=.sajtmaskin.se` can write that name, and the request
 * does not say who did. It is still the only pointer a returning visitor has to
 * their pre-migration guest projects, so it is allowed to act as a claim source
 * exactly once, after the user proved who they are:
 *
 *   verified `__Host-` login  ->  move `app_projects` rows with that
 *   `session_id` and `user_id IS NULL` onto the user  ->  expire the leftover
 *
 * It never becomes the live session id and it is never accepted for auth.
 */

import { claimUnclaimedSessionProjects } from "@/lib/db/services/projects";

export interface GuestReconnectResult {
  sessionId: string;
  claimedProjectIds: string[];
  /** False when the claim errored — keep the leftover so a retry is possible. */
  ok: boolean;
}

/**
 * @param sessionId an unambiguous, format-valid leftover guest id
 *   ({@link import("./host-cookies").leftoverGuestClaimId})
 * @param userId the user id from the freshly verified auth token
 */
export async function reconnectGuestProjects(
  sessionId: string,
  userId: string,
): Promise<GuestReconnectResult> {
  try {
    const claimedProjectIds = await claimUnclaimedSessionProjects(
      sessionId,
      userId,
    );
    if (claimedProjectIds.length > 0) {
      console.info(
        `[Auth] Reconnected ${claimedProjectIds.length} guest project(s) to user ${userId}`,
      );
    }
    return { sessionId, claimedProjectIds, ok: true };
  } catch (error) {
    console.error("[Auth] Guest project reconnect failed:", error);
    return { sessionId, claimedProjectIds: [], ok: false };
  }
}
