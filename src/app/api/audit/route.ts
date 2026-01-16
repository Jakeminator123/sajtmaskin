/**
 * API Route: Website Audit
 * POST /api/audit - Analyze a website and return audit results
 *
 * Cost: 3 diamonds
 * Model: OpenAI Responses API + web_search (model fallbacks)
 */

import { NextRequest, NextResponse } from "next/server";
import { OpenAI } from "openai";
import { getCurrentUser } from "@/lib/auth/auth";
import {
  getUserById,
  createTransaction,
  isTestUser,
} from "@/lib/data/database";
import { SECRETS } from "@/lib/config";
import {
  scrapeWebsite,
  validateAndNormalizeUrl,
  getCanonicalUrlKey,
} from "@/lib/webscraper";
import {
  buildAuditPrompt,
  combinePromptForResponsesApi,
  extractOutputText,
  extractFirstJsonObject,
  parseJsonWithRepair,
} from "@/lib/audit-prompts";
import {
  OPENAI_MODELS,
  OPENAI_PRICING_USD_PER_MTOK,
} from "@/lib/ai/openai-models";
import type { AuditResult, AuditRequest } from "@/types/audit";

// Extend timeout for long-running AI calls
export const maxDuration = 300; // 5 minutes

// Audit cost in diamonds
const AUDIT_COST = 3;

// ═══════════════════════════════════════════════════════════════════════════
// IN-FLIGHT AUDIT TRACKING - prevents duplicate concurrent requests
// ═══════════════════════════════════════════════════════════════════════════

type InFlightAudit = {
  startTime: number;
  userId: string;
  promise: Promise<AuditResult>;
};

// Track audits currently in progress (per canonical URL)
const inFlightAudits = new Map<string, InFlightAudit>();

// Cleanup stale entries after 10 minutes (safety net)
const IN_FLIGHT_MAX_AGE_MS = 10 * 60 * 1000;

function cleanupStaleInFlightAudits() {
  const now = Date.now();
  for (const [key, audit] of inFlightAudits.entries()) {
    if (now - audit.startTime > IN_FLIGHT_MAX_AGE_MS) {
      inFlightAudits.delete(key);
    }
  }
}

// Run cleanup periodically (on each request, cheap operation)
setInterval(cleanupStaleInFlightAudits, 60 * 1000);

// ═══════════════════════════════════════════════════════════════════════════

// Model configuration (fallback chain)
const AUDIT_MODEL_CANDIDATES = [
  OPENAI_MODELS.audit.primary,
  ...OPENAI_MODELS.audit.fallbacks,
] as const;

