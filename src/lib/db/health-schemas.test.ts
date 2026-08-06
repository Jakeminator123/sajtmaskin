/**
 * Schema-validering: kontrollerar att JSON-payload från
 * `scripts/db/db-health-check.mjs` och `scripts/db/redis-health-check.mjs`
 * matchar de strict schemas under `docs/schemas/strict/`.
 *
 * Validerar mot fixtures (icke-DB-anslutningar) — vi kör inte de riktiga
 * skripten i CI eftersom det kräver live-DB. Fixtures speglar de tre
 * varianterna per skript (success, fail-modes).
 *
 * Säkerhets-net: om ett fält i scriptet ändras utan att schemat följer med
 * failas detta test. Backoffice-loadern (database_health.py / redis_health.py)
 * skulle annars råka tysta UI-glapp.
 *
 * Långbänk-uppföljning 2026-04-24.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import { buildTrackedRedisHealthBuckets } from "../../../scripts/db/redis-health-buckets.mjs";

const REPO_ROOT = join(__dirname, "..", "..", "..");

function loadSchema(name: string): object {
  return JSON.parse(
    readFileSync(join(REPO_ROOT, "docs/schemas/strict", name), "utf8"),
  );
}

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const dbHealthSchema = loadSchema("db-health-check-report.schema.json");
const redisHealthSchema = loadSchema("redis-health-check-report.schema.json");
const perfAuditSchema = loadSchema("db-perf-indexes-audit-line.schema.json");

const validateDbHealth = ajv.compile(dbHealthSchema);
const validateRedisHealth = ajv.compile(redisHealthSchema);
const validatePerfAudit = ajv.compile(perfAuditSchema);

function fmt(errors: unknown): string {
  return JSON.stringify(errors, null, 2);
}

describe("db-health-check-report.schema.json", () => {
  it("validerar success-payload", () => {
    const fixture = {
      ok: true,
      timestamp: "2026-04-24T08:55:01.737Z",
      target: "postgresql://postgres.x:***@host.example.com:5432/postgres",
      is_prod_like: false,
      connection: { ok: true, latency_ms: 475, error: null },
      connections: {
        ok: true,
        error: null,
        latency_ms: 16,
        total: 13,
        this_database: 7,
        active: 1,
        idle: 4,
        state_hidden: 8,
        max_connections: 60,
        superuser_reserved: 3,
        usable_connections: 57,
        headroom: 44,
        used_pct: 22.8,
      },
      summary: {
        total_tables_expected: 31,
        total_tables_present: 31,
        total_tables_missing: 0,
        total_table_probe_failures: 0,
        total_rows_estimate: 13405,
        total_indexes_missing: 0,
        total_indexes_extra: 7,
      },
      tables: [
        {
          name: "engine_messages",
          exists: true,
          has_pk: true,
          indexes: ["engine_messages_pkey", "idx_engine_messages_chat_created"],
          expected_indexes: ["idx_engine_messages_chat_created"],
          missing_indexes: [],
          aliased_indexes: {},
          row_count_estimate: 946,
          row_count_exact: null,
          probe_latency_ms: 67,
          probe_error: null,
        },
      ],
      missing_indexes: [],
      extra_indexes: [{ table: "generation_telemetry", index: "idx_gen_telemetry_chat" }],
    };
    const ok = validateDbHealth(fixture);
    expect(ok, fmt(validateDbHealth.errors)).toBe(true);
  });

  it("validerar connection-fail-payload", () => {
    const fixture = {
      ok: false,
      timestamp: "2026-04-24T09:00:00.000Z",
      target: "postgresql://postgres.x:***@host.example.com:5432/postgres",
      is_prod_like: false,
      connection: { ok: false, latency_ms: 5000, error: "ETIMEDOUT" },
      tables: [],
    };
    const ok = validateDbHealth(fixture);
    expect(ok, fmt(validateDbHealth.errors)).toBe(true);
  });

  it("validerar config-fail-payload", () => {
    const fixture = { ok: false, error: "Missing database connection URL." };
    const ok = validateDbHealth(fixture);
    expect(ok, fmt(validateDbHealth.errors)).toBe(true);
  });

  it("avvisar payload utan obligatoriska fält", () => {
    const ok = validateDbHealth({ ok: true });
    expect(ok).toBe(false);
  });

  it("validerar full-rapport med ok=false (saknade tabeller)", () => {
    // Tidigare bug: schema accepterade ok som vilken boolean som helst på
    // success-grenen. Nu med additionalProperties:false måste alla fält
    // matcha exakt — verifierar att ok=false-fall (delvis grön) validerar.
    const fixture = {
      ok: false,
      timestamp: "2026-04-24T10:00:00.000Z",
      target: "postgresql://postgres.x:***@host.example.com:5432/postgres",
      is_prod_like: false,
      connection: { ok: true, latency_ms: 200, error: null },
      connections: { ok: true, error: null, latency_ms: 12, total: 4, this_database: 4, active: 1, idle: 3, state_hidden: 0, max_connections: 100, superuser_reserved: 3, usable_connections: 97, headroom: 93, used_pct: 4.1 },
      summary: {
        total_tables_expected: 31,
        total_tables_present: 30,
        total_tables_missing: 1,
        total_table_probe_failures: 0,
        total_rows_estimate: 13405,
        total_indexes_missing: 0,
        total_indexes_extra: 0,
      },
      tables: [{ name: "lost_table", exists: false }],
      missing_indexes: [],
      extra_indexes: [],
    };
    const ok = validateDbHealth(fixture);
    expect(ok, fmt(validateDbHealth.errors)).toBe(true);
  });

  // `connections` är best-effort: en misslyckad pg_stat_activity-probe får inte
  // fälla rapporten, så den grenen måste också vara en giltig fullReport.
  // Annars vore diagnostiken en ny anledning till rött.
  it("validerar full-rapport där connections-proben failade", () => {
    const fixture = {
      ok: true,
      timestamp: "2026-07-28T10:00:00.000Z",
      target: "postgresql://postgres.x:***@host.example.com:5432/postgres",
      is_prod_like: false,
      connection: { ok: true, latency_ms: 200, error: null },
      connections: {
        ok: false,
        error: "permission denied for view pg_stat_activity",
        latency_ms: 8,
      },
      summary: {
        total_tables_expected: 1,
        total_tables_present: 1,
        total_tables_missing: 0,
        total_table_probe_failures: 0,
        total_rows_estimate: 0,
        total_indexes_missing: 0,
        total_indexes_extra: 0,
      },
      tables: [{ name: "engine_messages", exists: false }],
      missing_indexes: [],
      extra_indexes: [],
    };
    const ok = validateDbHealth(fixture);
    expect(ok, fmt(validateDbHealth.errors)).toBe(true);
  });

  it("avvisar connections med okänt fält (additionalProperties strict)", () => {
    const fixture = {
      ok: true,
      timestamp: "2026-07-28T10:00:00.000Z",
      target: "x",
      is_prod_like: false,
      connection: { ok: true, latency_ms: 1, error: null },
      connections: { ok: true, latency_ms: 1, total: 1, surprise_field: 1 },
      summary: {
        total_tables_expected: 0,
        total_tables_present: 0,
        total_tables_missing: 0,
        total_table_probe_failures: 0,
        total_rows_estimate: 0,
        total_indexes_missing: 0,
        total_indexes_extra: 0,
      },
      tables: [],
      missing_indexes: [],
      extra_indexes: [],
    };
    expect(validateDbHealth(fixture)).toBe(false);
  });

  it("validerar fatal-error-payload (med stack)", () => {
    const fixture = {
      ok: false,
      error: "Unexpected: connection terminated unexpectedly",
      stack: "Error: ...\n    at run (scripts/db/db-health-check.mjs:495)",
    };
    const ok = validateDbHealth(fixture);
    expect(ok, fmt(validateDbHealth.errors)).toBe(true);
  });

  it("avvisar tablerow med okänt fält (additionalProperties strict)", () => {
    const fixture = {
      ok: true,
      timestamp: "2026-04-24T10:00:00.000Z",
      target: "x",
      is_prod_like: false,
      connection: { ok: true, latency_ms: 1, error: null },
      // Giltig, så testet fortsätter falla på skräpfälten nedan och inte på ett
      // saknat obligatoriskt fält.
      connections: { ok: true, latency_ms: 1, total: 1 },
      summary: {
        total_tables_expected: 1,
        total_tables_present: 1,
        total_tables_missing: 0,
        total_table_probe_failures: 0,
        total_rows_estimate: 0,
        total_indexes_missing: 0,
        total_indexes_extra: 0,
      },
      tables: [{ name: "x", exists: true, garbage_field: "should_not_validate" }],
      missing_indexes: [],
      extra_indexes: [],
      garbage_top_level: "also_should_not_validate",
    };
    const ok = validateDbHealth(fixture);
    expect(ok).toBe(false);
  });
});

describe("redis-health-check-report.schema.json", () => {
  it("validerar success-payload med env-scoped buckets", () => {
    const fixture = {
      ok: true,
      timestamp: "2026-04-24T08:55:00.000Z",
      target: "https://alert-silkworm-17000.upstash.io",
      runtime_env: "development",
      key_prefix: "dev:",
      connection: { ok: true, latency_ms: 309, error: null },
      server: {
        redis_version: "7.4.0",
        uptime_seconds: 3600,
        used_memory_human: "26K",
        connected_clients: 2,
      },
      summary: {
        total_keys: 6,
        total_prefix_buckets: 9,
        total_keys_in_buckets: 6,
        probe_round_trip_ms: 346,
      },
      prefixes: [
        {
          label: "cache",
          pattern: "dev:cache:*",
          scope: "env",
          latency_ms: 117,
          key_count: 0,
          sample_keys: [],
          truncated: false,
          error: null,
        },
        {
          label: "ratelimit (sajtmaskin, denna miljö)",
          pattern: "sajtmaskin:dev:ratelimit:*",
          scope: "global",
          latency_ms: 114,
          key_count: 0,
          sample_keys: [],
          truncated: false,
          error: null,
        },
      ],
      probe: {
        key: "dev:health:probe:1777019816192",
        write: { ok: true, latency_ms: 117, error: null },
        read: { ok: true, latency_ms: 113, error: null, value_matches: true },
        delete: { ok: true, latency_ms: 116, error: null },
      },
    };

    const trackedBuckets = buildTrackedRedisHealthBuckets("dev:");
    expect(trackedBuckets).toEqual([
      { scope: "env", label: "cache", pattern: "dev:cache:*" },
      { scope: "env", label: "audit", pattern: "dev:audit:*" },
      { scope: "env", label: "audit_list", pattern: "dev:audit_list:*" },
      {
        scope: "env",
        label: "preview-session:session",
        pattern: "dev:preview-session:session:*",
      },
      {
        scope: "env",
        label: "sandbox-preview:session (legacy)",
        pattern: "dev:sandbox-preview:session:*",
      },
      { scope: "env", label: "prompt_handoff", pattern: "dev:prompt_handoff:*" },
      { scope: "env", label: "brief:v1", pattern: "dev:brief:v1:*" },
      { scope: "env", label: "health:probe", pattern: "dev:health:probe:*" },
      {
        scope: "global",
        label: "ratelimit (sajtmaskin, denna miljö)",
        pattern: "sajtmaskin:dev:ratelimit:*",
      },
    ]);
    expect(fixture.summary.total_prefix_buckets).toBe(trackedBuckets.length);
    expect(
      fixture.prefixes.every((prefix) =>
        trackedBuckets.some(
          (bucket) =>
            bucket.scope === prefix.scope &&
            bucket.label === prefix.label &&
            bucket.pattern === prefix.pattern,
        ),
      ),
    ).toBe(true);
    const ok = validateRedisHealth(fixture);
    expect(ok, fmt(validateRedisHealth.errors)).toBe(true);
  });

  it("validerar creds-missing-payload", () => {
    const fixture = {
      ok: false,
      error: "UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN saknas",
      target: null,
    };
    const ok = validateRedisHealth(fixture);
    expect(ok, fmt(validateRedisHealth.errors)).toBe(true);
  });

  it("avvisar bucket utan scope-fält", () => {
    const fixture = {
      ok: true,
      timestamp: "2026-04-24T08:55:00.000Z",
      target: "https://x.upstash.io",
      runtime_env: "development",
      key_prefix: "dev:",
      connection: { ok: true, latency_ms: 100 },
      summary: { total_keys: 0, total_prefix_buckets: 1, probe_round_trip_ms: 0 },
      prefixes: [
        // Missing `scope` — borde failas av schemat
        { label: "x", pattern: "dev:x:*", latency_ms: 5 },
      ],
      probe: {
        key: "k",
        write: { ok: true, latency_ms: 1 },
        read: { ok: true, latency_ms: 1, value_matches: true },
        delete: { ok: true, latency_ms: 1 },
      },
    };
    const ok = validateRedisHealth(fixture);
    expect(ok).toBe(false);
  });

  it("avvisar key_prefix utan kolon-suffix", () => {
    const fixture = {
      ok: false,
      timestamp: "2026-04-24T08:55:00.000Z",
      target: "https://x.upstash.io",
      runtime_env: "development",
      key_prefix: "dev", // saknar kolon
      connection: { ok: false, error: "boom" },
    };
    const ok = validateRedisHealth(fixture);
    expect(ok).toBe(false);
  });

  it("validerar ping-fail-payload (minimal struktur)", () => {
    const fixture = {
      ok: false,
      timestamp: "2026-04-24T08:55:00.000Z",
      target: "https://x.upstash.io",
      runtime_env: "production",
      key_prefix: "prod:",
      connection: { ok: false, latency_ms: 5000, error: "ETIMEDOUT" },
    };
    const ok = validateRedisHealth(fixture);
    expect(ok, fmt(validateRedisHealth.errors)).toBe(true);
  });

  it("validerar fatal-error-payload (med stack)", () => {
    const fixture = {
      ok: false,
      error: "Unexpected: ...",
      stack: "Error: ...\n    at run (scripts/db/redis-health-check.mjs:308)",
    };
    const ok = validateRedisHealth(fixture);
    expect(ok, fmt(validateRedisHealth.errors)).toBe(true);
  });

  it("validerar prefix-bucket med error satt", () => {
    const fixture = {
      ok: true,
      timestamp: "2026-04-24T08:55:00.000Z",
      target: "https://x.upstash.io",
      runtime_env: "development",
      key_prefix: "dev:",
      connection: { ok: true, latency_ms: 100, error: null },
      summary: { total_keys: 0, total_prefix_buckets: 1, probe_round_trip_ms: 0 },
      prefixes: [
        {
          label: "broken_bucket",
          pattern: "dev:broken:*",
          scope: "env",
          latency_ms: 0,
          key_count: null,
          sample_keys: [],
          truncated: false,
          error: "WRONGTYPE Operation against a key holding the wrong kind of value",
        },
      ],
      probe: {
        key: "dev:health:probe:1",
        write: { ok: true, latency_ms: 1 },
        read: { ok: true, latency_ms: 1, value_matches: true },
        delete: { ok: true, latency_ms: 1 },
      },
    };
    const ok = validateRedisHealth(fixture);
    expect(ok, fmt(validateRedisHealth.errors)).toBe(true);
  });
});

describe("db-perf-indexes-audit-line.schema.json", () => {
  it("validerar typisk audit-rad (apply-körning)", () => {
    const fixture = {
      timestamp: "2026-04-24T08:55:01.737Z",
      dry_run: false,
      reason: "Hälsokollen visade 17 saknade index efter dagens deploy",
      target_redacted: "postgresql://postgres.x:***@host.example.com:5432/postgres",
      created: 17,
      already: 7,
      skipped: 0,
      failed: 0,
      process_user: "jakem",
      runtime_env: "development",
    };
    const ok = validatePerfAudit(fixture);
    expect(ok, fmt(validatePerfAudit.errors)).toBe(true);
  });

  it("validerar dry-run-rad utan reason", () => {
    const fixture = {
      timestamp: "2026-04-24T08:55:01.737Z",
      dry_run: true,
      reason: null,
      target_redacted: "postgresql://postgres.x:***@host.example.com:5432/postgres",
      created: 0,
      already: 7,
      skipped: 0,
      failed: 0,
      process_user: null,
      runtime_env: "development",
    };
    const ok = validatePerfAudit(fixture);
    expect(ok, fmt(validatePerfAudit.errors)).toBe(true);
  });

  it("validerar rad med failures", () => {
    const fixture = {
      timestamp: "2026-04-24T08:55:01.737Z",
      dry_run: false,
      reason: "auto:predev",
      target_redacted: "postgresql://postgres.x:***@host.example.com:5432/postgres",
      created: 1,
      already: 0,
      skipped: 0,
      failed: 1,
      failures: [{ name: "idx_x", message: "permission denied" }],
      process_user: "ci",
      runtime_env: "production",
    };
    const ok = validatePerfAudit(fixture);
    expect(ok, fmt(validatePerfAudit.errors)).toBe(true);
  });

  it("avvisar rad utan obligatoriska fält", () => {
    const ok = validatePerfAudit({ timestamp: "2026-04-24T00:00:00Z" });
    expect(ok).toBe(false);
  });

  it("avvisar negativa counters", () => {
    const fixture = {
      timestamp: "2026-04-24T08:55:01.737Z",
      dry_run: false,
      target_redacted: "x",
      created: -1,
      already: 0,
      skipped: 0,
      failed: 0,
      runtime_env: "development",
    };
    const ok = validatePerfAudit(fixture);
    expect(ok).toBe(false);
  });
});
