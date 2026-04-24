#!/usr/bin/env node
/**
 * Redis-hälsa — read-only diagnostics för backofficen.
 *
 * Producerar JSON-rapport till stdout med:
 *   - target            (host/port, redacted)
 *   - connection        (latency_ms + ok)
 *   - server            (version, uptime_seconds, used_memory_human, total_keys)
 *   - prefixes[]        (per-prefix-bucket: prefix, key_count, sample_keys[3])
 *   - probe             (write/read/del på en hälsonyckel + latens per steg)
 *   - summary
 *
 * Använder @upstash/redis (HTTP) — INTE ioredis — så ingen TCP-handshake i
 * denna process och inget extra connection-leak mot Upstash.
 *
 * Säkerhet: ENBART SCAN/INFO + en self-test på `prod:health:probe:*` /
 * `dev:health:probe:*` (skapas + raderas inom samma körning, TTL 30s som
 * fail-safe). Inga FLUSHDB, inga andra mutationer.
 *
 * Användning:
 *   node scripts/db/redis-health-check.mjs [--snapshot]
 *
 * --snapshot lägger till rad i data/observability/redis-health-snapshots.ndjson
 */
import { Redis } from "@upstash/redis";
import { config } from "dotenv";
import { mkdir, appendFile } from "fs/promises";
import { dirname, join } from "path";

config({ path: ".env.local" });

const SNAPSHOT_FLAG = process.argv.includes("--snapshot");
const SNAPSHOT_PATH = join(
  process.cwd(),
  "data/observability/redis-health-snapshots.ndjson",
);

const restUrl =
  process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
const restToken =
  process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";

if (!restUrl || !restToken) {
  console.log(
    JSON.stringify({
      ok: false,
      error:
        "UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN saknas (eller KV_REST_API_*).",
      target: null,
    }),
  );
  process.exit(0);
}

function redactUrl(u) {
  try {
    const url = new URL(u);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "(invalid URL)";
  }
}

const RUNTIME_ENV =
  (process.env.VERCEL_ENV?.trim().toLowerCase() === "production" && "production") ||
  (process.env.VERCEL_ENV?.trim().toLowerCase() === "preview" && "preview") ||
  (process.env.NODE_ENV === "production" ? "production" : "development");

const KEY_PREFIX =
  RUNTIME_ENV === "production"
    ? "prod:"
    : RUNTIME_ENV === "preview"
      ? "preview:"
      : "dev:";

// Kategorier vi grupperar nycklar i. Måste hållas i synk med
// src/lib/data/redis.ts och src/lib/api/ai/brief-cache.ts.
const TRACKED_PREFIX_BUCKETS = [
  // Per-miljö (dev:/preview:/prod:)
  { label: "user:session", pattern: `*user:session:*` },
  { label: "cache", pattern: `*cache:*` },
  { label: "audit", pattern: `*audit:*` },
  { label: "audit_list", pattern: `*audit_list:*` },
  { label: "project:files", pattern: `*project:files:*` },
  { label: "project:meta", pattern: `*project:meta:*` },
  { label: "video:job", pattern: `*video:job:*` },
  { label: "preview", pattern: `*preview:*` },
  { label: "preview-session:session", pattern: `*preview-session:session:*` },
  { label: "sandbox-preview:session", pattern: `*sandbox-preview:session:*` }, // legacy
  { label: "prompt_handoff", pattern: `*prompt_handoff:*` },
  { label: "brief:v1", pattern: `*brief:v1:*` },
  // Sajtmaskin rate-limit (annorlunda key-namespace, inkluderar miljöprefix)
  { label: "ratelimit (sajtmaskin)", pattern: `sajtmaskin:*ratelimit:*` },
  // Health-probe (ska egentligen aldrig dröja sig kvar — TTL=30s)
  { label: "health:probe", pattern: `*health:probe:*` },
];

const redis = new Redis({ url: restUrl, token: restToken });

async function timed(fn) {
  const t0 = Date.now();
  try {
    const result = await fn();
    return { result, latency_ms: Date.now() - t0, error: null };
  } catch (err) {
    return { result: null, latency_ms: Date.now() - t0, error: err.message };
  }
}

async function scanCount(pattern) {
  // SCAN returnerar [cursor, keys]. För counts samlar vi in keys batchvis.
  // För säkerhetsbegränsa: max 50 SCAN-iterationer (= max ~50_000 keys
  // sampled @ COUNT 1000). Backofficen är inte rätt plats att räkna varenda
  // nyckel om databasen har miljonnycklar — samplet räcker som signal.
  let cursor = "0";
  let count = 0;
  const sample = [];
  let iterations = 0;
  const MAX_ITERATIONS = 50;

  do {
    const res = await redis.scan(cursor, { match: pattern, count: 1000 });
    cursor = String(res[0]);
    const keys = res[1] || [];
    count += keys.length;
    if (sample.length < 3) {
      for (const k of keys) {
        if (sample.length >= 3) break;
        sample.push(k);
      }
    }
    iterations += 1;
    if (iterations >= MAX_ITERATIONS) break;
  } while (cursor !== "0");

  return { count, sample, truncated: iterations >= MAX_ITERATIONS && cursor !== "0" };
}

