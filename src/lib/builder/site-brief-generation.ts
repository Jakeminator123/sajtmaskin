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
import { getAllDossiers } from "@/lib/gen/dossiers/registry";

const ENV_MAX_TOKENS = Number(process.env.AI_BRIEF_MAX_TOKENS) || 81_920;

export type BriefQuality = "full" | "server-auto" | "none";

export const briefRequestSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(1, "prompt is required")
    .max(MAX_AI_BRIEF_PROMPT_CHARS, `prompt too long (max ${MAX_AI_BRIEF_PROMPT_CHARS} chars)`),
  provider: z.enum(["openai", "gateway", "anthropic"]).optional(),
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

function applyBriefQuality(
  brief: Record<string, unknown>,
  briefQuality: Exclude<BriefQuality, "none">,
): Record<string, unknown> {
  return { ...brief, briefQuality };
}

/**
 * Marker quality used while the brief is being finalized.
 * `generateSiteBriefObject` always tags the raw object with `"full"`, and the
 * outer caller (`tryGenerateServerAutoBrief`) downgrades it to `"server-auto"`
 * when relevant. The downgrade is the single rewrite point; the inner tag is
 * just a sentinel so the schema field is always populated.
 */
const INITIAL_BRIEF_QUALITY: Exclude<BriefQuality, "none"> = "full";

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
  domainProfile: z
    .string()
    .nullable()
    .describe(
      "Specific domain classification beyond generic labels. " +
      "E.g. 'heavy-metal-merch-store', 'artisan-bakery', 'luxury-spa'. " +
      "Drives structural hints and backend contract decisions. " +
      "Set to null if the site does not fit a clear domain."
    ),
  motionLevel: z
    .enum(["minimal", "moderate", "lively"])
    .nullable()
    .describe(
      "How much animation suits this site. " +
      "'minimal' for corporate/serious/text-heavy, " +
      "'moderate' for balanced (default when unsure), " +
      "'lively' for energetic/playful/animated. " +
      "Set to null only when truly ambiguous."
    ),
  qualityBar: z
    .enum(["clean", "premium", "bold-dramatic"])
    .nullable()
    .describe(
      "Visual density target. " +
      "'clean' for minimal/airy/whitespace-driven, " +
      "'premium' for layered/polished/card-heavy (default when unsure), " +
      "'bold-dramatic' for high-contrast/oversized/maximal. " +
      "Set to null only when truly ambiguous."
    ),
  seasonalHints: z
    .array(z.string())
    .max(6)
    .nullable()
    .describe(
      "Seasonal or cultural themes present in the request. " +
      "E.g. ['christmas', 'winter']. Use an empty array [] or null when not seasonal."
    ),
  mustHave: z
    .array(z.string())
    .min(0)
    .max(10)
    .describe("Hard requirements the user explicitly stated or that are critical for the site type"),
  avoid: z
    .array(z.string())
    .min(0)
    .max(8)
    .describe("Things to explicitly avoid based on user request or domain conventions"),

  // ── Brief nominations (Fas 1.0) ───────────────────────────────────────
  // Brief-LLM nominates scaffold + variant + dossiers based on the request.
  // These are HINTS — the runtime embedding-pick may confirm or override
  // them and logs drift. IDs are validated downstream against master indexes.
  scaffoldNomination: z
    .object({
      id: z
        .string()
        .describe(
          "scaffold-id from `src/lib/gen/scaffolds/`. Valid ids: " +
          "base-nextjs, landing-page, saas-landing, portfolio, blog, " +
          "dashboard, auth-pages, ecommerce, content-site, app-shell.",
        ),
      reason: z
        .string()
        .max(200)
        .describe("1-2 sentences explaining why this scaffold fits the request."),
      confidence: z
        .number()
        .min(0)
        .max(1)
        .describe(
          "0.0-1.0. Use < 0.5 when ambiguous (lets embedding override). " +
          "Use > 0.8 only when the prompt explicitly maps to a scaffold.",
        ),
    })
    .nullable()
    .describe(
      "Brief-LLM's scaffold guess. Hint for orchestrator — embedding pick " +
      "may override based on full brief context.",
    ),
  variantNomination: z
    .object({
      id: z
        .string()
        .describe(
          "variant-id within the chosen scaffold (see config/scaffold-variants/<scaffold>/). " +
          "Set null if scaffoldNomination is null.",
        ),
      reason: z.string().max(200),
      confidence: z.number().min(0).max(1),
    })
    .nullable()
    .describe(
      "Brief-LLM's variant guess (visual signature within the scaffold). " +
      "Set null if you didn't nominate a scaffold.",
    ),
  // Dossier capabilities (Fas 2 — capability-driven dossier-system, 2026-04-20).
  // Brief-LLM deklarerar vilka abstrakta förmågor sajten behöver. Varje
  // capability matchar 1:1 mot en dossier i data/dossiers/{hard,soft}/<id>/
  // (eller noll om ingen finns). OBS: INGEN .default([]) — Zod's .default()
  // gör fältet optional i strict-mode JSON-schemat och kraschar OpenAI.
  // Brief-LLM:n ska alltid skicka fältet (tom array [] om inget behövs).
  requestedCapabilities: z
    .array(
      z
        .string()
        .min(2)
        .max(60)
        .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
        .describe(
          "Single kebab-case capability id. Examples: payments, auth, ai-chat, " +
          "image-gen, pricing-section, visual-3d.",
        ),
    )
    .max(6)
    .describe(
      "Capabilities the site explicitly needs. Each one resolves to one dossier " +
      "(or none) at runtime. Only include a capability if the prompt clearly asks " +
      "for it. Empty array [] when the request is purely visual/content. Cap at 6.",
    ),
});

