import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

// In CI and on Vercel there is no local dev log, so the preflight run always
// skips. The self-test exercises the same detection logic against synthetic
// logs, which gives the check a real signal in `test:ci`.
describe("check-autofix-risk", () => {
  it("passes its self-test", () => {
    const res = spawnSync(process.execPath, ["scripts/dev/check-autofix-risk.mjs", "--self-test"], {
      encoding: "utf8",
    });
    expect(res.status, res.stderr || res.stdout).toBe(0);
    expect(res.stdout).toContain("self-test OK");
  }, 30_000);
});
