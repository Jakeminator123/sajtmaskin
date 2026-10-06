import { afterEach, describe, expect, it, vi } from "vitest";
import { getScaffoldIds } from "../scaffolds/registry";
import { getVariantsForScaffold } from "./registry";
import { pickScaffoldVariantWithReceipt, pickScaffoldVariantAsyncWithReceipt } from "./matcher";
import * as embeddingsStorage from "../embeddings/embeddings-storage";

const variants = getScaffoldIds().flatMap(getVariantsForScaffold);
const opponent = "professional b2b consulting corporate enterprise agency business services";
const multilineNegative = [
  "Do not use\nvariant hero-fullbleed-bg.",
  "Använd inte\nvariant hero-fullbleed-bg.",
  "Vi diskuterar:\nVariant: hero-fullbleed-bg.",
  "Välj aldrig\nstilvariant hero-fullbleed-bg.",
  "Don't use\nvariant hero-fullbleed-bg.",
  "Avoid\nvariant hero-fullbleed-bg.",
  "Utan\nvariant hero-fullbleed-bg.",
  "We are discussing:\nVariant: hero-fullbleed-bg.",
];
const punctuationNegative = [
  "Använd inte t.ex. variant hero-fullbleed-bg.",
  "Använd inte t.ex. Variant: hero-fullbleed-bg.",
  "Do not use e.g. variant hero-fullbleed-bg.",
  "Do not use... variant hero-fullbleed-bg.",
  "Do not use... Variant: hero-fullbleed-bg.",
  "Vi diskuterar alternativen:\n1. Variant: hero-fullbleed-bg.",
  "Använd inte t.ex.\nVariant: hero-fullbleed-bg.",
  "Do not use...\nVariant: hero-fullbleed-bg.",
  "Vi diskuterar alternativen:\n1.\nVariant: hero-fullbleed-bg.",
  "Do not use etc. Variant: hero-fullbleed-bg.",
  "Do not use the following;\nVariant: hero-fullbleed-bg.",
  "Vi diskuterar följande;\nVariant: hero-fullbleed-bg.",
];
afterEach(() => vi.restoreAllMocks());

