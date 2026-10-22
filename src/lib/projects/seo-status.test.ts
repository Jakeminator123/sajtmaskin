import { describe, expect, it } from "vitest";
import type { SeoPublishReport } from "@/lib/seo/types";
import { buildSeoStatus, parseSeoStatus, SEO_STATUS_MAX_FINDINGS } from "./seo-status";

function report(overrides: Partial<SeoPublishReport> = {}): SeoPublishReport {
  return {
    before: { score: 40, findings: [], pagesInspected: ["/", "/kontakt"] },
    after: { score: 80, findings: [], pagesInspected: ["/", "/kontakt"] },
    improvements: [
      { findingId: "missing-robots", file: "app/robots.ts", change: "Lade till robots", by: "deterministic" },
    ],
    remaining: [
      { id: "image-missing-alt", severity: "advisory", file: "app/page.tsx", message: "Bild saknar alt.", fixable: false },
      { id: "missing-h1", severity: "critical", file: "app/page.tsx", message: "Saknar H1.", fixable: false },
      { id: "title-too-long", severity: "important", file: "app/layout.tsx", message: "Titeln är lång.", fixable: true },
    ],
    llmSkippedReason: null,
    ...overrides,
  } as SeoPublishReport;
}

describe("buildSeoStatus", () => {
  it("summarises the report with the most severe open findings first", () => {
    const status = buildSeoStatus(report(), {
      siteUrl: "https://kund.se",
      versionId: "ver_1",
      checkedAt: "2026-10-22T09:00:00.000Z",
    });
    expect(status).toMatchObject({
      score: 80,
      scoreBefore: 40,
      siteUrl: "https://kund.se",
      versionId: "ver_1",
      pagesInspected: 2,
      improvementCount: 1,
      remainingCount: 3,
      remainingBlockingCount: 2,
    });
    expect(status.remaining.map((finding) => finding.severity)).toEqual([
      "critical",
      "important",
      "advisory",
    ]);
    expect(status.remaining[0]).toEqual({
      id: "missing-h1",
      severity: "critical",
      message: "Saknar H1.",
    });
  });

  it("caps the listed findings but counts all of them", () => {
    const many = Array.from({ length: SEO_STATUS_MAX_FINDINGS + 5 }, (_, index) => ({
      id: "image-missing-alt" as const,
      severity: "advisory" as const,
      file: `app/p${index}.tsx`,
      message: `Bild ${index}`,
      fixable: false,
    }));
    const status = buildSeoStatus(report({ remaining: many }), {
      siteUrl: "https://kund.se",
      versionId: "ver_1",
      checkedAt: "2026-10-22T09:00:00.000Z",
    });
    expect(status.remaining).toHaveLength(SEO_STATUS_MAX_FINDINGS);
    expect(status.remainingCount).toBe(SEO_STATUS_MAX_FINDINGS + 5);
    expect(status.remainingBlockingCount).toBe(0);
  });
});

describe("parseSeoStatus", () => {
  it("round-trips a persisted status and rejects malformed ones", () => {
    const status = buildSeoStatus(report(), {
      siteUrl: "https://kund.se",
      versionId: "ver_1",
      checkedAt: "2026-10-22T09:00:00.000Z",
    });
    expect(parseSeoStatus(JSON.parse(JSON.stringify(status)))).toEqual(status);
    expect(parseSeoStatus(null)).toBeNull();
    expect(parseSeoStatus({ score: "80" })).toBeNull();
    expect(parseSeoStatus({ score: 80 })).toBeNull();
  });

  it("drops malformed findings instead of failing the whole status", () => {
    const status = parseSeoStatus({
      score: 70,
      checkedAt: "2026-10-22T09:00:00.000Z",
      siteUrl: "https://kund.se",
      versionId: "ver_1",
      remaining: [{ id: "missing-h1", severity: "critical", message: "Saknar H1." }, "junk", { id: 1 }],
    });
    expect(status?.remaining).toEqual([
      { id: "missing-h1", severity: "critical", message: "Saknar H1." },
    ]);
    expect(status?.remainingCount).toBe(1);
    expect(status?.remainingBlockingCount).toBe(1);
    expect(status?.scoreBefore).toBe(70);
  });
});
