import { describe, expect, it } from "vitest";
import { BUSINESS_FACTS_MODULE_MARKER } from "@/lib/projects/business-facts-module";
import type { SeoPublishReport } from "@/lib/seo/types";
import { buildPortalStatusMetaPatch, computeBusinessFactsSupported } from "./portal-status";

const MARKED = { path: "lib/business-facts.ts", content: `${BUSINESS_FACTS_MODULE_MARKER}\nexport {}` };
const PAGE = { path: "app/page.tsx", content: "export default function Page(){}" };
const FOOTER_USING_MODULE = {
  path: "components/site-footer.tsx",
  content: 'import { openingHoursLines } from "@/lib/business-facts";\nexport function Footer(){}',
};

const REPORT: SeoPublishReport = {
  before: { score: 40, findings: [], pagesInspected: ["/"] },
  after: { score: 90, findings: [], pagesInspected: ["/"] },
  improvements: [],
  remaining: [],
  llmSkippedReason: null,
};

describe("computeBusinessFactsSupported", () => {
  it("needs a marked module that another file actually imports", () => {
    expect(computeBusinessFactsSupported([PAGE, MARKED, FOOTER_USING_MODULE])).toBe(true);
    expect(computeBusinessFactsSupported([PAGE, FOOTER_USING_MODULE])).toBe(false);
    expect(
      computeBusinessFactsSupported([
        { path: "lib/business-facts.ts", content: "export const x = 1;" },
        FOOTER_USING_MODULE,
      ]),
    ).toBe(false);
  });

  it("does not count a marked module that nothing renders", () => {
    expect(computeBusinessFactsSupported([PAGE, MARKED])).toBe(false);
  });

  it("accepts relative and dynamic imports", () => {
    expect(
      computeBusinessFactsSupported([
        MARKED,
        { path: "app/kontakt/page.tsx", content: "import { businessFacts } from '../../lib/business-facts';" },
      ]),
    ).toBe(true);
    expect(
      computeBusinessFactsSupported([
        MARKED,
        { path: "components/open-badge.tsx", content: 'const m = await import("@/lib/business-facts");' },
      ]),
    ).toBe(true);
  });
});

describe("buildPortalStatusMetaPatch", () => {
  const base = {
    seoReport: REPORT,
    seoSiteUrl: "https://kund.se",
    versionId: "ver_1",
    publishedFiles: [PAGE, MARKED, FOOTER_USING_MODULE],
    importedRepo: false,
    now: "2026-10-22T10:00:00.000Z",
  };

  it("writes SEO status and support for production, keyed by version", () => {
    const production = buildPortalStatusMetaPatch({ ...base, deployTarget: "production" });
    expect(production.businessFactsSupport).toEqual({
      supported: true,
      versionId: "ver_1",
      checkedAt: "2026-10-22T10:00:00.000Z",
      importedRepo: false,
    });
    expect(production.seoStatus).toMatchObject({ score: 90, versionId: "ver_1", siteUrl: "https://kund.se" });
  });

  it("writes nothing for a preview deploy, so the live answer is never overwritten", () => {
    expect(buildPortalStatusMetaPatch({ ...base, deployTarget: "preview" })).toEqual({});
  });

  it("omits the SEO status when the pass did not run against a URL", () => {
    const patch = buildPortalStatusMetaPatch({ ...base, deployTarget: "production", seoSiteUrl: null });
    expect(patch.seoStatus).toBeUndefined();
    expect(patch.businessFactsSupport).toBeDefined();
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