// Structured output schema for the AI portion of the audit.
// NOTE: We add audit_type/domain/timestamp/cost on the server after parsing.
const AUDIT_AI_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    company: { type: "string" },
    audit_scores: {
      type: "object",
      additionalProperties: false,
      properties: {
        seo: { type: "number" },
        technical_seo: { type: "number" },
        ux: { type: "number" },
        content: { type: "number" },
        performance: { type: "number" },
        accessibility: { type: "number" },
        security: { type: "number" },
        mobile: { type: "number" },
      },
      required: [
        "seo",
        "technical_seo",
        "ux",
        "content",
        "performance",
        "accessibility",
        "security",
        "mobile",
      ],
    },
    strengths: { type: "array", items: { type: "string" } },
    issues: { type: "array", items: { type: "string" } },
    improvements: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          item: { type: "string" },
          impact: { type: "string", enum: ["high", "medium", "low"] },
          effort: { type: "string", enum: ["low", "medium", "high"] },
          why: { type: "string" },
          how: { type: "string" },
          estimated_time: { type: "string" },
          technologies: { type: "array", items: { type: "string" } },
          code_example: { type: "string" },
          category: {
            type: "string",
            enum: ["UX", "Tech", "Content", "Marketing", "Security"],
          },
        },
        required: [
          "item",
          "impact",
          "effort",
          "why",
          "how",
          "estimated_time",
          "technologies",
          "code_example",
          "category",
        ],
      },
    },
    budget_estimate: {
      type: "object",
      additionalProperties: false,
      properties: {
        immediate_fixes: {
          type: "object",
          additionalProperties: false,
          properties: { low: { type: "number" }, high: { type: "number" } },
          required: ["low", "high"],
        },
        full_optimization: {
          type: "object",
          additionalProperties: false,
          properties: { low: { type: "number" }, high: { type: "number" } },
          required: ["low", "high"],
        },
        currency: { type: "string" },
        payment_structure: { type: "string" },
      },
      required: [
        "immediate_fixes",
        "full_optimization",
        "currency",
        "payment_structure",
      ],
    },
    expected_outcomes: { type: "array", items: { type: "string" } },
    security_analysis: {
      type: "object",
      additionalProperties: false,
      properties: {
        https_status: { type: "string" },
        headers_analysis: { type: "string" },
        cookie_policy: { type: "string" },
        vulnerabilities: { type: "array", items: { type: "string" } },
      },
      required: [
        "https_status",
        "headers_analysis",
        "cookie_policy",
        "vulnerabilities",
      ],
    },
    competitor_insights: {
      type: "object",
      additionalProperties: false,
      properties: {
        industry_standards: { type: "string" },
        missing_features: { type: "string" },
        unique_strengths: { type: "string" },
      },
      required: ["industry_standards", "missing_features", "unique_strengths"],
    },
    technical_recommendations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          area: { type: "string" },
          current_state: { type: "string" },
          recommendation: { type: "string" },
          implementation: { type: "string" },
        },
        required: ["area", "current_state", "recommendation", "implementation"],
      },
    },
    // Keep advanced sections optional (the model should still fill them when possible)
    competitor_benchmarking: {
      type: "object",
      additionalProperties: false,
      properties: {
        industry_leaders: { type: "array", items: { type: "string" } },
        common_features: { type: "array", items: { type: "string" } },
        differentiation_opportunities: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: [
        "industry_leaders",
        "common_features",
        "differentiation_opportunities",
      ],
    },
    target_audience_analysis: {
      type: "object",
      additionalProperties: false,
      properties: {
        demographics: { type: "string" },
        behaviors: { type: "string" },
        pain_points: { type: "string" },
        expectations: { type: "string" },
      },
      required: ["demographics", "behaviors", "pain_points", "expectations"],
    },
    content_strategy: {
      type: "object",
      additionalProperties: false,
      properties: {
        key_pages: { type: "array", items: { type: "string" } },
        content_types: { type: "array", items: { type: "string" } },
        seo_foundation: { type: "string" },
        conversion_paths: { type: "array", items: { type: "string" } },
      },
      required: [
        "key_pages",
        "content_types",
        "seo_foundation",
        "conversion_paths",
      ],
    },
    design_direction: {
      type: "object",
      additionalProperties: false,
      properties: {
        style: { type: "string" },
        color_psychology: { type: "string" },
        ui_patterns: { type: "array", items: { type: "string" } },
        accessibility_level: { type: "string" },
      },
      required: [
        "style",
        "color_psychology",
        "ui_patterns",
        "accessibility_level",
      ],
    },
    technical_architecture: {
      type: "object",
      additionalProperties: false,
      properties: {
        recommended_stack: {
          type: "object",
          additionalProperties: false,
          properties: {
            frontend: { type: "string" },
            backend: { type: "string" },
            cms: { type: "string" },
            hosting: { type: "string" },
          },
          required: ["frontend", "backend", "cms", "hosting"],
        },
        integrations: { type: "array", items: { type: "string" } },
        security_measures: { type: "array", items: { type: "string" } },
      },
      required: ["recommended_stack", "integrations", "security_measures"],
    },
    priority_matrix: {
      type: "object",
      additionalProperties: false,
      properties: {
        quick_wins: { type: "array", items: { type: "string" } },
        major_projects: { type: "array", items: { type: "string" } },
        fill_ins: { type: "array", items: { type: "string" } },
        thankless_tasks: { type: "array", items: { type: "string" } },
      },
      required: ["quick_wins", "major_projects", "fill_ins", "thankless_tasks"],
    },
    implementation_roadmap: {
      type: "object",
      additionalProperties: false,
      properties: {
        phase_1: {
          type: "object",
          additionalProperties: false,
          properties: {
            duration: { type: "string" },
            deliverables: { type: "array", items: { type: "string" } },
            activities: { type: "array", items: { type: "string" } },
          },
          required: ["duration", "deliverables", "activities"],
        },
        phase_2: {
          type: "object",
          additionalProperties: false,
          properties: {
            duration: { type: "string" },
            deliverables: { type: "array", items: { type: "string" } },
            activities: { type: "array", items: { type: "string" } },
          },
          required: ["duration", "deliverables", "activities"],
        },
        phase_3: {
          type: "object",
          additionalProperties: false,
          properties: {
            duration: { type: "string" },
            deliverables: { type: "array", items: { type: "string" } },
            activities: { type: "array", items: { type: "string" } },
          },
          required: ["duration", "deliverables", "activities"],
        },
        launch: {
          type: "object",
          additionalProperties: false,
          properties: {
            duration: { type: "string" },
            deliverables: { type: "array", items: { type: "string" } },
            activities: { type: "array", items: { type: "string" } },
          },
          required: ["duration", "deliverables", "activities"],
        },
      },
      required: ["phase_1", "phase_2", "phase_3", "launch"],
    },
    success_metrics: {
      type: "object",
      additionalProperties: false,
      properties: {
        kpis: { type: "array", items: { type: "string" } },
        tracking_setup: { type: "string" },
        review_schedule: { type: "string" },
      },
      required: ["kpis", "tracking_setup", "review_schedule"],
    },
    site_content: {
      type: "object",
      additionalProperties: false,
      properties: {
        company_name: { type: "string" },
        tagline: { type: "string" },
        description: { type: "string" },
        industry: { type: "string" },
        location: { type: "string" },
        services: { type: "array", items: { type: "string" } },
        products: { type: "array", items: { type: "string" } },
        unique_selling_points: { type: "array", items: { type: "string" } },
        sections: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string" },
              content: { type: "string" },
              type: {
                type: "string",
                enum: [
                  "hero",
                  "services",
                  "about",
                  "contact",
                  "testimonials",
                  "portfolio",
                  "pricing",
                  "faq",
                  "team",
                  "cta",
                  "footer",
                  "other",
                ],
              },
            },
            required: ["name", "content", "type"],
          },
        },
        ctas: { type: "array", items: { type: "string" } },
        contact: {
          type: "object",
          additionalProperties: false,
          properties: {
            email: { type: "string" },
            phone: { type: "string" },
            address: { type: "string" },
            social_links: { type: "array", items: { type: "string" } },
          },
          required: ["email", "phone", "address", "social_links"],
        },
      },
      required: [
        "company_name",
        "tagline",
        "description",
        "industry",
        "location",
        "services",
        "products",
        "unique_selling_points",
        "sections",
        "ctas",
        "contact",
      ],
    },
    color_theme: {
      type: "object",
      additionalProperties: false,
      properties: {
        primary_color: { type: "string" },
        secondary_color: { type: "string" },
        accent_color: { type: "string" },
        background_color: { type: "string" },
        text_color: { type: "string" },
        theme_type: { type: "string", enum: ["light", "dark", "mixed"] },
        style_description: { type: "string" },
        design_style: {
          type: "string",
          enum: [
            "minimalist",
            "bold",
            "playful",
            "corporate",
            "creative",
            "elegant",
            "tech",
            "organic",
          ],
        },
        typography_style: { type: "string" },
      },
      required: [
        "primary_color",
        "secondary_color",
        "accent_color",
        "background_color",
        "text_color",
        "theme_type",
        "style_description",
        "design_style",
        "typography_style",
      ],
    },
    template_data: {
      type: "object",
      additionalProperties: false,
      properties: {
        generation_prompt: { type: "string" },
        must_have_sections: { type: "array", items: { type: "string" } },
        style_notes: { type: "string" },
        improvements_to_apply: { type: "array", items: { type: "string" } },
      },
      required: [
        "generation_prompt",
        "must_have_sections",
        "style_notes",
        "improvements_to_apply",
      ],
    },
  },
  required: [
    "company",
    "audit_scores",
    "strengths",
    "issues",
    "improvements",
    "budget_estimate",
    "expected_outcomes",
    "security_analysis",
    "competitor_insights",
    "technical_recommendations",
    "competitor_benchmarking",
    "target_audience_analysis",
    "content_strategy",
    "design_direction",
    "technical_architecture",
    "priority_matrix",
    "implementation_roadmap",
    "success_metrics",
    "site_content",
    "color_theme",
    "template_data",
  ],
} as const;

