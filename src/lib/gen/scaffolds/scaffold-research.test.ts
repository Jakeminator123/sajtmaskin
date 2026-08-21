import { describe, expect, it } from "vitest";

import type { ScaffoldResearchFile } from "./scaffold-research";

describe("ScaffoldResearchFile", () => {
  it("contains only scaffold-owned quality metadata", () => {
    const research: ScaffoldResearchFile = {
      generatedAt: "2026-08-21T00:00:00.000Z",
      source: "test",
      scaffolds: {
        ecommerce: {
          qualityChecklist: ["Keep the storefront conversion path clear."],
          research: { upgradeTargets: ["Improve cart interactions."] },
        },
      },
    };

    expect(research.scaffolds.ecommerce?.research?.upgradeTargets).toEqual([
      "Improve cart interactions.",
    ]);
  });
});
