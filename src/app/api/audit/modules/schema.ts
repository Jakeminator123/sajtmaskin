import {
  AUDIT_STRUCTURED_DEFAULT_MODEL,
  AUDIT_STRUCTURED_FALLBACK_MODELS,
} from "@/lib/gen/defaults";

// Model configuration (primary + fallback chain) from config/ai_models/manifest.json
const AUDIT_MODEL_CANDIDATES = [
  AUDIT_STRUCTURED_DEFAULT_MODEL,
  ...AUDIT_STRUCTURED_FALLBACK_MODELS.filter((model) => model !== AUDIT_STRUCTURED_DEFAULT_MODEL),
];

function toResponsesModelId(model: string): string {
  return model.replace(/^openai\//, "");
}

// Structured output schema for the AI portion of the audit.
// NOTE: We add audit_type/domain/timestamp/cost on the server after parsing.
const AUDIT_AI_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    audit_mode: { type: "string", enum: ["basic", "advanced"] },
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
      required: ["immediate_fixes", "full_optimization", "currency", "payment_structure"],
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
      required: ["https_status", "headers_analysis", "cookie_policy", "vulnerabilities"],
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
      required: ["industry_leaders", "common_features", "differentiation_opportunities"],
    },
    business_profile: {
      type: "object",
      additionalProperties: false,
      properties: {
        industry: { type: "string" },
        company_size: { type: "string" },
        business_model: { type: "string" },
        maturity: { type: "string" },
        core_offers: { type: "array", items: { type: "string" } },
        revenue_streams: { type: "array", items: { type: "string" } },
      },
      required: [
        "industry",
        "company_size",
        "business_model",
        "maturity",
        "core_offers",
        "revenue_streams",
      ],
    },
    market_context: {
      type: "object",
      additionalProperties: false,
      properties: {
        primary_geography: { type: "string" },
        service_area: { type: "string" },
        competition_level: { type: "string" },
        key_competitors: { type: "array", items: { type: "string" } },
        seasonal_patterns: { type: "string" },
        local_market_dynamics: { type: "string" },
      },
      required: [
        "primary_geography",
        "service_area",
        "competition_level",
        "key_competitors",
        "seasonal_patterns",
        "local_market_dynamics",
      ],
    },
    customer_segments: {
      type: "object",
      additionalProperties: false,
      properties: {
        primary_segment: { type: "string" },
        secondary_segments: { type: "array", items: { type: "string" } },
        customer_needs: { type: "array", items: { type: "string" } },
        decision_triggers: { type: "array", items: { type: "string" } },
        trust_signals: { type: "array", items: { type: "string" } },
      },
      required: [
        "primary_segment",
        "secondary_segments",
        "customer_needs",
        "decision_triggers",
        "trust_signals",
      ],
    },
    competitive_landscape: {
      type: "object",
      additionalProperties: false,
      properties: {
        positioning: { type: "string" },
        differentiation: { type: "string" },
        price_positioning: { type: "string" },
        barriers_to_entry: { type: "string" },
        opportunities: { type: "array", items: { type: "string" } },
      },
      required: [
        "positioning",
        "differentiation",
        "price_positioning",
        "barriers_to_entry",
        "opportunities",
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
      required: ["key_pages", "content_types", "seo_foundation", "conversion_paths"],
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
      required: ["style", "color_psychology", "ui_patterns", "accessibility_level"],
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
      required: ["generation_prompt", "must_have_sections", "style_notes", "improvements_to_apply"],
    },
  },
  required: [
    "audit_mode",
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
    "business_profile",
    "market_context",
    "customer_segments",
    "competitive_landscape",
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
 * Validates that a JSON Schema with additionalProperties:false
 * has all properties listed in required.
 */
function validateStrictSchema(schema: JsonSchemaObject, path: string = "root"): string[] {
  const errors: string[] = [];

  if (schema.type === "object" && schema.properties) {
    const propKeys = Object.keys(schema.properties);
    const requiredKeys = schema.required ? [...schema.required] : [];

    // Strict JSON mode requires ALL properties to be listed in required
    // when additionalProperties is false.
    if (schema.additionalProperties === false) {
      const missingRequired = propKeys.filter((k) => !requiredKeys.includes(k));
      if (missingRequired.length > 0) {
        errors.push(
          `${path}: required must include all properties. Missing: [${missingRequired.join(", ")}]`,
        );
      }
    }

    // Check for required keys that don't exist in properties
    const extraRequired = requiredKeys.filter((k) => !propKeys.includes(k));
    if (extraRequired.length > 0) {
      errors.push(
        `${path}: required contains keys not in properties: [${extraRequired.join(", ")}]`,
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
    "\n",
  )}`;
  console.error(errorMsg);
  // In development, throw to fail fast. In production, log but continue.
  if (process.env.NODE_ENV === "development") {
    throw new Error(errorMsg);
  }
}

export { AUDIT_MODEL_CANDIDATES, toResponsesModelId, AUDIT_AI_SCHEMA };
