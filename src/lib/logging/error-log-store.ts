/**
 * Durable (Postgres) backing for the error-log RAG.
 *
 * The file-based producer/indexer (`error-log-rag.ts` +
 * `scripts/observability/index-error-log-rag.mjs`) only works in dev: a
 * serverless prod filesystem is ephemeral/read-only, so the NDJSON producer
 * and the on-disk TF-IDF snapshot never persist. This module mirrors that
 * data in the `error_log_events` table (created in `scripts/db/db-init.mjs`)
 * so the retriever can rebuild the same TF-IDF index from Postgres in prod.
 *
 * SAFETY: every operation is best-effort and never throws — a failure here
 * must never affect a generation. Raw queries (not Drizzle) because this is a
 * telemetry side-channel intentionally outside the typed schema.
 */
import { pool, dbConfigured } from "@/lib/db/client";
import type { ErrorLogIndexedRow } from "@/lib/gen/rag/error-log-retriever";

export interface ErrorLogDbInsert {
  phase: string;
  subphase?: string | null;
  creator?: string | null;
  fixer?: string | null;
  severity?: string | null;
  fault: string;
  faultText?: string | null;
  fixText?: string | null;
  modelTier?: string | null;
  model?: string | null;
  provider?: string | null;
  passNumber?: number | null;
  repairPassIndex?: number | null;
  result?: string | null;
  chatId?: string | null;
  versionId?: string | null;
  scaffoldId?: string | null;
  routePath?: string | null;
  variantId?: string | null;
  capabilityIds?: string[];
  generationMode?: string | null;
  lineageHash?: string | null;
}

export interface ErrorLogDocument {
  id: string;
  text: string;
  payload: ErrorLogIndexedRow;
}

/** Whether the durable store is usable (DB configured). */
export function isErrorLogDbAvailable(): boolean {
  return dbConfigured;
}

/**
 * Insert one fault/fix row. Best-effort: resolves even on failure. Callers
 * MUST fire-and-forget (never await on the generation hot path).
 */
export async function insertErrorLogEventToDb(row: ErrorLogDbInsert): Promise<void> {
  if (!dbConfigured || !pool) return;
  try {
    await pool.query(
      `INSERT INTO error_log_events (
        phase, subphase, creator, fixer, severity, fault, fault_text, fix_text,
        model_tier, model, provider, pass_number, repair_pass_index, result,
        chat_id, version_id, scaffold_id, route_path, variant_id, capability_ids,
        generation_mode, lineage_hash
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22
      )`,
      [
        row.phase,
        row.subphase ?? null,
        row.creator ?? null,
        row.fixer ?? null,
        row.severity ?? null,
        row.fault,
        row.faultText ?? null,
        row.fixText ?? null,
        row.modelTier ?? null,
        row.model ?? null,
        row.provider ?? null,
        row.passNumber ?? null,
        row.repairPassIndex ?? null,
        row.result ?? null,
        row.chatId ?? null,
        row.versionId ?? null,
        row.scaffoldId ?? null,
        row.routePath ?? null,
        row.variantId ?? null,
        JSON.stringify(row.capabilityIds ?? []),
        row.generationMode ?? null,
        row.lineageHash ?? null,
      ],
    );
  } catch {
    // best-effort — never throw on the generation hot path
  }
}

/** Map a DB row (snake_case) to a TF-IDF document. Pure — unit-testable. */
export function errorLogDbRowToDocument(dbRow: Record<string, unknown>): ErrorLogDocument {
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.length > 0 ? v : null;
  const caps = Array.isArray(dbRow.capability_ids)
    ? (dbRow.capability_ids as unknown[]).filter(
        (c): c is string => typeof c === "string",
      )
    : [];
  const rawTime = dbRow.created_at;
  const time =
    str(rawTime) ??
    (rawTime instanceof Date
      ? rawTime.toISOString()
      : rawTime != null
        ? String(rawTime)
        : null);
  const payload: ErrorLogIndexedRow = {
    time,
    phase: str(dbRow.phase) ?? "",
    fault: str(dbRow.fault) ?? "",
    faultText: str(dbRow.fault_text) ?? "",
    fixText: str(dbRow.fix_text),
    scaffoldId: str(dbRow.scaffold_id),
    routePath: str(dbRow.route_path),
    variantId: str(dbRow.variant_id),
    capabilityIds: caps,
    generationMode:
      (str(dbRow.generation_mode) as ErrorLogIndexedRow["generationMode"]) ?? null,
    lineageHash: str(dbRow.lineage_hash),
    result: str(dbRow.result),
  };
  // Mirror the NDJSON indexer's `indexableText` (field set, order, 800-char cap)
  // so DB-backed retrieval ranks the same as dev's on-disk snapshot.
  const text = [
    payload.fault,
    payload.faultText,
    payload.fixText ?? "",
    str(dbRow.subphase) ?? "",
    str(dbRow.creator) ?? "",
    str(dbRow.fixer) ?? "",
    payload.scaffoldId ?? "",
    payload.routePath ?? "",
    payload.variantId ?? "",
    ...(payload.capabilityIds ?? []),
    payload.generationMode ?? "",
    payload.phase,
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 800);
  const id = dbRow.id != null ? String(dbRow.id) : `${payload.fault}-${time ?? ""}`;
  return { id, text, payload };
}

/**
 * Load recent fault rows from Postgres as TF-IDF documents (newest first,
 * capped). Best-effort: returns [] on any failure or when DB is unconfigured.
 */
export async function loadRecentErrorLogDocsFromDb(
  maxRows = 5000,
): Promise<ErrorLogDocument[]> {
  if (!dbConfigured || !pool) return [];
  try {
    const limit = Math.max(1, Math.min(maxRows, 20000));
    const res = await pool.query(
      `SELECT id, created_at, phase, subphase, creator, fixer, fault, fault_text,
              fix_text, scaffold_id, route_path, variant_id, capability_ids,
              generation_mode, lineage_hash, result
       FROM error_log_events
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit],
    );
    return res.rows.map((r) => errorLogDbRowToDocument(r as Record<string, unknown>));
  } catch {
    return [];
  }
}
