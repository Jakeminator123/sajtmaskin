import { eq } from "drizzle-orm";
import { db, dbConfigured } from "@/lib/db/client";
import { liveReviewGrants } from "@/lib/db/schema";
import {
  parsePersistedLiveReviewGrant,
  type LiveReviewGrantRecord,
} from "@/lib/openclaw/live-review-access";
import { sanitizeOpenClawPowerIds, type OpenClawPowerId } from "@/lib/openclaw/powers";

export async function readLiveReviewGrant(
  chatId: string,
): Promise<LiveReviewGrantRecord | null> {
  const id = chatId.trim();
  if (!id || !dbConfigured) return null;
  try {
    const rows = await db
      .select({
        granted: liveReviewGrants.granted,
        powersOn: liveReviewGrants.powersOn,
      })
      .from(liveReviewGrants)
      .where(eq(liveReviewGrants.chatId, id))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return parsePersistedLiveReviewGrant(row);
  } catch (error) {
    console.warn(
      "[live-review-grant] read failed:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

export async function writeLiveReviewGrant(input: {
  chatId: string;
  powersOn: boolean;
  granted: readonly OpenClawPowerId[];
}): Promise<LiveReviewGrantRecord | null> {
  const chatId = input.chatId.trim();
  if (!chatId || !dbConfigured) return null;
  const granted = sanitizeOpenClawPowerIds(input.granted);
  const powersOn = input.powersOn === true && granted.length > 0 ? true : input.powersOn === true;
  try {
    await db
      .insert(liveReviewGrants)
      .values({
        chatId,
        granted,
        powersOn,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: liveReviewGrants.chatId,
        set: { granted, powersOn, updatedAt: new Date() },
      });
    return { powersOn, granted };
  } catch (error) {
    console.warn(
      "[live-review-grant] write failed:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
