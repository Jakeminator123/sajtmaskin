import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, dbConfigured } from "@/lib/db/client";
import type { ProductPostcheckResult } from "@/lib/gen/verify/product-postcheck";

/**
 * Lease must outlive the route `maxDuration` (300s). A live handler still
 * inside its platform deadline must not be stolen by a retry.
 */
export const PRODUCT_POSTCHECK_CLAIM_LEASE_MS = 6 * 60 * 1000;

export type ProductPostcheckRunStatus =
  | "running"
  | "passed"
  | "blocked"
  | "failed"
  | "superseded"
  | "expired";

export type ProductPostcheckClaimKey = {
  versionId: string;
  filesRevision: string;
  previewSession: string;
  lifecycleToken: string | null;
  mutationRevision: number | null;
};

export type NormalizedProductPostcheckClaimKey = {
  versionId: string;
  filesRevision: string;
  previewSession: string;
  lifecycleToken: string;
  mutationRevision: number;
};

export type ProductPostcheckTablePresence = "exists" | "missing" | "unavailable";

export type ClaimedProductPostcheck =
  | {
      kind: "acquired";
      runId: string;
      claimGeneration: number;
      owner: string;
    }
  | {
      kind: "busy";
      runId: string;
      claimGeneration: number;
      status: ProductPostcheckRunStatus;
    }
  | {
      kind: "settled";
      runId: string;
      claimGeneration: number;
      status: "passed" | "blocked";
    }
  | {
      kind: "unavailable";
      reason: "missing" | "unavailable" | "db_error" | "not_configured";
    };

type ClaimRow = {
  run_id: string;
  owner: string;
  claim_generation: number;
  status: string;
  expires_at: Date | string;
};

function asRows(result: unknown): ClaimRow[] {
  return (result as { rows?: ClaimRow[] } | undefined)?.rows ?? [];
}

export function normalizeProductPostcheckLifecycleToken(
  lifecycleToken: string | null | undefined,
): string {
  return lifecycleToken?.trim() || "";
}

export function normalizeProductPostcheckMutationRevision(
  mutationRevision: number | null | undefined,
): number {
  return typeof mutationRevision === "number" &&
    Number.isSafeInteger(mutationRevision) &&
    mutationRevision > 0
    ? mutationRevision
    : 0;
}

export function normalizeProductPostcheckClaimKey(
  key: ProductPostcheckClaimKey,
): NormalizedProductPostcheckClaimKey {
  return {
    versionId: key.versionId.trim(),
    filesRevision: key.filesRevision.trim(),
    previewSession: key.previewSession.trim(),
    lifecycleToken: normalizeProductPostcheckLifecycleToken(key.lifecycleToken),
    mutationRevision: normalizeProductPostcheckMutationRevision(key.mutationRevision),
  };
}

export function productPostcheckClaimExpiresAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + PRODUCT_POSTCHECK_CLAIM_LEASE_MS);
}

export function isProductPostcheckClaimExpired(
  expiresAt: Date | string,
  now: Date = new Date(),
): boolean {
  const ms = expiresAt instanceof Date ? expiresAt.getTime() : new Date(expiresAt).getTime();
  return now.getTime() >= ms;
}

const RETRYABLE_TERMINAL_STATUSES = new Set(["failed", "superseded", "expired"]);

export function isSettledProductPostcheckStatus(
  status: string,
): status is "passed" | "blocked" {
  return status === "passed" || status === "blocked";
}

/**
 * Takeover is only for a dead holder: expired `running`, or a retryable
 * terminal (`failed` / `superseded` / `expired`). `passed` / `blocked` are
 * finished product verdicts — reclaiming them starts a second Chromium
 * for the same tuple (resume after `claim_busy`).
 */
export function isTakeoverEligibleProductPostcheckRow(
  row: { status: string; expiresAt: Date | string },
  now: Date = new Date(),
): boolean {
  if (row.status === "running") {
    return isProductPostcheckClaimExpired(row.expiresAt, now);
  }
  return RETRYABLE_TERMINAL_STATUSES.has(row.status);
}