describe("explicit positive variant directives — actual registry identities", () => {
  it.each(punctuationNegative)("sync preserves punctuation context and keyword fallback: %s", (rawPrompt) => {
    const input = { prompt: opponent, scaffoldId: "landing-page" as const };
    const fallback = pickScaffoldVariantWithReceipt({ ...input, rawPrompt: "" });
    expect(fallback.selection.source).toBe("keyword");
    expect(pickScaffoldVariantWithReceipt({ ...input, rawPrompt })).toEqual(fallback);
  });

  it.each(punctuationNegative)("async preserves punctuation context and embedding fallback: %s", async (rawPrompt) => {
    const landingVariants = getVariantsForScaffold("landing-page");
    const load = vi.spyOn(embeddingsStorage, "loadEmbeddingsArtifact").mockResolvedValue({
      _meta: { model: "test", dimensions: 2, generated: "2026-10-05", count: landingVariants.length },
      embeddings: landingVariants.map((variant) => ({
        id: variant.id,
        scaffoldId: variant.scaffoldId,
        embedding: variant.id === "corporate-grid" ? [1, 0] : [0, 1],
      })),
    });
    const result = await pickScaffoldVariantAsyncWithReceipt({
      prompt: opponent, rawPrompt, scaffoldId: "landing-page", queryVector: [1, 0],
    });
    expect(result.selection).toMatchObject({ source: "embedding", finalId: "corporate-grid" });
    expect(load).toHaveBeenCalled();
  });

  it.each(multilineNegative)("sync preserves negative/descriptive multiline context: %s", (rawPrompt) => {
    expect(pickScaffoldVariantWithReceipt({
      prompt: opponent, rawPrompt, scaffoldId: "landing-page",
    }).selection.source).not.toBe("explicit");
  });

  it.each(multilineNegative)("async preserves negative/descriptive multiline context: %s", async (rawPrompt) => {
    vi.spyOn(embeddingsStorage, "loadEmbeddingsArtifact").mockResolvedValue(null);
    expect((await pickScaffoldVariantAsyncWithReceipt({
      prompt: opponent, rawPrompt, scaffoldId: "landing-page", queryVector: [1, 0],
    })).selection.source).not.toBe("explicit");
  });

  it.each([
    "Use\nvariant hero-fullbleed-bg.",
    "Välj\nstilvariant hero-fullbleed-bg.",
    "Bygg en sida.\nVariant: hero-fullbleed-bg.",
    "Build a website.\r\nStyle variant: Full-bleed Hero.",
    "Build a website!\nVariant: hero-fullbleed-bg.",
  ])("sync/async keep unambiguous positive multiline commands: %s", async (rawPrompt) => {
    const input = { prompt: opponent, rawPrompt, scaffoldId: "landing-page" as const };
    const load = vi.spyOn(embeddingsStorage, "loadEmbeddingsArtifact").mockResolvedValue(null);
    expect(pickScaffoldVariantWithReceipt(input).selection)
      .toMatchObject({ source: "explicit", finalId: "hero-fullbleed-bg" });
    expect((await pickScaffoldVariantAsyncWithReceipt(input)).selection)
      .toMatchObject({ source: "explicit", finalId: "hero-fullbleed-bg" });
    expect(load).not.toHaveBeenCalled();
  });
  it("covers the complete current pool without silently dropping identities", () => {
    expect(variants).toHaveLength(41);
    expect(new Set(variants.map((variant) => `${variant.scaffoldId}/${variant.id}`)).size).toBe(41);
  });

  it.each(
    variants.flatMap((variant) => [
      { variant, cue: "Använd variant", value: variant.id },
      { variant, cue: "Välj stilvariant", value: variant.label },
      { variant, cue: "Use variant", value: variant.id },
      { variant, cue: "Choose style variant", value: variant.label },
    ]),
  )("$cue $value for $variant.scaffoldId is authoritative", ({ variant, cue, value }) => {
    const result = pickScaffoldVariantWithReceipt({
      prompt: `${opponent}.\n${cue} "${value}".`,
      scaffoldId: variant.scaffoldId,
      styleKeywords: ["corporate", "enterprise"],
      sessionSeed: "explicit-registry",
    });
    expect(result.variant?.id).toBe(variant.id);
    expect(result.selection).toEqual({
      source: "explicit",
      score: null,
      runnerUpScore: null,
      margin: null,
      hintId: null,
      finalId: variant.id,
      changedFromHint: false,
    });
  });

  it.each([
    "Variant: HERO-FULLBLEED-BG.",
    "Stilvariant = Full-bleed Hero.",
    "Använd varianten `hero-fullbleed-bg`.",
    "Välj stilvarianten ‘Full-bleed Hero’.",
    "Please use the variant hero-fullbleed-bg.",
    "Vänligen välj variant hero-fullbleed-bg!",
  ])("accepts an exact positive directive: %s", (prompt) => {
    expect(
      pickScaffoldVariantWithReceipt({ prompt, scaffoldId: "landing-page" }).selection,
    ).toMatchObject({ source: "explicit", finalId: "hero-fullbleed-bg" });
  });

  it.each(
    variants.flatMap((variant) => [
      { variant, cue: "Använd variant", value: variant.id },
      { variant, cue: "Välj stilvariant", value: variant.label },
      { variant, cue: "Use variant", value: variant.id },
      { variant, cue: "Choose style variant", value: variant.label },
    ]),
  )(
    "async raw $cue $value beats wrapped commands for $variant.scaffoldId",
    async ({ variant, cue, value }) => {
      const load = vi.spyOn(embeddingsStorage, "loadEmbeddingsArtifact").mockResolvedValue(null);
      const result = await pickScaffoldVariantAsyncWithReceipt({
        prompt: `${opponent}.\nUse variant corporate-grid.`,
        rawPrompt: `${cue} "${value}".`,
        scaffoldId: variant.scaffoldId,
        queryVector: [1, 0],
        sessionSeed: "explicit-raw-registry",
      });
      expect(result.variant?.id).toBe(variant.id);
      expect(result.selection).toEqual({
        source: "explicit",
        score: null,
        runnerUpScore: null,
        margin: null,
        hintId: null,
        finalId: variant.id,
        changedFromHint: false,
      });
      expect(load).not.toHaveBeenCalled();
    },
  );

  it.each([
    "Använd inte variant hero-fullbleed-bg.",
    "Välj aldrig stilvariant hero-fullbleed-bg.",
    "Do not use variant hero-fullbleed-bg.",
    "Don't use variant hero-fullbleed-bg.",
    "Avoid variant hero-fullbleed-bg.",
    "Utan variant hero-fullbleed-bg.",
    "Finns variant hero-fullbleed-bg?",
    "What is variant hero-fullbleed-bg?",
    "Vi diskuterar variant hero-fullbleed-bg.",
    "Variant hero-fullbleed-bg?",
    "Använd variant hero-fullbleed-bg eller corporate-grid.",
    "Use variant hero-fullbleed-bg or corporate-grid.",
    "Use variant hero-fullbleed-bg. Use variant corporate-grid.",
    "Use variant hero-fullbleed-bg. Use variant hero-fullbleed-bg.",
    "Use variant unknown-id.",
    "Use variant unknown-id or hero-fullbleed-bg.",
    "Use variant hero-fullbleed-bg-extra.",
    "Use variant Full-bleed Heroic.",
    "Use variant compact-app.",
    "```text\nVariant: hero-fullbleed-bg\n```",
    "> Use variant hero-fullbleed-bg.",
  ])("does not turn negative/descriptive/ambiguous text into an explicit pin: %s", (directive) => {
    const result = pickScaffoldVariantWithReceipt({
      prompt: `${opponent}.\n${directive}`,
      scaffoldId: "landing-page",
      sessionSeed: "negative-directive",
    });
    expect(result.selection.source).not.toBe("explicit");
    expect(result.variant?.scaffoldId).toBe("landing-page");
  });

  it("does not infer directives from wrapped prompt when a raw source is supplied", () => {
    const input = {
      prompt: `${opponent}.\nUse variant corporate-grid.`,
      rawPrompt: "Välj variant hero-fullbleed-bg.",
      scaffoldId: "landing-page" as const,
    };
    expect(pickScaffoldVariantWithReceipt(input).selection).toMatchObject({
      source: "explicit",
      finalId: "hero-fullbleed-bg",
    });
    const noRawDirective = { ...input, rawPrompt: "Bygg en vanlig företagshemsida." };
    expect(pickScaffoldVariantWithReceipt(noRawDirective).selection.source).not.toBe("explicit");
    expect(pickScaffoldVariantWithReceipt({ ...input, rawPrompt: "" }).selection.source).not.toBe(
      "explicit",
    );
  });

  it.each(["hero-fullbleed-bg", "Full-bleed Hero"])(
    "beats a conflicting async embedding before any artifact/provider work: %s",
    async (identity) => {
      const landingVariants = getVariantsForScaffold("landing-page");
      const load = vi.spyOn(embeddingsStorage, "loadEmbeddingsArtifact").mockResolvedValue({
        _meta: {
          model: "test",
          dimensions: 2,
          generated: "2026-10-05",
          count: landingVariants.length,
        },
        embeddings: landingVariants.map((variant) => ({
          id: variant.id,
          scaffoldId: variant.scaffoldId,
          embedding: variant.id === "corporate-grid" ? [1, 0] : [0, 1],
        })),
      });
      const result = await pickScaffoldVariantAsyncWithReceipt({
        prompt: `${opponent}.\nUse variant "${identity}".`,
        scaffoldId: "landing-page",
        queryVector: [1, 0],
      });
      expect(result.selection).toMatchObject({
        source: "explicit",
        finalId: "hero-fullbleed-bg",
        score: null,
        margin: null,
      });
      expect(load).not.toHaveBeenCalled();
    },
  );

  it("invalid directives preserve the existing async embedding fallback", async () => {
    const landingVariants = getVariantsForScaffold("landing-page");
    vi.spyOn(embeddingsStorage, "loadEmbeddingsArtifact").mockResolvedValue({
      _meta: {
        model: "test",
        dimensions: 2,
        generated: "2026-10-05",
        count: landingVariants.length,
      },
      embeddings: landingVariants.map((variant) => ({
        id: variant.id,
        scaffoldId: variant.scaffoldId,
        embedding: variant.id === "corporate-grid" ? [1, 0] : [0, 1],
      })),
    });
    const result = await pickScaffoldVariantAsyncWithReceipt({
      prompt: "Don't use variant hero-fullbleed-bg.",
      scaffoldId: "landing-page",
      queryVector: [1, 0],
    });
    expect(result.selection).toMatchObject({ source: "embedding", finalId: "corporate-grid" });
  });

  it.each([null, "projekt-bas-app"] as const)(
    "a foreign directive cannot reactivate/switch scaffold %s",
    (scaffoldId) => {
      const result = pickScaffoldVariantWithReceipt({
        prompt: "Use variant hero-fullbleed-bg.",
        scaffoldId,
      });
      expect(result.selection.source).not.toBe("explicit");
      expect(result.variant?.scaffoldId ?? null).toBe(scaffoldId);
    },
  );
});
