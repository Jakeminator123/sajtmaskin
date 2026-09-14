import { afterEach, describe, expect, it } from "vitest";
import {
  buildPromptFromWizardData,
  generatePassword,
  hasKostnadsfriPasswordSecret,
  type MiniWizardData,
} from "./index";

afterEach(() => {
  delete process.env.KOSTNADSFRI_PASSWORD_SEED;
  delete process.env.KOSTNADSFRI_API_KEY;
});

describe("generatePassword", () => {
  it("requires a configured secret instead of falling back to a predictable seed", () => {
    expect(hasKostnadsfriPasswordSecret()).toBe(false);
    expect(() => generatePassword("acme-ab")).toThrow(/KOSTNADSFRI_PASSWORD_SEED/);
  });

  it("derives deterministic passwords from the configured seed", () => {
    process.env.KOSTNADSFRI_PASSWORD_SEED = "test-seed";

    expect(hasKostnadsfriPasswordSecret()).toBe(true);
    expect(generatePassword("acme-ab")).toBe(generatePassword("acme-ab"));
    expect(generatePassword("acme-ab")).not.toBe(generatePassword("other-ab"));
  });
});

function wizardData(overrides: Partial<MiniWizardData> = {}): MiniWizardData {
  return {
    companyName: "Zax 2.0 AB",
    industry: "creative",
    website: "",
    location: "Kista",
    description: "Frisörverksamhet",
    purposes: ["leads"],
    targetAudience: "Privatkunder",
    usp: "Snabba tider",
    designVibe: "modern",
    paletteName: null,
    colorPrimary: null,
    colorSecondary: null,
    colorAccent: null,
    ...overrides,
  };
}

function promptPageNames(prompt: string): string[] {
  const block = prompt.split("Site structure (pages to include):")[1] ?? "";
  const [list] = block.split("\n\n");
  return (list ?? "")
    .split("\n")
    .map((line) => line.replace(/^-\s*/, "").trim())
    .filter(Boolean);
}

// Ägarbeslut 2026-09-14: kampanjflödet äger inte sidantalet. Anroparen skickar
// taket och prompten skriver inte ut något tal — ruttplanen får det som
// `meta.pageCountHint`.
describe("buildPromptFromWizardData — sidantal", () => {
  it("names exactly as many pages as the caller allows, starting with Hem", () => {
    const pages = promptPageNames(buildPromptFromWizardData(wizardData(), { maxPages: 3 }));

    expect(pages).toEqual(["Hem", "Portfolio", "Kontakt"]);
  });

  it("keeps lower and higher caps honest for an industry with a long list", () => {
    expect(promptPageNames(buildPromptFromWizardData(wizardData(), { maxPages: 1 }))).toEqual([
      "Hem",
    ]);
    expect(
      promptPageNames(buildPromptFromWizardData(wizardData(), { maxPages: 5 })).length,
    ).toBe(5);
  });

  it("never drops below a single page", () => {
    expect(promptPageNames(buildPromptFromWizardData(wizardData(), { maxPages: 0 }))).toEqual([
      "Hem",
    ]);
  });

  it("falls back to a generic order for an unknown industry", () => {
    const pages = promptPageNames(
      buildPromptFromWizardData(wizardData({ industry: "frisor" }), { maxPages: 3 }),
    );

    expect(pages).toEqual(["Hem", "Tjänster", "Kontakt"]);
  });

  it("states no page count in prose, so detectExplicitPageCount has nothing to read back", () => {
    const prompt = buildPromptFromWizardData(wizardData(), { maxPages: 3 });

    expect(prompt).not.toMatch(/\d+\s*(pages|sidor)/i);
    expect(prompt).toMatch(/Do NOT reduce this to a single-page site/);
  });
});
