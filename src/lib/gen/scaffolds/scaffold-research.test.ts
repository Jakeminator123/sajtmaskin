import { describe, expect, it } from "vitest";
import {
  type ScaffoldResearchFile,
  validateReferenceTemplateIds,
} from "./scaffold-research";

describe("validateReferenceTemplateIds", () => {
  it("accepts research where all reference template ids resolve", () => {
    const research: ScaffoldResearchFile = {
      generatedAt: "2026-04-08T00:00:00.000Z",
      source: "test",
      scaffolds: {
        ecommerce: {
          qualityChecklist: ["x"],
          research: {
            upgradeTargets: [],
            referenceTemplates: [
              {
                id: "tpl-ok",
                title: "Template OK",
                categorySlug: "ecommerce",
                qualityScore: 91,
                strengths: ["checkout"],
              },
            ],
          },
        },
      },
    };

    expect(() =>
      validateReferenceTemplateIds(research, (id) => (id === "tpl-ok" ? { id } : null)),
    ).not.toThrow();
  });

  it("throws a clear error when scaffold research references unknown template ids", () => {
    const research: ScaffoldResearchFile = {
      generatedAt: "2026-04-08T00:00:00.000Z",
      source: "test",
      scaffolds: {
        landing: {
          qualityChecklist: ["x"],
          research: {
            upgradeTargets: [],
            referenceTemplates: [
              {
                id: "tpl-missing",
                title: "Missing template",
                categorySlug: "landing-page",
                qualityScore: 77,
                strengths: ["hero"],
              },
            ],
          },
        },
      },
    };

    expect(() => validateReferenceTemplateIds(research, () => null)).toThrow(
      /landing:tpl-missing/,
    );
  });
});
