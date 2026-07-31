import { describe, expect, it } from "vitest";

import {
  DEFAULT_INIT_BUILD_CHOICES,
  SITE_TYPE_SCAFFOLD_IDS,
  buildInitBuildChoicesMeta,
  composeInitBuildChoicesText,
  type InitBuildChoices,
} from "./init-build-choices";
import { getScaffoldById } from "@/lib/gen/scaffolds/registry";
import { upsertKeyedPromptBlock } from "./prompt-prefill-event";
import { detectExplicitPageCount } from "@/lib/gen/route-plan";
import {
  BLOG_KEYWORDS,
  DASHBOARD_KEYWORDS,
  ECOMMERCE_KEYWORDS,
  LANDING_KEYWORDS,
  PORTFOLIO_KEYWORDS,
} from "@/lib/gen/scaffolds/keyword-banks";

/** Mirrors `countKeywordMatches` in src/lib/gen/scaffolds/matcher.ts. */
function countBankHits(text: string, keywords: readonly string[]): number {
  const lower = text.toLowerCase();
  return keywords.reduce((count, keyword) => {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, "iu");
    return count + (pattern.test(lower) ? 1 : 0);
  }, 0);
}

/** matchScaffold requires MIN_SCORE = 2 to pick a specific scaffold. */
const SCAFFOLD_MIN_SCORE = 2;

function withChoices(partial: Partial<InitBuildChoices>): InitBuildChoices {
  return { ...DEFAULT_INIT_BUILD_CHOICES, ...partial };
}

describe("composeInitBuildChoicesText", () => {
  it("returns empty string when everything is auto", () => {
    expect(composeInitBuildChoicesText(DEFAULT_INIT_BUILD_CHOICES)).toBe("");
  });

  it("produces a page-count phrase that detectExplicitPageCount parses", () => {
    for (const pageCount of [1, 3, 6]) {
      const text = composeInitBuildChoicesText(withChoices({ pageCount }));
      expect(detectExplicitPageCount(text)).toBe(pageCount);
    }
  });

  it("uses singular 'sida' for one page", () => {
    expect(composeInitBuildChoicesText(withChoices({ pageCount: 1 }))).toContain("1 sida.");
  });

  it("gives every site-type choice enough bank hits to clear MIN_SCORE", () => {
    // A single keyword hit is below matchScaffold's MIN_SCORE and would make
    // the control a no-op on sparse prompts.
    const cases: Array<[InitBuildChoices["siteType"], readonly string[]]> = [
      ["landing", LANDING_KEYWORDS],
      ["portfolio", PORTFOLIO_KEYWORDS],
      ["blog", BLOG_KEYWORDS],
      ["shop", ECOMMERCE_KEYWORDS],
      ["dashboard", DASHBOARD_KEYWORDS],
    ];
    for (const [siteType, bank] of cases) {
      const text = composeInitBuildChoicesText(withChoices({ siteType }));
      expect(countBankHits(text, bank), `siteType=${siteType}`).toBeGreaterThanOrEqual(
        SCAFFOLD_MIN_SCORE,
      );
    }
  });

  it("keeps the editorial style below the blog-scaffold threshold", () => {
    // "editorial" alone is also a blog-scaffold token; a second one (e.g.
    // "magasin") would reach MIN_SCORE and flip scaffold selection to blog
    // when the user picked only a style.
    const text = composeInitBuildChoicesText(withChoices({ style: "editorial" }));
    expect(countBankHits(text, BLOG_KEYWORDS)).toBeLessThan(SCAFFOLD_MIN_SCORE);
  });

  it("includes variant keyword tokens with word boundaries for styles", () => {
    // pickScaffoldVariant matches keywords with word boundaries, so the
    // exact tokens must appear as standalone words.
    const cases: Array<[InitBuildChoices["style"], RegExp]> = [
      ["warm", /(?:^|[^\p{L}\p{N}])lokal(?:[^\p{L}\p{N}]|$)/iu],
      ["corporate", /(?:^|[^\p{L}\p{N}])corporate(?:[^\p{L}\p{N}]|$)/iu],
      ["bold", /(?:^|[^\p{L}\p{N}])bold(?:[^\p{L}\p{N}]|$)/iu],
      ["editorial", /(?:^|[^\p{L}\p{N}])editorial(?:[^\p{L}\p{N}]|$)/iu],
      ["minimal", /(?:^|[^\p{L}\p{N}])minimal(?:[^\p{L}\p{N}]|$)/iu],
    ];
    for (const [style, pattern] of cases) {
      expect(composeInitBuildChoicesText(withChoices({ style }))).toMatch(pattern);
    }
  });

  it("includes the dark/light tokens the variant matcher boosts on", () => {
    // The matcher boost regex is word-boundary based ("mörkt" does NOT match
    // \bmörk\b), so the fragments must carry the base form and/or the
    // English token.
    const dark = composeInitBuildChoicesText(withChoices({ colorMode: "dark" }));
    expect(dark).toMatch(/\bmörk\b/i);
    expect(dark).toMatch(/\bdark\b/i);
    const light = composeInitBuildChoicesText(withChoices({ colorMode: "light" }));
    expect(light).toMatch(/\bljus\b/i);
    expect(light).toMatch(/\blight\b/i);
  });

  it("does not leak light-boost tokens from the minimal style", () => {
    // "ren"/"clean"/"light"/"ljus"/"airy" boost light variants in
    // pickScaffoldVariant — the style fragment must stay color-neutral.
    const text = composeInitBuildChoicesText(withChoices({ style: "minimal" }));
    expect(text).not.toMatch(/\b(?:ren|clean|light|ljus|airy)\b/i);
  });
});

