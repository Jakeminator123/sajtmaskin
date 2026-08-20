import { describe, expect, it } from "vitest";

import {
  VARIANT_TEMPLATE_STYLE_REFERENCE_PURPOSE,
  variantTemplateImageInSentPayload,
  type RequestAttachment,
} from "../request-metadata";
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

const VARIANT_STILL: RequestAttachment = {
  url: INSPIRATION.stillImageUrl,
  mimeType: "image/png",
  purpose: VARIANT_TEMPLATE_STYLE_REFERENCE_PURPOSE,
};

function userImages(count: number): RequestAttachment[] {
  return Array.from({ length: count }, (_, i) => ({
    url: `https://cdn.example.com/user-${i + 1}.jpg`,
    mimeType: "image/jpeg",
  }));
}

describe("buildSourceReceipt — variant inspiration paths", () => {
  it("marks reachedPrompt true when the text block survived budget", () => {
    const sources = buildSourceReceipt({
      variantTemplateInspiration: INSPIRATION,
      pruning: { keptBlockKeys: ["variant_template_inspiration"] },
      variantTemplateImageSent: false,
    });

    expect(sources).toEqual([
      expect.objectContaining({
        kind: "variant-reference",
        id: "8QhCJAwn16K",
        reachedPrompt: true,
      }),
    ]);
  });

  it("marks reachedPrompt true when the text block was pruned but the still image was sent", () => {
    const sources = buildSourceReceipt({
      variantTemplateInspiration: INSPIRATION,
      pruning: { keptBlockKeys: ["scaffold_variant_this_generation"] },
      variantTemplateImageSent: true,
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
      variantTemplateImageSent: false,
    });

    expect(sources[0]?.reachedPrompt).toBe(false);
  });

  it("marks reachedPrompt false when four user images crowd out the variant still (text treated separately)", () => {
    const sent = [VARIANT_STILL, ...userImages(4)];
    expect(variantTemplateImageInSentPayload(sent)).toBe(false);

    const sources = buildSourceReceipt({
      variantTemplateInspiration: INSPIRATION,
      pruning: { keptBlockKeys: ["scaffold_variant_this_generation"] },
      variantTemplateImageSent: variantTemplateImageInSentPayload(sent),
    });

    expect(sources[0]?.reachedPrompt).toBe(false);
  });

  it("keeps reachedPrompt true from the text block even when four user images crowd out the still", () => {
    const sent = [VARIANT_STILL, ...userImages(4)];
    const sources = buildSourceReceipt({
      variantTemplateInspiration: INSPIRATION,
      pruning: { keptBlockKeys: ["variant_template_inspiration"] },
      variantTemplateImageSent: variantTemplateImageInSentPayload(sent),
    });

    expect(variantTemplateImageInSentPayload(sent)).toBe(false);
    expect(sources[0]?.reachedPrompt).toBe(true);
  });

  it("marks reachedPrompt true when one user image leaves room for the variant still", () => {
    const sent = [VARIANT_STILL, ...userImages(1)];
    expect(variantTemplateImageInSentPayload(sent)).toBe(true);

    const sources = buildSourceReceipt({
      variantTemplateInspiration: INSPIRATION,
      pruning: { keptBlockKeys: ["scaffold_variant_this_generation"] },
      variantTemplateImageSent: variantTemplateImageInSentPayload(sent),
    });

    expect(sources[0]?.reachedPrompt).toBe(true);
  });
});
