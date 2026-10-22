import { describe, expect, it } from "vitest";
import { BUSINESS_FACTS_MODULE_MARKER } from "@/lib/projects/business-facts-module";
import type { SeoPublishReport } from "@/lib/seo/types";
import { buildPortalStatusMetaPatch, computeBusinessFactsSupported } from "./portal-status";

const MARKED = { path: "lib/business-facts.ts", content: `${BUSINESS_FACTS_MODULE_MARKER}\nexport {}` };
const PAGE = { path: "app/page.tsx", content: "export default function Page(){}" };

const REPORT: SeoPublishReport = {
  before: { score: 40, findings: [], pagesInspected: ["/"] },
  after: { score: 90, findings: [], pagesInspected: ["/"] },
  improvements: [],
  remaining: [],
  llmSkippedReason: null,
};

describe("computeBusinessFactsSupported", () => {
  it("needs a module at the known path that still starts with the marker", () => {
    expect(computeBusinessFactsSupported([PAGE, MARKED])).toBe(true);
    expect(computeBusinessFactsSupported([PAGE])).toBe(false);
    expect(
      computeBusinessFactsSupported([{ path: "lib/business-facts.ts", content: "export const x = 1;" }]),
    ).toBe(false);
  });
});

describe("buildPortalStatusMetaPatch", () => {
  const base = {
    seoReport: null,
    seoSiteUrl: null,
    versionId: "ver_1",
    publishedFiles: [PAGE, MARKED],
    importedRepo: false,
    now: "2026-10-22T10:00:00.000Z",
  };

  it("records support for production only, so a preview never overwrites the live answer", () => {
    const production = buildPortalStatusMetaPatch({ ...base, deployTarget: "production" });
    expect(production.businessFactsSupport).toEqual({
      supported: true,
      versionId: "ver_1",
      checkedAt: "2026-10-22T10:00:00.000Z",
      importedRepo: false,
    });
    expect(production.seoStatus).toBeUndefined();

    const preview = buildPortalStatusMetaPatch({ ...base, deployTarget: "preview" });
    expect(preview).toEqual({});
  });

  it("includes the SEO status only when the pass ran against a URL", () => {
    const withSeo = buildPortalStatusMetaPatch({
      ...base,
      deployTarget: "preview",
      seoReport: REPORT,
      seoSiteUrl: "https://kund.se",
    });
    expect(withSeo.seoStatus).toMatchObject({ score: 90, scoreBefore: 40, siteUrl: "https://kund.se" });

    const noUrl = buildPortalStatusMetaPatch({ ...base, deployTarget: "preview", seoReport: REPORT });
    expect(noUrl).toEqual({});
  });

  it("flags imported repos so the portal does not promise a builder upgrade that cannot happen", () => {
    const patch = buildPortalStatusMetaPatch({
      ...base,
      deployTarget: "production",
      publishedFiles: [PAGE],
      importedRepo: true,
    });
    expect(patch.businessFactsSupport).toMatchObject({ supported: false, importedRepo: true });
  });
});