export function mapProductPostcheckResultToStatus(
  result: Pick<ProductPostcheckResult, "skipped" | "skippedReason" | "productBlocked">,
): Exclude<ProductPostcheckRunStatus, "running" | "expired"> {
  if (result.skippedReason === "preview_superseded") return "superseded";
  if (result.productBlocked) return "blocked";
  if (result.skipped) return "failed";
  return "passed";
}

function parseStatus(value: string): ProductPostcheckRunStatus {
  if (
    value === "running" ||
    value === "passed" ||
    value === "blocked" ||
    value === "failed" ||
    value === "superseded" ||
    value === "expired"
  ) {
    return value;
  }
  return "running";
}

function mapClaimRow(
  row: ClaimRow,
): { runId: string; owner: string; claimGeneration: number; status: ProductPostcheckRunStatus } {
  return {
    runId: row.run_id,
    owner: row.owner,
    claimGeneration: Number(row.claim_generation),
    status: parseStatus(row.status),
  };
}

/**
 * Definitive presence of `product_postcheck_runs`. Same tri-state as L4
 * `leaseTableExists`: collapsing probe errors into "missing" would let the
 * route invent a second Chromium job.
 */
export async function productPostcheckRunsTablePresence(): Promise<ProductPostcheckTablePresence> {
  if (!dbConfigured) return "unavailable";
  try {
    const res = await db.execute(sql`SELECT to_regclass('public.product_postcheck_runs') AS oid`);
    const rows = (res as unknown as { rows?: Array<{ oid: string | null }> }).rows ?? [];
    if (rows.length === 0) return "unavailable";
    return rows[0]?.oid != null ? "exists" : "missing";
  } catch {
    return "unavailable";
  }
}

async function selectClaimRow(
  key: NormalizedProductPostcheckClaimKey,
): Promise<(ClaimRow & { expires_at: Date | string }) | null> {
  const result = await db.execute(sql`
    SELECT run_id, owner, claim_generation, status, expires_at
    FROM product_postcheck_runs
    WHERE version_id = ${key.versionId}
      AND files_revision = ${key.filesRevision}
      AND preview_session = ${key.previewSession}
      AND lifecycle_token = ${key.lifecycleToken}
      AND mutation_revision = ${key.mutationRevision}
    LIMIT 1
  `);
  return asRows(result)[0] ?? null;
}

/**
 * Atomically claim the single-flight slot for this revision tuple.
 *
 * Fail-closed: missing table, probe error, or any claim exception becomes
 * `unavailable` — the route must answer 503 and must not start Chromium.
 */
