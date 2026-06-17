/**
 * Error-log RAG retriever — wraps the TF-IDF index over historical fault/fix
 * rows and renders a `### Lessons from similar past builds` block for the
 * system-prompt.
 *
 * Index lifecycle:
 *  1. Producer (`error-log-rag.ts`) appends NDJSON.
 *  2. Auto-ingest hook (`scripts/observability/index-error-log-rag.mjs`)
 *     rebuilds the deterministic TF-IDF snapshot stored at
 *     `data/observability/error-log-tfidf-snapshot.json`.
 *  3. This module loads the snapshot lazily and serves top-K hits per query.
 *
 * The snapshot avoids re-tokenising 5k rows on every generation; cold-load
 * cost is ~10ms even for big indexes.
 */

import fs from "node:fs";
import path from "node:path";
import { FEATURES } from "@/lib/config";
import {
  buildTfIdfIndex,
  queryTfIdfIndex,
  type TfIdfIndex,
} from "./error-log-tfidf";

const INDEX_DIR = path.join(process.cwd(), "data", "observability");
export const ERROR_LOG_INDEX_PATH = path.join(INDEX_DIR, "error-log-tfidf-snapshot.json");

export interface ErrorLogIndexedRow {
  time: string | null;
  phase: string;
  fault: string;
  faultText: string;
  fixText: string | null;
  scaffoldId: string | null;
  routePath?: string | null;
  variantId?: string | null;
  capabilityIds?: string[];
  generationMode?: "init" | "followup" | "auto_repair" | null;
  lineageHash: string | null;
  result: string | null;
}

interface SnapshotShape {
  generatedAt: string;
  rowCount: number;
  documents: Array<{ id: string; text: string; payload: ErrorLogIndexedRow }>;
}

interface CacheEntry {
  index: TfIdfIndex<ErrorLogIndexedRow>;
  generatedAt: string;
  mtimeMs: number;
}

let cache: CacheEntry | null = null;

function loadIndexFromDisk(): CacheEntry | null {
  try {
    if (!fs.existsSync(ERROR_LOG_INDEX_PATH)) return null;
    const stat = fs.statSync(ERROR_LOG_INDEX_PATH);
    if (cache && cache.mtimeMs === stat.mtimeMs) return cache;
    const raw = fs.readFileSync(ERROR_LOG_INDEX_PATH, "utf8");
    const snap = JSON.parse(raw) as SnapshotShape;
    if (!Array.isArray(snap.documents) || snap.documents.length === 0) return null;
    const index = buildTfIdfIndex(snap.documents);
    cache = { index, generatedAt: snap.generatedAt, mtimeMs: stat.mtimeMs };
    return cache;
  } catch {
    return null;
  }
}

// ── DB-backed index (serverless prod, where the on-disk snapshot is absent) ──
// The retriever stays synchronous; the DB index is refreshed out-of-band
// (throttled, fire-and-forget) and served from this module-level cache. The
// first call on a cold instance may miss (empty cache → []); warm instances
// serve from cache after the initial refresh. Dev keeps using the disk path.
let dbCache: CacheEntry | null = null;
let dbRefreshAtMs = 0;
let dbRefreshInFlight = false;
const DB_REFRESH_INTERVAL_MS = 60_000;

function triggerDbIndexRefresh(): void {
  if (dbRefreshInFlight) return;
  if (dbCache && Date.now() - dbRefreshAtMs < DB_REFRESH_INTERVAL_MS) return;
  dbRefreshInFlight = true;
  void import("../../logging/error-log-store")
    .then(async (m) => {
      const docs = await m.loadRecentErrorLogDocsFromDb();
      if (docs.length > 0) {
        dbCache = {
          index: buildTfIdfIndex(docs),
          generatedAt: new Date().toISOString(),
          mtimeMs: 0,
        };
      }
      dbRefreshAtMs = Date.now();
    })
    .catch(() => {})
    .finally(() => {
      dbRefreshInFlight = false;
    });
}

function loadIndexForRetrieval(): CacheEntry | null {
  const disk = loadIndexFromDisk();
  if (disk) return disk;
  // No disk snapshot (serverless prod): fall back to the DB-backed index.
  triggerDbIndexRefresh();
  return dbCache;
}

export interface RetrieveSimilarFailuresOptions {
  prompt: string;
  faultType?: string | null;
  routePath?: string | null;
  scaffoldId?: string | null;
  variantId?: string | null;
  capabilityIds?: string[];
  generationMode?: "init" | "followup" | "auto_repair" | null;
  lineageHash?: string | null;
  topK?: number;
}

