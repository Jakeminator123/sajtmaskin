import { describe, expect, it } from "vitest";

import { emptyWizardAnswers } from "@viewser/components/discovery-wizard/wizard-types";
import type { WizardAnswers } from "@viewser/components/discovery-wizard/wizard-types";
import type { DiscoveryPayload } from "@viewser/components/discovery-wizard/wizard-payload";

import { discoveryToBrief } from "./brief";

function payload(
  overrides: {
    rawPrompt?: string;
    answers?: Partial<WizardAnswers>;
    directives?: DiscoveryPayload["directives"];
    scaffoldHint?: string;
    contentBranch?: string;
  } = {},
): DiscoveryPayload {
  const answers = { ...emptyWizardAnswers(), ...(overrides.answers ?? {}) };
  return {
    schemaVersion: 2,
    rawPrompt: overrides.rawPrompt ?? "En sajt för mitt företag",
    contentBranch:
      (overrides.contentBranch as DiscoveryPayload["contentBranch"]) ??
      ("service" as DiscoveryPayload["contentBranch"]),
    scaffoldHint: overrides.scaffoldHint ?? "landing-page",
    answers,
    directives: overrides.directives,
  };
}

describe("discoveryToBrief", () => {
  it("defaults language to sv and does NOT forward scaffold/scope drivers", () => {
    const brief = discoveryToBrief(payload({ scaffoldHint: "portfolio", contentBranch: "creative" }));
    expect(brief.language).toBe("sv");
    // Scaffold/domain are intentionally inferred by the native engine, not forced.
    expect(brief.scaffoldHint).toBeUndefined();
    expect(brief.domainProfile).toBeUndefined();
    expect(brief.businessType).toBeUndefined();
  });

  it("does NOT forward capabilities/conversion goals/pages (engine infers scope)", () => {
    const brief = discoveryToBrief(
      payload({
        answers: { mustHave: ["Tjänster", "Om oss"] },
        directives: {
          language: "sv",
          scaffoldHint: "landing-page",
          businessType: "restaurant",
          requestedCapabilities: ["booking", "menu"],
          conversionGoals: ["booking"],
        },
      }),
    );
    expect(brief.requestedCapabilities).toBeUndefined();
    expect(brief.conversionGoals).toBeUndefined();
    expect(brief.pages).toBeUndefined();
    expect(brief.businessType).toBeUndefined();
  });

  it("carries the descriptive target audience", () => {
    const brief = discoveryToBrief(
      payload({ answers: { targetAudience: "Småföretag" } }),
    );
    expect(brief.targetAudience).toBe("Småföretag");
  });

  it("builds toneAndVoice with primary first then secondary", () => {
    const brief = discoveryToBrief(
      payload({
        directives: {
          language: "sv",
          scaffoldHint: "landing-page",
          tone: { primary: "varm", secondary: ["personlig", "trygg"] },
        },
      }),
    );
    expect(brief.toneAndVoice).toEqual(["varm", "personlig", "trygg"]);
  });

  it("builds visualDirection from design style, vibe and brand colors", () => {
    const brief = discoveryToBrief(
      payload({
        answers: {
          brand: {
            toneTags: [],
            designStyle: "minimalist",
            primaryColorHex: "#0F0F0F",
            accentColorHex: "#E6E1D8",
            wordsToAvoid: "",
          },
          vibe: {
            vibeId: "nordic-trust",
            useCustomColors: true,
            typographyFeel: "modern-sans",
            references: "",
            layoutHint: "",
            sectionTreatments: {},
          },
        },
      }),
    );
    expect(brief.visualDirection?.styleKeywords).toContain("minimalist");
    expect(brief.visualDirection?.styleKeywords).toContain("nordic-trust");
    expect(brief.visualDirection?.primaryColorHex).toBe("#0F0F0F");
    expect(brief.visualDirection?.accentColorHex).toBe("#E6E1D8");
    expect(brief.visualDirection?.typography?.headings).toBe("modern-sans");
  });

  it("infers premium quality bar from operator wording", () => {
    expect(discoveryToBrief(payload({ rawPrompt: "en enkel sajt" })).qualityBar).toBe("clean");
    expect(
      discoveryToBrief(payload({ rawPrompt: "en exklusiv och påkostad sajt" })).qualityBar,
    ).toBe("premium");
    expect(
      discoveryToBrief(payload({ rawPrompt: "en dramatisk och atmosfärisk sajt" })).qualityBar,
    ).toBe("bold-dramatic");
  });

  it("sets lively motion for bold-dramatic, moderate otherwise", () => {
    expect(discoveryToBrief(payload({ rawPrompt: "enkel" })).motionLevel).toBe("moderate");
    expect(discoveryToBrief(payload({ rawPrompt: "cinematic moody" })).motionLevel).toBe("lively");
  });

  it("omits empty collections rather than emitting empty arrays", () => {
    const brief = discoveryToBrief(payload());
    expect(brief.toneAndVoice).toBeUndefined();
    expect(brief.uniqueSellingPoints).toBeUndefined();
    expect(brief.visualDirection).toBeUndefined();
  });
});