export async function claimProductPostcheckRun(input: {
  chatId: string;
  owner: string;
  key: ProductPostcheckClaimKey;
}): Promise<ClaimedProductPostcheck> {
  if (!dbConfigured) return { kind: "unavailable", reason: "not_configured" };

  const presence = await productPostcheckRunsTablePresence();
  if (presence !== "exists") {
    return { kind: "unavailable", reason: presence };
  }

  const key = normalizeProductPostcheckClaimKey(input.key);
  if (
    !key.versionId ||
    !key.filesRevision ||
    !key.previewSession ||
    key.previewSession === "unbound"
  ) {
    return { kind: "unavailable", reason: "db_error" };
  }

  const runId = randomUUID();
  const owner = input.owner.trim() || "anonymous";
  const leaseSeconds = Math.round(PRODUCT_POSTCHECK_CLAIM_LEASE_MS / 1000);

  try {
    const inserted = asRows(
      await db.execute(sql`
        INSERT INTO product_postcheck_runs (
          run_id, chat_id, version_id, files_revision, preview_session,
          lifecycle_token, mutation_revision, owner, claim_generation,
          status, claimed_at, expires_at
        ) VALUES (
          ${runId}, ${input.chatId}, ${key.versionId}, ${key.filesRevision},
          ${key.previewSession}, ${key.lifecycleToken}, ${key.mutationRevision},
          ${owner}, 1, 'running', now(),
          now() + ${leaseSeconds} * interval '1 second'
        )
        ON CONFLICT (version_id, files_revision, preview_session, lifecycle_token, mutation_revision)
        DO NOTHING
        RETURNING run_id, owner, claim_generation, status, expires_at
      `),
    );
    if (inserted[0]) {
      const row = mapClaimRow(inserted[0]);
      return {
        kind: "acquired",
        runId: row.runId,
        claimGeneration: row.claimGeneration,
        owner: row.owner,
      };
    }

    const existing = await selectClaimRow(key);
    if (!existing) return { kind: "unavailable", reason: "db_error" };

    const existingMapped = mapClaimRow(existing);
    if (isSettledProductPostcheckStatus(existingMapped.status)) {
      return {
        kind: "settled",
        runId: existingMapped.runId,
        claimGeneration: existingMapped.claimGeneration,
        status: existingMapped.status,
      };
    }

    // Takeover authority is Postgres `now()`, not this process clock.
    // Running + unexpired → 0 rows → busy. Expired running or
    // failed/superseded/expired may be reclaimed. passed/blocked never.
    // CAS on claim_generation serializes two concurrent takeovers.
    const taken = asRows(
      await db.execute(sql`
        UPDATE product_postcheck_runs
        SET run_id = ${runId},
            owner = ${owner},
            claim_generation = claim_generation + 1,
            status = 'running',
            claimed_at = now(),
            expires_at = now() + ${leaseSeconds} * interval '1 second',
            completed_at = NULL
        WHERE version_id = ${key.versionId}
          AND files_revision = ${key.filesRevision}
          AND preview_session = ${key.previewSession}
          AND lifecycle_token = ${key.lifecycleToken}
          AND mutation_revision = ${key.mutationRevision}
          AND claim_generation = ${Number(existing.claim_generation)}
          AND (
            (status = 'running' AND expires_at <= now())
            OR status IN ('failed', 'superseded', 'expired')
          )
        RETURNING run_id, owner, claim_generation, status, expires_at
      `),
    );
    if (taken[0]) {
      const row = mapClaimRow(taken[0]);
      return {
        kind: "acquired",
        runId: row.runId,
        claimGeneration: row.claimGeneration,
        owner: row.owner,
      };
    }

    const raced = (await selectClaimRow(key)) ?? existing;
    const row = mapClaimRow(raced);
    if (isSettledProductPostcheckStatus(row.status)) {
      return {
        kind: "settled",
        runId: row.runId,
        claimGeneration: row.claimGeneration,
        status: row.status,
      };
    }
    return {
      kind: "busy",
      runId: row.runId,
      claimGeneration: row.claimGeneration,
      status: row.status,
    };
  } catch (error) {
    console.warn(
      "[product-postcheck-claim] claim failed (fail-closed):",
      error instanceof Error ? error.message : error,
    );
    return { kind: "unavailable", reason: "db_error" };
  }
}

/**
 * Complete the claim. CAS on `run_id` + `claim_generation` — a displaced
 * owner after takeover writes zero rows (no-op).
 */
export async function completeProductPostcheckRun(input: {
  runId: string;
  claimGeneration: number;
  status: Exclude<ProductPostcheckRunStatus, "running">;
}): Promise<boolean> {
  if (!dbConfigured) return false;
  try {
    const updated = asRows(
      await db.execute(sql`
        UPDATE product_postcheck_runs
        SET status = ${input.status},
            completed_at = now()
        WHERE run_id = ${input.runId}
          AND claim_generation = ${input.claimGeneration}
          AND status = 'running'
        RETURNING run_id, owner, claim_generation, status, expires_at
      `),
    );
    return updated.length > 0;
  } catch (error) {
    console.warn(
      "[product-postcheck-claim] complete failed:",
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}
