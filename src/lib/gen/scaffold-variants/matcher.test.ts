import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  buildKeywordWordPattern,
  lockedVariantForFollowUp,
  pickScaffoldVariant,
  pickScaffoldVariantAsync,
} from "./matcher";
import { getVariantsForScaffold } from "./registry";
import * as embeddingsStorage from "@/lib/gen/embeddings/embeddings-storage";

describe("pickScaffoldVariant", () => {
  it("picks corporate-grid when the prompt carries strong b2b/consulting keywords", () => {
    const variant = pickScaffoldVariant({
      prompt:
        "Build a professional b2b consulting corporate landing page for an enterprise agency",
      scaffoldId: "landing-page",
      generationMode: "init",
      sessionSeed: "seed-1",
    });

    expect(variant?.id).toBe("corporate-grid");
  });

  it("matches scaffold-specific editorial blog signals", () => {
    const variant = pickScaffoldVariant({
      prompt: "Create a longform editorial blog for essays and magazine-style reading",
      scaffoldId: "blog",
      styleKeywords: ["editorial", "reading"],
      toneKeywords: ["thoughtful"],
      generationMode: "init",
      sessionSeed: "seed-2",
    });

    expect(variant?.id).toBe("editorial-serif");
  });

  it("applies the dark color-mode boost from structured style keywords (Byggval)", () => {
    // Byggval skickar "dark mode" via styleKeywordsHint i stället för
    // prompt-text — boosten måste läsa styleKeywords, inte bara prompten.
    const neutralPrompt = "Bygg en sajt för min verksamhet";
    const withDarkHint = pickScaffoldVariant({
      prompt: neutralPrompt,
      scaffoldId: "ecommerce",
      styleKeywords: ["bold", "dark mode"],
      generationMode: "init",
      sessionSeed: "seed-color-1",
    });
    // streetwear-bold är enda dark-varianten under ecommerce; "bold" (3p)
    // + dark-boost (2p) ska vinna deterministiskt över ljusa kandidater.
    expect(withDarkHint?.id).toBe("streetwear-bold");
  });

  it("väljer nature-flow för svensk skogsprompt via böjda keywords", () => {
    // Regressionsfall från prod 2026-07-31: "springa i skogen på Vindö" gav
    // 0 keyword-träffar (skogen ≠ forest) och landade i corporate-grid via
    // den gamla alfabetiska tie-breaken. Med "skog" som keyword + suffix-
    // tolerans ska nature-flow vinna deterministiskt (enda positiva poängen).
    const variant = pickScaffoldVariant({
      prompt: "En hemsida om att springa i skogen på Vindö",
      scaffoldId: "landing-page",
      generationMode: "init",
      sessionSeed: "seed-skog",
    });
    expect(variant?.id).toBe("nature-flow");
  });

  it("does not escape the selected scaffold's variant pool", () => {
    const variant = pickScaffoldVariant({
      prompt: "Create a dark terminal-style developer product landing page",
      scaffoldId: "app-shell",
      styleKeywords: ["terminal", "developer"],
      toneKeywords: ["technical"],
      generationMode: "init",
      sessionSeed: "seed-3",
    });

    expect(variant?.scaffoldId).toBe("app-shell");
    expect(variant?.id).toBe("immersive-dark");
  });
});

