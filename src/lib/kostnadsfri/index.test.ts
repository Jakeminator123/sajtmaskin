import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_INIT_BUILD_CHOICES,
  buildInitBuildChoicesMeta,
} from "@/lib/builder/init-build-choices";
import { buildRoutePlan, detectExplicitPageCount } from "@/lib/gen/route-plan";
import type { KostnadsfriPage } from "@/lib/db/services/shared";
import {
  abSiblingSlug,
  buildPromptFromWizardData,
  extractCompanyData,
  findKostnadsfriPageForSlug,
  generatePassword,
  hasKostnadsfriPasswordSecret,
  kostnadsfriAttemptBucket,
  pickKostnadsfriPageForSlug,
  verifyDeterministicPassword,
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

describe("abSiblingSlug", () => {
  it("växlar ett avslutande -ab", () => {
    expect(abSiblingSlug("nordbygg-entreprenad")).toBe("nordbygg-entreprenad-ab");
    expect(abSiblingSlug("nordbygg-entreprenad-ab")).toBe("nordbygg-entreprenad");
    expect(abSiblingSlug("lab")).toBe("lab-ab");
    expect(abSiblingSlug("ab")).toBe("ab-ab");
    expect(abSiblingSlug("-ab")).toBeNull();
    expect(abSiblingSlug("")).toBeNull();
  });
});

describe("kostnadsfriAttemptBucket", () => {
  it("delar hink mellan slug och -ab-syskon", () => {
    expect(kostnadsfriAttemptBucket("nordbygg-entreprenad")).toBe(
      kostnadsfriAttemptBucket("nordbygg-entreprenad-ab"),
    );
    expect(kostnadsfriAttemptBucket("nordbygg-entreprenad")).not.toBe(
      kostnadsfriAttemptBucket("annat-bolag-ab"),
    );
  });
});

describe("pickKostnadsfriPageForSlug", () => {
  it("föredrar exakt slug när båda raderna finns", () => {
    const pages = [{ slug: "foo" }, { slug: "foo-ab" }];
    expect(pickKostnadsfriPageForSlug(pages, "foo")?.slug).toBe("foo");
    expect(pickKostnadsfriPageForSlug(pages, "foo-ab")?.slug).toBe("foo-ab");
  });

  it("faller tillbaka till syskonraden", () => {
    expect(pickKostnadsfriPageForSlug([{ slug: "foo-ab" }], "foo")?.slug).toBe("foo-ab");
    expect(pickKostnadsfriPageForSlug([{ slug: "foo" }], "foo-ab")?.slug).toBe("foo");
  });
});

describe("findKostnadsfriPageForSlug", () => {
  it("slår upp syskonet när den begärda sluggen saknas", async () => {
    const getBySlug = vi.fn(async (candidate: string) =>
      candidate === "foo-ab" ? { slug: candidate } : null,
    );
    await expect(findKostnadsfriPageForSlug("foo", getBySlug)).resolves.toEqual({ slug: "foo-ab" });
    expect(getBySlug.mock.calls.map((call) => call[0])).toEqual(["foo", "foo-ab"]);
  });
});

describe("verifyDeterministicPassword", () => {
  // Slug och kod hålls i variabler: en inline-literal i ett lösenordsanrop läses
  // som ett hårdkodat lösenord av GitGuardian (samma fynd som på #1306).
  const bareSlug = "nordbygg-entreprenad";
  const abSlug = "nordbygg-entreprenad-ab";
  const otherSlug = "annat-bolag-ab";

  it("godkänner HMAC för sluggen eller dess -ab-syskon", () => {
    process.env.KOSTNADSFRI_PASSWORD_SEED = "test-seed";
    const bareCode = generatePassword(bareSlug);
    const abCode = generatePassword(abSlug);

    expect(verifyDeterministicPassword(bareSlug, bareCode)).toBe(true);
    expect(verifyDeterministicPassword(abSlug, bareCode)).toBe(true);
    expect(verifyDeterministicPassword(bareSlug, abCode)).toBe(true);
    expect(verifyDeterministicPassword(abSlug, abCode)).toBe(true);
    expect(verifyDeterministicPassword(bareSlug, generatePassword(otherSlug))).toBe(false);
  });
});

// DTO:n går till browsern efter lösenordsverifiering. En post som lagrades före
// allowlisten — eller lades in för hand — kan bära personnummer och hemadresser
// i `extra_data`, så den råa kolumnen får inte följa med ut.
describe("extractCompanyData", () => {
  const page = (extraData: Record<string, unknown> | null) =>
    ({
      slug: "zax-2-0-ab",
      company_name: "Zax 2.0 AB",
      industry: "health",
      website: null,
      contact_email: "post@example.se",
      contact_name: "Didar",
      extra_data: extraData,
    }) as unknown as KostnadsfriPage;

  it("exponerar inte rå extra_data", () => {
    const data = extractCompanyData(
      page({
        profile: { city: "Kista" },
        homeAddress: "HÖGNÄSVÄGEN 4, 196 34 KUNGSÄNGEN",
        boardMembers: [{ name: "Didar", personalId: "19748885-2517" }],
      }),
    );

    expect(data).not.toHaveProperty("extraData");
    expect(JSON.stringify(data)).not.toContain("HÖGNÄSVÄGEN");
    expect(JSON.stringify(data)).not.toContain("19748885-2517");
  });

  it("behåller de normaliserade projektionerna", () => {
    const data = extractCompanyData(
      page({
        openclaw: { roleLabel: "Sajtagenten" },
        profile: { city: "Kista", orgNumber: "559599-5639", shareCapital: "25.000 SEK" },
      }),
    );

    expect(data.profile).toEqual({ city: "Kista", orgNumber: "559599-5639" });
    expect(data.openclawConfig?.roleLabel).toBe("Sajtagenten");
    expect(data.companyName).toBe("Zax 2.0 AB");
  });

  it("är tyst när extra_data saknas", () => {
    const data = extractCompanyData(page(null));

    expect(data.profile).toBeNull();
    expect(data.openclawConfig).toBeNull();
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

function promptPagePriorities(prompt: string): string[] {
  const block =
    prompt.split("Page priorities (ordered suggestions, not an exact page list):")[1] ?? "";
  const [list] = block.split("\n\n");
  return (list ?? "")
    .split("\n")
    .map((line) => line.replace(/^-\s*/, "").trim())
    .filter(Boolean);
}

// Ägarbeslut 2026-09-14: kampanjflödet äger inte sidantalet. Prompten ger
// enbart prioriteringar; ruttplanen får enda antalssanningen som
// `meta.pageCountHint`.
describe("buildPromptFromWizardData — sidantal", () => {
  it("lists ordered page priorities without turning them into an exact route list", () => {
    const prompt = buildPromptFromWizardData(wizardData());

    expect(promptPagePriorities(prompt)).toEqual([
      "Hem",
      "Portfolio",
      "Kontakt",
      "Tjänster",
      "Om oss",
    ]);
    expect(prompt).toMatch(/not an exact page list/i);
    expect(prompt).toMatch(/non-binding route suggestions/i);
  });

  it("falls back to a generic order for an unknown industry", () => {
    const pages = promptPagePriorities(
      buildPromptFromWizardData(wizardData({ industry: "frisor" })),
    );

    expect(pages).toEqual(["Hem", "Tjänster", "Kontakt", "Om oss"]);
  });

  it("states no page count in prose, so detectExplicitPageCount has nothing to read back", () => {
    const prompt = buildPromptFromWizardData(wizardData());

    expect(detectExplicitPageCount(prompt)).toBeNull();
    expect(prompt).not.toMatch(/multi-page|single-page|pages to include|exactly the pages/i);
  });

  it.each([1, 2])(
    "honors an explicit page-count choice of %i through prompt to route plan",
    (pageCount) => {
      const prompt = buildPromptFromWizardData(wizardData());
      const meta = buildInitBuildChoicesMeta({
        ...DEFAULT_INIT_BUILD_CHOICES,
        pageCount,
      });
      const plan = buildRoutePlan({
        prompt,
        buildIntent: "website",
        resolvedScaffold: null,
        pageCountHint: meta.pageCountHint,
      });

      expect(meta.pageCountHint).toBe(pageCount);
      expect(plan.routes).toHaveLength(pageCount);
      expect(plan.routes[0]?.path).toBe("/");
      expect(plan.siteType === "one-page").toBe(pageCount === 1);
    },
  );
});

describe("buildPromptFromWizardData — profilen når inte prompten", () => {
  it("reads MiniWizardData only — a smuggled profile never enters the prompt", () => {
    const leaked = {
      ...wizardData({
        description: "Användaren godkände den här texten",
        location: "Kista",
        industry: "creative",
      }),
      profile: {
        streetAddress: "c/o Hemlig Revisorsgatan 1",
        orgNumber: "559599-5639",
        businessDescription: "HEMLIG PROFILTEXT",
      },
    };

    const prompt = buildPromptFromWizardData(leaked as MiniWizardData);

    expect("profile" in wizardData()).toBe(false);
    expect(prompt).toContain("Användaren godkände den här texten");
    expect(prompt).toContain("Kista");
    expect(prompt).not.toContain("HEMLIG PROFILTEXT");
    expect(prompt).not.toContain("Revisorsgatan");
    expect(prompt).not.toContain("559599-5639");
  });
});
