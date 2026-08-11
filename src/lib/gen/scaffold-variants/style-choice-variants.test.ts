import { describe, expect, it } from "vitest";

import {
  STYLE_CHOICE_VARIANTS_FOR_TEST,
  resolveVariantForStyleChoice,
} from "./style-choice-variants";
import type { ScaffoldId } from "../scaffolds/types";

describe("resolveVariantForStyleChoice", () => {
  it("resolves every mapped pair to a variant that actually exists", () => {
    const pairs = Object.entries(STYLE_CHOICE_VARIANTS_FOR_TEST).flatMap(
      ([scaffoldId, byStyle]) =>
        Object.entries(byStyle ?? {}).map(([style, variantId]) => ({
          scaffoldId,
          style,
          variantId,
        })),
    );
    // Guards against the map silently emptying out during a refactor.
    expect(pairs.length).toBeGreaterThan(20);

    for (const pair of pairs) {
      const variant = resolveVariantForStyleChoice(pair.scaffoldId, pair.style);
      expect(
        variant,
        `${pair.scaffoldId}/${pair.style} → ${pair.variantId} does not resolve`,
      ).not.toBeNull();
      expect(variant!.id).toBe(pair.variantId);
      expect(variant!.scaffoldId).toBe(pair.scaffoldId as ScaffoldId);
    }
  });

  it("returns null for auto, unknown scaffolds and unmapped pairs", () => {
    expect(resolveVariantForStyleChoice("landing-page", "auto")).toBeNull();
    expect(resolveVariantForStyleChoice("landing-page", null)).toBeNull();
    expect(resolveVariantForStyleChoice(null, "minimal")).toBeNull();
    expect(resolveVariantForStyleChoice("no-such-scaffold", "minimal")).toBeNull();
    // dashboard has no honest "warm" or "minimal" variant — the matcher should decide.
    expect(resolveVariantForStyleChoice("dashboard", "warm")).toBeNull();
    expect(resolveVariantForStyleChoice("dashboard", "minimal")).toBeNull();
    expect(resolveVariantForStyleChoice("saas-landing", "minimal")).toBeNull();
  });

  it("pins distinct variants for opposing styles on the same scaffold", () => {
    const minimal = resolveVariantForStyleChoice("landing-page", "minimal");
    const bold = resolveVariantForStyleChoice("landing-page", "bold");
    expect(minimal?.id).not.toBe(bold?.id);
  });
});
