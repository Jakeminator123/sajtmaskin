import { describe, expect, it } from "vitest";

import { renderScaffoldVariantBlock } from "./scaffold-stack";
import { getVariantById } from "@/lib/gen/scaffold-variants";

/**
 * The compact variant block is what non-redesign follow-ups get — i.e. most
 * rounds after the first. It used to omit `signaturePatterns` entirely, so the
 * variant's anti-patterns only ever reached the model on init and a follow-up
 * could drift into exactly the styles the variant exists to avoid.
 */
describe("renderScaffoldVariantBlock — compact follow-up form", () => {
  const variant = getVariantById("landing-page", "corporate-grid");

  it("keeps the variant identity and at least one anti-pattern", () => {
    if (!variant) throw new Error("corporate-grid variant not registered");
    expect(variant.signaturePatterns?.antiPatterns.length ?? 0).toBeGreaterThan(0);

    const compact = renderScaffoldVariantBlock(variant, { compact: true }).join("\n");
    expect(compact).toContain("## Scaffold Variant (this generation)");
    expect(compact).toContain("corporate-grid");
    expect(compact).toContain("Still avoid (variant anti-patterns):");
    expect(compact).toContain(variant.signaturePatterns!.antiPatterns[0]);
  });

  it("stays materially shorter than the full block", () => {
    if (!variant) throw new Error("corporate-grid variant not registered");
    const compact = renderScaffoldVariantBlock(variant, { compact: true }).join("\n");
    const full = renderScaffoldVariantBlock(variant).join("\n");
    expect(compact.length).toBeLessThan(full.length / 2);
  });

  it("renders nothing without a variant", () => {
    expect(renderScaffoldVariantBlock(null, { compact: true })).toEqual([]);
  });
});
