import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { BLOCKING_STABILITY_SCRIPT, BLOCKING_STABILITY_TESTS } from "./check-contract.mjs";

function walkStabilityTests(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walkStabilityTests(path, acc);
      continue;
    }
    if (/\.stability\.test\.tsx?$/.test(name)) {
      acc.push(path.replaceAll("\\", "/"));
    }
  }
  return acc;
}

describe("blocking deterministic stability contracts", () => {
  it("classifies every *.stability.test.* file as blocking", () => {
    const discovered = walkStabilityTests("src").sort();
    expect(discovered).toEqual([...BLOCKING_STABILITY_TESTS]);
  });

  it("runs the explicit deterministic subset in the blocking quality job", () => {
    expect(BLOCKING_STABILITY_SCRIPT).toBe(
      ["vitest run -c vitest.stability.config.ts", ...BLOCKING_STABILITY_TESTS].join(" "),
    );
  });
});
