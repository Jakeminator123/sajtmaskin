import { and, desc, eq, inArray, lt, notInArray, notLike, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import { getScaffoldById } from "@/lib/gen/scaffolds";
import { engineChats, engineVersionErrorLogs, engineVersions } from "@/lib/db/schema";
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

export type AttestedProductPostcheckInsertResult =
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
  "f3-readiness:missing-env",
  "preview:client-error",
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
 * Writes one Product Postcheck batch against the exact files revision it
 * inspected. The `FOR UPDATE` lock serializes this check with every files-json
 * writer, so revision N can never be inserted after N+1 has committed.
 *
 * Preview-session/lifecycle authority lives in Redis and is fenced by the API
 * route immediately before this call. It cannot participate in the Postgres
 * transaction; the durable guarantee here is therefore the canonical DB
 * content revision, while the attestation metadata preserves the cross-store
 * identity for diagnostics.
 */
export async function createAttestedProductPostcheckErrorLogs(
  payloads: VersionErrorLogPayload[],
  options: { expectedFilesRevision: string; lockTimeoutMs: number },
): Promise<AttestedProductPostcheckInsertResult> {
  assertDbConfigured();
  if (payloads.length === 0) return { status: "stored", logs: [] };

  const versionId = payloads[0]?.versionId;
  if (!versionId || payloads.some((payload) => payload.versionId !== versionId)) {
    throw new Error("Attested Product Postcheck batch must target one version");
  }

  const expectedFilesRevision = options.expectedFilesRevision.trim();
  if (!expectedFilesRevision) {
    throw new Error("Attested Product Postcheck requires files revision");
  }

  const now = new Date();
  const enrichedPayloads = await enrichEnginePayloads(payloads);
  const values = enrichedPayloads.map((payload) => mapLogPayload(payload, now));

  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT set_config('lock_timeout', ${String(Math.floor(options.lockTimeoutMs))}, true)`,
      );
      const locked = await tx
        .select({ filesRevision: engineVersions.filesRevision })
        .from(engineVersions)
        .where(eq(engineVersions.id, versionId))
        .for("update");
      if (locked[0]?.filesRevision?.trim() !== expectedFilesRevision) {
        return {
          status: "superseded",
          logs: [] as [],
        } satisfies AttestedProductPostcheckInsertResult;
      }
      const logs = (await tx
        .insert(engineVersionErrorLogs)
        .values(values)
        .returning()) as VersionErrorLog[];
      return { status: "stored", logs } satisfies AttestedProductPostcheckInsertResult;
    });
    if (result.status === "stored") appendBugRegisterEntries(enrichedPayloads);
    return result;
  } catch (err) {
    if (isLockTimeoutError(err)) return { status: "contention", logs: [] };
    throw err;
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
    sql`${engineVersionErrorLogs.meta}->>'attestedFilesRevision' IS NULL`,
    sql`${engineVersionErrorLogs.meta}->>'attestedFilesRevision' = (
      SELECT ${engineVersions.filesRevision}
      FROM ${engineVersions}
      WHERE ${engineVersions.id} = ${versionId}
    )`,
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
  if (!Object.prototype.hasOwnProperty.call(record, "attestedFilesRevision")) return true;
  const attested = record.attestedFilesRevision;
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
