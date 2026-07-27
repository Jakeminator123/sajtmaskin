import { describe, expect, it } from "vitest";
import { inspectExplicitDbTargets, normalizeEnvUrl, summarizeTarget } from "./db-target-guard.mjs";
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
