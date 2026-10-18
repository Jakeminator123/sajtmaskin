// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("DB startup policy", () => {
  it("dev setup has no implicit DB writer", () => {
    const source = readFileSync("scripts/dev/predev.mjs", "utf8");
    expect(source).not.toMatch(/"(?:npm run db:|node scripts\/db\/)/u);
    expect(source).toContain('"npm run hooks:install:soft"');
  });

  it("Cursor cloud start and Postgres pretest are check-only", () => {
    const cloud = JSON.parse(readFileSync(".cursor/environment.json", "utf8"));
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(cloud.start).toBe("node scripts/db/ensure-schema.mjs --check-only --soft --quiet-ok");
    expect(pkg.scripts["pretest:postgres"]).toBe(
      "node scripts/db/ensure-schema.mjs --check-only --quiet-ok",
    );
    expect(pkg.scripts["db:init"]).toBe("node scripts/db/db-init.mjs");
    expect(pkg.scripts["db:ensure"]).toBe("node scripts/db/ensure-schema.mjs");
    expect(pkg.scripts["db:migrate:prod"]).toBe("node scripts/db/migrate-prod.mjs");
    expect(pkg.scripts["db:init:soft"]).toBeUndefined();
    expect(pkg.scripts["db:perf-indexes:soft"]).toBeUndefined();
  });

  it("background guard passes check-only even on the fast dev path", () => {
    const source = readFileSync("scripts/dev/next-runner.mjs", "utf8");
    expect(source).toContain('[SCHEMA_GUARD_PATH, "--check-only", "--soft", "--quiet-ok"]');
  });
});
