import { describe, expect, it } from "vitest";

import {
  DEFAULT_INIT_BUILD_CHOICES,
  MAX_PAGE_COUNT_CHOICE,
  SITE_TYPE_SCAFFOLD_IDS,
  buildInitBuildChoicesInstructions,
  buildInitBuildChoicesMeta,
  getCurrentInitBuildChoices,
  resetInitBuildChoices,
  setCurrentInitBuildChoices,
  type InitBuildChoices,
} from "./init-build-choices";
import { getScaffoldById } from "@/lib/gen/scaffolds/registry";

function withChoices(partial: Partial<InitBuildChoices>): InitBuildChoices {
  return { ...DEFAULT_INIT_BUILD_CHOICES, ...partial };
}

describe("buildInitBuildChoicesMeta (strukturerade signaler)", () => {
  it("returns an empty object when everything is auto", () => {
    expect(buildInitBuildChoicesMeta(DEFAULT_INIT_BUILD_CHOICES)).toEqual({});
  });

  it("maps every site-type choice to a scaffold id that resolves in the registry", () => {
    for (const [siteType, scaffoldId] of Object.entries(SITE_TYPE_SCAFFOLD_IDS)) {
      expect(getScaffoldById(scaffoldId)?.id, `siteType=${siteType}`).toBe(scaffoldId);
      const meta = buildInitBuildChoicesMeta(
        withChoices({ siteType: siteType as InitBuildChoices["siteType"] }),
      );
      expect(meta.scaffoldId).toBe(scaffoldId);
    }
  });

  it("clamps the page-count hint to the 3-page control cap", () => {
    // Ägarbeslut 2026-07-31: max 3 sidor per init-bygge (tokenbudget/kvalitet).
    expect(MAX_PAGE_COUNT_CHOICE).toBe(3);
    expect(buildInitBuildChoicesMeta(withChoices({ pageCount: 2 })).pageCountHint).toBe(2);
    expect(buildInitBuildChoicesMeta(withChoices({ pageCount: 99 })).pageCountHint).toBe(3);
    expect(buildInitBuildChoicesMeta(withChoices({ pageCount: 0 })).pageCountHint).toBeUndefined();
  });

  it("collects style and color-mode keywords within the server-side caps", () => {
    const meta = buildInitBuildChoicesMeta(
      withChoices({ style: "warm", colorMode: "dark" }),
    );
    expect(meta.styleKeywordsHint).toBeDefined();
    expect(meta.styleKeywordsHint!.length).toBeGreaterThan(0);
    // promptMetaSchema caps: max 8 entries, max 40 chars each.
    expect(meta.styleKeywordsHint!.length).toBeLessThanOrEqual(8);
    for (const keyword of meta.styleKeywordsHint!) {
      expect(keyword.length).toBeLessThanOrEqual(40);
      expect(keyword.trim()).toBe(keyword);
      expect(keyword.length).toBeGreaterThan(0);
    }
  });

  it("omits style keywords when style and color mode are auto", () => {
    expect(buildInitBuildChoicesMeta(withChoices({ pageCount: 2 })).styleKeywordsHint).toBeUndefined();
  });

  it("maps complexity to complexityHint but keeps tone out of the meta", () => {
    // Komplexitet är strukturerad (BuildSpec); ton går enbart via
    // custom-instructions-kanalen.
    expect(
      buildInitBuildChoicesMeta(withChoices({ tone: "playful", complexity: "complex" })),
    ).toEqual({ complexityHint: "complex" });
    expect(buildInitBuildChoicesMeta(withChoices({ complexity: "simple" }))).toEqual({
      complexityHint: "simple",
    });
    expect(buildInitBuildChoicesMeta(withChoices({ tone: "warm" }))).toEqual({});
  });
});

describe("buildInitBuildChoicesInstructions (custom-instructions-kanalen)", () => {
  it("returns empty string when complexity, color mode and tone are auto", () => {
    expect(buildInitBuildChoicesInstructions(DEFAULT_INIT_BUILD_CHOICES)).toBe("");
    // Val som redan har strukturerade fält ger inga direktiv.
    expect(
      buildInitBuildChoicesInstructions(
        withChoices({ siteType: "portfolio", pageCount: 3, style: "minimal" }),
      ),
    ).toBe("");
  });

  it("emits Swedish directives for complexity, color mode and tone", () => {
    const text = buildInitBuildChoicesInstructions(
      withChoices({ complexity: "simple", colorMode: "dark", tone: "professional" }),
    );
    expect(text).toContain("enkel och avskalad");
    expect(text).toContain("mörkt färgtema");
    expect(text).toContain("professionell");
  });

  it("emits a single directive when only one choice is active", () => {
    const text = buildInitBuildChoicesInstructions(withChoices({ tone: "warm" }));
    expect(text).toBe("Ton i texterna: varm och personlig.");
  });
});

describe("init build choices store (delad källa panel ↔ useCreateChat)", () => {
  it("round-trips set → get and resets to defaults", () => {
    try {
      const chosen = withChoices({ siteType: "blog", pageCount: 2, tone: "playful" });
      setCurrentInitBuildChoices(chosen);
      // Samma värde som panelen skrev är det useCreateChat läser — och det
      // en ommonterad panel initierar sin state från efter misslyckad skapning.
      expect(getCurrentInitBuildChoices()).toEqual(chosen);
      resetInitBuildChoices();
      expect(getCurrentInitBuildChoices()).toEqual(DEFAULT_INIT_BUILD_CHOICES);
    } finally {
      resetInitBuildChoices();
    }
  });
});
