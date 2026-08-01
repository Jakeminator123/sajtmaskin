import { afterEach, describe, expect, it } from "vitest";

import { resolveSeoCopyModelId, toSeoReportPayload } from "./seo-publish";
import type { SeoFinding, SeoPublishReport } from "@/lib/seo";

function finding(index: number): SeoFinding {
  return {
    id: "missing-h1",
    severity: "important",
    file: `app/sida-${index}/page.tsx`,
    message: `Sida ${index} saknar h1.`,
    fixable: false,
  };
}

function reportWith(counts: { improvements: number; remaining: number }): SeoPublishReport {
  const remaining = Array.from({ length: counts.remaining }, (_, i) => finding(i));
  return {
    before: { findings: remaining, score: 40, pagesInspected: ["app/page.tsx"] },
    after: { findings: remaining, score: 70, pagesInspected: ["app/page.tsx"] },
    improvements: Array.from({ length: counts.improvements }, (_, i) => ({
      findingId: "missing-robots" as const,
      file: `f${i}.ts`,
      change: `Lade till f${i}.ts.`,
      by: "deterministic" as const,
    })),
    remaining,
    llmSkippedReason: null,
  };
}

const originalKey = process.env.OPENAI_API_KEY;

afterEach(() => {
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalKey;
});

describe("toSeoReportPayload", () => {
  it("carries both scores and the inspection counts", () => {
    const payload = toSeoReportPayload(reportWith({ improvements: 2, remaining: 3 }));
    expect(payload.scoreBefore).toBe(40);
    expect(payload.scoreAfter).toBe(70);
    expect(payload.pagesInspected).toBe(1);
    expect(payload.findingsBefore).toBe(3);
  });

  it("caps the lists but keeps the counts exact", () => {
    // A project with hundreds of pages must not bloat the deploy response —
    // but the UI still has to be able to say "och 30 till" truthfully.
    const payload = toSeoReportPayload(reportWith({ improvements: 50, remaining: 50 }));
    expect(payload.improvements).toHaveLength(20);
    expect(payload.improvementCount).toBe(50);
    expect(payload.remaining).toHaveLength(20);
    expect(payload.remainingCount).toBe(50);
  });

  it("does not leak the internal fixable flag to the client", () => {
    const payload = toSeoReportPayload(reportWith({ improvements: 1, remaining: 1 }));
    expect(payload.remaining[0]).not.toHaveProperty("fixable");
  });
});

describe("resolveSeoCopyModelId", () => {
  it("returns null without an API key so the report says the pass was disabled", () => {
    // Distinct from `no_api_key`: with no key the copy pass would skip anyway,
    // and "disabled" reads as configuration rather than a transient failure.
    delete process.env.OPENAI_API_KEY;
    expect(resolveSeoCopyModelId()).toBeNull();
  });

  it("resolves a model from the manifest when a key is present", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    expect(resolveSeoCopyModelId()).toBeTruthy();
  });
});
