import { describe, expect, it } from "vitest";
import {
  auditHandoffPayloadSchema,
  buildAuditBriefContext,
  buildAuditCodegenPrompt,
  buildAuditDisplayPrompt,
  deriveAuditInitHints,
  extractAuditHandoffPayload,
  publicAuditHandoffView,
} from "./audit-handoff";
import type { AuditResult } from "@/types/audit";

function sampleResult(): AuditResult {
  return {
    audit_type: "website_audit",
    company: "Granit & Co",
    domain: "granit.se",
    cost: { tokens: 1, sek: 0, usd: 0 },
    audit_scores: { seo: 62, ux: 71 },
    issues: ["Svag CTA", "Ingen kontaktsektion"],
    improvements: [{ item: "Tydligare hero-CTA", impact: "high", effort: "low", why: "Konvertering" }],
    site_content: {
      company_name: "Granit & Co",
      tagline: "Sten för offentliga rum",
      description: "Vi levererar granit och natursten till kommuner.",
      industry: "Bygg",
      location: "Kalmar",
      services: ["Granitleverans", "Bokning av konsultation"],
      unique_selling_points: ["Lokal sten"],
      sections: [
        { name: "Hero", content: "Granit som håller i generationer.", type: "hero" },
        { name: "Kontakt", content: "Skicka ett formulär så hör vi av oss.", type: "contact" },
        { name: "Galleri", content: "Se våra projekt.", type: "portfolio" },
      ],
      contact: { address: "Storgatan 1, Kalmar" },
    },
    color_theme: {
      primary_color: "#4b5563",
      secondary_color: "#1f2937",
      accent_color: "#d97706",
      background_color: "#f8fafc",
      text_color: "#111827",
      theme_type: "light",
      style_description: "Kal, modern, professionell",
      design_style: "corporate",
    },
    design_direction: {
      style: "Corporate och tydlig",
      color_psychology: "Trygg och varm accent",
      ui_patterns: ["Sticky header"],
      accessibility_level: "WCAG AA",
    },
    content_strategy: {
      key_pages: ["Startsida", "Tjänster", "Kontakt"],
    },
    template_data: {
      generation_prompt: "Bygg en modern sajt för Granit & Co med originalcopy.",
      must_have_sections: ["hero", "services", "contact"],
      style_notes: "Ljus bas, varm CTA",
      improvements_to_apply: ["Starkare CTA"],
    },
    scrape_summary: {
      sampled_urls: ["https://granit.se"],
      pages_sampled: 1,
      aggregated_word_count: 200,
      headings_count: 4,
      images_count: 3,
      images: [
        { url: "https://granit.se/hero.jpg", alt: "Fasad", kind: "content" },
        { url: "https://granit.se/logo.png", alt: "Logo", kind: "logo" },
      ],
      response_time_ms: 120,
      is_js_rendered: false,
    },
  };
}

describe("auditHandoffPayloadSchema", () => {
  it("accepts the structured audit subset and rejects unknown top-level keys", () => {
    const payload = extractAuditHandoffPayload(sampleResult(), "https://granit.se");
    expect(payload.company).toBe("Granit & Co");
    expect(payload.source_images).toHaveLength(2);
    expect(auditHandoffPayloadSchema.safeParse({ ...payload, extra: true }).success).toBe(false);
  });
});

describe("buildAuditCodegenPrompt", () => {
  it("uses generation_prompt and original section text instead of a score dump", () => {
    const payload = extractAuditHandoffPayload(sampleResult(), "https://granit.se");
    const prompt = buildAuditCodegenPrompt(payload);
    expect(prompt).toContain("Bygg en modern sajt för Granit & Co med originalcopy.");
    expect(prompt).toContain("Granit som håller i generationer.");
    expect(prompt).not.toContain("=== BYGG NY SAJT BASERAD PÅ AUDIT ===");
  });
});

describe("deriveAuditInitHints", () => {
  it("derives colors, mode, pages and capability seeds", () => {
    const hints = deriveAuditInitHints(extractAuditHandoffPayload(sampleResult()));
    expect(hints.themeColors).toEqual({
      primary: "#4b5563",
      secondary: "#1f2937",
      accent: "#d97706",
    });
    expect(hints.colorModeHint).toBe("light");
    expect(hints.pageCountHint).toBe(3);
    expect(hints.requestedCapabilities).toEqual(
      expect.arrayContaining(["contact-form", "gallery-lightbox", "map-display", "booking"]),
    );
  });
});

describe("buildAuditBriefContext", () => {
  it("exposes brand, palette and seeded capabilities", () => {
    const context = buildAuditBriefContext(extractAuditHandoffPayload(sampleResult()));
    expect(context).toContain("Granit & Co");
    expect(context).toContain("#4b5563");
    expect(context).toContain("contact-form");
  });
});

describe("publicAuditHandoffView", () => {
  it("exposes only payloadKind and domain, never the payload body", () => {
    const payload = extractAuditHandoffPayload(sampleResult());
    const view = publicAuditHandoffView("audit", payload);
    expect(view).toEqual({ payloadKind: "audit", domain: "granit.se" });
    expect(JSON.stringify(view)).not.toContain("generation_prompt");
  });
});

describe("buildAuditDisplayPrompt", () => {
  it("stays a short human line", () => {
    expect(buildAuditDisplayPrompt(extractAuditHandoffPayload(sampleResult()))).toBe(
      "Bygg en förbättrad sajt för granit.se",
    );
  });
});
