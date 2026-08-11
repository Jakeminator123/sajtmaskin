import { describe, expect, it } from "vitest";

import {
  DEFAULT_INIT_BUILD_CHOICES,
  MAX_PAGE_COUNT_CHOICE,
  SITE_TYPE_SCAFFOLD_IDS,
  buildInitBuildChoicesInstructions,
  buildInitBuildChoicesMeta,
  getCurrentInitBuildChoices,
  isSiteTypeAllowedForTarget,
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

  it("maps complexity to complexityHint", () => {
    expect(buildInitBuildChoicesMeta(withChoices({ complexity: "simple" }))).toEqual({
      complexityHint: "simple",
    });
  });

  // Ägarbeslut 2026-08-11: ton var tidigare BARA en svensk mening i
  // custom-instructions, vilket betydde att den aldrig nådde variant-scorern —
  // den läser `toneKeywords`, och inget fyllde dem utan en Deep Brief.
  it("sends tone as structured keywords on top of the Swedish directive", () => {
    const meta = buildInitBuildChoicesMeta(withChoices({ tone: "playful" }));
    expect(meta.toneKeywordsHint).toBeDefined();
    expect(meta.toneKeywordsHint!.length).toBeGreaterThan(0);
    expect(meta.toneKeywordsHint!.length).toBeLessThanOrEqual(8);
    for (const keyword of meta.toneKeywordsHint!) {
      expect(keyword.length).toBeLessThanOrEqual(40);
      expect(keyword.trim()).toBe(keyword);
    }
    // Direktivet finns kvar — ton styr copy, inte bara variantmatchning.
    expect(buildInitBuildChoicesInstructions(withChoices({ tone: "playful" }))).toContain(
      "lekfull",
    );
  });

  it("sends the raw style choice so the server can pin a variant", () => {
    expect(buildInitBuildChoicesMeta(withChoices({ style: "minimal" })).styleChoiceHint).toBe(
      "minimal",
    );
    expect(buildInitBuildChoicesMeta(withChoices({ style: "auto" })).styleChoiceHint).toBeUndefined();
  });

  it("sends the color mode so the server can pick the cluster's palette", () => {
    expect(buildInitBuildChoicesMeta(withChoices({ colorMode: "dark" })).colorModeHint).toBe("dark");
    expect(buildInitBuildChoicesMeta(withChoices({ colorMode: "auto" })).colorModeHint).toBeUndefined();
  });
});

describe("Hemsida/App-valet (buildTarget)", () => {
  it("maps a non-auto target to meta.buildIntent", () => {
    expect(buildInitBuildChoicesMeta(withChoices({ buildTarget: "app" })).buildIntent).toBe("app");
    expect(buildInitBuildChoicesMeta(withChoices({ buildTarget: "website" })).buildIntent).toBe(
      "website",
    );
    expect(buildInitBuildChoicesMeta(withChoices({ buildTarget: "auto" })).buildIntent).toBeUndefined();
  });

  it("allows every site type while the target is auto", () => {
    for (const siteType of Object.keys(SITE_TYPE_SCAFFOLD_IDS)) {
      expect(
        isSiteTypeAllowedForTarget(siteType as InitBuildChoices["siteType"], "auto"),
        `siteType=${siteType}`,
      ).toBe(true);
    }
  });

  it("separates website-only from app-only site types", () => {
    expect(isSiteTypeAllowedForTarget("landing", "website")).toBe(true);
    expect(isSiteTypeAllowedForTarget("landing", "app")).toBe(false);
    expect(isSiteTypeAllowedForTarget("dashboard", "app")).toBe(true);
    expect(isSiteTypeAllowedForTarget("dashboard", "website")).toBe(false);
    expect(isSiteTypeAllowedForTarget("appshell", "website")).toBe(false);
    // auth-pages is the one scaffold both targets allow.
    expect(isSiteTypeAllowedForTarget("auth", "website")).toBe(true);
    expect(isSiteTypeAllowedForTarget("auth", "app")).toBe(true);
  });

  // Second line of defence: the UI hides the chip, but the meta builder must not
  // ship the contradiction either — that would put an app-only scaffold behind a
  // website intent, which `allowedBuildIntents` forbids.
  it("drops a site type that contradicts the chosen target", () => {
    const meta = buildInitBuildChoicesMeta(
      withChoices({ buildTarget: "app", siteType: "landing" }),
    );
    expect(meta.scaffoldId).toBeUndefined();
    expect(meta.buildIntent).toBe("app");
  });

  /**
   * The explicit flag suppresses website→app promotion AND lets `resolve-base`
   * reject an auto-matched app scaffold. Setting it without a real choice would
   * apply both to an intent the user never expressed, so the check is positive
   * (`=== "website" | "app"`) rather than `!== "auto"`.
   */
  it("never marks the intent explicit without a real target", () => {
    const partial = { ...DEFAULT_INIT_BUILD_CHOICES } as InitBuildChoices;
    delete (partial as Partial<InitBuildChoices>).buildTarget;
    const meta = buildInitBuildChoicesMeta(partial);
    expect(meta.buildIntentExplicit).toBeUndefined();
    expect(meta.buildIntent).toBeUndefined();
  });

  it("filters nothing when the target is missing rather than hiding every chip", () => {
    const missing = undefined as unknown as InitBuildChoices["buildTarget"];
    expect(isSiteTypeAllowedForTarget("landing", missing)).toBe(true);
    expect(isSiteTypeAllowedForTarget("dashboard", missing)).toBe(true);
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
