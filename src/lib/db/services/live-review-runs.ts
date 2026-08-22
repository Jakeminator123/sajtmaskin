import { and, desc, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, dbConfigured } from "@/lib/db/client";
import { engineChats, engineVersions, liveReviewRuns } from "@/lib/db/schema";
import { deleteBlob } from "@/lib/vercel/blob-service";
import {
  LIVE_REVIEW_CLAIM_LEASE_MS,
  LIVE_REVIEW_CLAIM_WAIT_MS,
  LIVE_REVIEW_MAX_MODEL_ATTEMPTS,
  RETRYABLE_LIVE_REVIEW_SKIP_REASONS,
  decideLiveReviewClaim,
  liveReviewExpiresAt,
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

async function selectRun(
  versionId: string,
  filesRevision: string,
): Promise<LiveReviewRunRow | null> {
  const rows = await db
    .select()
    .from(liveReviewRuns)
    .where(
      and(eq(liveReviewRuns.versionId, versionId), eq(liveReviewRuns.filesRevision, filesRevision)),
    )
    .limit(1);
  return rows[0] ? mapRow(rows[0]) : null;
}

async function applyExistingDecision(
  existing: LiveReviewRunRow,
  now: Date,
): Promise<ClaimedLiveReview | null> {
  // A TTL purge has hidden the old public URLs but still owns external Blob
  // cleanup. Do not let a retry reuse the same deterministic screenshot keys
  // until that tombstone is gone; otherwise the old purge can delete the new
  // lease's freshly uploaded JPEG.
  if (
    !existing.desktopUrl &&
    !existing.mobileUrl &&
    (existing.desktopBlobPath || existing.mobileBlobPath)
  ) {
    return { kind: "in_flight", row: existing };
  }
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
          existing.desktopUrl === null
            ? isNull(liveReviewRuns.desktopUrl)
            : eq(liveReviewRuns.desktopUrl, existing.desktopUrl),
          existing.mobileUrl === null
            ? isNull(liveReviewRuns.mobileUrl)
            : eq(liveReviewRuns.mobileUrl, existing.mobileUrl),
          existing.desktopBlobPath === null
            ? isNull(liveReviewRuns.desktopBlobPath)
            : eq(liveReviewRuns.desktopBlobPath, existing.desktopBlobPath),
          existing.mobileBlobPath === null
            ? isNull(liveReviewRuns.mobileBlobPath)
            : eq(liveReviewRuns.mobileBlobPath, existing.mobileBlobPath),
          or(
            and(eq(liveReviewRuns.status, "running"), lt(liveReviewRuns.claimedAt, staleBefore)),
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
    if (raced?.result && raced.status !== "running") {
      return raced.modelAttempts >= LIVE_REVIEW_MAX_MODEL_ATTEMPTS
        ? { kind: "cost_capped", result: raced.result, row: raced }
        : { kind: "cached", result: raced.result, row: raced };
    }
    // A concurrent TTL purge may have removed the expired row between the
    // conflict read and takeover CAS. Let the caller retry INSERT instead of
    // returning a phantom in-flight claim.
    return raced ? { kind: "in_flight", row: raced } : null;
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
  try {
    // Two passes close the tiny purge-vs-claim window: if ON CONFLICT saw an
    // expired row that a concurrent purge then removed, the second insert
    // becomes the canonical fresh lease.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const inserted = await db
        .insert(liveReviewRuns)
        .values({
          id: `lr_${randomUUID()}`,
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
      if (!existing) continue;
      const decision = await applyExistingDecision(existing, now);
      if (decision) return decision;
    }
    return null;
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
    if (row && (row.status === "completed" || row.status === "skipped") && row.result) {
      return row.result;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return skippedLiveReviewResult("claim_busy");
}

export async function completeLiveReviewRun(input: {
  id: string;
  claimedAt: Date;
  filesRevision: string;
  result: LiveReviewResult;
  screenshots?: LiveReviewScreenshotSet | null;
  desktopBlobPath?: string | null;
  mobileBlobPath?: string | null;
  modelAttempts?: number;
}): Promise<boolean> {
  if (!dbConfigured) return false;
  const now = new Date();
  const skipReason = input.result.status === "skipped" ? input.result.reason : null;
  try {
    const updated = await db
      .update(liveReviewRuns)
      .set({
        status: input.result.status === "completed" ? "completed" : "skipped",
        skipReason,
        result: input.result,
        desktopUrl: input.screenshots?.desktopUrl ?? null,
        mobileUrl: input.screenshots?.mobileUrl ?? null,
        desktopBlobPath: input.desktopBlobPath ?? null,
        mobileBlobPath: input.mobileBlobPath ?? null,
        modelAttempts: input.modelAttempts ?? 0,
        completedAt: now,
        expiresAt: liveReviewExpiresAt(now),
      })
      .where(
        and(
          eq(liveReviewRuns.id, input.id),
          eq(liveReviewRuns.status, "running"),
          eq(liveReviewRuns.claimedAt, input.claimedAt),
          eq(liveReviewRuns.filesRevision, input.filesRevision),
        ),
      )
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

export async function abandonLiveReviewRun(id: string, claimedAt?: Date): Promise<void> {
  if (!dbConfigured) return;
  try {
    await db
      .delete(liveReviewRuns)
      .where(
        and(
          eq(liveReviewRuns.id, id),
          eq(liveReviewRuns.status, "running"),
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

/**
 * Reserve the paid critic slot only if this handler still owns the lease.
 * Returns null when another postcheck took over or the attempt cap is hit.
 */
export async function beginPaidLiveReviewAttempt(input: {
  id: string;
  claimedAt: Date;
}): Promise<number | null> {
  if (!dbConfigured) return null;
  try {
    const rows = await db
      .update(liveReviewRuns)
      .set({
        modelAttempts: sql`${liveReviewRuns.modelAttempts} + 1`,
      })
      .where(
        and(
          eq(liveReviewRuns.id, input.id),
          eq(liveReviewRuns.status, "running"),
          eq(liveReviewRuns.claimedAt, input.claimedAt),
          lt(liveReviewRuns.modelAttempts, LIVE_REVIEW_MAX_MODEL_ATTEMPTS),
        ),
      )
      .returning({ modelAttempts: liveReviewRuns.modelAttempts });
    return rows[0]?.modelAttempts ?? null;
  } catch {
    return null;
  }
}

export async function incrementLiveReviewModelAttempts(id: string): Promise<number> {
  if (!dbConfigured) return LIVE_REVIEW_MAX_MODEL_ATTEMPTS;
  try {
    const rows = await db
      .select({ modelAttempts: liveReviewRuns.modelAttempts })
      .from(liveReviewRuns)
      .where(eq(liveReviewRuns.id, id))
      .limit(1);
    const next = (rows[0]?.modelAttempts ?? 0) + 1;
    await db.update(liveReviewRuns).set({ modelAttempts: next }).where(eq(liveReviewRuns.id, id));
    return next;
  } catch {
    return LIVE_REVIEW_MAX_MODEL_ATTEMPTS;
  }
}

export async function getLiveReviewRunForVersion(
  versionId: string,
  filesRevision?: string | null,
): Promise<LiveReviewRunRow | null> {
  if (!versionId.trim() || !dbConfigured) return null;
  try {
    // ORDER BY i SQL före LIMIT — annars tar vi 8 godtyckliga rader och kan
    // missa den nyaste färdiga reviewn när en version har fler revisioner
    // (PR-granskningsfynd F-c264a864d347).
    const normalizedRevision = filesRevision?.trim() || null;
    const rows = await db
      .select()
      .from(liveReviewRuns)
      .where(
        normalizedRevision
          ? and(
              eq(liveReviewRuns.versionId, versionId.trim()),
              eq(liveReviewRuns.filesRevision, normalizedRevision),
            )
          : eq(liveReviewRuns.versionId, versionId.trim()),
      )
      .orderBy(desc(liveReviewRuns.completedAt))
      .limit(8);
    const completed = rows
      .map(mapRow)
      .filter((row) => row.status === "completed" || row.status === "skipped")
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
  previousVersionId?: string | null;
  previousFilesRevision?: string | null;
}): Promise<LiveReviewScreenshotSet & { hasStoredRun: boolean }> {
  if (!dbConfigured) {
    return { desktopUrl: null, mobileUrl: null, hasStoredRun: false };
  }
  try {
    const exactPreviousVersionId = input.previousVersionId?.trim() || null;
    if (exactPreviousVersionId) {
      const exactPreviousFilesRevision = input.previousFilesRevision?.trim() || null;
      // Without an exact content identity, a same-version in-place repair can
      // make "latest parent JPEG" refer to different files than the diff.
      // Fail closed and suppress legacy-log fallback instead of mixing truths.
      if (!exactPreviousFilesRevision) {
        return { desktopUrl: null, mobileUrl: null, hasStoredRun: true };
      }
      const exactRows = await db
        .select()
        .from(liveReviewRuns)
        .where(
          and(
            eq(liveReviewRuns.chatId, input.chatId),
            eq(liveReviewRuns.versionId, exactPreviousVersionId),
            eq(liveReviewRuns.filesRevision, exactPreviousFilesRevision),
            eq(liveReviewRuns.status, "completed"),
          ),
        )
        .orderBy(desc(liveReviewRuns.completedAt));
      const exact = exactRows.map(mapRow).find((row) => row.desktopUrl || row.mobileUrl);
      return {
        desktopUrl: exact?.desktopUrl ?? null,
        mobileUrl: exact?.mobileUrl ?? null,
        previousDesktopUrl: exact?.desktopUrl ?? null,
        previousMobileUrl: exact?.mobileUrl ?? null,
        // A row with scrubbed URLs is authoritative evidence that its blobs
        // were deleted. Callers must not resurrect stale URLs from old logs.
        hasStoredRun: exactRows.length > 0,
      };
    }
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
      hasStoredRun: rows.length > 0,
    };
  } catch {
    return { desktopUrl: null, mobileUrl: null, hasStoredRun: false };
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

/**
 * Hide public URLs while retaining one exact deletion target per viewport in
 * the existing blob-path columns. Those columns then act as a durable cleanup
 * tombstone: a transient Blob failure can be retried without resurrecting the
 * JPEG in UI/log fallback, and no schema migration is required.
 */
function buildRunCleanupTombstone(row: LiveReviewRunRow): LiveReviewRunRow {
  return {
    ...row,
    desktopUrl: null,
    mobileUrl: null,
    desktopBlobPath: row.desktopUrl ?? row.desktopBlobPath,
    mobileBlobPath: row.mobileUrl ?? row.mobileBlobPath,
  };
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
  keepRunId: string;
  keepClaimedAt: Date;
}): Promise<number> {
  if (!dbConfigured) return 0;
  try {
    const keepVersions = await db
      .select({
        id: engineVersions.id,
        versionNumber: engineVersions.versionNumber,
        filesRevision: engineVersions.filesRevision,
      })
      .from(engineVersions)
      .where(
        and(eq(engineVersions.id, input.keepVersionId), eq(engineVersions.chatId, input.chatId)),
      )
      .limit(1);
    const keepVersion = keepVersions[0];
    // A late review for a now-repaired revision owns no cleanup authority.
    if (!keepVersion || keepVersion.filesRevision !== input.keepFilesRevision) return 0;

    const rows = await db
      .select()
      .from(liveReviewRuns)
      .where(
        and(
          eq(liveReviewRuns.chatId, input.chatId),
          eq(liveReviewRuns.status, "completed"),
          ne(liveReviewRuns.id, input.keepRunId),
        ),
      );
    const candidateVersionIds = [...new Set(rows.map((row) => row.versionId))];
    const candidateVersions =
      candidateVersionIds.length === 0
        ? []
        : await db
            .select({ id: engineVersions.id, versionNumber: engineVersions.versionNumber })
            .from(engineVersions)
            .where(
              and(
                eq(engineVersions.chatId, input.chatId),
                inArray(engineVersions.id, candidateVersionIds),
              ),
            );
    const candidateVersionNumbers = new Map(
      candidateVersions.map((version) => [version.id, version.versionNumber]),
    );
    let deleted = 0;
    for (const raw of rows) {
      const row = mapRow(raw);
      if (row.status !== "completed") continue;
      const candidateVersionNumber = candidateVersionNumbers.get(row.versionId) ?? null;
      const isOlderVersion =
        candidateVersionNumber !== null && candidateVersionNumber < keepVersion.versionNumber;
      const isOlderRevisionOfSameVersion =
        row.versionId === input.keepVersionId &&
        row.filesRevision !== input.keepFilesRevision &&
        row.claimedAt.getTime() < input.keepClaimedAt.getTime();
      if (!isOlderVersion && !isOlderRevisionOfSameVersion) continue;

      // Scrub public references with a monotonic/CAS guard BEFORE touching
      // Blob, but retain exact deletion targets as durable tombstones. This is
      // the authority handoff: a late v2 completion can never scrub v3, a
      // repaired keep version invalidates the update atomically, and a
      // transient Blob failure remains retryable on the next cleanup pass.
      const monotonicGuard =
        row.versionId === input.keepVersionId
          ? lt(liveReviewRuns.claimedAt, input.keepClaimedAt)
          : sql`EXISTS (
              SELECT 1 FROM ${engineVersions}
              WHERE ${engineVersions.id} = ${liveReviewRuns.versionId}
                AND ${engineVersions.chatId} = ${input.chatId}
                AND ${engineVersions.versionNumber} < ${keepVersion.versionNumber}
            )`;
      const tombstone = buildRunCleanupTombstone(row);
      const scrubbed = await db
        .update(liveReviewRuns)
        .set({
          desktopUrl: null,
          mobileUrl: null,
          desktopBlobPath: tombstone.desktopBlobPath,
          mobileBlobPath: tombstone.mobileBlobPath,
        })
        .where(
          and(
            eq(liveReviewRuns.id, row.id),
            eq(liveReviewRuns.chatId, input.chatId),
            eq(liveReviewRuns.status, "completed"),
            eq(liveReviewRuns.claimedAt, row.claimedAt),
            eq(liveReviewRuns.filesRevision, row.filesRevision),
            sql`EXISTS (
              SELECT 1 FROM ${engineVersions}
              WHERE ${engineVersions.id} = ${input.keepVersionId}
                AND ${engineVersions.chatId} = ${input.chatId}
                AND ${engineVersions.filesRevision} = ${input.keepFilesRevision}
            )`,
            monotonicGuard,
          ),
        )
        .returning({ id: liveReviewRuns.id });
      if (!scrubbed[0]) continue;
      const removed = await deleteRunBlobs(tombstone);
      if (!removed) continue;
      const cleared = await db
        .update(liveReviewRuns)
        .set({ desktopBlobPath: null, mobileBlobPath: null })
        .where(
          and(
            eq(liveReviewRuns.id, row.id),
            eq(liveReviewRuns.chatId, input.chatId),
            eq(liveReviewRuns.status, "completed"),
            eq(liveReviewRuns.claimedAt, row.claimedAt),
            eq(liveReviewRuns.filesRevision, row.filesRevision),
            sql`EXISTS (
              SELECT 1 FROM ${engineVersions}
              WHERE ${engineVersions.id} = ${input.keepVersionId}
                AND ${engineVersions.chatId} = ${input.chatId}
                AND ${engineVersions.filesRevision} = ${input.keepFilesRevision}
            )`,
            monotonicGuard,
          ),
        )
        .returning({ id: liveReviewRuns.id });
      if (cleared[0]) deleted += 1;
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

export async function purgeExpiredLiveReviewBlobs(now: Date = new Date()): Promise<number> {
  if (!dbConfigured) return 0;
  try {
    const rows = await db
      .select()
      .from(liveReviewRuns)
      .where(and(lt(liveReviewRuns.expiresAt, now), ne(liveReviewRuns.status, "running")));
    let deleted = 0;
    for (const raw of rows) {
      const row = mapRow(raw);
      if (row.status === "running") continue;
      const tombstone = buildRunCleanupTombstone(row);
      // Atomically hide public URLs while preserving exact cleanup targets.
      // If a retry took over after SELECT it is running/renewed and this CAS
      // returns zero, so its JPEGs remain untouched.
      const scrubbedRows = await db
        .update(liveReviewRuns)
        .set({
          desktopUrl: null,
          mobileUrl: null,
          desktopBlobPath: tombstone.desktopBlobPath,
          mobileBlobPath: tombstone.mobileBlobPath,
        })
        .where(
          and(
            eq(liveReviewRuns.id, row.id),
            eq(liveReviewRuns.status, row.status),
            ne(liveReviewRuns.status, "running"),
            eq(liveReviewRuns.claimedAt, row.claimedAt),
            eq(liveReviewRuns.filesRevision, row.filesRevision),
            eq(liveReviewRuns.expiresAt, row.expiresAt),
            lt(liveReviewRuns.expiresAt, now),
          ),
        )
        .returning({ id: liveReviewRuns.id });
      if (!scrubbedRows[0]) continue;
      const removed = await deleteRunBlobs(tombstone);
      if (!removed) {
        console.warn("[live-review-claim] expired Blob cleanup deferred for retry", {
          runId: row.id,
        });
        continue;
      }
      // Remove the row only after Blob deletion succeeded. The same exact
      // lease/revision/expiry CAS prevents deleting a concurrently renewed run.
      const removedRows = await db
        .delete(liveReviewRuns)
        .where(
          and(
            eq(liveReviewRuns.id, row.id),
            eq(liveReviewRuns.status, row.status),
            ne(liveReviewRuns.status, "running"),
            eq(liveReviewRuns.claimedAt, row.claimedAt),
            eq(liveReviewRuns.filesRevision, row.filesRevision),
            eq(liveReviewRuns.expiresAt, row.expiresAt),
            lt(liveReviewRuns.expiresAt, now),
          ),
        )
        .returning({ id: liveReviewRuns.id });
      if (removedRows[0]) deleted += 1;
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
