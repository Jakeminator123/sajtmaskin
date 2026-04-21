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

export interface RetrieveSimilarFailuresOptions {
  prompt: string;
  scaffoldId?: string | null;
  lineageHash?: string | null;
  topK?: number;
}

export interface RetrievedFailure {
  fault: string;
  faultText: string;
  fixText: string | null;
  scaffoldId: string | null;
  result: string | null;
  score: number;
}

export function retrieveSimilarFailures(
  options: RetrieveSimilarFailuresOptions,
): RetrievedFailure[] {
  if (!FEATURES.useErrorLogRag) return [];
  const entry = loadIndexFromDisk();
  if (!entry) return [];
  const topK = options.topK ?? 5;
  // Bias the query with scaffoldId + lineage prefix so same-site failures
  // outrank cross-scaffold matches when token overlap is identical.
  const queryParts = [options.prompt];
  if (options.scaffoldId) queryParts.push(options.scaffoldId);
  if (options.lineageHash) queryParts.push(options.lineageHash.slice(0, 16));
  const hits = queryTfIdfIndex(entry.index, queryParts.join(" "), topK * 3);
  // Apply scaffold-aware rerank: same scaffold gets a 1.25x multiplier.
  const reranked = hits.map((hit) => {
    const sameScaffold =
      options.scaffoldId &&
      hit.document.payload.scaffoldId === options.scaffoldId;
    return {
      ...hit,
      score: sameScaffold ? hit.score * 1.25 : hit.score,
    };
  });
  reranked.sort((a, b) => b.score - a.score);
  return reranked.slice(0, topK).map((hit) => ({
    fault: hit.document.payload.fault,
    faultText: hit.document.payload.faultText,
    fixText: hit.document.payload.fixText,
    scaffoldId: hit.document.payload.scaffoldId,
    result: hit.document.payload.result,
    score: Math.round(hit.score * 1000) / 1000,
  }));
}

const RAG_BLOCK_MAX_CHARS = 800;

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
    items.push(`- \`${hit.fault}\` — ${hit.faultText.slice(0, 120)}${fix}`);
  }
  const block = [header, "", intro, "", ...items, ""];
  while (block.join("\n").length > RAG_BLOCK_MAX_CHARS && block.length > 4) {
    block.splice(block.length - 2, 1);
  }
  return block;
}

/** Test/debug helper — clears the in-memory snapshot cache. */
export function __resetErrorLogRetrieverCacheForTests(): void {
  cache = null;
}