describe("buildInitBuildChoicesMeta (nivå 2 — strukturerade signaler)", () => {
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

  it("clamps the page-count hint to the slider range", () => {
    expect(buildInitBuildChoicesMeta(withChoices({ pageCount: 3 })).pageCountHint).toBe(3);
    expect(buildInitBuildChoicesMeta(withChoices({ pageCount: 99 })).pageCountHint).toBe(6);
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
});

describe("upsertKeyedPromptBlock", () => {
  it("appends to existing user text as a new paragraph", () => {
    expect(upsertKeyedPromptBlock("Min frisörsalong.", undefined, "Sajten ska ha 3 sidor.")).toBe(
      "Min frisörsalong.\n\nSajten ska ha 3 sidor.",
    );
  });

  it("replaces the previous block instead of stacking duplicates", () => {
    const first = upsertKeyedPromptBlock("Min salong.", undefined, "Sajten ska ha 2 sidor.");
    const second = upsertKeyedPromptBlock(first, "Sajten ska ha 2 sidor.", "Sajten ska ha 4 sidor.");
    expect(second).toBe("Min salong.\n\nSajten ska ha 4 sidor.");
  });

  it("removes the block when next text is empty", () => {
    const withBlock = upsertKeyedPromptBlock("Min salong.", undefined, "Stil: minimal och ren design.");
    expect(upsertKeyedPromptBlock(withBlock, "Stil: minimal och ren design.", "")).toBe(
      "Min salong.",
    );
  });

  it("leaves a hand-edited previous block alone and appends", () => {
    const edited = "Min salong.\n\nSajten ska ha 2 sidor och en karta.";
    expect(upsertKeyedPromptBlock(edited, "Sajten ska ha 2 sidor.", "Sajten ska ha 3 sidor.")).toBe(
      `${edited}\n\nSajten ska ha 3 sidor.`,
    );
  });

  it("works when the input is empty", () => {
    expect(upsertKeyedPromptBlock("", undefined, "Sajten är en blogg.")).toBe("Sajten är en blogg.");
    expect(upsertKeyedPromptBlock("", undefined, "")).toBe("");
  });
});
