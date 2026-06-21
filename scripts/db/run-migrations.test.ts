import { readdirSync } from "fs";
import { describe, expect, it } from "vitest";
import {
  MIGRATION_ORDER,
  MIGRATIONS_DIR,
  resolveConnectionString,
  resolveMigrationRunOrder,
} from "./run-migrations";

// Anchor against env-convention drift for the manual-run migration script.
// The actual resolver lives in `src/lib/db/env.ts` and is unit-tested there;
// this file just guards the wiring inside `run-migrations.ts` so a future
// regression that re-introduces a hand-rolled `process.env.POSTGRES_URL ||
// ...` chain (which is what point 4 of KRAVER-DIALOG-2026-04-24 fixed) is
// caught by `npm run test:ci`.
describe("scripts/db/run-migrations resolveConnectionString", () => {
  it("accepts DATABASE_URL (the alias the standalone script previously ignored)", () => {
    const env = {
      DATABASE_URL: "postgresql://datab.example:5432/devdb",
    } as unknown as NodeJS.ProcessEnv;

    expect(resolveConnectionString(env)).toBe(
      "postgresql://datab.example:5432/devdb",
    );
  });

  it("prefers POSTGRES_URL over DATABASE_URL when both are set", () => {
    const env = {
      POSTGRES_URL: "postgresql://primary.example:5432/db",
      DATABASE_URL: "postgresql://fallback.example:5432/db",
    } as unknown as NodeJS.ProcessEnv;

    expect(resolveConnectionString(env)).toBe(
      "postgresql://primary.example:5432/db",
    );
  });

  it("ignores uninterpolated placeholders and falls through to next alias", () => {
    const env = {
      POSTGRES_URL: "${POSTGRES_URL}",
      DATABASE_URL: "postgresql://datab.example:5432/devdb",
    } as unknown as NodeJS.ProcessEnv;

    expect(resolveConnectionString(env)).toBe(
      "postgresql://datab.example:5432/devdb",
    );
  });

  it("throws with a message that lists every supported alias when nothing is set", () => {
    const env = {} as unknown as NodeJS.ProcessEnv;

    expect(() => resolveConnectionString(env)).toThrow(/POSTGRES_URL/);
    expect(() => resolveConnectionString(env)).toThrow(
      /POSTGRES_URL_NON_POOLING/,
    );
    expect(() => resolveConnectionString(env)).toThrow(/STORAGE_POSTGRES_URL/);
    expect(() => resolveConnectionString(env)).toThrow(
      /STORAGE_POSTGRES_URL_NON_POOLING/,
    );
    expect(() => resolveConnectionString(env)).toThrow(/DATABASE_URL/);
  });
});

// BUG-SWARM rank 10: migrations used to be applied via `readdir(...).sort()`
// (alphabetical, not dependency-aware). `resolveMigrationRunOrder` replaces that
// with an explicit, drift-checked manifest.
describe("scripts/db/run-migrations resolveMigrationRunOrder", () => {
  it("keeps MIGRATION_ORDER in sync with the migrations directory", () => {
    const onDisk = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
    // Drift guard: a new migration added to the directory without being slotted
    // into MIGRATION_ORDER (or vice versa) must fail this, not silently regress
    // to alphabetical order.
    expect(() => resolveMigrationRunOrder(onDisk)).not.toThrow();
    expect(resolveMigrationRunOrder(onDisk)).toHaveLength(onDisk.length);
    expect([...MIGRATION_ORDER].sort()).toEqual([...onDisk].sort());
  });

  it("applies the generation_telemetry CREATE before its scaffold-selection ALTER", () => {
    const order = resolveMigrationRunOrder([...MIGRATION_ORDER]);
    const createIdx = order.indexOf("add-generation-telemetry.sql");
    const alterIdx = order.indexOf("add-generation-telemetry-scaffold-selection.sql");
    expect(createIdx).toBeGreaterThanOrEqual(0);
    expect(alterIdx).toBeGreaterThanOrEqual(0);
    expect(createIdx).toBeLessThan(alterIdx);
  });

  it("throws when an on-disk migration is not registered in the manifest", () => {
    expect(() =>
      resolveMigrationRunOrder([...MIGRATION_ORDER, "add-some-new-thing.sql"]),
    ).toThrow(/not registered in MIGRATION_ORDER/);
  });

  it("throws when the manifest lists a migration that is absent on disk", () => {
    const withoutFirst = MIGRATION_ORDER.slice(1);
    expect(() => resolveMigrationRunOrder([...withoutFirst])).toThrow(/not found on disk/);
  });

  it("ignores non-sql files in the directory listing", () => {
    expect(() =>
      resolveMigrationRunOrder([...MIGRATION_ORDER, "README.md", ".gitkeep"]),
    ).not.toThrow();
  });
});