import { inferSiteTypeHintFromDomain } from "./domain-inference";
import { detectExplicitPageCount } from "@/lib/gen/route-plan";

function resolveAnthropicBriefModelId(model: string): string {
  const stripped = model.replace(/^anthropic-direct\//, "").replace(/^anthropic\//, "");
  return stripped.replace(/(\d+)\.(\d+)$/g, "$1-$2");
}

/**
 * Builds the bullet list of available capabilities shown to the brief-LLM.
 *
 * Reads the dossier registry at call time so the vocabulary always matches
 * what is actually installable from disk (data/dossiers/{hard,soft}/). Previously
 * this list was hardcoded inside BRIEF_SYSTEM_PROMPT and drifted out of sync —
 * LLM learned to output "image-gen" / "auth" that no dossier backed, while
 * ignoring real dossiers like faq-accordion, scroll-parallax, resend-contact-form.
 *
 * Output shape (one bullet per unique capability, alphabetically sorted):
 *   - 'capability-id' (dossier-id: one-sentence summary)
 *
 * Two dossiers sharing a capability are collapsed onto one bullet; the one
 * with defaultForCapability=true wins the sentence.
 */
function buildCapabilityBulletList(): string {
  try {
    const all = getAllDossiers();
    if (all.length === 0) return "";

    const byCap = new Map<string, { summary: string; dossierId: string }>();
    for (const entry of all) {
      if (!entry.capability) continue;
      const firstSentence = entry.summary
        ? entry.summary.split(/[.!?]\s/).shift()?.trim() ?? ""
        : "";
      const existing = byCap.get(entry.capability);
      if (!existing || entry.defaultForCapability) {
        byCap.set(entry.capability, {
          summary: firstSentence,
          dossierId: entry.id,
        });
      }
    }

    const sorted = [...byCap.entries()].sort(([a], [b]) => a.localeCompare(b));
    return sorted
      .map(([cap, { summary, dossierId }]) =>
        summary
          ? `  - '${cap}' (${dossierId}: ${summary})`
          : `  - '${cap}' (${dossierId})`,
      )
      .join("\n");
  } catch (err) {
    // Defensive: if registry walk fails at runtime, fall back to no bullet list
    // rather than crashing brief generation. The LLM will still receive the
    // general guidance below.
    debugLog("brief", "buildCapabilityBulletList failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return "";
  }
}

function buildBriefSystemPrompt(): string {
  const capabilityBullets = buildCapabilityBulletList();
  const capabilityBlock = capabilityBullets
    ? "- Capabilities currently available as dossiers (prefer these exact ids — capabilities outside this list are not backed by any dossier and will produce no code):\n" +
      capabilityBullets +
      "\n"
    : "- Use kebab-case capability ids that describe concrete installable features.\n";
  return (
    "You are a senior product designer + information architect. " +
    "Convert the user request into a concise website brief that is immediately usable for implementation. " +
    "Infer the most likely site type from the user request and adjust pages, sections, and content to fit. " +
    "Be specific about pages/sections, visual direction, and copy direction. " +
    "Include every key from the schema in your response — never omit a key. For nullable design-guidance fields (domainProfile, motionLevel, qualityBar, seasonalHints), set them to a real value when the request gives you signal, and set them to null (or [] for seasonalHints) when truly ambiguous. " +
    "If a required value is unknown, use an empty string. " +
    "Do NOT include any extra keys beyond the schema. Keep strings concise but detailed.\n\n" +
    "NOMINATIONS (scaffoldNomination, variantNomination):\n" +
    "- These are HINTS for the orchestrator, not commitments. Be honest about confidence (0.0-1.0).\n" +
    "- scaffoldNomination: pick from {base-nextjs, landing-page, saas-landing, portfolio, blog, dashboard, auth-pages, ecommerce, content-site, app-shell}. Use confidence < 0.5 when several would fit. Set to null only when the request is too vague to guess.\n" +
    "- variantNomination: only nominate when scaffoldNomination is set. Variant ids live under config/scaffold-variants/<scaffold>/. If unsure of exact id, set to null.\n\n" +
    "REQUESTED CAPABILITIES (drives dossier injection):\n" +
    "- Declare the abstract capabilities the site explicitly needs. Each one is matched 1:1 against a dossier at runtime.\n" +
    "- Only include a capability when the prompt CLEARLY asks for it. Pure visual/content sites should return [].\n" +
    capabilityBlock +
    "- Use kebab-case. Cap at 6. Skip any capability you are not certain the user wants — false positives drag in env vars and dependencies.\n\n" +
    "SCOPE AWARENESS (important):\n" +
    "- Match the scope to the complexity of the user's request.\n" +
    "- A short, casual request (e.g. 'a page for Lasse's flea market') should produce a compact, single-page brief with 4-6 sections. Do NOT over-engineer it with multiple pages.\n" +
    "- A detailed, structured request with many requirements should produce a multi-page brief (2-5 pages) with richer sections.\n" +
    "- When in doubt, lean toward fewer pages with more polished sections rather than many thin pages.\n" +
    "- Always prefer quality over quantity: a beautiful one-pager beats a mediocre five-page site.\n\n" +
    "DESIGN GUIDANCE FIELDS (always present, set null/[] when ambiguous):\n" +
    "- domainProfile: Go beyond generic labels. A heavy-metal band selling merch is 'heavy-metal-merch-store', not just 'ecommerce'. An artisan bakery is 'artisan-bakery', not 'restaurant'. Be specific — this drives structural hints. Use null only when no domain fits.\n" +
    "- motionLevel: Match animation to the subject. A law firm → 'minimal'. A children's toy store → 'lively'. Most sites → 'moderate'. Use null only if truly ambiguous.\n" +
    "- qualityBar: Visual density. A zen meditation studio → 'clean'. A SaaS landing page → 'premium'. A gaming/nightclub site → 'bold-dramatic'. Use null only if truly ambiguous.\n" +
    "- seasonalHints: Only when the request has a clear seasonal or cultural theme (e.g. ['christmas', 'winter']). Use [] when not seasonal.\n\n" +
    "VARIANT HINTS (when provided in the user message):\n" +
    "- Use the scaffold variant as a design starting point for colorPalette, typography, and styleKeywords.\n" +
    "- Adjust when the user's request clearly calls for a different direction.\n" +
    "- If the variant says 'dark' but the user asks for a bright, airy site — follow the user.\n" +
    "- If the variant has a font pairing and nothing in the prompt contradicts it — adopt it.\n" +
    "- When variant hints contain explicit `Variant theme tokens` (background, primary, accent, etc.), copy them VERBATIM into `visualDirection.colorPalette` UNLESS the prompt explicitly mentions different colors. Map: variant background → palette.background, variant foreground → palette.text, variant primary → palette.primary, variant secondary → palette.secondary, variant accent → palette.accent.\n" +
    "- When variant hints contain a font pairing, copy `heading` and `body` VERBATIM into `visualDirection.typography.headings` / `.body` UNLESS the prompt names a specific font.\n" +
    "- Do NOT 'improve', 'modernize', or substitute variant tokens for trendier defaults — they are calibrated per scaffold variant. Echoing them keeps brief and downstream CSS aligned.\n\n" +
    "PAGE COUNT (when the user message states an explicit number of pages):\n" +
    "- If the user message contains a `User explicitly requested N pages` line, that count is a HARD CAP. Produce EXACTLY N entries in `pages`, never more. Pick the most important pages and merge sub-purposes into sections of those pages instead of spawning new entries.\n\n" +
    "DELTA-BRIEF (when prior design context is provided):\n" +
    "- You are updating a prior design, not starting from scratch.\n" +
    "- Preserve aspects not explicitly changed by the new request (brand, structure, tone).\n" +
    "- If the user says 'make it dark' — change palette/mood but keep pages, brand, and structure.\n" +
    "- If the user describes a completely new site — treat it as a fresh brief, ignoring prior context."
  );
}

function buildBriefUserPrompt(
  prompt: string,
  imageGenerations: boolean,
  variantHints?: string,
  priorDesignContext?: string,
): string {
  const siteTypeHint = inferSiteTypeHintFromDomain(prompt);
  const explicitPageCount = detectExplicitPageCount(prompt);
  const pageCapLine = explicitPageCount !== null
    ? `\n\nUser explicitly requested ${explicitPageCount} pages — produce EXACTLY ${explicitPageCount} entries in the pages array, no more. Merge sub-purposes into sections of those pages instead of spawning new pages.`
    : "";
  return (
    prompt +
    (priorDesignContext ? `\n\n${priorDesignContext}` : "") +
    (siteTypeHint ? `\n\nSite type hint: ${siteTypeHint}.` : "") +
    (variantHints ? `\n\n${variantHints}` : "") +
    pageCapLine +
    (imageGenerations
      ? "\n\nInclude imagery guidance because image generation is enabled."
      : "\n\nImage generation is disabled; prefer layout and iconography, keep imagery optional.")
  );
}

export type SiteBriefGenerationResult = {
  brief: Record<string, unknown>;
  briefQuality: Exclude<BriefQuality, "none">;
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
  providerOverride?: "openai" | "gateway" | "anthropic",
): SiteBriefHttpError | null {
  const resolvedProvider = resolvePromptAssistProvider(normalizedModel);
  const normalizedProviderOverride = providerOverride === "gateway" ? "openai" : providerOverride;
  if (normalizedProviderOverride && normalizedProviderOverride !== resolvedProvider) {
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
): Promise<SiteBriefGenerationResult | null> {
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
  const maxTokens = resolveMaxTokens(requestedMaxTokens);
  const userPrompt = buildBriefUserPrompt(prompt, imageGenerations, variantHints, priorDesignContext);
  const briefSource = normalizeBriefLogSource(source);

  debugLog("brief", `model_call ${normalizedModel} provider=${resolvedProvider} maxTokens=${maxTokens}`);
  devLogAppend("latest", {
    type: "assist.brief.request",
    source: briefSource,
    provider: resolvedProvider,
    model: normalizedModel,
    prompt,
    imageGenerations,
    maxTokens,
  });

  const briefSystemPrompt = buildBriefSystemPrompt();

  if (resolvedProvider === "anthropic") {
    const directModel = createDirectModel(`anthropic/${resolveAnthropicBriefModelId(normalizedModel)}`);
    try {
      const result = await generateObject({
        model: directModel,
        schema: siteBriefSchema,
        messages: [
          { role: "system", content: briefSystemPrompt },
          { role: "user", content: userPrompt },
        ],
        maxRetries: 1,
        maxOutputTokens: maxTokens,
        abortSignal,
        ...getTemperatureConfig(normalizedModel, temperature),
      });
      const briefObject = applyBriefQuality(result.object as Record<string, unknown>, INITIAL_BRIEF_QUALITY);
      const pages = Array.isArray(briefObject.pages) ? briefObject.pages.length : 0;
      devLogAppend("latest", {
        type: "assist.brief.response",
        provider: "anthropic",
        model: normalizedModel,
        briefQuality: INITIAL_BRIEF_QUALITY,
        projectTitle: typeof briefObject.projectTitle === "string" ? briefObject.projectTitle : null,
        pages,
      });
      return {
        brief: briefObject,
        briefQuality: "full",
        provider: "anthropic",
        normalizedModel,
      };
    } catch (briefErr) {
      const errMsg = briefErr instanceof Error ? briefErr.message : String(briefErr);
      errorLog("AI", "Anthropic brief generation failed", {
        model: normalizedModel,
        promptLength: prompt.length,
        error: errMsg,
      });
      return null;
    }
  }

  const directModel = createDirectModel(normalizedModel);
  try {
    const result = await generateObject({
      model: directModel,
      schema: siteBriefSchema,
      messages: [
        { role: "system", content: briefSystemPrompt },
        { role: "user", content: userPrompt },
      ],
      maxRetries: 1,
      maxOutputTokens: maxTokens,
      abortSignal,
      ...getTemperatureConfig(normalizedModel, temperature),
    });
    const briefObject = applyBriefQuality(result.object as Record<string, unknown>, INITIAL_BRIEF_QUALITY);
    const pages = Array.isArray(briefObject.pages) ? briefObject.pages.length : 0;
    devLogAppend("latest", {
      type: "assist.brief.response",
      provider: "openai",
      model: normalizedModel,
      briefQuality: INITIAL_BRIEF_QUALITY,
      projectTitle: typeof briefObject.projectTitle === "string" ? briefObject.projectTitle : null,
      pages,
    });
    devLogAppend("in-progress", {
      type: "brief.full",
      provider: "openai",
      model: normalizedModel,
      brief: briefObject,
    });
    return {
      brief: briefObject,
      briefQuality: INITIAL_BRIEF_QUALITY,
      provider: "openai",
      normalizedModel,
    };
  } catch (briefErr) {
    const errMsg = briefErr instanceof Error ? briefErr.message : String(briefErr);
    errorLog("AI", "Brief generation failed", {
      model: normalizedModel,
      promptLength: prompt.length,
      error: errMsg,
    });
    return null;
  }
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
  variantHints?: string;
  priorDesignContext?: string;
}): Promise<{ brief: Record<string, unknown>; modelUsed: string } | null> {
  const normalized = normalizeAssistModel(
    params.assistModelHint?.trim() || AUTO_BRIEF_MODEL_OPENAI,
  );
  const runnable = resolveRunnableBriefModel(normalized);
  if (!runnable) return null;

  try {
    const generated = await generateSiteBriefObject({
      prompt: params.prompt,
      normalizedModel: runnable,
      imageGenerations: params.imageGenerations,
      abortSignal: params.signal,
      source: params.priorDesignContext ? "server_delta_brief" : "server_auto_brief",
      variantHints: params.variantHints,
      priorDesignContext: params.priorDesignContext,
    });
    if (!generated) return null;
    const { brief, normalizedModel } = generated;
    return { brief: applyBriefQuality(brief, "server-auto"), modelUsed: normalizedModel };
  } catch (e) {
    console.warn("[server-auto-brief] Generation failed:", e instanceof Error ? e.message : e);
    return null;
  }
}
