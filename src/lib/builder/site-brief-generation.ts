/**
 * Shared Deep Brief (structured site brief) generation for `/api/ai/brief`
 * and server-side auto-brief in create-chat streams.
 */
import { generateObject } from "ai";
import { z } from "zod";
import { debugLog, errorLog } from "@/lib/utils/debug";
import { devLogAppend } from "@/lib/logging/devLog";
import {
  isAnthropicAssistModel,
  isOpenAIAssistModel,
  isPromptAssistModelAllowed,
  normalizeAssistModel,
  resolvePromptAssistProvider,
} from "@/lib/builder/promptAssist";
import { createDirectModel, getTemperatureConfig } from "@/lib/builder/gateway-policy";
import { MAX_AI_BRIEF_PROMPT_CHARS } from "@/lib/builder/promptLimits";
import {
  ASSIST_MAX_OUTPUT_TOKENS,
  AUTO_BRIEF_MODEL_ANTHROPIC,
  AUTO_BRIEF_MODEL_OPENAI,
  BRIEF_MODEL,
} from "@/lib/gen/defaults";

const ENV_MAX_TOKENS = Number(process.env.AI_BRIEF_MAX_TOKENS) || 81_920;

export const briefRequestSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(1, "prompt is required")
    .max(MAX_AI_BRIEF_PROMPT_CHARS, `prompt too long (max ${MAX_AI_BRIEF_PROMPT_CHARS} chars)`),
  provider: z.enum(["openai", "anthropic"]).optional(),
  model: z.string().min(1).optional().default(BRIEF_MODEL),
  temperature: z.number().min(0).max(2).optional(),
  imageGenerations: z.boolean().optional().default(true),
  maxTokens: z.number().int().positive().max(ENV_MAX_TOKENS).optional(),
  source: z.string().trim().max(80).optional(),
});

function resolveMaxTokens(requested: number | undefined): number {
  const base = typeof requested === "number" ? requested : ASSIST_MAX_OUTPUT_TOKENS;
  const capped = Math.min(base, ENV_MAX_TOKENS);
  if (typeof requested === "number" && capped !== requested) {
    debugLog("AI", "Brief maxTokens capped by env limit", {
      requested,
      capped,
      envLimit: ENV_MAX_TOKENS,
    });
  }
  return capped;
}

function normalizeBriefLogSource(source: string | undefined): string {
  const normalized = source?.trim();
  return normalized ? normalized : "unspecified";
}

const sectionTypeSchema = z.enum([
  "hero",
  "features",
  "benefits",
  "social-proof",
  "testimonials",
  "pricing",
  "faq",
  "gallery",
  "about",
  "contact",
  "cta",
  "footer",
  "custom",
]);

const siteBriefSchema = z.object({
  projectTitle: z.string().describe("Short internal project title"),
  brandName: z.string().describe("Brand/company name if present, else empty string"),
  oneSentencePitch: z.string().describe("A single sentence describing what the site is about"),
  targetAudience: z.string().describe("Primary audience / persona"),
  primaryCallToAction: z.string().describe('Main CTA label, e.g. "Book a demo"'),
  toneAndVoice: z.array(z.string()).min(2).max(8).describe("Tone keywords"),
  pages: z
    .array(
      z.object({
        name: z.string().describe("Navigation label"),
        path: z.string().describe('Route path, e.g. "/" or "/pricing"'),
        purpose: z.string().describe("Why this page exists"),
        sections: z
          .array(
            z.object({
              type: sectionTypeSchema,
              heading: z.string(),
              bullets: z.array(z.string()).min(1).max(8),
            }),
          )
          .min(3)
          .max(14),
      }),
    )
    .min(1)
    .max(10),
  visualDirection: z.object({
    styleKeywords: z.array(z.string()).min(3).max(12),
    colorPalette: z.object({
      primary: z.string().describe("Hex or CSS color"),
      secondary: z.string().describe("Hex or CSS color"),
      accent: z.string().describe("Hex or CSS color"),
      background: z.string().describe("Hex or CSS color"),
      text: z.string().describe("Hex or CSS color"),
    }),
    typography: z.object({
      headings: z.string().describe('Font suggestion for headings (e.g. "Inter", "Sora")'),
      body: z.string().describe('Font suggestion for body (e.g. "Inter", "Source Sans 3")'),
    }),
  }),
  imagery: z.object({
    needsImages: z.boolean(),
    styleKeywords: z.array(z.string()).min(2).max(12),
    suggestedSubjects: z.array(z.string()).min(2).max(16),
    altTextRules: z.array(z.string()).min(2).max(8),
  }),
  uiNotes: z.object({
    components: z.array(z.string()).min(3).max(16),
    interactions: z.array(z.string()).min(2).max(16),
    accessibility: z.array(z.string()).min(3).max(16),
  }),
  seo: z.object({
    titleTemplate: z.string().describe('e.g. "{page} | Brand"'),
    metaDescription: z.string().describe("One concise meta description"),
    keywords: z.array(z.string()).min(3).max(30),
  }),
});

