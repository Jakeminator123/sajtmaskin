import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { getScaffoldIds } from "./registry";

// scripts/warm-cache-scaffolds.json drives both the warm-cache provisioner and
// `warm-cache:smoke`. A scaffold missing from it is always `cache_cold` while
// the smoke check still reports "All scaffolds warm" (projekt-bas-app, the
// Scaffold: Av baseline, was missing for two months).
describe("warm-cache scaffold list", () => {
  it("covers exactly the registered scaffolds", () => {
    const listed = JSON.parse(
      readFileSync(join(process.cwd(), "scripts", "warm-cache-scaffolds.json"), "utf8"),
    ) as { scaffoldIds: string[] };
    expect([...listed.scaffoldIds].sort()).toEqual([...getScaffoldIds()].sort());
  });
});