describe("buildKeywordWordPattern — svensk böjningstolerans", () => {
  it("träffar bestämd form och plural för keywords ≥ 4 tecken", () => {
    expect(buildKeywordWordPattern("natur").test("en sida om naturen")).toBe(true);
    expect(buildKeywordWordPattern("skog").test("springa i skogen")).toBe(true);
    expect(buildKeywordWordPattern("skog").test("skogarna på vindö")).toBe(true);
    expect(buildKeywordWordPattern("kafé").test("kaféet i göteborg")).toBe(true);
    expect(buildKeywordWordPattern("salong").test("salongen bokar online")).toBe(true);
  });

  it("håller korta keywords exakta och cappar suffixet till 4 bokstäver", () => {
    expect(buildKeywordWordPattern("eco").test("ecosystem tooling")).toBe(false);
    expect(buildKeywordWordPattern("law").test("mow the lawn")).toBe(false);
    expect(buildKeywordWordPattern("product").test("productivity suite")).toBe(false);
    expect(buildKeywordWordPattern("green").test("greenhouse gases")).toBe(false);
  });

  it("kräver att keywordet inleder ordet (sammansättningar täcks inte)", () => {
    expect(buildKeywordWordPattern("tidning").test("en kulturtidning")).toBe(false);
    expect(buildKeywordWordPattern("tidning").test("en tidning om kultur")).toBe(true);
  });

  it("fras-keywords matchas ordagrant utan suffixtolerans", () => {
    expect(buildKeywordWordPattern("dark theme").test("with dark theme enabled")).toBe(true);
    expect(buildKeywordWordPattern("dark theme").test("a dark themed site")).toBe(false);
    expect(buildKeywordWordPattern("white-space").test("generous white-space")).toBe(true);
    expect(buildKeywordWordPattern("white-space").test("white-spaced layout")).toBe(false);
  });
});

describe("pickScaffoldVariant — tie-break vid nollpoäng", () => {
  // Avsiktligt nonsens: prompten får inte träffa något variant-keyword och
  // inga färglägesord (dark/light-boosten). Testet gäller nollpoängsvägen.
  const zeroHitPrompt = "Xyzzy plugh snarfblatt kwyjibo";

  it("roterar över hela variantfältet, inte bara de fyra första alfabetiskt", () => {
    const allIds = getVariantsForScaffold("landing-page").map((variant) => variant.id);
    const picked = new Set<string>();
    for (let i = 0; i < 12 * allIds.length; i += 1) {
      const variant = pickScaffoldVariant({
        prompt: zeroHitPrompt,
        scaffoldId: "landing-page",
        generationMode: "init",
        sessionSeed: `seed-${i}`,
      });
      if (variant) picked.add(variant.id);
    }
    // Före fixen var poolen exakt de 4 första i bokstavsordning
    // (asymmetric-stack, bold-startup, corporate-grid, editorial-lux).
    expect(picked.size).toBeGreaterThan(4);
    for (const id of picked) {
      expect(allIds).toContain(id);
    }
  });

  it("är deterministisk för samma prompt + seed", () => {
    const first = pickScaffoldVariant({
      prompt: zeroHitPrompt,
      scaffoldId: "landing-page",
      generationMode: "init",
      sessionSeed: "stable-seed",
    });
    const second = pickScaffoldVariant({
      prompt: zeroHitPrompt,
      scaffoldId: "landing-page",
      generationMode: "init",
      sessionSeed: "stable-seed",
    });
    expect(first?.id).toBe(second?.id);
  });

  it("keeps a previously report-blocked variant in the sync candidate pool", () => {
    const picked = pickScaffoldVariant({
      prompt:
        "Asymmetric stack with vertical scroll-rhythm, typography-led off-grid handmade sections",
      scaffoldId: "landing-page",
      generationMode: "init",
      sessionSeed: "runtime-policy-sync",
    });

    expect(picked?.id).toBe("asymmetric-stack");
  });
});

