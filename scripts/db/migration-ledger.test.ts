import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MIGRATION_ORDER } from "./migration-order.mjs";
import { diffPendingMigrations } from "./migration-ledger.mjs";

// Guards the pure diff that powers `db:migrate:check` (the prod migration-ledger
// gate). The DB-touching parts (ensure/record/read) are exercised for real by
// `db:migrate` / `db:migrate:prod` against a live Postgres; here we lock the
// behind/ahead logic that decides whether CI reddens.
describe("diffPendingMigrations", () => {
  it("treats a null ledger (table not created yet) as ALL migrations pending", () => {
    expect(diffPendingMigrations(null)).toEqual([...MIGRATION_ORDER]);
  });

  it("reports no pending when every migration is recorded", () => {
    const applied = new Set(MIGRATION_ORDER);
    expect(diffPendingMigrations(applied)).toEqual([]);
  });

  it("reports exactly the unrecorded migrations, in MIGRATION_ORDER order", () => {
    // Drop the first and last recorded => both should surface as pending.
    const applied = new Set(MIGRATION_ORDER.slice(1, MIGRATION_ORDER.length - 1));
    const pending = diffPendingMigrations(applied);
    expect(pending).toEqual([
      MIGRATION_ORDER[0],
      MIGRATION_ORDER[MIGRATION_ORDER.length - 1],
    ]);
  });

  it("ignores unknown/extra ledger entries (only MIGRATION_ORDER matters)", () => {
    const applied = new Set([...MIGRATION_ORDER, "some-old-removed-migration.sql"]);
    expect(diffPendingMigrations(applied)).toEqual([]);
  });
});

// Guards the connection-resolution gate in check-migrations-applied.mjs. An
// EXPLICIT --env target (e.g. db:migrate:check:prod) must never pass as a silent
// SKIP just because the file is missing or carries no Postgres URL — that would
// be a false-green in the prod migration gate. The fork/no-secret SKIP is only
// allowed when NO --env was given (covered by the runtime env-var path in CI).
describe("check-migrations-applied --env target guard", () => {
  // Resolve from the project root (vitest runs with cwd = repo root, both
  // locally via `npx vitest` and in CI via `npm run test:ci`).
  const CHECK_SCRIPT = join(
    process.cwd(),
    "scripts",
    "db",
    "check-migrations-applied.mjs",
  );
  const CONNECTION_KEYS = [
    "POSTGRES_URL",
    "POSTGRES_URL_NON_POOLING",
    "STORAGE_POSTGRES_URL",
    "STORAGE_POSTGRES_URL_NON_POOLING",
    "DATABASE_URL",
  ];

  function runCheck(args: string[]) {
    // Strip any real connection string from the child env so the test is
    // deterministic regardless of a POSTGRES_URL injected by the CI runner.
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const k of CONNECTION_KEYS) delete env[k];
    return spawnSync(process.execPath, [CHECK_SCRIPT, ...args], {
      env,
      encoding: "utf8",
    });
  }

  it("hard-fails (exit 1) when an explicit --env file is missing", () => {
    const res = runCheck(["--env=./__definitely-missing__.env", "--json"]);
    expect(res.status).toBe(1);
  });

  it("hard-fails (exit 1) when an explicit --env file exists but has no Postgres URL", () => {
    const dir = mkdtempSync(join(tmpdir(), "migchk-"));
    const envFile = join(dir, "no-url.env");
    writeFileSync(envFile, "SOME_UNRELATED_VAR=1\n");
    try {
      const res = runCheck([`--env=${envFile}`, "--json"]);
      expect(res.status).toBe(1);
      expect(`${res.stderr}`).toContain("--env");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
