import { describe, expect, it } from "vitest";
import { toPublicAnalysReport } from "@/lib/audit/public-report";
import type { AuditResult } from "@/types/audit";

function auditResult(overrides: Partial<AuditResult> = {}): AuditResult {
  return {
    audit_type: "website_audit",
    audit_mode: "basic",
    company: "Nordlunden AB",
    domain: "nordlunden.se",
    cost: { tokens: 14313, sek: 0.13, usd: 0.0121 },
    ...overrides,
  } as AuditResult;
}

describe("toPublicAnalysReport", () => {
  it("keeps what the public report renders", () => {
    const report = toPublicAnalysReport(
      auditResult({
        business_profile: {
          industry: "Bygg",
          company_size: "5",
          business_model: "B2C",
          maturity: "etablerad",
          core_offers: [],
          revenue_streams: [],
        },
        audit_scores: { seo: 82, security: 78, mobile: 88 },
        customer_segments: {
          primary_segment: "Villaägare i Umeå",
          secondary_segments: [],
          customer_needs: ["Snabb offert", "Referenser"],
          decision_triggers: [],
          trust_signals: [],
        },
        content_strategy: { seo_foundation: "Titel saknar ort", key_pages: ["Start", "Tjänster"] },
        strengths: ["Tydlig tjänstelista"],
        issues: ["Ingen kontaktväg ovan mitten"],
        priority_matrix: { quick_wins: ["Lägg ort i titeln"], major_projects: ["Bygg om start"] },
        expected_outcomes: ["Fler förfrågningar"],
        security_analysis: {
          https_status: "Aktivt",
          headers_analysis: "CSP saknas",
          cookie_policy: "-",
        },
        scrape_summary: {
          sampled_urls: ["https://nordlunden.se"],
          pages_sampled: 4,
          aggregated_word_count: 1276,
          headings_count: 20,
          images_count: 4,
          response_time_ms: 173,
          is_js_rendered: false,
        },
      }),
    );

    expect(report.company).toBe("Nordlunden AB");
    expect(report.industry).toBe("Bygg");
    expect(report.audit_scores).toEqual({ seo: 82, security: 78, mobile: 88 });
    expect(report.audience?.primary_segment).toBe("Villaägare i Umeå");
    expect(report.audience?.customer_needs).toEqual(["Snabb offert", "Referenser"]);
    expect(report.seo?.foundation).toBe("Titel saknar ort");
    expect(report.quick_wins).toEqual(["Lägg ort i titeln"]);
    expect(report.major_projects).toEqual(["Bygg om start"]);
    expect(report.expected_outcomes).toEqual(["Fler förfrågningar"]);
    expect(report.technical?.https_status).toBe("Aktivt");
    expect(report.data_quality).toEqual({
      pages_sampled: 4,
      aggregated_word_count: 1276,
      is_js_rendered: false,
    });
  });

  it("drops the internal generation payload, business data and cost", () => {
    const report = toPublicAnalysReport(
      auditResult({
        site_content: {
          company_name: "Nordlunden AB",
          description: "intern extraktion",
          industry: "Bygg",
          sections: [],
        },
        color_theme: {
          primary_color: "#0af",
          background_color: "#000",
          text_color: "#fff",
          theme_type: "dark",
          style_description: "mörk",
        },
        template_data: {
          generation_prompt: "superprompt",
          must_have_sections: [],
          style_notes: "",
          improvements_to_apply: [],
        },
        budget_estimate: { currency: "SEK", low: 20000, high: 90000 },
        competitor_insights: {
          industry_standards: "x",
          missing_features: "y",
          unique_strengths: "z",
        },
      }),
    );

    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("superprompt");
    expect(serialized).not.toContain("intern extraktion");
    expect(serialized).not.toContain("budget_estimate");
    expect(serialized).not.toContain("competitor_insights");
    expect(serialized).not.toContain("0.0121");
    expect("cost" in report).toBe(false);
  });

  it("caps arrays and long strings so one target site cannot inflate the response", () => {
    const report = toPublicAnalysReport(
      auditResult({
        strengths: Array.from({ length: 30 }, (_, i) => `styrka ${i}`),
        issues: Array.from({ length: 30 }, (_, i) => `problem ${i}`),
        improvements: Array.from({ length: 30 }, (_, i) => ({
          item: `åtgärd ${i}`,
          impact: "high" as const,
          effort: "low" as const,
        })),
        content_strategy: { seo_foundation: "x".repeat(5000) },
      }),
    );

    expect(report.strengths).toHaveLength(5);
    expect(report.issues).toHaveLength(5);
    expect(report.improvements).toHaveLength(8);
    expect(report.seo?.foundation?.length).toBeLessThanOrEqual(600);
  });

  it("puts audience/content work before technical work and normalises unknown levels", () => {
    const report = toPublicAnalysReport(
      auditResult({
        improvements: [
          { item: "Hårdare headers", impact: "high", effort: "low", category: "Security" },
          { item: "Fixa titel", impact: "medium", effort: "low", category: "Marketing" },
          { item: "Byt bildformat", impact: "high", effort: "medium", category: "Tech" },
          {
            item: "Okänd nivå",
            impact: "kritisk" as unknown as "high",
            effort: "enorm" as unknown as "high",
            category: "Content",
          },
        ],
      }),
    );

    expect(report.improvements?.map((item) => item.item)).toEqual([
      "Fixa titel",
      "Okänd nivå",
      "Byt bildformat",
      "Hårdare headers",
    ]);
    const unknown = report.improvements?.find((item) => item.item === "Okänd nivå");
    expect(unknown?.impact).toBe("low");
    expect(unknown?.effort).toBe("high");
  });

  it("omits sections entirely when the model returned nothing usable", () => {
    const report = toPublicAnalysReport(
      auditResult({
        strengths: [],
        customer_segments: {
          primary_segment: "   ",
          secondary_segments: [],
          customer_needs: [],
          decision_triggers: [],
          trust_signals: [],
        },
      }),
    );

    expect(report.strengths).toBeUndefined();
    expect(report.audience).toBeUndefined();
    expect(report.seo).toBeUndefined();
    expect(report.technical).toBeUndefined();
  });

  it("flags a fallback run so the report can say the bedömning is degraded", () => {
    const report = toPublicAnalysReport(auditResult(), { usedFallback: true });
    expect(report.data_quality?.used_fallback).toBe(true);
  });
});