describe("variant candidate authority", () => {
  it("forbids local eval-report dependencies in the runtime matcher", () => {
    const matcherSource = readFileSync(
      resolve(process.cwd(), "src/lib/gen/scaffold-variants/matcher.ts"),
      "utf-8",
    );

    expect(matcherSource).not.toMatch(
      /eval-blocklist|getBlockedVariantIds|scaffold-eval[\\/]reports|candidatesForRemoval/,
    );
  });

  it("keeps the full committed pool in the async embedding path", async () => {
    const variants = getVariantsForScaffold("landing-page");
    const targetId = "asymmetric-stack";
    const loadSpy = vi.spyOn(embeddingsStorage, "loadEmbeddingsArtifact").mockResolvedValue({
      _meta: {
        model: "test-embedding-model",
        dimensions: 2,
        generated: "2026-08-11T00:00:00.000Z",
        count: variants.length,
      },
      embeddings: variants.map((variant) => ({
        id: variant.id,
        scaffoldId: variant.scaffoldId,
        embedding: variant.id === targetId ? [1, 0] : [0, 1],
      })),
    });

    try {
      const picked = await pickScaffoldVariantAsync({
        // Keyword fallback would pick corporate-grid, so this assertion also
        // proves that queryVector + the embedding candidate path were used.
        prompt: "Professional B2B consulting and enterprise services",
        scaffoldId: "landing-page",
        generationMode: "init",
        sessionSeed: "runtime-policy-async",
        queryVector: [1, 0],
      });

      expect(picked?.id).toBe(targetId);
      expect(loadSpy).toHaveBeenCalledWith("variant");
    } finally {
      loadSpy.mockRestore();
    }
  });
});

describe("pickScaffoldVariant — keyword dominance margin", () => {
  // corporate-grid träffar många b2b/consulting-keywords (hög score); bold-startup
  // får också positiva träffar (startup/launch/growth/momentum) och landar i
  // top-4. Utan dominance-margin roterar seed-hash bort den klara vinnaren —
  // t.ex. sessionSeed "probe-0" ger bold-startup idag trots lägre score.
  const dominantPrompt =
    "Build a professional b2b consulting corporate enterprise agency landing page with startup launch growth momentum";

  it("picks the dominant keyword winner instead of seed-hash rotating it away", () => {
    // sessionSeed "probe-0" hash-roterar till bold-startup idag trots att
    // corporate-grid leder klart i keyword-score — dominance-margin ska
    // låsa vinnaren oavsett seed.
    const rotatedAwayToday = pickScaffoldVariant({
      prompt: dominantPrompt,
      scaffoldId: "landing-page",
      generationMode: "init",
      sessionSeed: "probe-0",
    });
    expect(rotatedAwayToday?.id).toBe("corporate-grid");

    for (let i = 0; i < 40; i += 1) {
      const variant = pickScaffoldVariant({
        prompt: dominantPrompt,
        scaffoldId: "landing-page",
        generationMode: "init",
        sessionSeed: `probe-${i}`,
      });
      expect(variant?.id).toBe("corporate-grid");
    }
  });

  it("still seed-hash rotates when the keyword score field is even", () => {
    // editorial + magazine → samma keyword-score för warm-editorial och
    // minimalist-mag (jämnt fält). Rotationen ska leva kvar.
    const evenPrompt = "Create an editorial magazine reading site";
    const first = pickScaffoldVariant({
      prompt: evenPrompt,
      scaffoldId: "landing-page",
      generationMode: "init",
      sessionSeed: "even-stable",
    });
    const second = pickScaffoldVariant({
      prompt: evenPrompt,
      scaffoldId: "landing-page",
      generationMode: "init",
      sessionSeed: "even-stable",
    });
    expect(first?.id).toBe(second?.id);

    const picked = new Set<string>();
    for (let i = 0; i < 60; i += 1) {
      const variant = pickScaffoldVariant({
        prompt: evenPrompt,
        scaffoldId: "landing-page",
        generationMode: "init",
        sessionSeed: `even-${i}`,
      });
      if (variant) picked.add(variant.id);
    }
    expect(picked.size).toBeGreaterThanOrEqual(2);
  });
});

