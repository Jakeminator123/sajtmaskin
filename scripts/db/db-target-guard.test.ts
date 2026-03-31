import { describe, expect, it } from "vitest";
import { inspectExplicitDbTargets, normalizeEnvUrl, summarizeTarget } from "./db-target-guard.mjs";

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
});
