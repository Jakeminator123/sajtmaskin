import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import {
  assertSafeWriteTarget,
  inspectExplicitDbTargets,
  normalizeEnvUrl,
  summarizeTarget,
} from "./db-target-guard.mjs";
import { loadDbTargets } from "./check-db-env-target.mjs";

// Read from the canonical mapping rather than hardcoding refs, so the test
// keeps asserting the real dev/prod identities if those ever change.
const { dev: DEV_TARGET, prod: PROD_TARGET } = loadDbTargets();
const DEV_REF = DEV_TARGET.projectRef;
const PROD_REF = PROD_TARGET.projectRef;

describe("db-target-guard", () => {
  it("normalizes empty or placeholder env values away", () => {
    expect(normalizeEnvUrl("")).toBeUndefined();
    expect(normalizeEnvUrl("   ")).toBeUndefined();
    expect(normalizeEnvUrl("${POSTGRES_URL}")).toBeUndefined();
    expect(normalizeEnvUrl("$POSTGRES_URL")).toBeUndefined();
  });

  it("treats the same host, port and database as prod-like even with different query params", () => {
    const inspection = inspectExplicitDbTargets(
      "postgresql://user:pw@aws-1-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x",
      "postgresql://user:pw@aws-1-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require&supa=project-ref",
    );

    expect(inspection.isProdLike).toBe(true);
    expect(summarizeTarget(inspection.current)).toBe("aws-1-us-east-1.pooler.supabase.com:6543/postgres");
  });

  it("treats a different database target as non-prod-like", () => {
    const inspection = inspectExplicitDbTargets(
      "postgresql://user:pw@aws-1-us-east-1.pooler.supabase.com:6543/postgres",
      "postgresql://user:pw@db.internal:5432/postgres",
    );

    expect(inspection.isProdLike).toBe(false);
  });

  // Regression: a read command pointed at DEV used to print a bare hostname,
  // indistinguishable from a successful prod read unless you know the regions.
  // The environment prefix is what makes the wrong-database answer visible.
  it("labels a known dev target as DEV even though it is not prod-like", () => {
    const inspection = inspectExplicitDbTargets(
      `postgresql://postgres.${DEV_REF}:pw@aws-1-eu-north-1.pooler.supabase.com:6543/postgres`,
      `postgresql://postgres.${PROD_REF}:pw@aws-1-us-east-1.pooler.supabase.com:6543/postgres`,
    );

    expect(inspection.isProdLike).toBe(false);
    expect(summarizeTarget(inspection.current)).toBe(
      "[DEV] aws-1-eu-north-1.pooler.supabase.com:6543/postgres",
    );
  });

  it("labels a known prod target as PROD", () => {
    const inspection = inspectExplicitDbTargets(
      `postgresql://postgres.${PROD_REF}:pw@aws-1-us-east-1.pooler.supabase.com:6543/postgres`,
      `postgresql://postgres.${PROD_REF}:pw@aws-1-us-east-1.pooler.supabase.com:6543/postgres`,
    );

    expect(inspection.isProdLike).toBe(true);
    expect(summarizeTarget(inspection.current)).toBe(
      "[PROD] aws-1-us-east-1.pooler.supabase.com:6543/postgres",
    );
  });

  it("leaves an unknown project (e.g. local Postgres) unlabelled", () => {
    const inspection = inspectExplicitDbTargets(
      "postgresql://postgres:postgres@localhost:5432/sajtmaskin",
      `postgresql://postgres.${PROD_REF}:pw@aws-1-us-east-1.pooler.supabase.com:6543/postgres`,
    );

    expect(summarizeTarget(inspection.current)).toBe("localhost:5432/sajtmaskin");
  });
});

// Regression: the prod refusal used to depend on `.env.vercel.production.pulled`
// existing — no snapshot file, no protection, which is precisely the state of a
// machine that has never pulled prod env. Since the schema-sync git hooks call
// this on an automatic path (`git pull` -> migrate), identity must come from the
// registry, not from whether a file happens to be on disk.
describe("assertSafeWriteTarget — prod identity from the registry", () => {
  const PROD_URL = `postgresql://postgres.${PROD_REF}:pw@aws-1-us-east-1.pooler.supabase.com:6543/postgres`;
  const DEV_URL = `postgresql://postgres.${DEV_REF}:pw@aws-1-eu-north-1.pooler.supabase.com:6543/postgres`;
  // Bara `warn` behövs; guarden rör inget annat på loggern.
  const silent = { warn: () => {} } as unknown as Console;
  const envWith = (extra: Record<string, string>) => extra as unknown as NodeJS.ProcessEnv;

  /** Runs from a temp cwd so the repo's own `.env.vercel.production.pulled` is out of reach. */
  function inNoSnapshotDir<T>(fn: () => T): T {
    const previous = process.cwd();
    const dir = mkdtempSync(join(tmpdir(), "db-target-guard-"));
    try {
      process.chdir(dir);
      return fn();
    } finally {
      process.chdir(previous);
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it("refuses a write to prod even when no pulled snapshot exists", () => {
    inNoSnapshotDir(() => {
      expect(() =>
        assertSafeWriteTarget({ env: envWith({ POSTGRES_URL: PROD_URL }), logger: silent }),
      ).toThrow(/PRODUCTION project in config\/db-targets\.json/);
    });
  });

  it("still honours the explicit acknowledgement, so db:migrate:prod and CI keep working", () => {
    inNoSnapshotDir(() => {
      expect(() =>
        assertSafeWriteTarget({
          env: envWith({ POSTGRES_URL: PROD_URL, DB_ALLOW_PROD_LIKE_WRITE: "1" }),
          logger: silent,
        }),
      ).not.toThrow();
    });
  });

  it("lets a dev target through untouched", () => {
    inNoSnapshotDir(() => {
      expect(() =>
        assertSafeWriteTarget({ env: envWith({ POSTGRES_URL: DEV_URL }), logger: silent }),
      ).not.toThrow();
    });
  });
});
