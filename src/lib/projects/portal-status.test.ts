import { describe, expect, it } from "vitest";
import { BUSINESS_FACTS_MODULE_MARKER } from "./business-facts-module";
import type { SeoPublishReport } from "@/lib/seo/types";
import {
  MAX_PORTAL_STATUS_VERSIONS,
  PORTAL_STATUS_META_KEY,
  buildPortalStatusMetaPatch,
  computeBusinessFactsSupported,
  readPortalStatusForVersion,
} from "./portal-status";

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

  it("accepts relative and dynamic imports but not look-alike modules", () => {
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
    expect(
      computeBusinessFactsSupported([
        MARKED,
        { path: "components/x.tsx", content: 'import { a } from "@/lib/business-facts-old";' },
      ]),
    ).toBe(false);
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
    existingMeta: null,
  };

  it("writes a production entry keyed by version with SEO and support", () => {
    const patch = buildPortalStatusMetaPatch({ ...base, deployTarget: "production" });
    const entries = patch[PORTAL_STATUS_META_KEY] as Record<string, Record<string, unknown>>;
    expect(Object.keys(entries)).toEqual(["ver_1"]);
    expect(entries.ver_1.businessFactsSupport).toEqual({ supported: true, importedRepo: false });
    expect(entries.ver_1.seoStatus).toMatchObject({ score: 90, versionId: "ver_1" });
  });

  it("writes nothing for a preview deploy", () => {
    expect(buildPortalStatusMetaPatch({ ...base, deployTarget: "preview" })).toEqual({});
  });

  it("keeps earlier versions so a failed newer build cannot hide the live one", () => {
    const first = buildPortalStatusMetaPatch({ ...base, deployTarget: "production" });
    // V2 is accepted (entry written) but its build fails; V1 stays live.
    const second = buildPortalStatusMetaPatch({
      ...base,
      deployTarget: "production",
      versionId: "ver_2",
      seoReport: null,
      publishedFiles: [PAGE],
      now: "2026-10-22T11:00:00.000Z",
      existingMeta: first,
    });

    const live = readPortalStatusForVersion(second, "ver_1");
    expect(live.seoStatus).toMatchObject({ score: 90, versionId: "ver_1" });
    expect(live.businessFactsSupport).toBe("supported");

    const failed = readPortalStatusForVersion(second, "ver_2");
    expect(failed.seoStatus).toBeNull();
    expect(failed.businessFactsSupport).toBe("unsupported");
  });

  it("caps the history to the newest versions", () => {
    let meta: Record<string, unknown> | null = null;
    for (let i = 0; i < MAX_PORTAL_STATUS_VERSIONS + 3; i += 1) {
      meta = buildPortalStatusMetaPatch({
        ...base,
        deployTarget: "production",
        versionId: `ver_${i}`,
        now: `2026-10-22T10:${String(i).padStart(2, "0")}:00.000Z`,
        existingMeta: meta,
      });
    }
    const entries = Object.keys((meta as Record<string, Record<string, unknown>>)[PORTAL_STATUS_META_KEY]);
    expect(entries).toHaveLength(MAX_PORTAL_STATUS_VERSIONS);
    expect(entries).toContain(`ver_${MAX_PORTAL_STATUS_VERSIONS + 2}`);
    expect(entries).not.toContain("ver_0");
  });

  it("flags imported repos so the portal does not promise a builder upgrade", () => {
    const patch = buildPortalStatusMetaPatch({
      ...base,
      deployTarget: "production",
      publishedFiles: [PAGE],
      importedRepo: true,
    });
    expect(readPortalStatusForVersion(patch, "ver_1").businessFactsSupport).toBe("imported");
  });
});

describe("readPortalStatusForVersion", () => {
  it("is empty and unknown without a live version or an entry for it", () => {
    expect(readPortalStatusForVersion(null, "ver_1")).toEqual({
      seoStatus: null,
      businessFactsSupport: "unknown",
    });
    expect(
      readPortalStatusForVersion({ [PORTAL_STATUS_META_KEY]: { ver_1: { junk: true } } }, "ver_1"),
    ).toEqual({ seoStatus: null, businessFactsSupport: "unknown" });
    expect(readPortalStatusForVersion({}, null)).toEqual({
      seoStatus: null,
      businessFactsSupport: "unknown",
    });
  });
});