const simplifiedBriefSchema = z.object({
  projectTitle: z.string(),
  brandName: z.string().default(""),
  oneSentencePitch: z.string(),
  targetAudience: z.string().default("General audience"),
  primaryCallToAction: z.string().default("Get Started"),
  toneAndVoice: z.array(z.string()).default([]),
  pages: z
    .array(
      z.object({
        name: z.string(),
        path: z.string(),
        purpose: z.string().default(""),
        sections: z
          .array(
            z.object({
              type: z.string(),
              heading: z.string(),
              bullets: z.array(z.string()).default([]),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
  visualDirection: z
    .object({
      styleKeywords: z.array(z.string()).default([]),
      colorPalette: z
        .object({
          primary: z.string().default("#3b82f6"),
          secondary: z.string().default("#6366f1"),
          accent: z.string().default("#f59e0b"),
          background: z.string().default("#0a0a0a"),
          text: z.string().default("#ffffff"),
        })
        .default({
          primary: "#3b82f6",
          secondary: "#6366f1",
          accent: "#f59e0b",
          background: "#0a0a0a",
          text: "#ffffff",
        }),
      typography: z
        .object({
          headings: z.string().default("Inter"),
          body: z.string().default("Inter"),
        })
        .default({
          headings: "Inter",
          body: "Inter",
        }),
    })
    .default({
      styleKeywords: [],
      colorPalette: {
        primary: "#3b82f6",
        secondary: "#6366f1",
        accent: "#f59e0b",
        background: "#0a0a0a",
        text: "#ffffff",
      },
      typography: {
        headings: "Inter",
        body: "Inter",
      },
    }),
  imagery: z
    .object({
      needsImages: z.boolean().default(true),
      styleKeywords: z.array(z.string()).default([]),
      suggestedSubjects: z.array(z.string()).default([]),
      altTextRules: z.array(z.string()).default([]),
    })
    .default({
      needsImages: true,
      styleKeywords: [],
      suggestedSubjects: [],
      altTextRules: [],
    }),
  uiNotes: z
    .object({
      components: z.array(z.string()).default([]),
      interactions: z.array(z.string()).default([]),
      accessibility: z.array(z.string()).default([]),
    })
    .default({
      components: [],
      interactions: [],
      accessibility: [],
    }),
  seo: z
    .object({
      titleTemplate: z.string().default("{page} | Site"),
      metaDescription: z.string().default(""),
      keywords: z.array(z.string()).default([]),
    })
    .default({
      titleTemplate: "{page} | Site",
      metaDescription: "",
      keywords: [],
    }),
});

type SiteTypeRule = { hint: string; keywords: string[] };

const SITE_TYPE_RULES: SiteTypeRule[] = [
  {
    hint: "ecommerce storefront",
    keywords: [
      "ecommerce",
      "e-commerce",
      "webshop",
      "shop",
      "store",
      "cart",
      "checkout",
      "product",
    ],
  },
  {
    hint: "saas product marketing site",
    keywords: ["saas", "b2b", "platform", "subscription", "dashboard", "startup"],
  },
  {
    hint: "portfolio site",
    keywords: ["portfolio", "designer", "photography", "photographer", "case study", "showcase"],
  },
  {
    hint: "restaurant or cafe site",
    keywords: ["restaurant", "cafe", "menu", "reservation", "takeaway"],
  },
  {
    hint: "agency or services site",
    keywords: ["agency", "consulting", "consultant", "services", "company", "foretag", "tjanst"],
  },
  {
    hint: "event or conference site",
    keywords: ["event", "conference", "ticket", "schedule", "speaker", "workshop"],
  },
  {
    hint: "education or course site",
    keywords: ["course", "education", "academy", "school", "training", "learning"],
  },
  {
    hint: "real estate site",
    keywords: ["real estate", "property", "listing", "broker", "apartment"],
  },
  {
    hint: "healthcare site",
    keywords: ["clinic", "health", "medical", "dentist", "therapy"],
  },
];

function normalizePromptText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function inferSiteTypeHint(prompt: string): string | null {
  const normalized = normalizePromptText(prompt);
  for (const rule of SITE_TYPE_RULES) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
      return rule.hint;
    }
  }
  return null;
}

function resolveAnthropicBriefModelId(model: string): string {
  const stripped = model.replace(/^anthropic-direct\//, "").replace(/^anthropic\//, "");
  return stripped.replace(/(\d+)\.(\d+)$/g, "$1-$2");
}

const BRIEF_SYSTEM_PROMPT =
  "You are a senior product designer + information architect. " +
  "Convert the user request into a concise website brief that is immediately usable for implementation. " +
  "Infer the most likely site type from the user request and adjust pages, sections, and content to fit. " +
  "Be specific about pages/sections, visual direction, and copy direction. " +
  "Include every field in the schema. If a value is unknown, use an empty string. " +
  "Do NOT include any extra keys beyond the schema. Keep strings concise but detailed.\n\n" +
  "SCOPE AWARENESS (important):\n" +
  "- Match the scope to the complexity of the user's request.\n" +
  "- A short, casual request (e.g. 'a page for Lasse's flea market') should produce a compact, single-page brief with 4-6 sections. Do NOT over-engineer it with multiple pages.\n" +
  "- A detailed, structured request with many requirements should produce a multi-page brief (2-5 pages) with richer sections.\n" +
  "- When in doubt, lean toward fewer pages with more polished sections rather than many thin pages.\n" +
  "- Always prefer quality over quantity: a beautiful one-pager beats a mediocre five-page site.";

function buildBriefUserPrompt(
  prompt: string,
  imageGenerations: boolean,
  variantHints?: string,
  priorDesignContext?: string,
): string {
  const siteTypeHint = inferSiteTypeHint(prompt);
  // Order: raw prompt -> prior design context (for clear-redesign followups)
  // -> variant hints (scaffold variant tokens the orchestrator pre-matched)
  // -> site-type domain hint -> imagery guidance. Each block optional.
  return (
    prompt +
    (priorDesignContext ? `\n\n${priorDesignContext}` : "") +
    (variantHints ? `\n\n${variantHints}` : "") +
    (siteTypeHint ? `\n\nSite type hint: ${siteTypeHint}.` : "") +
    (imageGenerations
      ? "\n\nInclude imagery guidance because image generation is enabled."
      : "\n\nImage generation is disabled; prefer layout and iconography, keep imagery optional.")
  );
}

export type SiteBriefGenerationResult = {
  brief: Record<string, unknown>;
  usedSimplified: boolean;
  provider: "openai" | "anthropic";
  normalizedModel: string;
};

export type SiteBriefHttpError = {
  status: number;
  body: Record<string, unknown>;
};

/**
 * Validates model + provider alignment and API keys. Used by `/api/ai/brief`.
 */
export function validateBriefModelForHttp(
  normalizedModel: string,
  providerOverride?: "openai" | "anthropic",
): SiteBriefHttpError | null {
  const resolvedProvider = resolvePromptAssistProvider(normalizedModel);
  if (providerOverride && providerOverride !== resolvedProvider) {
    return {
      status: 400,
      body: {
        error: "Provider does not match model",
        setup: `Model "${normalizedModel}" kräver provider "${resolvedProvider}".`,
      },
    };
  }
  if (!isPromptAssistModelAllowed(normalizedModel)) {
    return {
      status: 400,
      body: {
        error: "Model not allowed for prompt assist",
        setup: "Välj en modell från listan i buildern (OpenAI eller Anthropic).",
      },
    };
  }
  if (resolvedProvider === "anthropic") {
    if (!isAnthropicAssistModel(normalizedModel) && !normalizedModel.startsWith("anthropic/")) {
      return {
        status: 400,
        body: {
          error: "Invalid model for anthropic provider",
          setup: "Set model to a supported Anthropic prompt-assist model.",
        },
      };
    }
    if (!process.env.ANTHROPIC_API_KEY?.trim()) {
      return {
        status: 401,
        body: {
          error: "Missing Anthropic API key",
          setup: "Set ANTHROPIC_API_KEY to use Anthropic Deep Brief.",
        },
      };
    }
    return null;
  }
  if (!isOpenAIAssistModel(normalizedModel) || normalizedModel.startsWith("anthropic/")) {
    return {
      status: 400,
      body: {
        error: "Invalid model for OpenAI brief",
        setup: "Set model to a supported OpenAI prompt-assist model (e.g. openai/gpt-5.4).",
      },
    };
  }
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return {
      status: 401,
      body: {
        error: "Missing OpenAI API key",
        setup:
          "Set OPENAI_API_KEY. Deep brief calls OpenAI directly via createDirectModel().",
      },
    };
  }
  return null;
}

/**
 * Generate Deep Brief (same shape as `meta.brief` / system prompt expects).
 * Caller must validate model/keys first (HTTP) or use `tryGenerateServerAutoBrief`.
 */
export async function generateSiteBriefObject(
  input: {
    prompt: string;
    normalizedModel: string;
    imageGenerations: boolean;
    temperature?: number;
    maxTokens?: number;
    abortSignal?: AbortSignal;
    source?: string;
    variantHints?: string;
    priorDesignContext?: string;
  },
): Promise<SiteBriefGenerationResult> {
  const {
    prompt,
    normalizedModel,
    imageGenerations,
    temperature,
    maxTokens: requestedMaxTokens,
    abortSignal,
    source,
    variantHints,
    priorDesignContext,
  } = input;
  const resolvedProvider = resolvePromptAssistProvider(normalizedModel);
  const logProvider = resolvedProvider;
  const maxTokens = resolveMaxTokens(requestedMaxTokens);
  const userPrompt = buildBriefUserPrompt(
    prompt,
    imageGenerations,
    variantHints,
    priorDesignContext,
  );
  const briefSource = normalizeBriefLogSource(source);

  debugLog("AI", "Brief model call started (same request, direct provider)", {
    source: briefSource,
    provider: logProvider,
    transport: "direct_provider_api",
    sdk: "ai",
    requestStage: "model_call",
    model: normalizedModel,
    promptLength: prompt.length,
    temperature: typeof temperature === "number" ? temperature : null,
    imageGenerations,
    maxTokens,
  });
  devLogAppend("latest", {
    type: "assist.brief.request",
    source: briefSource,
    provider: logProvider,
    model: normalizedModel,
    prompt,
    imageGenerations,
    maxTokens,
  });

  if (resolvedProvider === "anthropic") {
    const directModel = createDirectModel(`anthropic/${resolveAnthropicBriefModelId(normalizedModel)}`);
    let usedSimplified = false;
    let result;
    try {
      result = await generateObject({
        model: directModel,
        schema: siteBriefSchema,
        messages: [
          { role: "system", content: BRIEF_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        maxRetries: 1,
        maxOutputTokens: maxTokens,
        abortSignal,
        ...getTemperatureConfig(normalizedModel, temperature),
      });
    } catch (fullSchemaErr) {
      debugLog("AI", "Full Anthropic brief schema failed, trying simplified", {
        error: fullSchemaErr instanceof Error ? fullSchemaErr.message : String(fullSchemaErr),
      });
      try {
        result = await generateObject({
          model: directModel,
          schema: simplifiedBriefSchema,
          messages: [
            {
              role: "system",
              content:
                BRIEF_SYSTEM_PROMPT +
                "\n\nIMPORTANT: Keep your response concise. Arrays can be empty if you're unsure.",
            },
            { role: "user", content: userPrompt },
          ],
          maxRetries: 1,
          maxOutputTokens: Math.min(maxTokens, 40_960),
          abortSignal,
          ...getTemperatureConfig(normalizedModel, temperature),
        });
        usedSimplified = true;
      } catch (simplifiedErr) {
        const errMsg = simplifiedErr instanceof Error ? simplifiedErr.message : String(simplifiedErr);
        errorLog("AI", "Anthropic brief generation failed - both schemas", {
          model: normalizedModel,
          promptLength: prompt.length,
          fullError: fullSchemaErr instanceof Error ? fullSchemaErr.message : String(fullSchemaErr),
          simplifiedError: errMsg,
        });
        throw simplifiedErr;
      }
    }
    const briefObject = result.object as Record<string, unknown>;
    const pages = Array.isArray(briefObject.pages) ? briefObject.pages.length : 0;
    devLogAppend("latest", {
      type: "assist.brief.response",
      provider: "anthropic",
      model: normalizedModel,
      schema: usedSimplified ? "simplified" : "full",
      projectTitle: typeof briefObject.projectTitle === "string" ? briefObject.projectTitle : null,
      pages,
    });
    return {
      brief: briefObject,
      usedSimplified,
      provider: "anthropic",
      normalizedModel,
    };
  }

  const directModel = createDirectModel(normalizedModel);
  let usedSimplified = false;
  let result;
  try {
    result = await generateObject({
      model: directModel,
      schema: siteBriefSchema,
      messages: [
        { role: "system", content: BRIEF_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      maxRetries: 1,
      maxOutputTokens: maxTokens,
      abortSignal,
      ...getTemperatureConfig(normalizedModel, temperature),
    });
  } catch (fullSchemaErr) {
    debugLog("AI", "Full brief schema failed, trying simplified", {
      error: fullSchemaErr instanceof Error ? fullSchemaErr.message : String(fullSchemaErr),
    });
    try {
      result = await generateObject({
        model: directModel,
        schema: simplifiedBriefSchema,
        messages: [
          {
            role: "system",
            content:
              BRIEF_SYSTEM_PROMPT +
              "\n\nIMPORTANT: Keep your response concise. Arrays can be empty if you're unsure.",
          },
          { role: "user", content: userPrompt },
        ],
        maxRetries: 1,
        maxOutputTokens: Math.min(maxTokens, 40_960),
        abortSignal,
        ...getTemperatureConfig(normalizedModel, temperature),
      });
      usedSimplified = true;
    } catch (simplifiedErr) {
      const errMsg = simplifiedErr instanceof Error ? simplifiedErr.message : String(simplifiedErr);
      errorLog("AI", "Brief generation failed - both schemas", {
        model: normalizedModel,
        promptLength: prompt.length,
        fullError: fullSchemaErr instanceof Error ? fullSchemaErr.message : String(fullSchemaErr),
        simplifiedError: errMsg,
      });
      throw simplifiedErr;
    }
  }
  const briefObject = result.object as Record<string, unknown>;
  const pages = Array.isArray(briefObject.pages) ? briefObject.pages.length : 0;
  devLogAppend("latest", {
    type: "assist.brief.response",
    provider: "openai",
    model: normalizedModel,
    schema: usedSimplified ? "simplified" : "full",
    projectTitle: typeof briefObject.projectTitle === "string" ? briefObject.projectTitle : null,
    pages,
  });
  return {
    brief: briefObject,
    usedSimplified,
    provider: "openai",
    normalizedModel,
  };
}

function resolveRunnableBriefModel(preferred: string): string | null {
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY?.trim());
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  if (!hasOpenAI && !hasAnthropic) return null;

  let m = preferred;
  if (!isPromptAssistModelAllowed(m)) {
    m = AUTO_BRIEF_MODEL_OPENAI;
  }
  const provider = resolvePromptAssistProvider(m);
  if (provider === "openai" && !hasOpenAI && hasAnthropic) {
    return AUTO_BRIEF_MODEL_ANTHROPIC;
  }
  if (provider === "anthropic" && !hasAnthropic && hasOpenAI) {
    return AUTO_BRIEF_MODEL_OPENAI;
  }
  if (provider === "openai" && !hasOpenAI) return null;
  if (provider === "anthropic" && !hasAnthropic) return null;
  return m;
}

/**
 * Best-effort brief for create-chat / internal callers: picks a runnable model when keys differ.
 */
export async function tryGenerateServerAutoBrief(params: {
  prompt: string;
  assistModelHint?: string | null;
  imageGenerations: boolean;
  signal?: AbortSignal;
  /** Scaffold variant hints the orchestrator pre-matched; surfaces palette/
   *  font tokens so the brief-LLM can echo them instead of inventing new ones. */
  variantHints?: string;
  /** Prior design context (compact summary of the previous brief). Used on
   *  clear-redesign follow-ups to preserve brand/structure while allowing
   *  visual changes. */
  priorDesignContext?: string;
}): Promise<{ brief: Record<string, unknown>; modelUsed: string } | null> {
  const normalized = normalizeAssistModel(
    params.assistModelHint?.trim() || AUTO_BRIEF_MODEL_OPENAI,
  );
  const runnable = resolveRunnableBriefModel(normalized);
  if (!runnable) return null;

  try {
    const { brief, normalizedModel } = await generateSiteBriefObject({
      prompt: params.prompt,
      normalizedModel: runnable,
      imageGenerations: params.imageGenerations,
      abortSignal: params.signal,
      source: "server_auto_brief",
      variantHints: params.variantHints,
      priorDesignContext: params.priorDesignContext,
    });
    return { brief, modelUsed: normalizedModel };
  } catch (e) {
    console.warn("[server-auto-brief] Generation failed:", e instanceof Error ? e.message : e);
    return null;
  }
}
