import { and, eq, lt, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, dbConfigured } from "@/lib/db/client";
import { productPostcheckRuns } from "@/lib/db/schema";
import {
  isInfrastructureSkipReason,
  isNonFinalProductPostcheckSkipReason,
} from "@/lib/gen/verify/product-postcheck-skip";
import type { ProductPostcheckResult } from "@/lib/gen/verify/product-postcheck";

/**
 * Lease must outlive the route's `maxDuration` (300s). A live handler that
 * is still inside its platform deadline must not be stolen by a retry.
 * Same 6-minute bound as live-review claims.
 */
export const PRODUCT_POSTCHECK_CLAIM_LEASE_MS = 6 * 60 * 1000;
export const PRODUCT_POSTCHECK_CLAIM_WAIT_MS = 180_000;
export const PRODUCT_POSTCHECK_RUN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type ProductPostcheckRunStatus = "running" | "completed" | "skipped";

export interface ProductPostcheckRunRow {
  id: string;
  chatId: string;
  versionId: string;
  filesRevision: string;
  previewSessionId: string;
  lifecycleToken: string;
  verificationRunId: string | null;
  status: ProductPostcheckRunStatus;
  skipReason: string | null;
  result: ProductPostcheckResult | null;
  claimedAt: Date;
  leaseExpiresAt: Date;
  completedAt: Date | null;
  expiresAt: Date;
}

export type ProductPostcheckClaimDecision =
  | { kind: "acquired" }
  | { kind: "cached"; result: ProductPostcheckResult }
  | { kind: "in_flight" }
  | { kind: "takeover" };

export type ClaimedProductPostcheck =
  | { kind: "acquired"; row: ProductPostcheckRunRow }
  | { kind: "cached"; result: ProductPostcheckResult; row: ProductPostcheckRunRow }
  | { kind: "in_flight"; row: ProductPostcheckRunRow };

export function normalizeProductPostcheckLifecycleToken(
  lifecycleToken: string | null | undefined,
): string {
  return lifecycleToken?.trim() || "";
}

export function productPostcheckLeaseExpiresAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + PRODUCT_POSTCHECK_CLAIM_LEASE_MS);
}

export function productPostcheckRowExpiresAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + PRODUCT_POSTCHECK_RUN_TTL_MS);
}

export function isProductPostcheckClaimLeaseStale(
  row: Pick<ProductPostcheckRunRow, "claimedAt" | "leaseExpiresAt">,
  now: Date = new Date(),
): boolean {
  return now.getTime() >= row.leaseExpiresAt.getTime();
}

/**
 * Pure claim policy. The DB layer inserts first; this decides what a
 * conflicting existing row means.
 *
 * Fail-open for *unknown* status is still in_flight (do not start a second
 * browser). Infrastructure skips (playwright_unavailable, browser_crashed,
 * capture_failed) are takeover so a client infra-retry can run once the
 * first attempt already recorded a skip.
 */
export function decideProductPostcheckClaim(
  existing: ProductPostcheckRunRow,
  now: Date = new Date(),
): ProductPostcheckClaimDecision {
  if (existing.status === "completed" && existing.result) {
    return { kind: "cached", result: existing.result };
  }
  if (existing.status === "skipped" && existing.result) {
    const reason = existing.skipReason ?? existing.result.skippedReason;
    // Infrastructure skips say nothing about the site, and non-final outcomes
    // (claim_busy / timeout / runtime_error) are not an answer for this target
    // at all. Serving either from cache would let one bad attempt poison the
    // tuple for the row's whole TTL — before single-flight a retry simply ran
    // the check again.
    if (isInfrastructureSkipReason(reason) || isNonFinalProductPostcheckSkipReason(reason)) {
      return { kind: "takeover" };
    }
    return { kind: "cached", result: existing.result };
  }
  if (existing.status === "running") {
    if (!isProductPostcheckClaimLeaseStale(existing, now)) {
      return { kind: "in_flight" };
    }
    return { kind: "takeover" };
  }
  return { kind: "in_flight" };
}

