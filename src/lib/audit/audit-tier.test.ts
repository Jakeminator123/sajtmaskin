import { describe, expect, it } from "vitest";
import { AUDIT_AI_SCHEMA, AUDIT_AI_SCHEMA_BASIC } from "@/app/api/audit/modules/schema";
import { createFallbackResult } from "@/app/api/audit/modules/analysis";
import { AUDIT_COSTS } from "@/lib/credits/pricing";
import {
  AUDIT_PUBLIC_STRUCTURED_DEFAULT_MODEL,
  AUDIT_STRUCTURED_DEFAULT_MODEL,
} from "@/lib/gen/defaults";
import {
  AUDIT_ADVANCED_ONLY_FIELDS,
  AUDIT_TIER_COPY,
  hasAdvancedOnlyFields,
  omitAdvancedOnlyFields,
  resolveAuditRun,
} from "./audit-tier";

describe("resolveAuditRun", () => {
  it("makes paid Vanlig a smaller Luna run without research or Advanced-only fields", () => {
    const run = resolveAuditRun({ promptKind: "product", auditMode: "basic" });
    expect(run.mode).toBe("basic");
    expect(run.primaryModel).toBe(AUDIT_PUBLIC_STRUCTURED_DEFAULT_MODEL);
    expect(run.primaryModel).toBe("openai/gpt-5.6-luna");
    expect(run.maxPages).toBe(2);
    expect(run.allowWebSearch).toBe(false);
    expect(run.schemaKind).toBe("core");
    expect(run.schema).toBe(AUDIT_AI_SCHEMA_BASIC);
    expect(run.improvementTarget).toEqual({ min: 6, max: 8 });
    for (const field of AUDIT_ADVANCED_ONLY_FIELDS) {
      expect(run.schema.required).not.toContain(field);
      expect(run.schema.properties).not.toHaveProperty(field);
    }
  });

  it("makes Avancerad a fuller Sol run with research and Advanced-only fields", () => {
    const run = resolveAuditRun({ promptKind: "product", auditMode: "advanced" });
    expect(run.mode).toBe("advanced");
    expect(run.primaryModel).toBe(AUDIT_STRUCTURED_DEFAULT_MODEL);
    expect(run.primaryModel).toBe("openai/gpt-5.6-sol");
    expect(run.maxPages).toBe(4);
    expect(run.allowWebSearch).toBe(true);
    expect(run.schemaKind).toBe("full");
    expect(run.schema).toBe(AUDIT_AI_SCHEMA);
    expect(run.improvementTarget).toEqual({ min: 12 });
    for (const field of AUDIT_ADVANCED_ONLY_FIELDS) {
      expect(run.schema.required).toContain(field);
      expect(run.schema.properties).toHaveProperty(field);
    }
  });

  it("keeps public /analys as a separate Luna lead magnet on the full schema", () => {
    const run = resolveAuditRun({ promptKind: "public", auditMode: "advanced" });
    expect(run.mode).toBe("basic");
    expect(run.promptKind).toBe("public");
    expect(run.primaryModel).toBe("openai/gpt-5.6-luna");
    expect(run.maxPages).toBe(4);
    expect(run.allowWebSearch).toBe(false);
    expect(run.schemaKind).toBe("full");
    expect(run.schema).toBe(AUDIT_AI_SCHEMA);
  });
});

describe("Advanced-only field stripping", () => {
  it("omits Advanced-only keys from a mixed result", () => {
    const stripped = omitAdvancedOnlyFields({
      company: "Nordlunden",
      business_profile: { industry: "Hantverk" },
      market_context: { primary_geography: "Umeå" },
      customer_segments: { primary_segment: "Villaägare" },
      competitive_landscape: { positioning: "Lokal" },
      competitor_insights: { industry_standards: "Case" },
      content_strategy: { seo_foundation: "Ort i titeln" },
    });

    expect(stripped.company).toBe("Nordlunden");
    expect(stripped.content_strategy).toEqual({ seo_foundation: "Ort i titeln" });
    expect(hasAdvancedOnlyFields(stripped)).toBe(false);
    for (const field of AUDIT_ADVANCED_ONLY_FIELDS) {
      expect(stripped).not.toHaveProperty(field);
    }
  });

  it("keeps Advanced-only fields in a public/full basic fallback", () => {
    const fallback = createFallbackResult(
      {
        title: "Exempel",
        description: "En sida",
        wordCount: 200,
        hasSSL: true,
        headings: ["Hem"],
        meta: { viewport: "width=device-width" },
        links: { internal: 2, external: 1 },
        images: 1,
        responseTime: 100,
      },
      "https://example.se",
      "basic",
      { schemaKind: "full" },
    );
    expect(hasAdvancedOnlyFields(fallback)).toBe(true);
    expect(fallback.customer_segments).toBeTruthy();
    expect(fallback.business_profile).toBeTruthy();
  });

  it("does not put Advanced-only fields in a Vanlig fallback", () => {
    const fallback = createFallbackResult(
      {
        title: "Exempel",
        description: "En sida",
        wordCount: 200,
        hasSSL: true,
        headings: ["Hem"],
        meta: { viewport: "width=device-width" },
        links: { internal: 2, external: 1 },
        images: 1,
        responseTime: 100,
      },
      "https://example.se",
      "basic",
    );
    expect(hasAdvancedOnlyFields(fallback)).toBe(false);
    expect(fallback.audit_mode).toBe("basic");
    expect(Array.isArray(fallback.improvements)).toBe(true);
  });

  it("keeps Advanced-only fields in an Avancerad fallback", () => {
    const fallback = createFallbackResult(
      {
        title: "Exempel",
        description: "En sida",
        wordCount: 200,
        hasSSL: true,
        headings: ["Hem"],
        meta: { viewport: "width=device-width" },
        links: { internal: 2, external: 1 },
        images: 1,
        responseTime: 100,
      },
      "https://example.se",
      "advanced",
    );
    expect(hasAdvancedOnlyFields(fallback)).toBe(true);
    expect(fallback.business_profile).toBeTruthy();
    expect(fallback.competitor_insights).toBeTruthy();
  });
});

describe("prices stay put", () => {
  it("keeps Vanlig at 15 and Avancerad at 25", () => {
    expect(AUDIT_COSTS.basic).toBe(15);
    expect(AUDIT_COSTS.advanced).toBe(25);
  });
});

describe("honest UI copy", () => {
  it("describes depth, pages, research and improvement volume without model names", () => {
    expect(AUDIT_TIER_COPY.basic.title).toBe("Vanlig analys");
    expect(AUDIT_TIER_COPY.advanced.title).toBe("Avancerad analys");
    expect(AUDIT_TIER_COPY.basic.facts.join(" ")).toMatch(/2 sidor/);
    expect(AUDIT_TIER_COPY.basic.facts.join(" ")).toMatch(/6–8/);
    expect(AUDIT_TIER_COPY.basic.facts.join(" ")).toMatch(/Ingen web research/);
    expect(AUDIT_TIER_COPY.advanced.facts.join(" ")).toMatch(/4 sidor/);
    expect(AUDIT_TIER_COPY.advanced.facts.join(" ")).toMatch(/12/);
    expect(AUDIT_TIER_COPY.advanced.facts.join(" ")).toMatch(/Web research/);
    expect(JSON.stringify(AUDIT_TIER_COPY)).not.toMatch(/Luna|Sol|GPT/i);
  });
});