export interface RetrievedFailure {
  fault: string;
  faultText: string;
  fixText: string | null;
  scaffoldId: string | null;
  routePath: string | null;
  capabilityIds: string[];
  result: string | null;
  score: number;
}

function safeStringArray(value: readonly string[] | unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function overlapCount(a: readonly string[] | undefined, b: readonly string[] | unknown): number {
  const rightValues = safeStringArray(b);
  if (!a?.length || rightValues.length === 0) return 0;
  const right = new Set(rightValues.map((item) => item.toLowerCase()));
  return a.filter((item) => right.has(item.toLowerCase())).length;
}

function structuredBoost(row: ErrorLogIndexedRow, options: RetrieveSimilarFailuresOptions): number {
  let boost = 1;
  if (options.faultType && row.fault === options.faultType) boost *= 1.7;
  if (options.scaffoldId && row.scaffoldId === options.scaffoldId) boost *= 1.25;
  if (options.routePath && row.routePath === options.routePath) boost *= 1.2;
  if (options.variantId && row.variantId === options.variantId) boost *= 1.1;
  if (options.generationMode && row.generationMode === options.generationMode) boost *= 1.1;
  const caps = overlapCount(options.capabilityIds, row.capabilityIds);
  if (caps > 0) boost *= 1 + Math.min(caps, 3) * 0.15;
  return boost;
}

export function retrieveSimilarFailures(
  options: RetrieveSimilarFailuresOptions,
): RetrievedFailure[] {
  if (!FEATURES.useErrorLogRag) return [];
  const entry = loadIndexForRetrieval();
  if (!entry) return [];
  const topK = options.topK ?? 3;
  // Bias the query with structured context so related failures remain
  // retrievable even before the reranker applies exact-field boosts.
  const queryParts = [options.prompt];
  if (options.faultType) queryParts.push(options.faultType);
  if (options.scaffoldId) queryParts.push(options.scaffoldId);
  if (options.routePath) queryParts.push(options.routePath);
  if (options.variantId) queryParts.push(options.variantId);
  if (options.generationMode) queryParts.push(options.generationMode);
  if (options.capabilityIds?.length) queryParts.push(...options.capabilityIds);
  if (options.lineageHash) queryParts.push(options.lineageHash.slice(0, 16));
  const hits = queryTfIdfIndex(entry.index, queryParts.join(" "), topK * 3);
  const reranked = hits.map((hit) => {
    return {
      ...hit,
      score: hit.score * structuredBoost(hit.document.payload, options),
    };
  });
  reranked.sort((a, b) => b.score - a.score);
  return reranked.slice(0, topK).map((hit) => ({
    fault: hit.document.payload.fault || "unknown_fault",
    faultText: hit.document.payload.faultText || "",
    fixText: hit.document.payload.fixText,
    scaffoldId: hit.document.payload.scaffoldId,
    routePath: hit.document.payload.routePath ?? null,
    capabilityIds: safeStringArray(hit.document.payload.capabilityIds),
    result: hit.document.payload.result,
    score: Math.round(hit.score * 1000) / 1000,
  }));
}

const RAG_BLOCK_MAX_CHARS = 600;

export function renderErrorLogRagBlockLines(options: RetrieveSimilarFailuresOptions): string[] {
  if (!FEATURES.useErrorLogRag) return [];
  const hits = retrieveSimilarFailures(options);
  if (hits.length === 0) return [];
  const header = "### Lessons from similar past builds";
  const intro =
    "Past generations on similar inputs produced these faults. The repair " +
    "loop already patched them; do not reproduce the same failure modes.";
  const items: string[] = [];
  for (const hit of hits) {
    const fix = hit.fixText ? ` → fix: ${hit.fixText}` : "";
    const faultText = hit.faultText || "(no detail)";
    items.push(`- \`${hit.fault || "unknown_fault"}\` — ${faultText.slice(0, 120)}${fix}`);
  }
  const block = [header, "", intro, "", ...items, ""];
  while (block.join("\n").length > RAG_BLOCK_MAX_CHARS && block.length > 4) {
    block.splice(block.length - 2, 1);
  }
  return block;
}

/** Test/debug helper — clears the in-memory snapshot + DB caches. */
export function __resetErrorLogRetrieverCacheForTests(): void {
  cache = null;
  dbCache = null;
  dbRefreshAtMs = 0;
  dbRefreshInFlight = false;
}
