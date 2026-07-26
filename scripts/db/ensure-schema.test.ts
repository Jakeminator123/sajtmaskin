import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MIGRATION_ORDER } from "./migration-order.mjs";
import {
  decideSchemaAction,
  formatSchemaWarning,
  resolveSslConfig,
} from "./ensure-schema.mjs";

// Guards the local-schema safety net: dev must never silently run against a DB
// that is behind on migrations, and the read-only guard must never write.
describe("decideSchemaAction", () => {
  it("is in sync when nothing is pending", () => {
    expect(decideSchemaAction({ pending: [] })).toEqual({
      action: "ok",
      inSync: true,
    });
  });

  it("applies pending migrations by default", () => {
    expect(decideSchemaAction({ pending: ["add-llm-usage.sql"] })).toEqual({
      action: "apply",
      inSync: false,
    });
  });

  it("only reports — never applies — in check-only mode", () => {
    // The dev-start guard runs fire-and-forget in the background; it must stay
    // read-only so DDL keeps coming from explicit entry points only.
    expect(
      decideSchemaAction({ pending: ["add-llm-usage.sql"], checkOnly: true }),
    ).toEqual({ action: "report", inSync: false });
  });

  it("does not treat check-only mode as in sync when migrations are missing", () => {
    const decision = decideSchemaAction({
      pending: [...MIGRATION_ORDER],
      checkOnly: true,
    });
    expect(decision.inSync).toBe(false);
  });
});

describe("formatSchemaWarning", () => {
  it("names every missing migration, the database and the fix command", () => {
    // A warning that omits the pending file or the fix is exactly the kind of
    // signal that gets scrolled past and ignored.
    const out = formatSchemaWarning({
      host: "aws-1-eu-north-1.pooler.supabase.com:5432",
      pending: ["add-llm-usage.sql", "add-branded-site-domains.sql"],
      headline: "LOCAL DATABASE SCHEMA IS BEHIND",
      fix: "npm run db:ensure",
    });

    expect(out).toContain("aws-1-eu-north-1.pooler.supabase.com:5432");
    expect(out).toContain("add-llm-usage.sql");
    expect(out).toContain("add-branded-site-domains.sql");
    expect(out).toContain("npm run db:ensure");
    expect(out).toContain(`of ${MIGRATION_ORDER.length} migration(s)`);
  });

  it("omits the missing-migration section when the pending set is unknown", () => {
    // An inconclusive run (e.g. the ledger re-read failed) must not imply a
    // specific set of missing migrations.
    const out = formatSchemaWarning({
      host: "localhost:5432",
      headline: "COULD NOT VERIFY THE RESULT",
      fix: "npm run db:migrate:check",
    });

    expect(out).toContain("COULD NOT VERIFY THE RESULT");
    expect(out).not.toContain("Missing");
    expect(out).toContain("npm run db:migrate:check");
  });
});

// The guard must connect the same way db-init.mjs and src/lib/db/client.ts do.
// If it diverges it fails to connect on the very setups it protects — and a
// guard that cannot connect protects nothing while looking installed.
describe("resolveSslConfig", () => {
  it("disables TLS entirely for sslmode=disable (documented local Postgres)", () => {
    expect(
      resolveSslConfig("postgresql://u:p@localhost:5432/db?sslmode=disable", {
        env: {},
      }),
    ).toBe(false);
  });

  it("verifies certificates by default", () => {
    expect(
      resolveSslConfig("postgresql://u:p@host.pooler.supabase.com:5432/postgres", {
        env: {},
      }),
    ).toEqual({ rejectUnauthorized: true });
  });

  it("relaxes verification via DB_SSL_REJECT_UNAUTHORIZED=false", () => {
    expect(
      resolveSslConfig("postgresql://u:p@host:5432/db", {
        env: { DB_SSL_REJECT_UNAUTHORIZED: "false" },
      }),
    ).toEqual({ rejectUnauthorized: false });
  });

  it("relaxes verification via --allow-insecure-ssl", () => {
    expect(
      resolveSslConfig("postgresql://u:p@host:5432/db", {
        allowInsecureSsl: true,
        env: {},
      }),
    ).toEqual({ rejectUnauthorized: false });
  });

  it("keeps sslmode=disable winning over an insecure-verification override", () => {
    // `disable` means "no TLS", not "TLS without verification" — the flags only
    // control verification strictness, never whether TLS is used at all.
    expect(
      resolveSslConfig("postgresql://u:p@localhost:5432/db?sslmode=disable", {
        allowInsecureSsl: true,
        env: { DB_SSL_REJECT_UNAUTHORIZED: "false" },
      }),
    ).toBe(false);
  });

  it("falls back to verifying TLS for an unparseable connection string", () => {
    expect(resolveSslConfig("not-a-url", { env: {} })).toEqual({
      rejectUnauthorized: true,
    });
  });
});

describe("ensure-schema CLI", () => {
  const SCRIPT = join(process.cwd(), "scripts", "db", "ensure-schema.mjs");
  const CONNECTION_KEYS = [
    "POSTGRES_URL",
    "POSTGRES_URL_NON_POOLING",
    "STORAGE_POSTGRES_URL",
    "STORAGE_POSTGRES_URL_NON_POOLING",
    "DATABASE_URL",
  ];

  /**
   * Runs the CLI with no reachable connection: connection vars stripped AND cwd
   * pointed at an empty dir so the script's `.env.local` lookup finds nothing.
   * Keeps the test hermetic — it must not touch the real dev database.
   */
  function runWithoutConnection(args: string[]) {
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const k of CONNECTION_KEYS) delete env[k];
    const dir = mkdtempSync(join(tmpdir(), "ensure-schema-"));
    try {
      return spawnSync(process.execPath, [SCRIPT, ...args], {
        env,
        cwd: dir,
        encoding: "utf8",
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it("skips with exit 0 when no database is configured", () => {
    // Mirrors check-migrations-applied.mjs: a fork / no-secret env must not fail.
    const res = runWithoutConnection([]);
    expect(res.status).toBe(0);
    expect(`${res.stdout}${res.stderr}`).toContain("No database connection");
  });

  it("stays silent in the background-guard mode when there is nothing to say", () => {
    const res = runWithoutConnection(["--check-only", "--soft", "--quiet-ok"]);
    expect(res.status).toBe(0);
    expect(`${res.stdout}${res.stderr}`.trim()).toBe("");
  });
});