function mapRow(row: typeof productPostcheckRuns.$inferSelect): ProductPostcheckRunRow {
  return {
    id: row.id,
    chatId: row.chatId,
    versionId: row.versionId,
    filesRevision: row.filesRevision,
    previewSessionId: row.previewSessionId,
    lifecycleToken: row.lifecycleToken,
    verificationRunId: row.verificationRunId,
    status: row.status as ProductPostcheckRunStatus,
    skipReason: row.skipReason,
    result: asStoredResult(row.result),
    claimedAt: row.claimedAt,
    leaseExpiresAt: row.leaseExpiresAt,
    completedAt: row.completedAt,
    expiresAt: row.expiresAt,
  };
}

function asStoredResult(value: unknown): ProductPostcheckResult | null {
  if (!value || typeof value !== "object") return null;
  const result = value as ProductPostcheckResult;
  if (result.ok !== true || typeof result.skipped !== "boolean") return null;
  return result;
}

function isUndefinedTableError(error: unknown): boolean {
  if (error && typeof error === "object" && "code" in error) {
    if ((error as { code?: unknown }).code === "42P01") return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /relation ["']?product_postcheck_runs["']? does not exist/i.test(message);
}

/**
 * True when `product_postcheck_runs` exists. Mirrors `leaseTableExists()`:
 * Postgres resolves relation names at parse time, so a missing table cannot
 * be guarded inside the claim INSERT. `to_regclass(text)` never references
 * the table as a relation, so this probe is safe pre-migration.
 */
export async function productPostcheckRunsTableExists(): Promise<boolean> {
  if (!dbConfigured) return false;
  try {
    const res = await db.execute(
      sql`SELECT to_regclass('public.product_postcheck_runs') AS oid`,
    );
    const rows = (res as unknown as { rows?: Array<{ oid: string | null }> }).rows ?? [];
    return rows.length > 0 && rows[0]?.oid != null;
  } catch {
    return false;
  }
}

async function selectRun(input: {
  versionId: string;
  filesRevision: string;
  previewSessionId: string;
  lifecycleToken: string;
}): Promise<ProductPostcheckRunRow | null> {
  const rows = await db
    .select()
    .from(productPostcheckRuns)
    .where(
      and(
        eq(productPostcheckRuns.versionId, input.versionId),
        eq(productPostcheckRuns.filesRevision, input.filesRevision),
        eq(productPostcheckRuns.previewSessionId, input.previewSessionId),
        eq(productPostcheckRuns.lifecycleToken, input.lifecycleToken),
      ),
    )
    .limit(1);
  return rows[0] ? mapRow(rows[0]) : null;
}

async function applyExistingDecision(
  existing: ProductPostcheckRunRow,
  now: Date,
): Promise<ClaimedProductPostcheck> {
  const decision = decideProductPostcheckClaim(existing, now);
  if (decision.kind === "cached") {
    return { kind: "cached", result: decision.result, row: existing };
  }
  if (decision.kind === "in_flight") {
    return { kind: "in_flight", row: existing };
  }
  if (decision.kind === "takeover") {
    const updated = await db
      .update(productPostcheckRuns)
      .set({
        status: "running",
        claimedAt: now,
        leaseExpiresAt: productPostcheckLeaseExpiresAt(now),
        expiresAt: productPostcheckRowExpiresAt(now),
        skipReason: null,
        result: null,
        completedAt: null,
      })
      .where(
        and(
          eq(productPostcheckRuns.id, existing.id),
          or(
            and(
              eq(productPostcheckRuns.status, "running"),
              lt(productPostcheckRuns.leaseExpiresAt, now),
            ),
            eq(productPostcheckRuns.status, "skipped"),
          ),
        ),
      )
      .returning();
    if (updated[0]) return { kind: "acquired", row: mapRow(updated[0]) };
    const raced = await selectRun({
      versionId: existing.versionId,
      filesRevision: existing.filesRevision,
      previewSessionId: existing.previewSessionId,
      lifecycleToken: existing.lifecycleToken,
    });
    if (raced?.result && raced.status !== "running") {
      return { kind: "cached", result: raced.result, row: raced };
    }
    return { kind: "in_flight", row: raced ?? existing };
  }
  return { kind: "in_flight", row: existing };
}

export type ProductPostcheckClaimKey = {
  versionId: string;
  filesRevision: string;
  previewSessionId: string;
  lifecycleToken: string | null;
};

/**
 * Insert-first claim. `null` means "protection unavailable" — the route
 * MUST fall back to today's behaviour (run the postcheck). This is a
 * resource/duplication guard, not a correctness gate: failing closed
 * here would block every postcheck on a pod whose DB has not applied
 * `add-product-postcheck-runs.sql` yet, which is worse than the bug.
 */
export async function claimProductPostcheckRun(input: {
  chatId: string;
  versionId: string;
  filesRevision: string;
  previewSessionId: string;
  lifecycleToken: string | null;
  verificationRunId: string;
}): Promise<ClaimedProductPostcheck | null> {
  if (!dbConfigured) return null;
  const tableExists = await productPostcheckRunsTableExists();
  if (!tableExists) return null;

  const now = new Date();
  const lifecycleToken = normalizeProductPostcheckLifecycleToken(input.lifecycleToken);
  const id = `ppr_${randomUUID()}`;
  try {
    const inserted = await db
      .insert(productPostcheckRuns)
      .values({
        id,
        chatId: input.chatId,
        versionId: input.versionId,
        filesRevision: input.filesRevision,
        previewSessionId: input.previewSessionId,
        lifecycleToken,
        verificationRunId: input.verificationRunId,
        status: "running",
        claimedAt: now,
        leaseExpiresAt: productPostcheckLeaseExpiresAt(now),
        expiresAt: productPostcheckRowExpiresAt(now),
      })
      .onConflictDoNothing({
        target: [
          productPostcheckRuns.versionId,
          productPostcheckRuns.filesRevision,
          productPostcheckRuns.previewSessionId,
          productPostcheckRuns.lifecycleToken,
        ],
      })
      .returning();
    if (inserted[0]) return { kind: "acquired", row: mapRow(inserted[0]) };

    const existing = await selectRun({
      versionId: input.versionId,
      filesRevision: input.filesRevision,
      previewSessionId: input.previewSessionId,
      lifecycleToken,
    });
    if (!existing) return null;
    return applyExistingDecision(existing, now);
  } catch (error) {
    if (isUndefinedTableError(error)) return null;
    console.warn(
      "[product-postcheck-claim] claim failed:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

export async function waitForProductPostcheckRun(input: {
  versionId: string;
  filesRevision: string;
  previewSessionId: string;
  lifecycleToken: string | null;
  timeoutMs?: number;
}): Promise<ProductPostcheckResult | null> {
  const deadline = Date.now() + (input.timeoutMs ?? PRODUCT_POSTCHECK_CLAIM_WAIT_MS);
  const lifecycleToken = normalizeProductPostcheckLifecycleToken(input.lifecycleToken);
  while (Date.now() < deadline) {
    const row = dbConfigured
      ? await selectRun({
          versionId: input.versionId,
          filesRevision: input.filesRevision,
          previewSessionId: input.previewSessionId,
          lifecycleToken,
        }).catch(() => null)
      : null;
    if (row && row.status !== "running" && row.result) return row.result;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return null;
}

async function finishRun(input: {
  id: string;
  claimedAt?: Date;
  result: ProductPostcheckResult;
}): Promise<boolean> {
  if (!dbConfigured) return false;
  const now = new Date();
  const skipReason = input.result.skipped ? input.result.skippedReason : null;
  try {
    const updated = await db
      .update(productPostcheckRuns)
      .set({
        status: input.result.skipped ? "skipped" : "completed",
        skipReason,
        result: input.result,
        verificationRunId: input.result.verificationRunId ?? undefined,
        completedAt: now,
        expiresAt: productPostcheckRowExpiresAt(now),
      })
      .where(
        and(
          eq(productPostcheckRuns.id, input.id),
          eq(productPostcheckRuns.status, "running"),
          ...(input.claimedAt ? [eq(productPostcheckRuns.claimedAt, input.claimedAt)] : []),
        ),
      )
      .returning({ id: productPostcheckRuns.id });
    return updated.length > 0;
  } catch (error) {
    if (isUndefinedTableError(error)) return false;
    console.warn(
      "[product-postcheck-claim] complete failed:",
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}

export async function completeProductPostcheckRun(input: {
  id: string;
  claimedAt?: Date;
  result: ProductPostcheckResult;
}): Promise<boolean> {
  return finishRun(input);
}

export async function failProductPostcheckRun(input: {
  id: string;
  claimedAt?: Date;
  result: ProductPostcheckResult;
}): Promise<boolean> {
  return finishRun(input);
}
