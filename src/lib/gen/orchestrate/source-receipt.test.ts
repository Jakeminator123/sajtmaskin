import { describe, expect, it } from "vitest";

import { buildSourceReceipt } from "./source-receipt";
import type { VariantTemplateInspiration } from "../scaffold-variants";

const INSPIRATION: VariantTemplateInspiration = {
  templateId: "8QhCJAwn16K",
  title: "Reference",
  category: "landing-pages",
  archiveUrl: "https://cdn.example.com/ref.zip",
  stillImageUrl: "https://cdn.example.com/still.png",
  structuralReferences: [],
};

describe("buildSourceReceipt — variant inspiration paths", () => {
  it("marks reachedPrompt true when the text block survived budget", () => {
    const sources = buildSourceReceipt({
      variantTemplateInspiration: INSPIRATION,
      pruning: { keptBlockKeys: ["variant_template_inspiration"] },
      variantTemplateImageAttached: false,
    });

    expect(sources).toEqual([
      expect.objectContaining({
        kind: "variant-reference",
        id: "8QhCJAwn16K",
        reachedPrompt: true,
      }),
    ]);
  });

  it("marks reachedPrompt true when the text block was pruned but the still image was attached", () => {
    const sources = buildSourceReceipt({
      variantTemplateInspiration: INSPIRATION,
      pruning: { keptBlockKeys: ["scaffold_variant_this_generation"] },
      variantTemplateImageAttached: true,
    });

    expect(sources).toEqual([
      expect.objectContaining({
        kind: "variant-reference",
        id: "8QhCJAwn16K",
        reachedPrompt: true,
      }),
    ]);
  });

  it("marks reachedPrompt false when both the text block and the still image missed the prompt", () => {
    const sources = buildSourceReceipt({
      variantTemplateInspiration: INSPIRATION,
      pruning: { keptBlockKeys: ["scaffold_variant_this_generation"] },
      variantTemplateImageAttached: false,
    });

    expect(sources[0]?.reachedPrompt).toBe(false);
  });
});
