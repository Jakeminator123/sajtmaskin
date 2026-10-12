import { and, desc, eq, gt, inArray, lt, ne, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, dbConfigured } from "@/lib/db/client";
import { engineChats, engineVersionJobs, engineVersions, liveReviewRuns } from "@/lib/db/schema";
import { LEASE_LOCK_TIMEOUT_MS, versionWriteWhere } from "@/lib/db/chat-repository/internal";
import { deleteBlob } from "@/lib/vercel/blob-service";
import {
  LIVE_REVIEW_CLAIM_LEASE_MS,
  LIVE_REVIEW_CLAIM_WAIT_MS,
  LIVE_REVIEW_MAX_MODEL_ATTEMPTS,
  RETRYABLE_LIVE_REVIEW_SKIP_REASONS,
  decideLiveReviewClaim,
  liveReviewExpiresAt,
  liveReviewResultFromRow,
  pickPreviousLiveReviewRun,
  skippedLiveReviewResult,
  type LiveReviewClaimDecision,
  type LiveReviewRunRow,
} from "@/lib/gen/verify/live-review-claim";
import type { LiveReviewResult, LiveReviewScreenshotSet } from "@/lib/gen/verify/live-review-types";

function mapRow(row: typeof liveReviewRuns.$inferSelect): LiveReviewRunRow {
  return {
    id: row.id,
    chatId: row.chatId,
    versionId: row.versionId,
    filesRevision: row.filesRevision,
    userId: row.userId,
    status: row.status as LiveReviewRunRow["status"],
    skipReason: row.skipReason,
    result: (row.result as LiveReviewResult | null) ?? null,
    desktopUrl: row.desktopUrl,
    mobileUrl: row.mobileUrl,
    desktopBlobPath: row.desktopBlobPath,
    mobileBlobPath: row.mobileBlobPath,
    modelAttempts: row.modelAttempts,
    claimedAt: row.claimedAt,
    completedAt: row.completedAt,
    expiresAt: row.expiresAt,
  };
}

export type ClaimedLiveReview =
  | { kind: "acquired"; row: LiveReviewRunRow }
  | { kind: "cached"; result: LiveReviewResult; row: LiveReviewRunRow }
  | { kind: "in_flight"; row: LiveReviewRunRow }
  | { kind: "cost_capped"; result: LiveReviewResult; row: LiveReviewRunRow };

/** Internal context from an existing versionslease, never a product/LR claim id. */
export type LiveReviewHeldContext = {
  chatId: string;
  versionId: string;
  filesRevision: string;
  holderRunId: string;
};

export function isLiveReviewHeldContext(value: unknown): value is LiveReviewHeldContext {
  if (!value || typeof value !== "object") return false;
  const held = value as Partial<LiveReviewHeldContext>;
  return [held.chatId, held.versionId, held.filesRevision, held.holderRunId]
    .every((part) => typeof part === "string" && part.trim().length > 0);
}

async function selectRun(
  versionId: string,
  filesRevision: string,
): Promise<LiveReviewRunRow | null> {
  const rows = await db
    .select()
    .from(liveReviewRuns)
    .where(
      and(
        eq(liveReviewRuns.versionId, versionId),
        eq(liveReviewRuns.filesRevision, filesRevision),
      ),
    )
    .limit(1);
  return rows[0] ? mapRow(rows[0]) : null;
}

async function applyExistingDecision(
  existing: LiveReviewRunRow,
  now: Date,
): Promise<ClaimedLiveReview> {
  const decision: LiveReviewClaimDecision = decideLiveReviewClaim(existing, now);
  if (decision.kind === "cached") {
    return { kind: "cached", result: decision.result, row: existing };
  }
  if (decision.kind === "cost_capped") {
    return { kind: "cost_capped", result: decision.result, row: existing };
  }
  if (decision.kind === "in_flight") {
    return { kind: "in_flight", row: existing };
  }
  if (decision.kind === "takeover") {
    const staleBefore = new Date(now.getTime() - LIVE_REVIEW_CLAIM_LEASE_MS);
    const updated = await db
      .update(liveReviewRuns)
      .set({
        status: "running",
        claimedAt: now,
        expiresAt: liveReviewExpiresAt(now),
        skipReason: null,
        result: null,
      })
      .where(
        and(
          eq(liveReviewRuns.id, existing.id),
          eq(liveReviewRuns.modelAttempts, existing.modelAttempts),
          or(
            and(
              eq(liveReviewRuns.status, "running"),
              lt(liveReviewRuns.claimedAt, staleBefore),
            ),
            and(
              eq(liveReviewRuns.status, "skipped"),
              inArray(liveReviewRuns.skipReason, [...RETRYABLE_LIVE_REVIEW_SKIP_REASONS]),
            ),
          ),
        ),
      )
      .returning();
    if (updated[0]) return { kind: "acquired", row: mapRow(updated[0]) };
    const raced = await selectRun(existing.versionId, existing.filesRevision);
    const racedResult = raced ? liveReviewResultFromRow(raced) : null;
    if (raced && racedResult && raced.status !== "running") {
      return raced.modelAttempts >= LIVE_REVIEW_MAX_MODEL_ATTEMPTS
        ? { kind: "cost_capped", result: racedResult, row: raced }
        : { kind: "cached", result: racedResult, row: raced };
    }
    return { kind: "in_flight", row: raced ?? existing };
  }
  return { kind: "in_flight", row: existing };
}