const AUDIT_TEXT_FORMAT = {
  type: "json_schema",
  name: "website_audit_v1",
  strict: true,
  schema: AUDIT_AI_SCHEMA,
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// SCHEMA SANITY CHECK - runs at module load to catch schema errors early
// ═══════════════════════════════════════════════════════════════════════════

type JsonSchemaObject = {
  type?: string;
  properties?: Record<string, JsonSchemaObject>;
  items?: JsonSchemaObject;
  required?: readonly string[];
  additionalProperties?: boolean;
  enum?: readonly unknown[];
};

/**
 * Validates that a JSON Schema with strict:true has all properties listed in required.
 * OpenAI's strict mode requires ALL properties to be in required array.
 */
function validateStrictSchema(
  schema: JsonSchemaObject,
  path: string = "root"
): string[] {
  const errors: string[] = [];

  if (schema.type === "object" && schema.properties) {
    const propKeys = Object.keys(schema.properties);
    const requiredKeys = schema.required ? [...schema.required] : [];

    // OpenAI strict mode requires ALL properties to be listed in required
    // when additionalProperties is false.
    if (schema.additionalProperties === false) {
      const missingRequired = propKeys.filter((k) => !requiredKeys.includes(k));
      if (missingRequired.length > 0) {
        errors.push(
          `${path}: required must include all properties. Missing: [${missingRequired.join(
            ", "
          )}]`
        );
      }
    }

    // Check for required keys that don't exist in properties
    const extraRequired = requiredKeys.filter((k) => !propKeys.includes(k));
    if (extraRequired.length > 0) {
      errors.push(
        `${path}: required contains keys not in properties: [${extraRequired.join(
          ", "
        )}]`
      );
    }

    // Recursively validate nested objects
    for (const [key, value] of Object.entries(schema.properties)) {
      if (value && typeof value === "object") {
        errors.push(...validateStrictSchema(value, `${path}.${key}`));
      }
    }
  }

  // Validate array items
  if (schema.type === "array" && schema.items) {
    errors.push(...validateStrictSchema(schema.items, `${path}[]`));
  }

  return errors;
}

// Run schema validation at module load (fails fast in dev)
const schemaErrors = validateStrictSchema(AUDIT_AI_SCHEMA);
if (schemaErrors.length > 0) {
  const errorMsg = `[AUDIT SCHEMA ERROR] Invalid JSON schema configuration:\n${schemaErrors.join(
    "\n"
  )}`;
  console.error(errorMsg);
  // In development, throw to fail fast. In production, log but continue.
  if (process.env.NODE_ENV === "development") {
    throw new Error(errorMsg);
  }
}

// ═══════════════════════════════════════════════════════════════════════════

// Cost calculation (for logging/display only)
const USD_TO_SEK = 11.0;

// Initialize OpenAI client lazily
function getOpenAIClient(): OpenAI {
  const apiKey = SECRETS.openaiApiKey;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  return new OpenAI({
    apiKey,
    timeout: 300000, // 5 minute timeout
    maxRetries: 2,
  });
}

// Create a fallback result when AI response is invalid
function createFallbackResult(
  websiteContent: {
    title: string;
    description: string;
    wordCount: number;
    hasSSL: boolean;
    headings: string[];
    meta: { viewport?: string; keywords?: string };
    links: { internal: number; external: number };
    images: number;
    responseTime: number;
  },
  url: string
): Record<string, unknown> {
  const domain = new URL(url).hostname;
  const isJsRendered = websiteContent.wordCount < 50;
  const companyName = websiteContent.title || domain;

  return {
    company: companyName,
    audit_scores: {
      seo: websiteContent.description ? 50 : 30,
      technical_seo: websiteContent.hasSSL ? 60 : 30,
      ux: 50,
      content: isJsRendered ? 40 : websiteContent.wordCount > 200 ? 60 : 40,
      performance: websiteContent.responseTime < 2000 ? 60 : 40,
      accessibility: websiteContent.meta.viewport ? 50 : 30,
      security: websiteContent.hasSSL ? 60 : 20,
      mobile: websiteContent.meta.viewport ? 60 : 30,
    },
    strengths: [
      websiteContent.hasSSL ? "Använder HTTPS/SSL" : null,
      websiteContent.meta.viewport ? "Har viewport meta-tagg för mobil" : null,
      websiteContent.headings.length > 0
        ? `Har ${websiteContent.headings.length} rubriker för struktur`
        : null,
    ].filter(Boolean),
    issues: [
      !websiteContent.hasSSL
        ? "Saknar HTTPS/SSL - kritiskt säkerhetsproblem"
        : null,
      !websiteContent.description ? "Saknar meta-beskrivning för SEO" : null,
      !websiteContent.meta.viewport
        ? "Saknar viewport meta-tagg - mobilproblem"
        : null,
      isJsRendered
        ? "Sidan verkar vara JavaScript-renderad vilket kan påverka SEO negativt"
        : null,
      websiteContent.wordCount < 100
        ? "Mycket lite textinnehåll på sidan"
        : null,
    ].filter(Boolean),
    improvements: [
      {
        item: "Grundläggande SEO-optimering",
        impact: "high",
        effort: "low",
        why: "Förbättrar synlighet i sökmotorer och ökar relevant trafik.",
        how: "Säkerställ unika titles/description, korrekt rubrikhierarki (H1→H2), interna länkar och strukturerad data (JSON-LD).",
        estimated_time: "1-2 dagar",
        technologies: ["HTML", "Metadata", "Structured Data"],
        code_example: "",
        category: "Marketing",
      },
      {
        item: "Förbättra innehåll och värdeerbjudande",
        impact: "high",
        effort: "medium",
        why: "Tydlig copy och struktur ökar konvertering och minskar bounce rate.",
        how: "Skriv en tydlig hero (vad ni gör + för vem + resultat), lägg in 3–6 USP:ar, social proof (logos/case) och en tydlig CTA (t.ex. boka demo/kontakt).",
        estimated_time: "1-3 dagar",
        technologies: ["Copywriting", "UX"],
        code_example: "",
        category: "Content",
      },
      {
        item: "Optimera prestanda (Core Web Vitals)",
        impact: "high",
        effort: "medium",
        why: "Bättre laddtid förbättrar UX, SEO och konvertering.",
        how: "Komprimera bilder, använd lazy-loading, dela upp JS, cachea API-svar, minska onödiga scripts och mät med Lighthouse/PageSpeed.",
        estimated_time: "2-5 dagar",
        technologies: ["Core Web Vitals", "Caching", "Images"],
        code_example: "",
        category: "Tech",
      },
      {
        item: "Tillgänglighet (WCAG AA) och semantik",
        impact: "medium",
        effort: "low",
        why: "Tillgänglighet ger bättre UX och minskar juridisk risk.",
        how: "Säkerställ kontraster, fokus-stilar, semantiska element, alt-texter, korrekt tab-ordning och labels på formulär.",
        estimated_time: "1-2 dagar",
        technologies: ["WCAG", "HTML"],
        code_example: "",
        category: "UX",
      },
      {
        item: "Konverteringsflöde och CTA-strategi",
        impact: "high",
        effort: "low",
        why: "En tydlig CTA och friktionfri väg till kontakt ökar leads.",
        how: "Lägg CTA i header, hero och minst ett mid-page CTA-block. Lägg in kontaktformulär med få fält + kalenderlänk om relevant.",
        estimated_time: "0.5-1 dag",
        technologies: ["UX", "Forms"],
        code_example: "",
        category: "Marketing",
      },
      {
        item: "Säkerhetsbaslinje: HTTPS, headers och cookies",
        impact: "high",
        effort: "low",
        why: "Säkerhet påverkar trust, SEO och regelefterlevnad.",
        how: "Aktivera HTTPS överallt, lägg HSTS, säkra cookies, och säkerställ tydlig cookie-banner + policy (GDPR).",
        estimated_time: "0.5-1 dag",
        technologies: ["HTTPS", "Security Headers"],
        code_example: "",
        category: "Security",
      },
      {
        item: "Spårning och mätplan (GA4 + events)",
        impact: "medium",
        effort: "low",
        why: "Utan mätning blir förbättringar gissningar.",
        how: "Sätt upp GA4, definiera events (CTA-klick, formulär-submit, scroll-depth), och bygg en enkel dashboard för KPI:er.",
        estimated_time: "0.5-1 dag",
        technologies: ["GA4", "Analytics"],
        code_example: "",
        category: "Marketing",
      },
      {
        item: "Teknisk granskning för JS-renderade sidor",
        impact: "medium",
        effort: "medium",
        why: "JS-rendering kan göra att innehåll inte indexeras optimalt och att scraping missar kritisk copy.",
        how: "Verifiera SSR/SSG för viktiga sidor, generera sitemap/metadata server-side, och säkra att kritisk copy finns i initial HTML.",
        estimated_time: "1-3 dagar",
        technologies: ["SSR", "Sitemap", "Metadata"],
        code_example: "",
        category: "Tech",
      },
    ],
    budget_estimate: {
      immediate_fixes: { low: 15000, high: 35000 },
      full_optimization: { low: 60000, high: 180000 },
      currency: "SEK",
      payment_structure: "Fast pris (paket) eller löpande (konsult).",
    },
    expected_outcomes: [
      "Öka organisk trafik med 10–30% inom 3–6 månader (beroende på konkurrens).",
      "Högre konvertering via tydligare CTA och bättre informationshierarki (+5–20%).",
      "Bättre Core Web Vitals vilket ofta ger både SEO- och UX-lyft.",
      "Ökad trust genom social proof, tydligare erbjudande och förbättrad säkerhetsbaslinje.",
    ],
    security_analysis: {
      https_status: websiteContent.hasSSL
        ? "OK (HTTPS)"
        : "Problem (saknar HTTPS)",
      headers_analysis:
        "Okänt i fallback-läge. Rekommenderar att verifiera HSTS, CSP, X-Content-Type-Options och Referrer-Policy.",
      cookie_policy:
        "Okänt i fallback-läge. Rekommenderar att granska cookie-banner, lagring och policy (GDPR).",
      vulnerabilities: [
        !websiteContent.hasSSL
          ? "Saknar HTTPS (risk för avlyssning och sänkt trust)."
          : "Verifiera säkerhetshuvuden och cookie-flaggor.",
        "Säkerställ att tredjepartsscripts är minimala och uppdaterade.",
      ].filter(Boolean),
    },
    competitor_insights: {
      industry_standards:
        "Standard är tydlig hero med värdeerbjudande, social proof, tydliga sektioner (tjänster/case), och en stark CTA.",
      missing_features:
        "Vanliga luckor: tydlig CTA-resa, social proof (case/logos), FAQ, och tydliga landningssidor per tjänst/segment.",
      unique_strengths:
        "Bygg vidare på varumärkets tonalitet och differentiera med konkreta resultat, process och tydlig positionering.",
    },
    technical_recommendations: [
      {
        area: "Performance",
        current_state:
          websiteContent.responseTime < 2000
            ? "Serverns svarstid verkar OK."
            : "Serverns svarstid verkar hög.",
        recommendation:
          "Optimera bundling, minska scripts, komprimera bilder och inför caching.",
        implementation:
          "Next.js: använd Image-optimering, dynamiska imports, och cache headers för statiska resurser.",
      },
      {
        area: "SEO",
        current_state: websiteContent.description
          ? "Meta-beskrivning finns (kontrollera kvalitet/unikhet)."
          : "Meta-beskrivning saknas eller kunde inte hittas.",
        recommendation:
          "Säkerställ metadata per sida, korrekt rubrikhierarki och sitemap.xml.",
        implementation:
          "Next.js metadata API + generera sitemap/robots + JSON-LD för organisation/tjänster.",
      },
      {
        area: "Accessibility",
        current_state: websiteContent.meta.viewport
          ? "Viewport finns (bra för mobil)."
          : "Viewport saknas (mobilrisk).",
        recommendation:
          "Säkerställ kontraster, fokus, semantik och label/alt-texter.",
        implementation:
          "Inför WCAG-check i CI, använd semantiska komponenter och testa med skärmläsare.",
      },
      {
        area: "Security",
        current_state: websiteContent.hasSSL
          ? "HTTPS används."
          : "HTTPS saknas.",
        recommendation:
          "Inför säkerhetshuvuden och säkra cookies. Minimera tredjepartsberoenden.",
        implementation:
          "Sätt HSTS, CSP och SameSite/HttpOnly/Secure på cookies där det är relevant.",
      },
    ],
    competitor_benchmarking: {
      industry_leaders: [
        "Branschledare med stark SEO och tydlig positionering",
      ],
      common_features: [
        "Tydligt värdeerbjudande",
        "Snabba laddtider",
        "Social proof (case/logos)",
      ],
      differentiation_opportunities: [
        "Tydligare nischpositionering",
        "Mer konkret affärsnytta i copy",
      ],
    },
    target_audience_analysis: {
      demographics:
        "Okänt i fallback-läge. Utgå från att besökare är beslutsfattare och stakeholders som vill förstå värde snabbt.",
      behaviors:
        "Skummar hero och sektioner efter proof (case/logos), vill se erbjudande, process och en enkel väg till kontakt/demo.",
      pain_points:
        "Otydligt erbjudande, svag trust, för mycket friktion till kontakt, och lång laddtid på mobil.",
      expectations:
        "Snabb, modern, mobilförst, tydliga CTA:er, konkreta resultat och enkel navigering.",
    },
    content_strategy: {
      key_pages: ["Startsida", "Tjänster", "Case/Portfolio", "Kontakt"],
      content_types: ["Kort copy", "Case studies", "FAQ", "CTA-sektioner"],
      seo_foundation:
        "Fokusera på tjänstesidor med tydliga sökordscluster och intern länkning.",
      conversion_paths: ["Hero CTA → Kontaktformulär", "Case → Kontakt"],
    },
    design_direction: {
      style:
        "Modern, professionell och tydligt strukturerad (product/tech-känsla).",
      color_psychology:
        "Använd en tydlig primär accent för CTA och behåll neutral bas för läsbarhet.",
      ui_patterns: [
        "Sticky header med CTA",
        "Hero med primär + sekundär CTA",
        "Social proof (logos/case)",
        "Feature/benefit cards",
        "FAQ + kontaktsektion",
      ],
      accessibility_level: "WCAG 2.1 AA",
    },
    technical_architecture: {
      recommended_stack: {
        frontend: "Next.js",
        backend: "Node.js",
        cms: "Headless CMS",
        hosting: "Vercel",
      },
      integrations: ["Analytics", "CRM", "Email"],
      security_measures: ["HTTPS", "CSP", "HSTS"],
    },
    priority_matrix: {
      quick_wins: ["Tydlig CTA", "Meta-beskrivningar", "Fokusstilar"],
      major_projects: ["Omstrukturera tjänstesidor", "Casebibliotek"],
      fill_ins: ["FAQ", "Team/om oss"],
      thankless_tasks: ["Cookie-policy och compliance"],
    },
    implementation_roadmap: {
      phase_1: {
        duration: "1-2 veckor",
        deliverables: ["Copy-uppdatering", "CTA-struktur"],
        activities: ["Inventera copy", "Uppdatera hero + tjänstesidor"],
      },
      phase_2: {
        duration: "2-4 veckor",
        deliverables: ["Nya sektioner", "SEO-grund"],
        activities: ["Bygga case/FAQ", "Metadata och sitemap"],
      },
      phase_3: {
        duration: "4-6 veckor",
        deliverables: ["Prestandaoptimering", "A11y"],
        activities: ["Core Web Vitals", "Tillgänglighetsfixar"],
      },
      launch: {
        duration: "1 vecka",
        deliverables: ["Lansering", "Tracking"],
        activities: ["QA", "GA4 events", "Sitemap submit"],
      },
    },
    success_metrics: {
      kpis: ["Organisk trafik", "Konvertering", "CTA-klick"],
      tracking_setup: "GA4 + events + enkel dashboard",
      review_schedule: "Månadsvis uppföljning",
    },
    // Minimal site_content based on scraped data
    site_content: {
      company_name: companyName,
      tagline: websiteContent.description || "",
      description:
        websiteContent.description ||
        "Beskrivning kunde inte extraheras automatiskt",
      industry: "Okänd",
      location: "",
      services: [],
      products: [],
      unique_selling_points: [],
      sections: websiteContent.headings.slice(0, 5).map((heading, i) => ({
        name: heading,
        content: heading,
        type: i === 0 ? "hero" : "other",
      })),
      ctas: [],
      contact: {
        email: "",
        phone: "",
        address: "",
        social_links: [],
      },
    },
    // Default color theme (dark theme as placeholder)
    color_theme: {
      primary_color: "#3b82f6",
      secondary_color: "#1e40af",
      accent_color: "#22c55e",
      background_color: "#0f172a",
      text_color: "#f8fafc",
      theme_type: "dark",
      style_description:
        "Färgtema kunde inte extraheras - standardvärden används",
      design_style: "minimalist",
      typography_style: "Sans-serif, modern",
    },
    // Basic template data
    template_data: {
      generation_prompt: `Skapa en modern webbplats för ${companyName}. ${
        websiteContent.description
          ? `Beskrivning: ${websiteContent.description}.`
          : ""
      } Använd en minimalistisk design med mörkt tema. Inkludera hero-sektion, om oss, tjänster och kontakt.`,
      must_have_sections: ["hero", "about", "services", "contact"],
      style_notes: "Minimalistisk design, mörkt tema, modern typografi",
      improvements_to_apply: [
        "Tydligare värdeerbjudande i hero-sektionen",
        "Bättre call-to-actions",
        "Optimerad mobilvy",
      ],
    },
    _fallback: true,
    _fallback_reason: isJsRendered
      ? "Sidan är JavaScript-renderad och kunde inte analyseras fullt ut"
      : "AI-analysen returnerade inte giltigt resultat",
  };
}

// Validate audit result structure (lenient - accept partial results)
function validateAuditResult(result: unknown): result is AuditResult {
  if (!result || typeof result !== "object") return false;

  const r = result as Record<string, unknown>;

  // Accept if we have ANY of these fields with meaningful content
  const hasCompany =
    typeof r.company === "string" && r.company.trim().length > 0;
  const hasImprovements =
    Array.isArray(r.improvements) && r.improvements.length > 0;
  const hasScores = Boolean(
    r.audit_scores && typeof r.audit_scores === "object"
  );
  const hasStrengths = Array.isArray(r.strengths) && r.strengths.length > 0;
  const hasIssues = Array.isArray(r.issues) && r.issues.length > 0;
  const hasBudget = Boolean(
    r.budget_estimate && typeof r.budget_estimate === "object"
  );
  const hasSecurity = Boolean(
    r.security_analysis && typeof r.security_analysis === "object"
  );
  const hasTechRecs = Array.isArray(r.technical_recommendations);
  const hasSiteContent = Boolean(
    r.site_content && typeof r.site_content === "object"
  );
  const hasColorTheme = Boolean(
    r.color_theme && typeof r.color_theme === "object"
  );
  const hasTemplateData = Boolean(
    r.template_data && typeof r.template_data === "object"
  );

  // Very lenient - just needs to be an object with at least one key
  const hasAnyContent = Object.keys(r).length > 0;

  // Must have content AND at least one useful field
  const hasUsefulField =
    hasCompany ||
    hasImprovements ||
    hasScores ||
    hasStrengths ||
    hasIssues ||
    hasBudget ||
    hasSecurity ||
    hasTechRecs ||
    hasSiteContent ||
    hasColorTheme ||
    hasTemplateData;

  return hasAnyContent && hasUsefulField;
}

function countWordsFromText(value: string): number {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return 0;
  return normalized.split(" ").length;
}

function countWordsFromList(values?: Array<string | null | undefined>): number {
  if (!values || values.length === 0) return 0;
  return values.reduce((sum, item) => {
    if (!item) return sum;
    return sum + countWordsFromText(item);
  }, 0);
}

function estimateWordCountFromSiteContent(
  siteContent?: AuditResult["site_content"]
): number {
  if (!siteContent) return 0;

  let count = 0;
  count += countWordsFromText(siteContent.company_name || "");
  count += countWordsFromText(siteContent.tagline || "");
  count += countWordsFromText(siteContent.description || "");
  count += countWordsFromText(siteContent.industry || "");
  count += countWordsFromText(siteContent.location || "");
  count += countWordsFromList(siteContent.services);
  count += countWordsFromList(siteContent.products);
  count += countWordsFromList(siteContent.unique_selling_points);
  count += countWordsFromList(siteContent.ctas);

  if (Array.isArray(siteContent.sections)) {
    for (const section of siteContent.sections) {
      count += countWordsFromText(section.name || "");
      count += countWordsFromText(section.content || "");
    }
  }

  if (siteContent.contact) {
    count += countWordsFromList([
      siteContent.contact.email,
      siteContent.contact.phone,
      siteContent.contact.address,
    ]);
    count += countWordsFromList(siteContent.contact.social_links);
  }

  return count;
}

function getPricingForModel(model: string): { input: number; output: number } {
  // Default to the primary audit model pricing if unknown.
  return (
    OPENAI_PRICING_USD_PER_MTOK[model] ||
    OPENAI_PRICING_USD_PER_MTOK[OPENAI_MODELS.audit.primary] || {
      input: 0,
      output: 0,
    }
  );
}

function shouldFallbackToNextModel(err: unknown): boolean {
  const e = err as { status?: number; code?: string; message?: string };
  const status = typeof e?.status === "number" ? e.status : undefined;
  const code = typeof e?.code === "string" ? e.code : undefined;
  const message = typeof e?.message === "string" ? e.message : "";

  // Never fallback on auth/key issues.
  if (status === 401 || code === "invalid_api_key") return false;

  // Model availability / selection issues.
  if (code === "model_not_found") return true;
  if (status === 404 && message.toLowerCase().includes("model")) return true;
  if (
    message.toLowerCase().includes("model") &&
    message.toLowerCase().includes("not found")
  )
    return true;

  // Tool support mismatches (web_search not supported for a given model/variant).
  if (
    message.toLowerCase().includes("web_search") &&
    (message.toLowerCase().includes("not supported") ||
      message.toLowerCase().includes("unsupported") ||
      message.toLowerCase().includes("doesn't support"))
  ) {
    return true;
  }

  return false;
}

export async function POST(request: NextRequest) {
  const requestId = `audit_${Date.now()}_${Math.random()
    .toString(36)
    .substring(7)}`;
  const requestStartTime = Date.now();

  // Track in-flight key for cleanup (set after user auth succeeds)
  let inFlightKey: string | null = null;

  try {
    // Parse request body
    let body: AuditRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Ogiltig JSON i förfrågan" },
        { status: 400 }
      );
    }

    const { url } = body;

    // Validate URL
    let normalizedUrl: string;
    try {
      normalizedUrl = validateAndNormalizeUrl(url);
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Ogiltig URL. Ange en giltig webbadress.",
        },
        { status: 400 }
      );
    }

    console.log(`[${requestId}] Audit request for: ${normalizedUrl}`);

    // Get canonical key for duplicate detection
    const canonicalKey = getCanonicalUrlKey(normalizedUrl);

    // Check authentication and credits
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "Du måste vara inloggad för att använda audit-funktionen.",
          requiresAuth: true,
        },
        { status: 401 }
      );
    }

    // Get fresh user data from database
    const dbUser = getUserById(user.id);
    if (!dbUser) {
      return NextResponse.json(
        { success: false, error: "Användare hittades inte." },
        { status: 404 }
      );
    }

    // Check if user has enough diamonds (test users have unlimited)
    const isTest = isTestUser(dbUser);
    if (!isTest && dbUser.diamonds < AUDIT_COST) {
      return NextResponse.json(
        {
          success: false,
          error: `Du behöver minst ${AUDIT_COST} diamanter för att köra en audit. Du har ${dbUser.diamonds} diamanter.`,
          insufficientCredits: true,
          required: AUDIT_COST,
          current: dbUser.diamonds,
        },
        { status: 402 }
      );
    }

    console.log(
      `[${requestId}] User ${user.id} has ${dbUser.diamonds} diamonds (test: ${isTest})`
    );

    // Check for duplicate in-flight audit (same user + URL)
    inFlightKey = `${user.id}:${canonicalKey}`;
    const existingAudit = inFlightAudits.get(inFlightKey);
    if (existingAudit) {
      const ageMs = Date.now() - existingAudit.startTime;
      console.log(
        `[${requestId}] Duplicate audit request detected (in-flight for ${Math.round(
          ageMs / 1000
        )}s)`
      );
      // Return 409 Conflict to indicate a duplicate request
      return NextResponse.json(
        {
          success: false,
          error: `En audit för denna URL pågår redan. Vänta tills den är klar (startat för ${Math.round(
            ageMs / 1000
          )} sekunder sedan).`,
          duplicate: true,
        },
        { status: 409 }
      );
    }

    // Mark this audit as in-flight (will be cleaned up in finally block)
    // We use a placeholder promise here - actual result tracking would require refactoring
    inFlightAudits.set(inFlightKey, {
      startTime: Date.now(),
      userId: user.id,
      promise: Promise.resolve({} as AuditResult), // Placeholder
    });

    // Scrape website content
    console.log(`[${requestId}] Scraping website...`);
    let websiteContent;
    try {
      websiteContent = await scrapeWebsite(normalizedUrl);
      console.log(`[${requestId}] Scraping completed:`, {
        title: websiteContent.title?.substring(0, 50),
        wordCount: websiteContent.wordCount,
        headingsCount: websiteContent.headings.length,
        pagesSampled: websiteContent.sampledUrls?.length || 1,
      });
    } catch (error) {
      console.error(`[${requestId}] Scraping failed:`, error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Kunde inte hämta hemsidan. Kontrollera URL:en och försök igen.";

      // Return appropriate status code based on error type
      let statusCode = 400;
      if (errorMessage.includes("403") || errorMessage.includes("Forbidden")) {
        statusCode = 403;
      } else if (
        errorMessage.includes("401") ||
        errorMessage.includes("Unauthorized")
      ) {
        statusCode = 401;
      } else if (
        errorMessage.includes("404") ||
        errorMessage.includes("Not Found")
      ) {
        statusCode = 404;
      } else if (errorMessage.includes("Timeout")) {
        statusCode = 408;
      } else if (
        errorMessage.includes("Serverfel") ||
        errorMessage.includes("50")
      ) {
        statusCode = 502;
      }

      return NextResponse.json(
        {
          success: false,
          error: errorMessage,
        },
        { status: statusCode }
      );
    }

    const isJsRendered = websiteContent.wordCount < 50;

    // Build prompt
    const prompt = buildAuditPrompt(websiteContent, normalizedUrl);
    const { input, instructions } = combinePromptForResponsesApi(prompt);

    // Call OpenAI Responses API with WebSearch
    console.log(`[${requestId}] Calling OpenAI Responses API (web_search)`);

    let response;
    let usedModel: string | undefined;
    let lastError: unknown;
    let webSearchCallCount = 0;

    const baseRequest = {
      input,
      instructions: instructions || undefined,
      max_output_tokens: 16000,
      tools: [{ type: "web_search" }] as Array<{ type: "web_search" }>,
      // For JS-rendered pages, require at least one web_search tool call.
      ...(isJsRendered ? { tool_choice: "required" as const } : {}),
      text: { format: AUDIT_TEXT_FORMAT },
      // Don't store user content on OpenAI side
      store: false,
    };

    for (const model of AUDIT_MODEL_CANDIDATES) {
      try {
        console.log(`[${requestId}] Trying model: ${model}`);
        response = await getOpenAIClient().responses.create(
          {
            model,
            ...baseRequest,
          },
          {
            timeout: 300000,
          }
        );
        usedModel = model;
        break;
      } catch (apiError: unknown) {
        lastError = apiError;
        const err = apiError as {
          status?: number;
          code?: string;
          message?: string;
        };
        console.warn(`[${requestId}] Model ${model} failed`, {
          status: err?.status,
          code: err?.code,
          message: err?.message,
        });

        if (!shouldFallbackToNextModel(apiError)) {
          throw apiError;
        }
      }
    }

    if (!response || !usedModel) {
      throw lastError || new Error("OpenAI API call failed");
    }

    const apiDuration = Date.now() - requestStartTime;
    console.log(
      `[${requestId}] API call completed in ${apiDuration}ms using ${usedModel}`
    );

    // Debug: how the Responses API structured the output (tool calls vs message)
    try {
      const outputItems = (response as unknown as { output?: unknown }).output;
      if (Array.isArray(outputItems)) {
        const types = outputItems
          .map((i) => (i as { type?: unknown })?.type)
          .filter((t): t is string => typeof t === "string");
        const webSearchCalls = types.filter(
          (t) => t === "web_search_call" || t === "web_search_call_output"
        ).length;
        webSearchCallCount = webSearchCalls;
        console.log(
          `[${requestId}] Response output items: ${types.length} (web_search_call: ${webSearchCalls})`
        );
      }
    } catch {
      // ignore debug issues
    }

    // Extract and parse response
    const outputText = extractOutputText(
      response as unknown as Record<string, unknown>
    );

    if (!outputText || outputText.trim().length === 0) {
      console.error(`[${requestId}] Empty response from API`);
      console.error(
        `[${requestId}] Full response keys:`,
        Object.keys(response || {})
      );
      console.error(
        `[${requestId}] Response preview:`,
        JSON.stringify(response).substring(0, 500)
      );
      return NextResponse.json(
        { success: false, error: "Tom respons från AI. Försök igen." },
        { status: 500 }
      );
    }

    // Log first part of output for debugging
    console.log(
      `[${requestId}] Output text preview (first 300 chars):`,
      outputText.substring(0, 300)
    );

    // Clean output text - remove markdown code blocks if present
    let cleanedOutput = outputText.trim();

    // Remove ```json ... ``` or ``` ... ``` wrapper if present
    const jsonBlockMatch = cleanedOutput.match(
      /```(?:json)?\s*([\s\S]*?)\s*```/
    );
    if (jsonBlockMatch) {
      cleanedOutput = jsonBlockMatch[1].trim();
      console.log(`[${requestId}] Removed markdown code block wrapper`);
    }

    // Remove any text before the first { and after the last }
    const firstBrace = cleanedOutput.indexOf("{");
    const lastBrace = cleanedOutput.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const beforeJson = cleanedOutput.substring(0, firstBrace).trim();
      const afterJson = cleanedOutput.substring(lastBrace + 1).trim();
      if (beforeJson || afterJson) {
        cleanedOutput = cleanedOutput.substring(firstBrace, lastBrace + 1);
        console.log(`[${requestId}] Trimmed text before/after JSON`);
      }
    }

    // Parse JSON response with repair attempts
    let auditResult;
    let usedFallback = false;
    const parseResult = parseJsonWithRepair(cleanedOutput);

    if (parseResult.success && parseResult.data) {
      auditResult = parseResult.data;
      console.log(`[${requestId}] JSON parse succeeded`);
      console.log(
        `[${requestId}] Parsed result keys:`,
        Object.keys(auditResult as object)
      );
    } else {
      // Try to extract JSON from response if direct parse failed
      console.log(
        `[${requestId}] Direct parse failed, trying extraction:`,
        parseResult.error || "unknown"
      );
      const jsonString = extractFirstJsonObject(outputText);
      if (!jsonString) {
        console.error(
          `[${requestId}] Could not find JSON in response. Full output (first 2000 chars):`,
          outputText.substring(0, 2000)
        );
        console.log(
          `[${requestId}] Falling back to scraped-data audit (AI response invalid JSON)`
        );
        auditResult = createFallbackResult(websiteContent, normalizedUrl);
        usedFallback = true;
      } else {
        console.log(
          `[${requestId}] Extracted JSON length: ${jsonString.length} chars`
        );

        // Try parsing extracted JSON with repair
        const extractParseResult = parseJsonWithRepair(jsonString);
        if (extractParseResult.success && extractParseResult.data) {
          auditResult = extractParseResult.data;
          console.log(`[${requestId}] Extracted JSON parse succeeded`);
        } else {
          // Log the problematic JSON for debugging (first 1000 chars around error position)
          const errorPos =
            extractParseResult.error?.match(/position (\d+)/)?.[1];
          const startPos = errorPos ? Math.max(0, parseInt(errorPos) - 500) : 0;
          const endPos = errorPos
            ? Math.min(jsonString.length, parseInt(errorPos) + 500)
            : 1000;
          console.error(
            `[${requestId}] Failed to parse extracted JSON:`,
            extractParseResult.error
          );
          console.error(
            `[${requestId}] Problematic JSON section (chars ${startPos}-${endPos}):`,
            jsonString.substring(startPos, endPos)
          );
          console.log(
            `[${requestId}] Falling back to scraped-data audit (AI JSON parse failed)`
          );
          auditResult = createFallbackResult(websiteContent, normalizedUrl);
          usedFallback = true;
        }
      }
    }

    // Audit result parsed successfully

    // Special case: sometimes the model only returns audit_scores as root object.
    // If the parsed object ONLY contains score keys, wrap it in a fallback result
    // so the UI still gets a full audit payload instead of failing validation.
    const scoreKeys = [
      "seo",
      "technical_seo",
      "ux",
      "content",
      "performance",
      "accessibility",
      "security",
      "mobile",
    ];
    const auditObj = auditResult as Record<string, unknown>;
    const auditObjKeys = Object.keys(auditObj || {});
    const isScoreOnly =
      auditObjKeys.length > 0 &&
      auditObjKeys.every(
        (k) => scoreKeys.includes(k) && typeof auditObj[k] === "number"
      );

    if (isScoreOnly) {
      console.warn(
        `[${requestId}] Parsed JSON is score-only. Wrapping into fallback audit result. Keys: ${auditObjKeys.join(
          ", "
        )}`
      );
      const fallback = createFallbackResult(websiteContent, normalizedUrl) as {
        audit_scores: Record<string, number>;
        [key: string]: unknown;
      };
      fallback.audit_scores = {
        ...fallback.audit_scores,
        ...(auditObj as Record<string, number>),
      };
      auditResult = fallback;
      usedFallback = true;
    }

    // Check if result is nested inside another object (e.g. { result: {...} } or { audit: {...} })
    const possibleNestedKeys = [
      "result",
      "audit",
      "data",
      "response",
      "audit_result",
    ];
    for (const key of possibleNestedKeys) {
      const nested = (auditResult as Record<string, unknown>)?.[key];
      if (nested && typeof nested === "object" && !Array.isArray(nested)) {
        // Check if nested object has more audit-like fields
        const nestedObj = nested as Record<string, unknown>;
        if (
          nestedObj.company ||
          nestedObj.audit_scores ||
          nestedObj.improvements ||
          nestedObj.strengths
        ) {
          console.log(
            `[${requestId}] Found nested audit result under key "${key}"`
          );
          auditResult = nested;
          break;
        }
      }
    }

    // Validate result (more lenient - just check it's an object with some data)
    if (!validateAuditResult(auditResult)) {
      const ar = auditResult as Record<string, unknown>;
      console.error(
        `[${requestId}] Invalid audit result. Has fields:`,
        JSON.stringify({
          hasCompany: typeof ar?.company === "string" && ar.company,
          hasImprovements:
            Array.isArray(ar?.improvements) && ar.improvements.length > 0,
          hasScores: ar?.audit_scores && typeof ar.audit_scores === "object",
          hasStrengths: Array.isArray(ar?.strengths) && ar.strengths.length > 0,
          hasIssues: Array.isArray(ar?.issues) && ar.issues.length > 0,
        })
      );
      console.error(
        `[${requestId}] Actual keys present:`,
        Object.keys(ar || {})
      );
      console.error(
        `[${requestId}] Sample values:`,
        JSON.stringify({
          company: ar?.company,
          strengths: Array.isArray(ar?.strengths)
            ? ar.strengths.slice(0, 2)
            : ar?.strengths,
          issues: Array.isArray(ar?.issues)
            ? ar.issues.slice(0, 2)
            : ar?.issues,
        })
      );

      // Try to return partial result anyway if it has ANYTHING useful
      if (
        auditResult &&
        typeof auditResult === "object" &&
        Object.keys(ar).length > 0
      ) {
        console.log(
          `[${requestId}] Returning partial result despite validation failure (${
            Object.keys(ar).length
          } keys)`
        );
      } else {
        // Create a minimal fallback result based on scraped data
        console.log(
          `[${requestId}] Creating fallback result from scraped data`
        );
        auditResult = createFallbackResult(websiteContent, normalizedUrl);
      }
    }

    // Calculate cost (for display)
    interface Usage {
      input_tokens?: number;
      output_tokens?: number;
      prompt_tokens?: number;
      completion_tokens?: number;
    }
    const usage = ((response as { usage?: Usage }).usage || {}) as Usage;
    const inputTokens = usage.input_tokens || usage.prompt_tokens || 0;
    const outputTokens = usage.output_tokens || usage.completion_tokens || 0;
    const pricing = getPricingForModel(usedModel);
    const costUSD =
      (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
    const costSEK = costUSD * USD_TO_SEK;

    // Add metadata to result
    const domain = new URL(normalizedUrl).hostname;
    const estimatedWordCount = estimateWordCountFromSiteContent(
      auditResult.site_content
    );
    const useEstimatedWordCount =
      estimatedWordCount > 0 &&
      (isJsRendered || websiteContent.wordCount < 50 || webSearchCallCount > 0);
    const aggregatedWordCount = useEstimatedWordCount
      ? Math.max(websiteContent.wordCount, estimatedWordCount)
      : websiteContent.wordCount;
    const wordCountSource = useEstimatedWordCount ? "ai_estimate" : "scraper";

    const scrapeSummaryNotes: string[] = [
      useEstimatedWordCount
        ? `Scraper: ${websiteContent.sampledUrls?.length || 1} sida(or), ${
            websiteContent.wordCount
          } ord. AI-estimerat innehåll: ${aggregatedWordCount} ord. ${
            websiteContent.headings.length
          } rubriker.`
        : `Scraper: ${
            websiteContent.sampledUrls?.length || 1
          } sida(or), ${aggregatedWordCount} ord (agg), ${
            websiteContent.headings.length
          } rubriker.`,
      isJsRendered
        ? "Indikation: sidan verkar JavaScript-renderad (scraper kan missa text)."
        : "Indikation: sidan verkar server-renderad (scraper fångar normalt text bra).",
      `Web search: ${webSearchCallCount > 0 ? "användes" : "användes inte"}.`,
      "Begränsningar: scraper hämtar max 4 sidor och aggregerar max ~2000 ord.",
    ];
    if (usedFallback) {
      scrapeSummaryNotes.push(
        "Obs: AI-resultatet kunde inte valideras fullt ut och rapporten innehåller fallback-bedömningar."
      );
    }

    const result: AuditResult = {
      ...auditResult,
      audit_type: "website_audit",
      domain,
      timestamp: new Date().toISOString(),
      cost: {
        tokens: inputTokens + outputTokens,
        sek: parseFloat(costSEK.toFixed(2)),
        usd: parseFloat(costUSD.toFixed(4)),
      },
      scrape_summary: {
        sampled_urls: websiteContent.sampledUrls?.length
          ? websiteContent.sampledUrls
          : [websiteContent.url],
        pages_sampled: websiteContent.sampledUrls?.length || 1,
        aggregated_word_count: aggregatedWordCount,
        word_count_source: wordCountSource,
        headings_count: websiteContent.headings.length,
        images_count: websiteContent.images,
        response_time_ms: websiteContent.responseTime,
        is_js_rendered: isJsRendered,
        web_search_calls: webSearchCallCount,
        notes: scrapeSummaryNotes,
      },
    };

    // Deduct diamonds (only if not test user)
    if (!isTest) {
      try {
        createTransaction(
          user.id,
          "audit",
          -AUDIT_COST,
          `Site Audit: ${domain}`
        );
        console.log(
          `[${requestId}] Deducted ${AUDIT_COST} diamonds from user ${user.id}`
        );
      } catch (txError) {
        console.error(`[${requestId}] Failed to deduct diamonds:`, txError);
        // Still return result even if transaction fails
      }
    } else {
      console.log(`[${requestId}] Test user - no diamonds deducted`);
    }

    const totalDuration = Date.now() - requestStartTime;
    console.log(`[${requestId}] Audit completed in ${totalDuration}ms`);

    // Clean up in-flight tracking
    inFlightAudits.delete(inFlightKey);

    return NextResponse.json(
      {
        success: true,
        result,
      },
      {
        headers: {
          "X-Request-ID": requestId,
          "X-Response-Time": `${totalDuration}ms`,
          ...(usedFallback ? { "X-Audit-Fallback": "true" } : {}),
        },
      }
    );
  } catch (error: unknown) {
    // Clean up in-flight tracking on error
    if (inFlightKey) {
      inFlightAudits.delete(inFlightKey);
    }

    const totalDuration = Date.now() - requestStartTime;
    const err = error as { message?: string; status?: number; code?: string };

    console.error(`[${requestId}] Audit error after ${totalDuration}ms:`, {
      message: err.message,
      status: err.status,
      code: err.code,
    });

    // Provide user-friendly error messages
    let errorMessage = "Ett fel uppstod vid analysen. Försök igen senare.";

    if (err.status === 401 || err.message?.includes("OPENAI_API_KEY")) {
      errorMessage = "API-nyckel saknas eller är ogiltig.";
    } else if (err.status === 429) {
      errorMessage = "För många förfrågningar. Vänta en stund och försök igen.";
    } else if (err.message?.includes("timeout")) {
      errorMessage = "Analysen tog för lång tid. Försök med en enklare sida.";
    } else if (err.message?.includes("ENOTFOUND")) {
      errorMessage = "Kunde inte nå webbplatsen. Kontrollera URL:en.";
    }

    // Prefer returning the upstream status when it makes sense, but avoid
    // clashing with our own auth semantics (401 is reserved for user auth).
    let statusCode = 500;
    if (
      typeof err.status === "number" &&
      err.status >= 400 &&
      err.status < 600 &&
      err.status !== 401
    ) {
      statusCode = err.status;
    }

    return NextResponse.json(
      { success: false, error: errorMessage },
      {
        status: statusCode,
        headers: {
          "X-Request-ID": requestId,
          "X-Response-Time": `${totalDuration}ms`,
        },
      }
    );
  }
}
