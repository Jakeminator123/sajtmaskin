import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_INIT_BUILD_CHOICES,
  buildInitBuildChoicesMeta,
} from "@/lib/builder/init-build-choices";
import { buildRoutePlan, detectExplicitPageCount } from "@/lib/gen/route-plan";
import type { KostnadsfriPage } from "@/lib/db/services/shared";
import {
  buildPromptFromWizardData,
  extractCompanyData,
  generatePassword,
  hasKostnadsfriPasswordSecret,
  KostnadsfriIndustryConflictError,
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

describe("buildPromptFromWizardData — bransch vs verksamhet", () => {
  it("does not turn industry=null and a lottery/gaming description into a restaurant brief", () => {
    const prompt = buildPromptFromWizardData(
      wizardData({
        industry: "",
        description: "Bolaget utvecklar lotteri- och spelplattformar för reglerade marknader.",
        usp: "Licensierad igaming-plattform",
      }),
    );

    expect(prompt).not.toMatch(/Restaurang\/Bar/);
    expect(prompt).not.toMatch(/Meny/);
    expect(prompt).not.toMatch(/Boka bord/);
    expect(promptPagePriorities(prompt)).toEqual(["Hem", "Tjänster", "Kontakt", "Om oss"]);
    expect(prompt).toMatch(/a general company/);
  });

  it("refuses a restaurant industry plus lottery/gaming description instead of a hybrid prompt", () => {
    expect(() =>
      buildPromptFromWizardData(
        wizardData({
          industry: "restaurant",
          description: "Lotteri och spelplattformar med spellicens.",
        }),
      ),
    ).toThrow(KostnadsfriIndustryConflictError);

    expect(() =>
      buildPromptFromWizardData(wizardData({ industry: "", description: "Casino och sportsbook" }), {
        industryId: "restaurant",
      }),
    ).toThrow(KostnadsfriIndustryConflictError);
  });

  it("still compiles a matching restaurant brief", () => {
    const prompt = buildPromptFromWizardData(
      wizardData({
        industry: "restaurant",
        description: "Husmanskost och bar i Gamla stan.",
      }),
    );

    expect(prompt).toContain("Restaurang/Bar");
    expect(promptPagePriorities(prompt)).toEqual([
      "Hem",
      "Meny",
      "Kontakt",
      "Boka bord",
      "Om oss",
    ]);
  });
});

describe("buildPromptFromWizardData — kundbekräftade follow-up-svar", () => {
  it("tar med unik bekräftad fras och addendum, aldrig transkript eller profil", () => {
    const phrase = "SM-F1-CONFIRM-PHRASE-7f3a";
    const prompt = buildPromptFromWizardData(wizardData(), {
      usp: phrase,
      bookingHours: "Öppet 10-18, boka via mejl",
      price: "Klippning från 420 kr",
    });

    expect(prompt).toContain(phrase);
    expect(prompt).toContain("Customer-confirmed follow-up");
    expect(prompt).toContain("Öppet 10-18, boka via mejl");
    expect(prompt).toContain("Klippning från 420 kr");
    expect(prompt).not.toContain("HEMLIG PROFILTEXT");
    expect(prompt).not.toContain("user: hela chatten");
  });
});