describe("lockedVariantForFollowUp (P22)", () => {
  // Använd en faktisk variant från registry så testet inte beror på en mock.
  const landingVariants = getVariantsForScaffold("landing-page");
  const priorVariantId = landingVariants[0]?.id;

  it("locks to the prior variant on two clear-refine follow-ups in a row", () => {
    if (!priorVariantId) throw new Error("No landing-page variants registered");
    const first = lockedVariantForFollowUp({
      chatId: "chat-x",
      intent: "clear-refine",
      scaffoldId: "landing-page",
      priorVariantId,
    });
    const second = lockedVariantForFollowUp({
      chatId: "chat-x",
      intent: "clear-refine",
      scaffoldId: "landing-page",
      priorVariantId,
    });
    expect(first?.id).toBe(priorVariantId);
    expect(second?.id).toBe(priorVariantId);
    expect(first?.id).toBe(second?.id);
  });

  it("returns null on clear-redesign so the matcher can pick a new variant", () => {
    if (!priorVariantId) throw new Error("No landing-page variants registered");
    const result = lockedVariantForFollowUp({
      chatId: "chat-x",
      intent: "clear-redesign",
      scaffoldId: "landing-page",
      priorVariantId,
    });
    expect(result).toBeNull();
  });

  it("plan-11 bug 2: falls back to the scaffold default variant when prior variant id is missing on a follow-up", () => {
    // Plan 11 / open-question #8 regression: previously this returned
    // `null`, releasing the matcher into a fresh keyword/embedding pick
    // and causing `corporate-grid → warm-local` flips mid-chat. Now we
    // anchor to the scaffold's default so the look stays stable across
    // turns even when the prior variant id is lost from the snapshot.
    const result = lockedVariantForFollowUp({
      chatId: "chat-x",
      intent: "clear-refine",
      scaffoldId: "landing-page",
      priorVariantId: null,
    });
    expect(result).not.toBeNull();
    expect(result?.scaffoldId).toBe("landing-page");
    // Determinism: a second call with identical inputs returns the same variant.
    const second = lockedVariantForFollowUp({
      chatId: "chat-x",
      intent: "clear-refine",
      scaffoldId: "landing-page",
      priorVariantId: null,
    });
    expect(second?.id).toBe(result?.id);
  });

  it("plan-11 bug 2: still returns null on clear-redesign even when prior variant id is missing", () => {
    // Redesign intent must keep its escape hatch — fallback only fires
    // for stable-style intents (clear-refine / capability-add / neutral).
    const result = lockedVariantForFollowUp({
      chatId: "chat-x",
      intent: "clear-redesign",
      scaffoldId: "landing-page",
      priorVariantId: null,
    });
    expect(result).toBeNull();
  });

  it("returns null when prior variant id no longer resolves in the registry", () => {
    const result = lockedVariantForFollowUp({
      chatId: "chat-x",
      intent: "clear-refine",
      scaffoldId: "landing-page",
      priorVariantId: "this-variant-does-not-exist",
    });
    expect(result).toBeNull();
  });

  it("releases the lock when the scaffold was unlocked for rematch, even on neutral intent", () => {
    // "gör om hela sajten" unlocks the scaffold via the supplement patterns in
    // follow-up-clarification.ts while the intent classifier still says
    // `neutral`. Keeping the variant locked there gave the user a rematched
    // scaffold rendered in the exact style they asked to replace.
    if (!priorVariantId) throw new Error("No landing-page variants registered");
    const result = lockedVariantForFollowUp({
      chatId: "chat-x",
      intent: "neutral",
      scaffoldId: "landing-page",
      priorVariantId,
      scaffoldUnlocked: true,
    });
    expect(result).toBeNull();
  });

  it("keeps the lock when the scaffold is NOT unlocked (default)", () => {
    if (!priorVariantId) throw new Error("No landing-page variants registered");
    const result = lockedVariantForFollowUp({
      chatId: "chat-x",
      intent: "neutral",
      scaffoldId: "landing-page",
      priorVariantId,
      scaffoldUnlocked: false,
    });
    expect(result?.id).toBe(priorVariantId);
  });
});
