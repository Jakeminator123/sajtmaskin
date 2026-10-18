import { describe, expect, it } from "vitest";
import { COMPARISON_COPY } from "./comparison-copy";
import { INDUSTRY_COPY } from "./industry-copy";
import { SEO_INDUSTRY_SLUGS } from "./registry";

const VOLATILE_PRICE_PATTERNS = [/\d+\s*kr\b/i, /\b(?:49|99|179)\b/];

function flattenCopy(value: unknown): string {
  return JSON.stringify(value);
}

describe("industry landing copy", () => {
  it("covers every registered industry slug with unique lead, H2s and FAQ questions", () => {
    expect(Object.keys(INDUSTRY_COPY).sort()).toEqual([...SEO_INDUSTRY_SLUGS].sort());

    const leads = SEO_INDUSTRY_SLUGS.map((slug) => INDUSTRY_COPY[slug].lead);
    const faqs = SEO_INDUSTRY_SLUGS.flatMap((slug) => INDUSTRY_COPY[slug].faqs.map((faq) => faq.q));
    const needs = SEO_INDUSTRY_SLUGS.flatMap((slug) =>
      INDUSTRY_COPY[slug].needs.map((item) => item.title),
    );

    expect(new Set(leads).size).toBe(leads.length);
    expect(new Set(faqs).size).toBe(faqs.length);
    expect(new Set(needs).size).toBe(needs.length);

    for (const slug of SEO_INDUSTRY_SLUGS) {
      const copy = INDUSTRY_COPY[slug];
      expect(copy.lead.length).toBeGreaterThan(120);
      expect(copy.needs.length).toBeGreaterThanOrEqual(4);
      expect(copy.sections.length).toBeGreaterThanOrEqual(5);
      expect(copy.localTips.length).toBeGreaterThanOrEqual(3);
      expect(copy.faqs.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("keeps industry and new comparison copy free of volatile package prices", () => {
    const blob = `${flattenCopy(INDUSTRY_COPY)}\n${flattenCopy(COMPARISON_COPY)}`;
    for (const pattern of VOLATILE_PRICE_PATTERNS) {
      expect(blob).not.toMatch(pattern);
    }
  });
});
