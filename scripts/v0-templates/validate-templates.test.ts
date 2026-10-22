import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

// `templates:validate` has no CI step of its own. Running both halves here makes
// a broken template catalog or a stale variant-template-addenda.json fail
// `test:ci` instead of passing unnoticed.
describe("templates:validate", () => {
  it("accepts the committed template catalog", () => {
    const res = spawnSync(process.execPath, ["scripts/v0-templates/validate-templates.mjs"], {
      encoding: "utf8",
    });
    expect(res.status, res.stderr || res.stdout).toBe(0);
  }, 60_000);

  it("keeps variant-template-addenda.json in sync with its generator", () => {
    const res = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/v0-templates/generate-variant-template-addenda.ts", "--check"],
      { encoding: "utf8" },
    );
    expect(res.status, res.stderr || res.stdout).toBe(0);
  }, 60_000);
});