function parseInfo(info) {
  if (typeof info !== "string") return {};
  const out = {};
  for (const line of info.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf(":");
    if (i === -1) continue;
    out[line.slice(0, i)] = line.slice(i + 1);
  }
  return out;
}

async function run() {
  const startedAt = new Date().toISOString();
  const target = redactUrl(restUrl);

  // 1) Connection-test (ping → SELECT 1 motsvarighet)
  const ping = await timed(() => redis.ping());
  if (ping.error) {
    console.log(
      JSON.stringify({
        ok: false,
        timestamp: startedAt,
        target,
        runtime_env: RUNTIME_ENV,
        key_prefix: KEY_PREFIX,
        connection: { ok: false, latency_ms: ping.latency_ms, error: ping.error },
      }),
    );
    process.exit(0);
  }

  // 2) Server-info (best-effort — vissa Upstash-planer begränsar INFO)
  let server = null;
  try {
    const infoCmd = await timed(() => redis.info());
    if (!infoCmd.error) {
      const parsed = parseInfo(infoCmd.result);
      server = {
        redis_version: parsed.redis_version || null,
        uptime_seconds: Number(parsed.uptime_in_seconds) || null,
        used_memory_human: parsed.used_memory_human || null,
        connected_clients: Number(parsed.connected_clients) || null,
      };
    }
  } catch {
    /* ignore */
  }

  const dbsize = await timed(() => redis.dbsize());
  const total_keys = dbsize.error ? null : Number(dbsize.result);

  // 3) Per-prefix-buckets
  const prefixes = [];
  for (const bucket of TRACKED_PREFIX_BUCKETS) {
    const t = await timed(() => scanCount(bucket.pattern));
    prefixes.push({
      label: bucket.label,
      pattern: bucket.pattern,
      latency_ms: t.latency_ms,
      key_count: t.error ? null : t.result.count,
      sample_keys: t.error ? [] : t.result.sample,
      truncated: t.error ? false : t.result.truncated,
      error: t.error,
    });
  }

  // 4) Probe — skriv, läs, radera. TTL=30s som extra fail-safe.
  const probeKey = `${KEY_PREFIX}health:probe:${Date.now()}`;
  const probeValue = `health-${Date.now()}`;
  const writeT = await timed(() =>
    redis.set(probeKey, probeValue, { ex: 30 }),
  );
  const readT = await timed(() => redis.get(probeKey));
  const delT = await timed(() => redis.del(probeKey));
  const probe = {
    key: probeKey,
    write: { ok: !writeT.error, latency_ms: writeT.latency_ms, error: writeT.error },
    read: {
      ok: !readT.error && readT.result === probeValue,
      latency_ms: readT.latency_ms,
      error: readT.error,
      value_matches: readT.result === probeValue,
    },
    delete: { ok: !delT.error, latency_ms: delT.latency_ms, error: delT.error },
  };

  const summary = {
    total_keys,
    total_prefix_buckets: prefixes.length,
    total_keys_in_buckets: prefixes.reduce(
      (s, p) => s + (p.key_count ?? 0),
      0,
    ),
    probe_round_trip_ms: probe.write.latency_ms + probe.read.latency_ms + probe.delete.latency_ms,
  };

  const ok =
    !ping.error &&
    probe.write.ok &&
    probe.read.ok &&
    probe.read.value_matches &&
    probe.delete.ok;

  const out = {
    ok,
    timestamp: startedAt,
    target,
    runtime_env: RUNTIME_ENV,
    key_prefix: KEY_PREFIX,
    connection: { ok: true, latency_ms: ping.latency_ms, error: null },
    server,
    summary,
    prefixes,
    probe,
  };

  if (SNAPSHOT_FLAG) {
    try {
      await mkdir(dirname(SNAPSHOT_PATH), { recursive: true });
      const snapshot = {
        timestamp: out.timestamp,
        connection_latency_ms: out.connection.latency_ms,
        total_keys,
        used_memory_human: server?.used_memory_human ?? null,
        probe_round_trip_ms: summary.probe_round_trip_ms,
        per_prefix: prefixes.map((p) => ({
          label: p.label,
          key_count: p.key_count,
          latency_ms: p.latency_ms,
        })),
      };
      await appendFile(SNAPSHOT_PATH, JSON.stringify(snapshot) + "\n");
    } catch (err) {
      out.snapshot_error = err.message;
    }
  }

  console.log(JSON.stringify(out));
  process.exit(0);
}

run().catch((err) => {
  console.log(JSON.stringify({ ok: false, error: err.message, stack: err.stack }));
  process.exit(1);
});