export async function claimLiveReviewRun(input: {
  chatId: string;
  versionId: string;
  filesRevision: string;
  userId: string;
}): Promise<ClaimedLiveReview | null> {
  if (!dbConfigured) return null;
  const now = new Date();
  const id = `lr_${randomUUID()}`;
  try {
    const inserted = await db
      .insert(liveReviewRuns)
      .values({
        id,
        chatId: input.chatId,
        versionId: input.versionId,
        filesRevision: input.filesRevision,
        userId: input.userId,
        status: "running",
        claimedAt: now,
        expiresAt: liveReviewExpiresAt(now),
      })
      .onConflictDoNothing({
        target: [liveReviewRuns.versionId, liveReviewRuns.filesRevision],
      })
      .returning();
    if (inserted[0]) return { kind: "acquired", row: mapRow(inserted[0]) };

    const existing = await selectRun(input.versionId, input.filesRevision);
    if (!existing) return null;
    return applyExistingDecision(existing, now);
  } catch (error) {
    console.warn(
      "[live-review-claim] claim failed:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

export async function waitForLiveReviewRun(input: {
  versionId: string;
  filesRevision: string;
  timeoutMs?: number;
}): Promise<LiveReviewResult> {
  const deadline = Date.now() + (input.timeoutMs ?? LIVE_REVIEW_CLAIM_WAIT_MS);
  while (Date.now() < deadline) {
    const row = dbConfigured
      ? await selectRun(input.versionId, input.filesRevision).catch(() => null)
      : null;
    const result = row ? liveReviewResultFromRow(row) : null;
    if (row && row.status !== "running" && result) return result;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return skippedLiveReviewResult("claim_busy");
}

export async function completeLiveReviewRun(input: {
  id: string;
  result: LiveReviewResult;
  screenshots?: LiveReviewScreenshotSet | null;
  desktopBlobPath?: string | null;
  mobileBlobPath?: string | null;
  modelAttempts?: number;
}): Promise<boolean> {
  if (!dbConfigured) return false;
  const now = new Date();
  const skipReason = input.result.status === "skipped" ? input.result.reason : null;
  // Screenshot URLs have dedicated columns. Strip any transient read projection
  // defensively so callers can never create a second durable owner in JSON.
  const persistedResult = { ...input.result } as LiveReviewResult & {
    screenshots?: LiveReviewScreenshotSet | null;
  };
  delete persistedResult.screenshots;
  try {
    const updated = await db
      .update(liveReviewRuns)
      .set({
        status: input.result.status === "completed" ? "completed" : "skipped",
        skipReason,
        result: persistedResult,
        desktopUrl: input.screenshots?.desktopUrl ?? null,
        mobileUrl: input.screenshots?.mobileUrl ?? null,
        desktopBlobPath: input.desktopBlobPath ?? null,
        mobileBlobPath: input.mobileBlobPath ?? null,
        // Reservation is durable before the critic starts. A late completion
        // or an omitted count must never refund an already reserved attempt.
        modelAttempts: sql`greatest(${liveReviewRuns.modelAttempts}, ${input.modelAttempts ?? 0})`,
        completedAt: now,
        expiresAt: liveReviewExpiresAt(now),
      })
      .where(eq(liveReviewRuns.id, input.id))
      .returning({ id: liveReviewRuns.id });
    return updated.length > 0;
  } catch (error) {
    console.warn(
      "[live-review-claim] complete failed:",
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}

export async function abandonLiveReviewRun(
  id: string,
  claimedAt?: Date,
): Promise<void> {
  if (!dbConfigured) return;
  try {
    await db.delete(liveReviewRuns).where(
      and(
        eq(liveReviewRuns.id, id),
        eq(liveReviewRuns.status, "running"),
        eq(liveReviewRuns.modelAttempts, 0),
        ...(claimedAt ? [eq(liveReviewRuns.claimedAt, claimedAt)] : []),
      ),
    );
  } catch (error) {
    console.warn(
      "[live-review-claim] abandon failed:",
      error instanceof Error ? error.message : error,
    );
  }
}

/** Reserve under the active versionsholder/revision and unchanged LR CAS/cap. */
export async function beginPaidLiveReviewAttempt(input: {
  id: string;
  claimedAt: Date;
  held: LiveReviewHeldContext;
  deadlineAt: number;
}): Promise<number | null> {
  if (!dbConfigured) return null;
  try {
    if (!isLiveReviewHeldContext(input.held) || !Number.isFinite(input.deadlineAt) || Date.now() >= input.deadlineAt) return null;
    const held = input.held;
    const jobWhere = and(
      eq(engineVersionJobs.versionId, held.versionId), eq(engineVersionJobs.runId, held.holderRunId),
      eq(engineVersionJobs.status, "running"), gt(engineVersionJobs.leaseExpiresAt, sql`clock_timestamp()`),
    );
    return await db.transaction(async tx => {
      await tx.execute(sql`SELECT set_config('lock_timeout', ${String(LEASE_LOCK_TIMEOUT_MS)}, true)`);
      const versions = await tx.select({ chatId: engineVersions.chatId, filesRevision: engineVersions.filesRevision })
        .from(engineVersions).where(eq(engineVersions.id, held.versionId)).for("update");
      if (versions[0]?.chatId !== held.chatId || versions[0]?.filesRevision !== held.filesRevision) return null;
      const jobs = await tx.select({ runId: engineVersionJobs.runId }).from(engineVersionJobs).where(jobWhere).for("update");
      if (jobs.length !== 1) return null;
      // Recheck clock expiry/deadline after waiting for the LR row.
      const rows = await tx.update(liveReviewRuns)
        .set({ modelAttempts: sql`${liveReviewRuns.modelAttempts} + 1` })
        .where(and(eq(liveReviewRuns.id, input.id), eq(liveReviewRuns.status, "running"),
          eq(liveReviewRuns.claimedAt, input.claimedAt), lt(liveReviewRuns.modelAttempts, LIVE_REVIEW_MAX_MODEL_ATTEMPTS),
          eq(liveReviewRuns.chatId, held.chatId), eq(liveReviewRuns.versionId, held.versionId),
          eq(liveReviewRuns.filesRevision, held.filesRevision), lt(sql`clock_timestamp()`, new Date(input.deadlineAt)),
          sql`EXISTS (SELECT 1 FROM ${engineVersions} WHERE ${and(versionWriteWhere(held.versionId, held.holderRunId),
            eq(engineVersions.chatId, held.chatId), eq(engineVersions.filesRevision, held.filesRevision))})`,
          sql`EXISTS (SELECT 1 FROM ${engineVersionJobs} WHERE ${jobWhere})`,
        )).returning({ modelAttempts: liveReviewRuns.modelAttempts });
      return rows[0]?.modelAttempts ?? null;
    });
  } catch { return null; }
}

export async function getLiveReviewRunForVersion(
  versionId: string,
): Promise<LiveReviewRunRow | null> {
  if (!versionId.trim() || !dbConfigured) return null;
  try {
    // ORDER BY i SQL före LIMIT — annars tar vi 8 godtyckliga rader och kan
    // missa den nyaste färdiga reviewn när en version har fler revisioner
    // (PR-granskningsfynd F-c264a864d347).
    const rows = await db
      .select()
      .from(liveReviewRuns)
      .where(eq(liveReviewRuns.versionId, versionId.trim()))
      .orderBy(desc(liveReviewRuns.completedAt))
      .limit(8);
    const completed = rows
      .map(mapRow)
      .filter((row) => row.status !== "running")
      .sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0));
    return completed[0] ?? null;
  } catch {
    return null;
  }
}

export async function getPreviousLiveReviewScreenshots(input: {
  chatId: string;
  versionId: string;
  filesRevision: string;
}): Promise<LiveReviewScreenshotSet> {
  if (!dbConfigured) {
    return { desktopUrl: null, mobileUrl: null };
  }
  try {
    const rows = await db
      .select()
      .from(liveReviewRuns)
      .where(
        and(
          eq(liveReviewRuns.chatId, input.chatId),
          eq(liveReviewRuns.status, "completed"),
          or(
            ne(liveReviewRuns.versionId, input.versionId),
            ne(liveReviewRuns.filesRevision, input.filesRevision),
          ),
        ),
      );
    const versionIds = [...new Set(rows.map((raw) => raw.versionId))];
    const versionRows =
      versionIds.length === 0
        ? []
        : await db
            .select({
              id: engineVersions.id,
              versionNumber: engineVersions.versionNumber,
            })
            .from(engineVersions)
            .where(inArray(engineVersions.id, versionIds));
    const versionNumberById = new Map(
      versionRows.map((version) => [version.id, version.versionNumber]),
    );
    const latest = pickPreviousLiveReviewRun(
      rows.map((raw) => ({
        ...mapRow(raw),
        versionNumber: versionNumberById.get(raw.versionId) ?? null,
      })),
    );
    return {
      desktopUrl: latest?.desktopUrl ?? null,
      mobileUrl: latest?.mobileUrl ?? null,
      previousDesktopUrl: latest?.desktopUrl ?? null,
      previousMobileUrl: latest?.mobileUrl ?? null,
    };
  } catch {
    return { desktopUrl: null, mobileUrl: null };
  }
}

export async function deleteLiveReviewScreenshotUrls(
  screenshots: LiveReviewScreenshotSet | null | undefined,
): Promise<void> {
  const targets = [screenshots?.desktopUrl, screenshots?.mobileUrl].filter(
    (value): value is string => Boolean(value),
  );
  await Promise.all(targets.map((target) => deleteBlob(target).catch(() => false)));
}

function isRequiredBlobDeleteTarget(target: string): boolean {
  return target.includes(".blob.vercel-storage.com");
}

async function deleteRunBlobs(row: LiveReviewRunRow): Promise<boolean> {
  const targets = [
    ...new Set(
      [row.desktopUrl, row.mobileUrl, row.desktopBlobPath, row.mobileBlobPath].filter(
        (value): value is string => Boolean(value),
      ),
    ),
  ];
  if (targets.length === 0) return true;
  const required = targets.filter(isRequiredBlobDeleteTarget);
  const optional = targets.filter((target) => !isRequiredBlobDeleteTarget(target));
  const requiredResults = await Promise.all(
    required.map((target) => deleteBlob(target).catch(() => false)),
  );
  await Promise.all(optional.map((target) => deleteBlob(target).catch(() => false)));
  return requiredResults.every(Boolean);
}

export async function deletePreviousLiveReviewBlobs(input: {
  chatId: string;
  keepVersionId: string;
  keepFilesRevision: string;
}): Promise<number> {
  if (!dbConfigured) return 0;
  try {
    const rows = await db
      .select()
      .from(liveReviewRuns)
      .where(
        and(
          eq(liveReviewRuns.chatId, input.chatId),
          or(
            ne(liveReviewRuns.versionId, input.keepVersionId),
            ne(liveReviewRuns.filesRevision, input.keepFilesRevision),
          ),
        ),
      );
    let deleted = 0;
    for (const raw of rows) {
      const row = mapRow(raw);
      const removed = await deleteRunBlobs(row);
      if (!removed) continue;
      await db
        .update(liveReviewRuns)
        .set({
          desktopUrl: null,
          mobileUrl: null,
          desktopBlobPath: null,
          mobileBlobPath: null,
        })
        .where(eq(liveReviewRuns.id, row.id));
      deleted += 1;
    }
    return deleted;
  } catch (error) {
    console.warn(
      "[live-review-claim] previous blob delete failed:",
      error instanceof Error ? error.message : error,
    );
    return 0;
  }
}

export async function purgeExpiredLiveReviewBlobs(
  now: Date = new Date(),
): Promise<number> {
  if (!dbConfigured) return 0;
  try {
    const rows = await db
      .select()
      .from(liveReviewRuns)
      .where(lt(liveReviewRuns.expiresAt, now));
    let deleted = 0;
    for (const raw of rows) {
      const row = mapRow(raw);
      const removed = await deleteRunBlobs(row);
      if (!removed) continue;
      await db.delete(liveReviewRuns).where(eq(liveReviewRuns.id, row.id));
      deleted += 1;
    }
    return deleted;
  } catch (error) {
    console.warn(
      "[live-review-claim] ttl purge failed:",
      error instanceof Error ? error.message : error,
    );
    return 0;
  }
}

export async function purgeLiveReviewBlobsForChat(chatId: string): Promise<number> {
  if (!chatId.trim() || !dbConfigured) return 0;
  try {
    const rows = await db
      .select()
      .from(liveReviewRuns)
      .where(eq(liveReviewRuns.chatId, chatId.trim()));
    for (const raw of rows) {
      await deleteRunBlobs(mapRow(raw));
    }
    return rows.length;
  } catch {
    return 0;
  }
}

export async function purgeLiveReviewBlobsForProject(projectId: string): Promise<number> {
  if (!projectId.trim() || !dbConfigured) return 0;
  try {
    const chats = await db
      .select({ id: engineChats.id })
      .from(engineChats)
      .where(eq(engineChats.projectId, projectId.trim()));
    let total = 0;
    for (const chat of chats) {
      total += await purgeLiveReviewBlobsForChat(chat.id);
    }
    return total;
  } catch {
    return 0;
  }
}
