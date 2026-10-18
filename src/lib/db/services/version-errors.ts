import { and, desc, eq, gt, inArray, lt, notInArray, notLike, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import { FEATURES } from "@/lib/config";
import { getScaffoldById } from "@/lib/gen/scaffolds";
import { engineChats, engineVersionErrorLogs, engineVersionJobs, engineVersions, productPostcheckRuns } from "@/lib/db/schema";
import { LEASE_LOCK_TIMEOUT_MS } from "@/lib/db/chat-repository/internal";
import { isLiveReviewHeldContext, type LiveReviewHeldContext } from "./live-review-runs";
import { mapProductPostcheckResultToStatus, normalizeProductPostcheckClaimKey, type ProductPostcheckClaimKey } from "./product-postcheck-runs";
import { buildProductPostcheckLogItems, isNonBlockingPreviewBootResult } from "@/lib/gen/verify/product-postcheck-verdict";
import { isNonFinalProductPostcheckSkipReason } from "@/lib/gen/verify/product-postcheck-skip";
import type { ProductPostcheckResult } from "@/lib/gen/verify/product-postcheck";
import { assertDbConfigured } from "./shared";
import type { VersionErrorLog } from "./shared";
import { appendBugRegisterEntries } from "@/lib/logging/bug-register";
import { classifyVersionDefect } from "@/lib/logging/version-defect-signature";

type VersionErrorLogPayload = {
  chatId: string;
  versionId: string;
  v0VersionId?: string | null;
  level: "info" | "warning" | "error";
  category?: string | null;
  message: string;
  meta?: Record<string, unknown> | null;
};

export const SERVER_REPAIR_BUDGET_LOG_CATEGORY = "server-repair:budget";

function rejectBudgetPayloads(payloads: VersionErrorLogPayload[]): void {
  if (payloads.some((payload) => payload.category === SERVER_REPAIR_BUDGET_LOG_CATEGORY)) {
    throw new Error("Server repair budget receipts require their private owner");
  }
  if (payloads.some(payload => payload.category?.startsWith("product_postcheck."))) {
    throw new Error("Product Postcheck receipts require their server owner");
  }
}

export type ProductPostcheckCommitResult =
  | { status: "stored"; logs: VersionErrorLog[] }
  | { status: "superseded"; logs: [] }
  | { status: "contention"; logs: [] };

/**
 * Kategorier som repair-pass-prunet aldrig får röra.
 *
 * Prunet (`pruneStaleVersionErrorLogs`) städar *pipeline-diagnostik* från
 * äldre repair-pass och läser `meta.repairPassIndex`, där en saknad nyckel
 * betyder pass 0. En **gate-observation** beskriver inget repair-pass alls och
 * sätter därför aldrig fältet — utan det här undantaget räknas den som pass 0
 * och raderas vid nästa rena follow-up på samma version. Det träffade R7:s
 * missing-env-rad, vars enda syfte är att vara durabel (granskning 2026-07-29).
 *
 * `preview:client-error` (browser-runtime-fel speglade från preview-iframen,
 * se `src/lib/builder/preview-client-error-report.ts`) är samma sorts
 * observation och sätter heller aldrig `meta.repairPassIndex`.
 */
export const PRUNE_EXEMPT_CATEGORIES = [
  SERVER_REPAIR_BUDGET_LOG_CATEGORY,
  "f3-readiness:missing-env",
  "preview:client-error",
  "server-repair:phase",
  "preview:install-peer-fallback",
] as const;

export const PRUNE_EXEMPT_CATEGORY_PREFIXES = ["product_postcheck."] as const;

type EngineScaffoldContext = {
  scaffoldId: string;
  scaffoldLabel: string | null;
  persistedOn: "engine_chat";
};

function mapLogPayload(payload: VersionErrorLogPayload, now: Date) {
  return {
    id: nanoid(),
    chat_id: payload.chatId,
    version_id: payload.versionId,
    v0_version_id: payload.v0VersionId || null,
    level: payload.level,
    category: payload.category || null,
    message: payload.message,
    meta: payload.meta || null,
    created_at: now,
  };
}

function buildEngineScaffoldContext(scaffoldId: string | null): EngineScaffoldContext | null {
  if (!scaffoldId) return null;
  const manifest = getScaffoldById(scaffoldId);
  return {
    scaffoldId,
    scaffoldLabel: manifest?.label ?? null,
    persistedOn: "engine_chat",
  };
}

function mergeScaffoldContext(
  meta: Record<string, unknown> | null | undefined,
  scaffoldContext: EngineScaffoldContext | null,
) {
  const base = meta && typeof meta === "object" ? { ...meta } : {};
  if (!scaffoldContext) {
    return Object.keys(base).length > 0 ? base : null;
  }

  const existing =
    base.scaffoldContext && typeof base.scaffoldContext === "object"
      ? (base.scaffoldContext as Record<string, unknown>)
      : {};

  return {
    ...base,
    scaffoldContext: {
      ...existing,
      ...scaffoldContext,
    },
  };
}

/**
 * Sätt `meta.defect` ({ kind, signature, file?, line? }) på varje rad.
 *
 * Här och ingen annanstans: liggaren har ett fyrtiotal producenter, och en
 * signatur som bara vissa av dem sätter går inte att räkna på. En anropare som
 * redan skickat `meta.defect` får behålla sin — den vet mer om raden än vad en
 * textklassificerare kan läsa ut.
 */
function mergeDefectClassification(payload: VersionErrorLogPayload): VersionErrorLogPayload {
  const meta = payload.meta && typeof payload.meta === "object" ? payload.meta : null;
  if (meta?.defect) return payload;

  // Klassificeringen är en bekvämlighet ovanpå en rad som ska skrivas oavsett.
  // Den kör på VARJE skrivning till felliggaren, inklusive den best-effort-väg
  // som redan degraderar vid låskonflikt — ett kast här skulle förvandla en
  // diagnostikrad som tidigare gick igenom till ett 500-svar på routen. En
  // saknad signatur är bara en rad som uteblir ur aggregatet.
  let defect: ReturnType<typeof classifyVersionDefect> = null;
  try {
    defect = classifyVersionDefect({
      category: payload.category,
      message: payload.message,
      meta,
    });
  } catch (err) {
    console.warn("[version-errors] defect classification failed:", err);
    return payload;
  }
  if (!defect) return payload;

  return { ...payload, meta: { ...(meta ?? {}), defect } };
}

async function enrichEnginePayloads(
  payloads: VersionErrorLogPayload[],
): Promise<VersionErrorLogPayload[]> {
  // Klassificeringen är ren och kräver ingen DB — den ska därför ske även när
  // scaffold-uppslaget nedan hoppas över, annars tappar just de raderna sin
  // signatur och blir osynliga i aggregatet.
  const classified = payloads.map(mergeDefectClassification);
  const chatIds = Array.from(new Set(classified.map((payload) => payload.chatId).filter(Boolean)));
  if (chatIds.length === 0) return classified;

  const rows = await db
    .select({
      id: engineChats.id,
      scaffoldId: engineChats.scaffoldId,
    })
    .from(engineChats)
    .where(inArray(engineChats.id, chatIds));

  const byChatId = new Map(
    rows.map((row) => [row.id, buildEngineScaffoldContext(row.scaffoldId ?? null)]),
  );

  return classified.map((payload) => ({
    ...payload,
    meta: mergeScaffoldContext(payload.meta, byChatId.get(payload.chatId) ?? null),
  }));
}

/**
 * Postgres `lock_not_available` (55P03) — raised when a transaction-local
 * `lock_timeout` expires while waiting for a row lock. Mirrors the helper in
 * `chat-repository-pg.ts`; duplicated here to avoid a cross-module import cycle.
 */
function isLockTimeoutError(err: unknown): boolean {
  if (err == null || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  if (code === "55P03") return true;
  const cause = (err as { cause?: unknown }).cause;
  return cause != null && cause !== err && isLockTimeoutError(cause);
}

export async function createEngineVersionErrorLogs(
  payloads: VersionErrorLogPayload[],
  options?: {
    /**
     * Best-effort mode (prod incident 2026-07-03, chat 3120c05c): inserting an
     * error-log row takes an FK `FOR KEY SHARE` lock on the referenced
     * `engine_versions` row. When a concurrent verify/lease holds `FOR UPDATE`
     * on that row (quality-gate `acquireVersionLease`), the insert blocked until
     * Supabase's global `statement_timeout` (57014) and the whole route 500:ade —
     * even though these findings are pure diagnostics. A transaction-local
     * `lock_timeout` makes the contended insert give up in ~ms (55P03); we then
     * return `[]` so the caller degrades gracefully instead of surfacing a
     * statement-timeout 500. Same medicine as `updateVersionPreviewUrl` (#370).
     */
    lockTimeoutMs?: number;
  },
): Promise<VersionErrorLog[]> {
  rejectBudgetPayloads(payloads);
  assertDbConfigured();
  if (payloads.length === 0) return [];
  const now = new Date();
  const enrichedPayloads = await enrichEnginePayloads(payloads);
  const values = enrichedPayloads.map((payload) => mapLogPayload(payload, now));

  const lockTimeoutMs = options?.lockTimeoutMs;
  let rows: VersionErrorLog[];
  if (typeof lockTimeoutMs === "number" && Number.isFinite(lockTimeoutMs) && lockTimeoutMs > 0) {
    try {
      rows = (await db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT set_config('lock_timeout', ${String(Math.floor(lockTimeoutMs))}, true)`,
        );
        return await tx.insert(engineVersionErrorLogs).values(values).returning();
      })) as VersionErrorLog[];
    } catch (err) {
      if (isLockTimeoutError(err)) {
        // Row contention on engine_versions — skip the best-effort diagnostics
        // write instead of 500:ing. The caller treats `[]` as "not stored".
        return [];
      }
      throw err;
    }
  } else {
    rows = (await db
      .insert(engineVersionErrorLogs)
      .values(values)
      .returning()) as VersionErrorLog[];
  }
  // Fas 2: mirror bug-level findings to the flat JSONL bug register (best-effort).
  appendBugRegisterEntries(enrichedPayloads);
  return rows;
}

/**
 * Sole server-owned Product Postcheck writer. Logs and claim completion commit
 * together, under version -> versionsjob -> productclaim. Redis lifecycle is
 * re-read by the held core; this TX fences its durable tuple.
 */
export async function commitProductPostcheckResult(input: {
  held: LiveReviewHeldContext;
  key: ProductPostcheckClaimKey;
  claim: { runId: string; claimGeneration: number };
  result: ProductPostcheckResult;
  deadlineAt: number;
}): Promise<ProductPostcheckCommitResult> {
  assertDbConfigured();
  const key = normalizeProductPostcheckClaimKey(input.key);
  if (!isLiveReviewHeldContext(input.held) || key.versionId !== input.held.versionId ||
      key.filesRevision !== input.held.filesRevision || !key.previewSession || key.previewSession === "unbound" ||
      !input.claim.runId || !Number.isSafeInteger(input.claim.claimGeneration) || input.claim.claimGeneration < 1 ||
      !Number.isFinite(input.deadlineAt) || Date.now() >= input.deadlineAt) return { status: "superseded", logs: [] };
  const attestation = input.result.attestation;
  if (attestation && (attestation.filesRevision !== key.filesRevision ||
      attestation.previewSessionId !== key.previewSession ||
      (attestation.lifecycleToken?.trim() || "") !== key.lifecycleToken)) return { status: "superseded", logs: [] };
  const payloads = buildProductPostcheckLogItems({ ...input.result, verificationRunId: input.claim.runId })
    .map(log => ({ ...log, chatId: input.held.chatId, versionId: key.versionId,
      meta: { ...log.meta, claimGeneration: input.claim.claimGeneration } }));
  const enriched = await enrichEnginePayloads(payloads);
  const values = enriched.map(log => mapLogPayload(log, new Date()));
  const status = isNonBlockingPreviewBootResult(input.result) || input.result.skippedReason === "preview_not_ready" || isNonFinalProductPostcheckSkipReason(input.result.skippedReason)
    ? "superseded" : mapProductPostcheckResultToStatus(input.result);
  const jobWhere = and(eq(engineVersionJobs.versionId, key.versionId),
    eq(engineVersionJobs.runId, input.held.holderRunId), eq(engineVersionJobs.status, "running"),
    gt(engineVersionJobs.leaseExpiresAt, sql`clock_timestamp()`));
  try {
    const result = await db.transaction(async tx => {
      await tx.execute(sql`SELECT set_config('lock_timeout', ${String(LEASE_LOCK_TIMEOUT_MS)}, true)`);
      const versions = await tx.select({ chatId: engineVersions.chatId, filesRevision: engineVersions.filesRevision })
        .from(engineVersions).where(eq(engineVersions.id, key.versionId)).for("update");
      if (versions[0]?.chatId !== input.held.chatId || versions[0]?.filesRevision !== key.filesRevision) return { status: "superseded", logs: [] } satisfies ProductPostcheckCommitResult;
      const jobs = await tx.select({ runId: engineVersionJobs.runId }).from(engineVersionJobs).where(jobWhere).for("update");
      if (jobs.length !== 1) return { status: "superseded", logs: [] } satisfies ProductPostcheckCommitResult;
      const completed = await tx.update(productPostcheckRuns).set({ status, completedAt: sql`clock_timestamp()` })
        .where(and(eq(productPostcheckRuns.chatId, input.held.chatId), eq(productPostcheckRuns.versionId, key.versionId),
          eq(productPostcheckRuns.filesRevision, key.filesRevision), eq(productPostcheckRuns.previewSession, key.previewSession),
          eq(productPostcheckRuns.lifecycleToken, key.lifecycleToken), eq(productPostcheckRuns.mutationRevision, key.mutationRevision),
          eq(productPostcheckRuns.runId, input.claim.runId), eq(productPostcheckRuns.claimGeneration, input.claim.claimGeneration),
          eq(productPostcheckRuns.status, "running"), gt(productPostcheckRuns.expiresAt, sql`clock_timestamp()`),
          lt(sql`clock_timestamp()`, new Date(input.deadlineAt)),
          sql`EXISTS (SELECT 1 FROM ${engineVersionJobs} WHERE ${jobWhere})`))
        .returning({ runId: productPostcheckRuns.runId });
      if (completed.length !== 1) return { status: "superseded", logs: [] } satisfies ProductPostcheckCommitResult;
      const logs = values.length ? await tx.insert(engineVersionErrorLogs).values(values).returning() as VersionErrorLog[] : [];
      return { status: "stored", logs } satisfies ProductPostcheckCommitResult;
    });
    if (result.status === "stored") appendBugRegisterEntries(enriched);
    return result;
  } catch (error) {
    if (isLockTimeoutError(error)) return { status: "contention", logs: [] };
    throw error; // insert failure rolls back completion too
  }
}

/** Actual server policy only; no preview, lease, model or client log payload. */
export async function storeProductPostcheckPolicySkip(input: {
  chatId: string; versionId: string; expectedFilesRevision: string;
}): Promise<ProductPostcheckCommitResult> {
  assertDbConfigured();
  if (FEATURES.f2ProductPostcheck || !input.chatId.trim() || !input.versionId.trim() || !input.expectedFilesRevision.trim()) {
    return { status: "superseded", logs: [] };
  }
  try {
    return await db.transaction(async tx => {
      await tx.execute(sql`SELECT set_config('lock_timeout', ${String(LEASE_LOCK_TIMEOUT_MS)}, true)`);
      const versions = await tx.select({ chatId: engineVersions.chatId, filesRevision: engineVersions.filesRevision })
        .from(engineVersions).where(eq(engineVersions.id, input.versionId)).for("update");
      if (FEATURES.f2ProductPostcheck || versions[0]?.chatId !== input.chatId ||
          versions[0]?.filesRevision !== input.expectedFilesRevision) return { status: "superseded", logs: [] } satisfies ProductPostcheckCommitResult;
      const payload = { chatId: input.chatId, versionId: input.versionId, level: "info" as const,
        category: "product_postcheck.summary", message: "Product Postcheck disabled by server policy.",
        meta: { verdict: "allowed_skip", skippedReason: "feature_disabled", attestedFilesRevision: input.expectedFilesRevision } };
      const value = { ...mapLogPayload(payload, new Date()), id: `product-postcheck-policy:${input.versionId}:${input.expectedFilesRevision}` };
      const logs = await tx.insert(engineVersionErrorLogs).values(value).onConflictDoUpdate({
        target: engineVersionErrorLogs.id, set: { meta: value.meta, created_at: value.created_at },
      }).returning() as VersionErrorLog[];
      if (logs.length !== 1) throw new Error("Server Product Postcheck policy receipt not stored");
      return { status: "stored", logs } satisfies ProductPostcheckCommitResult;
    });
  } catch (error) {
    if (isLockTimeoutError(error)) return { status: "contention", logs: [] };
    throw error;
  }
}

/**
 * Product Postcheck rows are revision-scoped observations. Legacy rows without
 * an attestation remain readable, but attested N rows disappear from every
 * readiness/status consumer as soon as the version becomes N+1.
 */
function currentRevisionErrorLogPredicate(versionId: string) {
  return or(
    notLike(
      sql`COALESCE(${engineVersionErrorLogs.category}, '')`,
      `${PRUNE_EXEMPT_CATEGORY_PREFIXES[0]}%`,
    ),
    and(
      FEATURES.f2ProductPostcheck
        ? sql`LOWER(TRIM(${engineVersionErrorLogs.meta}->>'skippedReason')) IS DISTINCT FROM 'feature_disabled'`
        : undefined,
      or(
        sql`COALESCE(${engineVersionErrorLogs.meta}->>'attestedFilesRevision', ${engineVersionErrorLogs.meta}->>'filesRevision') IS NULL`,
        sql`COALESCE(${engineVersionErrorLogs.meta}->>'attestedFilesRevision', ${engineVersionErrorLogs.meta}->>'filesRevision') = (
          SELECT ${engineVersions.filesRevision}
          FROM ${engineVersions}
          WHERE ${engineVersions.id} = ${versionId}
        )`,
      ),
    ),
  );
}

/**
 * In-memory parity for batched readers that already own each version's current
 * files revision. Legacy rows without the key remain readable; once a writer
 * supplied an attestation, only an exact current-revision match is valid.
 */
export function productPostcheckLogMatchesCurrentFilesRevision(
  meta: unknown,
  currentFilesRevision: string | null | undefined,
): boolean {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return true;
  const record = meta as Record<string, unknown>;
  if (FEATURES.f2ProductPostcheck && typeof record.skippedReason === "string" &&
      record.skippedReason.trim().toLowerCase() === "feature_disabled") return false;
  const attested = record.attestedFilesRevision ?? record.filesRevision;
  if (attested == null) return true;
  return (
    typeof attested === "string" &&
    Boolean(currentFilesRevision?.trim()) &&
    attested.trim() === currentFilesRevision?.trim()
  );
}

export async function getEngineVersionErrorLogs(versionId: string): Promise<VersionErrorLog[]> {
  assertDbConfigured();
  const rows = await db
    .select()
    .from(engineVersionErrorLogs)
    .where(
      and(
        eq(engineVersionErrorLogs.version_id, versionId),
        currentRevisionErrorLogPredicate(versionId),
      ),
    )
    .orderBy(desc(engineVersionErrorLogs.created_at));
  return rows as VersionErrorLog[];
}

export async function getLatestEngineVersionErrorLogs(
  versionId: string,
  limit = 200,
): Promise<VersionErrorLog[]> {
  assertDbConfigured();
  const rows = await db
    .select()
    .from(engineVersionErrorLogs)
    .where(
      and(
        eq(engineVersionErrorLogs.version_id, versionId),
        currentRevisionErrorLogPredicate(versionId),
      ),
    )
    .orderBy(desc(engineVersionErrorLogs.created_at))
    .limit(limit);
  return rows as VersionErrorLog[];
}

/**
 * All error-log rows for a version within the given categories (no row
 * window). Used by the L2 verdict reader so a later skip summary cannot hide
 * an older `blocked` on the same filesRevision. Category-scoped, so
 * per-warning `product_postcheck.*` rows cannot crowd the result out.
 */
export async function getEngineVersionErrorLogsForCategories(
  versionId: string,
  categories: readonly string[],
): Promise<VersionErrorLog[]> {
  if (categories.length === 0) return [];
  assertDbConfigured();
  const rows = await db
    .select()
    .from(engineVersionErrorLogs)
    .where(
      and(
        eq(engineVersionErrorLogs.version_id, versionId),
        inArray(engineVersionErrorLogs.category, [...categories]),
        currentRevisionErrorLogPredicate(versionId),
      ),
    )
    .orderBy(desc(engineVersionErrorLogs.created_at));
  return rows as VersionErrorLog[];
}

/**
 * Newest error-log row for a version within ONE category (exact `LIMIT 1`
 * query). Codex P2 on #353 (backlog): the F3 gate previously fetched the
 * latest 200 rows and searched them for `product_postcheck.summary` — the
 * postcheck writes one row per product warning, so a noisy version could push
 * the summary row outside the window and silently unblock the gate. A
 * category-scoped query cannot be crowded out.
 */
export async function getLatestEngineVersionErrorLogForCategory(
  versionId: string,
  category: string,
): Promise<VersionErrorLog | null> {
  assertDbConfigured();
  const rows = await db
    .select()
    .from(engineVersionErrorLogs)
    .where(
      and(
        eq(engineVersionErrorLogs.version_id, versionId),
        eq(engineVersionErrorLogs.category, category),
        currentRevisionErrorLogPredicate(versionId),
      ),
    )
    .orderBy(desc(engineVersionErrorLogs.created_at))
    .limit(1);
  return (rows[0] as VersionErrorLog | undefined) ?? null;
}

/**
 * Repair-loop hardening — SAJ-25.
 *
 * When a follow-up/repair pass on the SAME `versionId` has no current
 * preflight/syntax blockers, the error-log rows from PREVIOUS passes (rows
 * whose `meta.repairPassIndex < currentRepairPassIndex`) are stale because
 * they describe state that no longer exists. Verifier-only findings from the
 * current pass may still be active, but they must not keep older rows alive.
 *
 * This prune is best-effort:
 *  - only deletes rows with strictly lower `meta.repairPassIndex`
 *  - never touches {@link PRUNE_EXEMPT_CATEGORIES} or
 *    {@link PRUNE_EXEMPT_CATEGORY_PREFIXES}
 *  - never throws (callers wrap in try/catch and rely on devLog telemetry)
 *
 * Returns the number of rows deleted so the caller can log
 * `version_error_log_pruned`.
 */
export async function pruneStaleVersionErrorLogs(
  versionId: string,
  currentRepairPassIndex: number,
): Promise<number> {
  assertDbConfigured();
  if (!versionId) return 0;
  if (!Number.isFinite(currentRepairPassIndex) || currentRepairPassIndex <= 0) {
    return 0;
  }
  // Drizzle / pg JSONB comparison: cast `meta->>'repairPassIndex'` to int
  // and compare. Rows that lack the meta key are treated as repairPassIndex
  // 0, which is correct: anything written before the consistentRepairPassIndex
  // feature-flag rolled out predates the current pass.
  const result = await db
    .delete(engineVersionErrorLogs)
    .where(
      and(
        eq(engineVersionErrorLogs.version_id, versionId),
        lt(
          sql`COALESCE((${engineVersionErrorLogs.meta}->>'repairPassIndex')::int, 0)`,
          currentRepairPassIndex,
        ),
        // COALESCE, inte en naken NOT IN: `category` är nullable och
        // `NULL NOT IN (...)` är NULL, vilket skulle låta varje
        // kategorilös rad överleva — en tyst beteendeändring.
        notInArray(sql`COALESCE(${engineVersionErrorLogs.category}, '')`, [
          ...PRUNE_EXEMPT_CATEGORIES,
        ]),
        notLike(
          sql`COALESCE(${engineVersionErrorLogs.category}, '')`,
          `${PRUNE_EXEMPT_CATEGORY_PREFIXES[0]}%`,
        ),
      ),
    )
    .returning({ id: engineVersionErrorLogs.id });
  return result.length;
}
