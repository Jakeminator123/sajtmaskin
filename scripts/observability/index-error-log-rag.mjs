#!/usr/bin/env node
/**
 * Vector-RAG indexer for the error-log NDJSON producer.
 *
 * Reads:  logs/llm-segmentts-and-index/error-log.ndjson
 * Writes: data/observability/error-log-tfidf-snapshot.json
 *
 * Idempotent and delta-aware: when the producer NDJSON mtime is older than
 * the snapshot mtime, the script exits without rebuilding. Caller can pass
 * --force to bypass this check.
 *
 * Auto-invoked by `scripts/dev/next-runner.mjs` before `next dev|build|start`
 * so the index stays warm without an explicit cron. Manual invocation:
 *
 *   node scripts/observability/index-error-log-rag.mjs           # delta
 *   node scripts/observability/index-error-log-rag.mjs --force   # rebuild
 *   node scripts/observability/index-error-log-rag.mjs --quiet   # silent
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = new Set(process.argv.slice(2));
const FORCE = args.has("--force");
const QUIET = args.has("--quiet");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

const NDJSON_PATH = path.join(ROOT, "logs", "llm-segmentts-and-index", "error-log.ndjson");
const SNAPSHOT_DIR = path.join(ROOT, "data", "observability");
const SNAPSHOT_PATH = path.join(SNAPSHOT_DIR, "error-log-tfidf-snapshot.json");
const META_PATH = path.join(SNAPSHOT_DIR, "error-log-tfidf-meta.json");

const MAX_ROWS_FOR_INDEX = 5000; // tail-only, keeps memory + warm-load tiny.

function log(...message) {
  if (QUIET) return;
  console.info("[error-log-rag]", ...message);
}

function ensureDirSync(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readNdjsonRows() {
  if (!fs.existsSync(NDJSON_PATH)) return { rows: [], mtimeMs: 0 };
  const stat = fs.statSync(NDJSON_PATH);
  const raw = fs.readFileSync(NDJSON_PATH, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const start = Math.max(0, lines.length - MAX_ROWS_FOR_INDEX);
  const rows = [];
  for (let i = start; i < lines.length; i += 1) {
    try {
      rows.push(JSON.parse(lines[i]));
    } catch {
      // skip malformed line
    }
  }
  return { rows, mtimeMs: stat.mtimeMs };
}

function snapshotMtime() {
  try {
    return fs.statSync(SNAPSHOT_PATH).mtimeMs;
  } catch {
    return 0;
  }
}

function indexableText(row) {
  const parts = [
    row.fault,
    row.faultText,
    row.fixText,
    row.subphase,
    row.creator,
    row.fixer,
    row.scaffoldId,
    row.routePath,
    row.variantId,
    ...(Array.isArray(row.capabilityIds) ? row.capabilityIds : []),
    row.generationMode,
    row.phase,
  ];
  return parts.filter(Boolean).join(" ").slice(0, 800);
}

function buildSnapshot(rows) {
  const documents = rows.map((row, i) => ({
    id: `row-${i}`,
    text: indexableText(row),
    payload: {
      time: row.time ?? null,
      phase: row.phase ?? "",
      fault: row.fault ?? "",
      faultText: row.faultText ?? "",
      fixText: row.fixText ?? null,
      scaffoldId: row.scaffoldId ?? null,
      routePath: row.routePath ?? null,
      variantId: row.variantId ?? null,
      capabilityIds: Array.isArray(row.capabilityIds) ? row.capabilityIds.filter((v) => typeof v === "string") : [],
      generationMode: row.generationMode ?? null,
      lineageHash: row.lineageHash ?? null,
      result: row.result ?? null,
    },
  }));
  return {
    generatedAt: new Date().toISOString(),
    rowCount: documents.length,
    documents,
  };
}

function writeMeta(meta) {
  ensureDirSync(SNAPSHOT_DIR);
  fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2), "utf8");
}

function main() {
  if (!fs.existsSync(NDJSON_PATH)) {
    log("no producer NDJSON yet — nothing to index. Skipping.");
    writeMeta({ status: "skipped-no-producer", checkedAt: new Date().toISOString() });
    return 0;
  }

  const ndjsonStat = fs.statSync(NDJSON_PATH);
  const snapMtime = snapshotMtime();

  if (!FORCE && snapMtime >= ndjsonStat.mtimeMs) {
    log(`up to date (snapshot mtime ${new Date(snapMtime).toISOString()} >= producer mtime).`);
    writeMeta({ status: "up-to-date", checkedAt: new Date().toISOString() });
    return 0;
  }

  const startedAt = Date.now();
  const { rows } = readNdjsonRows();
  if (rows.length === 0) {
    log("producer NDJSON is empty — writing empty snapshot.");
    ensureDirSync(SNAPSHOT_DIR);
    fs.writeFileSync(
      SNAPSHOT_PATH,
      JSON.stringify({ generatedAt: new Date().toISOString(), rowCount: 0, documents: [] }, null, 0),
      "utf8",
    );
    writeMeta({ status: "empty", rowCount: 0, builtAt: new Date().toISOString() });
    return 0;
  }
  const snapshot = buildSnapshot(rows);
  ensureDirSync(SNAPSHOT_DIR);
  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot), "utf8");
  const durationMs = Date.now() - startedAt;
  log(`indexed ${rows.length} rows in ${durationMs}ms → ${path.relative(ROOT, SNAPSHOT_PATH)}`);
  writeMeta({
    status: "rebuilt",
    rowCount: rows.length,
    durationMs,
    builtAt: new Date().toISOString(),
  });
  return 0;
}

try {
  process.exit(main());
} catch (err) {
  // Never fail next dev/build/start because the indexer crashed.
  console.warn("[error-log-rag] indexer failed (non-fatal):", err?.message ?? err);
  try {
    writeMeta({
      status: "errored",
      error: String(err?.message ?? err),
      checkedAt: new Date().toISOString(),
    });
  } catch {
    /* swallow */
  }
  process.exit(0);
}
