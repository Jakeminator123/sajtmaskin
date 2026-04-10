import { describe, expect, it } from "vitest";
import { SHADCN_COMPONENTS } from "./shadcn-components";
import { SHADCN_CATEGORIES } from "./shadcn-categories";

describe("SHADCN_CATEGORIES", () => {
  it("every categorized component exists in SHADCN_COMPONENTS", () => {
    const invalid: string[] = [];
    for (const cat of SHADCN_CATEGORIES) {
      for (const comp of cat.components) {
        if (!(comp in SHADCN_COMPONENTS)) {
          invalid.push(`${cat.id}: ${comp}`);
        }
      }
    }
    expect(
      invalid,
      `Components in categories but missing from SHADCN_COMPONENTS: ${invalid.join(", ")}`,
    ).toHaveLength(0);
  });

  it("has no duplicate components across categories", () => {
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const cat of SHADCN_CATEGORIES) {
      for (const comp of cat.components) {
        if (seen.has(comp)) {
          dupes.push(`${comp} in both ${seen.get(comp)} and ${cat.id}`);
        }
        seen.set(comp, cat.id);
      }
    }
    expect(dupes, `Duplicate components: ${dupes.join(", ")}`).toHaveLength(0);
  });

  it("has exactly 5 categories", () => {
    expect(SHADCN_CATEGORIES).toHaveLength(5);
  });
});
