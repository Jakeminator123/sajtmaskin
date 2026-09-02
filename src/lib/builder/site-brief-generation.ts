/**
 * Shared Deep Brief (structured site brief) generation for `/api/ai/brief`
 * and server-side auto-brief in create-chat streams.
 */
import {
    getBriefingEnvKeysFromManifest,
    getPerTierBriefingFromManifest,
    type BuildProfileId,
} from "@/lib/ai-models/load-manifest";
import {
    attachBriefReasoningSummary,
    extractGenerateObjectReasoning,
    OPENAI_REASONING_SUMMARY_DETAILED,
    openaiBriefReasoningProviderOptions,
    supportsOpenAIReasoningSummary,
} from "@/lib/builder/deep-brief-visibility";
import { createDirectModel, getTemperatureConfig } from "@/lib/builder/direct-model";
import {
    DOMAIN_PROFILES,
    inferSiteTypeHintFromDomain,
} from "@/lib/builder/domain-inference";
import {
    isAnthropicAssistModel,
    isOpenAIAssistModel,
    isPromptAssistModelAllowed,
    normalizeAssistModel,
    resolvePromptAssistProvider,
} from "@/lib/builder/prompt-assist";
import { MAX_AI_BRIEF_PROMPT_CHARS } from "@/lib/builder/prompt-limits";
import {
    ASSIST_MAX_OUTPUT_TOKENS,
    AUTO_BRIEF_MODEL_ANTHROPIC,
    AUTO_BRIEF_MODEL_OPENAI,
    BRIEF_MODEL,
} from "@/lib/gen/defaults";
import { devLogAppend } from "@/lib/logging/dev-log";
import { recordLlmUsage } from "@/lib/observability/llm-usage";
import { debugLog, errorLog } from "@/lib/utils/debug";
import { generateObject } from "ai";
import { createHash } from "node:crypto";
import { z } from "zod";

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
  /** Byggval Hemsida/App — hard intent for the brief LLM. */
  buildIntent: z.enum(["website", "app"]).optional(),
  scaffoldId: z.string().trim().min(1).max(80).optional(),
  pageCountHint: z.number().int().min(1).max(3).optional(),
  styleChoiceHint: z.string().trim().min(1).max(40).optional(),
  styleKeywordsHint: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
  toneKeywordsHint: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
  colorModeHint: z.enum(["light", "dark"]).optional(),
  complexityHint: z.enum(["simple", "medium", "complex"]).optional(),
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

export type BriefTrace = {
  source: string;
  promptHash: string;
  traceId: string;
};

function stableTracePayload(input: Record<string, unknown>): string {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(input).sort()) {
    sorted[key] = input[key] ?? null;
  }
  return JSON.stringify(sorted);
}

export function buildBriefTrace(input: {
  source?: string;
  prompt: string;
  modelId: string;
  imageGenerations: boolean;
  temperature?: number;
  maxTokens?: number;
  /** Extra fields hashed into promptHash (Byggval, etc.). */
  extraHashFields?: Record<string, unknown>;
}): BriefTrace {
  const source = normalizeBriefLogSource(input.source);
  const promptHash = createHash("sha256")
    .update(
      stableTracePayload({
        prompt: input.prompt.trim(),
        imageGenerations: input.imageGenerations,
        temperature: typeof input.temperature === "number" ? input.temperature : null,
        maxTokens: typeof input.maxTokens === "number" ? input.maxTokens : null,
        ...(input.extraHashFields ?? {}),
      }),
      "utf8",
    )
    .digest("hex")
    .slice(0, 24);

  return {
    source,
    promptHash,
    traceId: `brief:${source}:${input.modelId}:${promptHash}`,
  };
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

const domainProfileSchema = z.enum(DOMAIN_PROFILES);

const motionLevelSchema = z.enum(["minimal", "moderate", "lively"]);
const qualityBarSchema = z.enum(["clean", "premium", "bold-dramatic"]);

export const siteBriefSchema = z.object({
  projectTitle: z.string().describe("Short internal project title"),
  brandName: z.string().describe("Brand/company name if present, else empty string"),
  oneSentencePitch: z.string().describe("A single sentence describing what the site is about"),
  targetAudience: z.string().describe("Primary audience / persona"),
  primaryCallToAction: z.string().describe('Main CTA label, e.g. "Book a demo"'),
  toneAndVoice: z.array(z.string()).min(1).max(8).describe("Tone keywords"),
  domainProfile: domainProfileSchema.describe("Canonical domain profile slug, or general"),
  motionLevel: motionLevelSchema.describe("How much motion the generated site should use"),
  qualityBar: qualityBarSchema.describe("Visual quality bar for downstream prompt guidance"),
  seasonalHints: z
    .array(z.string())
    .max(8)
    .describe("Optional seasonal or contextual visual hints; empty array when none"),
  requestedCapabilities: z
    .array(z.string())
    .max(12)
    .describe(
      "Real requested capability ids in kebab-case, e.g. auth, payments, database, media-storage, ai-chat, booking, visual-3d, physics-3d, physics-2d, scroll-story, carousel, command-palette, site-search, map-display, gallery-lightbox, dashboard-charts, contact-form, newsletter-subscribe. There is ONE auth capability (`auth`) — the provider (Clerk default / Supabase on explicit ask) resolves downstream. Plain content sections (FAQ, pricing, testimonials, logo row, stats, CTA, multi-step form UI) are page content, not capability ids. Do not list generic page sections like hero, about, contact, footer, or SEO.",
    ),
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
          .min(1)
          .max(14),
      }),
    )
    .min(1)
    .max(10),
  visualDirection: z.object({
    styleKeywords: z.array(z.string()).min(2).max(12),
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

/**
 * Fallback-schemat är medvetet tolerant — varje fält har ett `.default()` så en
 * osäker modell kan utelämna det. Men OpenAI:s strikta structured outputs kräver
 * att `required` listar VARJE nyckel i `properties`, och Zods `.default()` gör
 * fältet optional i det genererade JSON-schemat. Fjorton av femton toppnycklar
 * och `bullets` i sektionsobjektet hamnade därför utanför `required`, så OpenAI
 * avvisade schemat med 422 "Missing 'bullets'" innan modellen ens svarade:
 * säkerhetsnätet fanns bara på pappret (observerat i prod 2026-07-27).
 *
 * Fallbacken skickas därför i icke-strikt läge. Toleransen är hela poängen med
 * schemat, så det är inställningen som ska ge sig — inte schemat. Nyckeln
 * ignoreras av andra leverantörer, så samma objekt kan användas på båda vägarna.
 */
export const SIMPLIFIED_SCHEMA_PROVIDER_OPTIONS = {
  openai: { strictJsonSchema: false },
} as const;

type BriefGenerateObjectProviderOptions = {
  openai: {
    reasoningSummary?: "detailed";
    strictJsonSchema?: boolean;
  };
};

/**
 * Exporterad för regressionstestet: invarianten "fallback-schemat skickas
 * icke-strikt" måste vaktas på vägen som faktiskt anropar `generateObject`.
 * Vaktar testet bara konstanten ovan blir det grönt även om den här helpern
 * slutar skicka flaggan.
 */
export function briefGenerateObjectProviderOptions(
  provider: "openai" | "anthropic",
  modelId: string,
  simplified: boolean,
): { providerOptions?: BriefGenerateObjectProviderOptions } {
  const nonStrict = { ...SIMPLIFIED_SCHEMA_PROVIDER_OPTIONS.openai };
  if (provider === "anthropic" || !supportsOpenAIReasoningSummary(modelId)) {
    return simplified ? { providerOptions: { openai: nonStrict } } : {};
  }
  if (simplified) {
    return {
      providerOptions: {
        openai: { ...nonStrict, reasoningSummary: OPENAI_REASONING_SUMMARY_DETAILED },
      },
    };
  }
  return { providerOptions: openaiBriefReasoningProviderOptions() };
}

export const simplifiedBriefSchema = z.object({
  projectTitle: z.string(),
  brandName: z.string().default(""),
  oneSentencePitch: z.string(),
  targetAudience: z.string().default("General audience"),
  primaryCallToAction: z.string().default("Get Started"),
  toneAndVoice: z.array(z.string()).default([]),
  domainProfile: domainProfileSchema.default("general"),
  motionLevel: motionLevelSchema.default("minimal"),
  qualityBar: qualityBarSchema.default("clean"),
  seasonalHints: z.array(z.string()).default([]),
  requestedCapabilities: z.array(z.string()).default([]),
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

/**
 * Ett misslyckat brief-försök har ändå förbrukat tokens hos leverantören.
 *
 * AI SDK:s `NoObjectGeneratedError` bär `usage` när modellen svarade men svaret
 * inte gick att tolka mot schemat — då loggas den verkliga volymen. Andra fel
 * (timeout, kvot, transport) saknar siffror, och raden sparas då som ett
 * misslyckat anrop så luckan i förbrukningen går att förklara.
 */
function recordFailedBriefAttempt(params: {
  model: string;
  workload: string;
  error: unknown;
  durationMs: number;
  schema?: "full" | "simplified";
}): void {
  const errorObject =
    params.error && typeof params.error === "object"
      ? (params.error as { usage?: unknown; name?: unknown })
      : null;
  recordLlmUsage({
    phase: "brief",
    workload: params.workload,
    model: params.model,
    usage: errorObject?.usage,
    durationMs: params.durationMs,
    ok: false,
    errorCode:
      typeof errorObject?.name === "string" ? errorObject.name : "brief_schema_failed",
    meta: {
      schema: params.schema ?? "full",
      outcome:
        (params.schema ?? "full") === "full" ? "retried_with_simplified" : "gave_up",
    },
  });
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
  "CANONICAL INIT SIGNALS:\n" +
  "- `domainProfile` must be one canonical slug from the schema; use `general` when no specific domain is clear.\n" +
  "- `motionLevel`: use `minimal` for calm/static sites, `moderate` for normal polished interaction, `lively` only when the user asks for strong animation, 3D, immersive, parallax, or highly dynamic visuals.\n" +
  "- `qualityBar`: use `clean` for simple/local pages, `premium` for polished or high-end work, and `bold-dramatic` only for explicitly cinematic, moody, experimental, or dramatic design directions.\n" +
  "- `seasonalHints` should be an empty array unless the prompt clearly mentions a season, holiday, event, campaign, or location-specific seasonal cue.\n" +
  "- `requestedCapabilities` is for real implementation capabilities only. Prefer existing ids when relevant: `auth`, `payments`, `database`, `media-storage`, `ai-chat`, `visual-3d`, `physics-3d`, `physics-2d`, `scroll-story`, `carousel`, `command-palette`, `site-search`, `map-display`, `gallery-lightbox`, `dashboard-charts`, `contact-form`, `newsletter-subscribe`. The integration ids are explicit-ask-only: add `payments` ONLY for a real ONE-OFF purchase/checkout ask — recurring subscriptions/memberships have NO capability id anymore (their dossier is parked): describe membership/subscription surfaces as ordinary page content and never route them to `payments`, while a newsletter signup is `newsletter-subscribe`; add `database` ONLY when the user explicitly asks for persistent server-side data storage (saving orders/bookings/submissions to a database, a data backend, or names Postgres/PostgreSQL/MongoDB/Neon — naming a DB brand still means the `database` capability / postgres-drizzle; there is no provider-specific capability id) — NOT for static content pages, NOT for a contact form alone (that is `contact-form`), and NOT for vector/semantic search stores; a content management system / headless CMS has NO capability id anymore (its dossier is parked) — describe editable content, blogs and news sections as ordinary page content and never invent a `cms` id; add `media-storage` ONLY when the user explicitly wants the site to host and show their OWN heavy media — their own MP4/video files, a growing photo library, 'ladda upp egna bilder/filmer', 'mediabibliotek', or names Vercel Blob / file storage — NOT for a few design images from the brief, NOT for embedding YouTube/Vimeo/Instagram, and NOT for visitor uploads; add `ai-chat` for any chatbot / AI-assistant surface — including tool-calling, function-calling, RAG, document Q&A, or 'chatbot som svarar från våra dokument' (those are chatbot asks, not separate capability ids; `ai-tool-calling` and `rag-chat` no longer exist). BE HONEST about what ships: the chat surface is a STANDARD conversational bot without retrieval or tool execution — describe any retrieval/tool wishes as prose in the page description, never as a working feature the chat performs. Add `analytics` ONLY when the user explicitly asks for web/traffic analytics or visitor tracking (Vercel Analytics, Plausible, Google Analytics, PostHog, 'besöksstatistik') — NEVER by default and NEVER just because a site would benefit from measuring traffic. Realtime infrastructure, in-site AI image generation and error/crash monitoring have no capability ids anymore (their dossiers are parked) — treat such asks as ordinary page content or leave them out. For login/auth of any kind use `auth` (there is ONE auth capability; the provider — Clerk by default, Supabase on an explicit Supabase ask — is resolved downstream from the prompt, so never invent a provider-specific capability id). Add `site-search` when visitors should search the site's own content (pages, products, articles) — a cmd+k navigation palette is `command-palette`, and chat-style answers from documents are `ai-chat`. Add `map-display` when the site should show a map with markers ('hitta hit', store locations, venue) — geocoding/routing/'near me' features are NOT covered and must not force this id. Use `physics-3d` only for explicit gravity, bouncing, falling, collisions, rigid bodies or physics simulation IN 3D — ordinary hovering/floating 3D stays `visual-3d`. Use `physics-2d` ONLY when the user explicitly asks for Matter.js, 2D/DOM physics, or physics-driven cards/images/labels that fall, stack, bounce and can be dragged on the page (no 3D, no WebGL) — NOT for CSS hover/bounce effects, confetti, parallax or drag-to-sort lists. Use `scroll-story` ONLY for explicit scrollytelling: 'scrollytelling', 'scrollberättelse', several pinned/sticky scenes or chapters that change while scrolling, an Apple-style product presentation — NOT for a hero parallax, scroll reveal/fade-in, a sticky header or a long landing page; plain parallax stays ordinary page content. Add `visual-3d` ONLY when the user explicitly asks for 3D, WebGL, Three.js, a canvas/mesh scene, or a GLB/GLTF model — NEVER for mood words like 'cinematic', 'immersive', 'dramatic', 'atmospheric', or 'moody' on their own; express that mood through `motionLevel`/`qualityBar` instead. `gallery-lightbox` (click-to-enlarge image gallery) and `dashboard-charts` (DATA charts/graphs or an analytics/dashboard page — NOT flow charts, org charts or process diagrams, which are ordinary page content) are explicit-ask-only. Plain content sections (FAQ, pricing table, testimonials, logo row, stats band, CTA, multi-step form UI, marquee, parallax) are ORDINARY PAGE CONTENT — describe them in `pages[].sections`, never as capability ids. Do NOT list generic structural sections like hero, about, contact, footer, or SEO, and never add a capability just because it would be nice to have.\n\n" +
  "- Add `booking` ONLY for real APPOINTMENT scheduling with provider-owned availability (consultations, treatments, classes or service times; Cal.com is the current provider) — NOT for a decorative date picker, a booking-request form, hotel rooms, restaurant tables, tickets or generic 'Boka' CTA copy.\n\n" +
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
  const siteTypeHint = inferSiteTypeHintFromDomain(prompt);
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
  /** generateObject.reasoning when the provider returned a summary; otherwise null. */
  reasoningSummary: string | null;
  usedSimplified: boolean;
  provider: "openai" | "anthropic";
  normalizedModel: string;
  trace: BriefTrace;
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
        error: "Model not allowed for Deep Brief",
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
          setup: "Set model to a supported Anthropic Deep Brief model.",
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
          setup: "Set model to a supported OpenAI Deep Brief model (e.g. openai/gpt-5.4).",
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
    /** Extra fields hashed into the brief trace (Byggval cache identity). */
    extraHashFields?: Record<string, unknown>;
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
    extraHashFields,
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
  const promptLength = userPrompt?.length ?? 0;
  const dynamicMaxTokens =
    promptLength < 200
      ? Math.min(ENV_MAX_TOKENS, 8_000)
      : promptLength < 1_000
        ? Math.min(ENV_MAX_TOKENS, 24_000)
        : ENV_MAX_TOKENS;
  const outputTokenCap = Math.min(maxTokens, dynamicMaxTokens);
  const briefSource = normalizeBriefLogSource(source);
  const trace = buildBriefTrace({
    source: briefSource,
    prompt,
    modelId: normalizedModel,
    imageGenerations,
    temperature,
    maxTokens: requestedMaxTokens,
    extraHashFields,
  });

  debugLog("AI", "Brief model call started (same request, direct provider)", {
    source: briefSource,
    traceId: trace.traceId,
    promptHash: trace.promptHash,
    provider: logProvider,
    transport: "direct_provider_api",
    sdk: "ai",
    requestStage: "model_call",
    model: normalizedModel,
    promptLength: prompt.length,
    temperature: typeof temperature === "number" ? temperature : null,
    imageGenerations,
    maxTokens,
    dynamicMaxTokens,
    outputTokenCap,
  });
  devLogAppend("latest", {
    type: "assist.brief.request",
    source: briefSource,
    traceId: trace.traceId,
    promptHash: trace.promptHash,
    provider: logProvider,
    model: normalizedModel,
    prompt,
    imageGenerations,
    maxTokens,
    dynamicMaxTokens,
    outputTokenCap,
  });

  const briefStartedAt = Date.now();
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
        maxOutputTokens: outputTokenCap,
        abortSignal,
        ...briefGenerateObjectProviderOptions("anthropic", normalizedModel, false),
        ...getTemperatureConfig(normalizedModel, temperature),
      });
    } catch (fullSchemaErr) {
      debugLog("AI", "Full Anthropic brief schema failed, trying simplified", {
        error: fullSchemaErr instanceof Error ? fullSchemaErr.message : String(fullSchemaErr),
      });
      // Det misslyckade försöket kostade tokens även om det inte gav något
      // objekt. Utan den här raden försvinner den kostnaden ur körningen.
      recordFailedBriefAttempt({
        model: `anthropic/${resolveAnthropicBriefModelId(normalizedModel)}`,
        workload: briefSource,
        error: fullSchemaErr,
        durationMs: Date.now() - briefStartedAt,
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
          maxOutputTokens: Math.min(outputTokenCap, 40_960),
          abortSignal,
          ...briefGenerateObjectProviderOptions("anthropic", normalizedModel, true),
          ...getTemperatureConfig(normalizedModel, temperature),
        });
        usedSimplified = true;
      } catch (simplifiedErr) {
        recordFailedBriefAttempt({
          model: `anthropic/${resolveAnthropicBriefModelId(normalizedModel)}`,
          workload: briefSource,
          error: simplifiedErr,
          durationMs: Date.now() - briefStartedAt,
          schema: "simplified",
        });
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
    recordLlmUsage({
      phase: "brief",
      workload: briefSource,
      model: `anthropic/${resolveAnthropicBriefModelId(normalizedModel)}`,
      usage: result.usage,
      durationMs: Date.now() - briefStartedAt,
      meta: { schema: usedSimplified ? "simplified" : "full" },
    });
    const briefObject = result.object as Record<string, unknown>;
    const reasoningSummary = extractGenerateObjectReasoning(result);
    const pages = Array.isArray(briefObject.pages) ? briefObject.pages.length : 0;
    devLogAppend("latest", {
      type: "assist.brief.response",
      source: briefSource,
      traceId: trace.traceId,
      promptHash: trace.promptHash,
      provider: "anthropic",
      model: normalizedModel,
      schema: usedSimplified ? "simplified" : "full",
      projectTitle: typeof briefObject.projectTitle === "string" ? briefObject.projectTitle : null,
      pages,
      reasoningChars: reasoningSummary?.length ?? 0,
    });
    return {
      brief: attachBriefReasoningSummary(briefObject, reasoningSummary),
      reasoningSummary,
      usedSimplified,
      provider: "anthropic",
      normalizedModel,
      trace,
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
      maxOutputTokens: outputTokenCap,
      abortSignal,
      ...briefGenerateObjectProviderOptions("openai", normalizedModel, false),
      ...getTemperatureConfig(normalizedModel, temperature),
    });
  } catch (fullSchemaErr) {
    debugLog("AI", "Full brief schema failed, trying simplified", {
      error: fullSchemaErr instanceof Error ? fullSchemaErr.message : String(fullSchemaErr),
    });
    recordFailedBriefAttempt({
      model: normalizedModel,
      workload: briefSource,
      error: fullSchemaErr,
      durationMs: Date.now() - briefStartedAt,
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
        maxOutputTokens: Math.min(outputTokenCap, 40_960),
        abortSignal,
        ...briefGenerateObjectProviderOptions("openai", normalizedModel, true),
        ...getTemperatureConfig(normalizedModel, temperature),
      });
      usedSimplified = true;
    } catch (simplifiedErr) {
      recordFailedBriefAttempt({
        model: normalizedModel,
        workload: briefSource,
        error: simplifiedErr,
        durationMs: Date.now() - briefStartedAt,
        schema: "simplified",
      });
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
  recordLlmUsage({
    phase: "brief",
    workload: briefSource,
    model: normalizedModel,
    usage: result.usage,
    durationMs: Date.now() - briefStartedAt,
    meta: { schema: usedSimplified ? "simplified" : "full" },
  });
  const briefObject = result.object as Record<string, unknown>;
  const reasoningSummary = extractGenerateObjectReasoning(result);
  const pages = Array.isArray(briefObject.pages) ? briefObject.pages.length : 0;
  devLogAppend("latest", {
    type: "assist.brief.response",
    source: briefSource,
    traceId: trace.traceId,
    promptHash: trace.promptHash,
    provider: "openai",
    model: normalizedModel,
    schema: usedSimplified ? "simplified" : "full",
    projectTitle: typeof briefObject.projectTitle === "string" ? briefObject.projectTitle : null,
    pages,
    reasoningChars: reasoningSummary?.length ?? 0,
  });
  return {
    brief: attachBriefReasoningSummary(briefObject, reasoningSummary),
    reasoningSummary,
    usedSimplified,
    provider: "openai",
    normalizedModel,
    trace,
  };
}

function resolveRunnableBriefModel(preferred: string): string | null {
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY?.trim());
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  if (!hasOpenAI && !hasAnthropic) return null;

  let m = preferred;
  if (!isPromptAssistModelAllowed(m)) {
    // Säg ifrån i stället för att byta tyst. `briefingModel` i manifestet är
    // operatörsredigerbart och valideras bara som "icke-tom sträng" i både
    // JSON-schemat och Zod-fallbacken, så en felstavning ser grön ut hela
    // vägen och märks först som "briefen använder fel modell".
    console.warn(
      `[server-auto-brief] "${m}" är inte en tillåten Deep Brief-modell — ` +
        `använder ${AUTO_BRIEF_MODEL_OPENAI} i stället. Kontrollera briefingModel i config/ai_models/manifest.json.`,
    );
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
export function resolveServerAutoBriefPreferredModel(params: {
  modelTier?: BuildProfileId | null;
  assistModelHint?: string | null;
}): string {
  const explicitModel = params.assistModelHint?.trim();
  const tierModel = params.modelTier
    ? getPerTierBriefingFromManifest()?.[params.modelTier]?.briefingModel.trim()
    : "";
  const tierProvider = tierModel
    ? resolvePromptAssistProvider(normalizeAssistModel(tierModel))
    : null;
  const briefingEnvKeys = getBriefingEnvKeysFromManifest();
  const envModel =
    tierProvider === "anthropic"
      ? process.env[briefingEnvKeys.serverAutoAnthropic]?.trim()
      : tierProvider === "openai"
        ? process.env[briefingEnvKeys.serverAutoOpenAI]?.trim()
        : "";
  return normalizeAssistModel(explicitModel || envModel || tierModel || AUTO_BRIEF_MODEL_OPENAI);
}

export async function tryGenerateServerAutoBrief(params: {
  prompt: string;
  modelTier?: BuildProfileId | null;
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
}): Promise<{ brief: Record<string, unknown>; modelUsed: string; trace: BriefTrace } | null> {
  const normalized = resolveServerAutoBriefPreferredModel(params);
  const runnable = resolveRunnableBriefModel(normalized);
  if (!runnable) return null;

  try {
    const { brief, normalizedModel, trace } = await generateSiteBriefObject({
      prompt: params.prompt,
      normalizedModel: runnable,
      imageGenerations: params.imageGenerations,
      abortSignal: params.signal,
      source: "server_auto_brief",
      variantHints: params.variantHints,
      priorDesignContext: params.priorDesignContext,
    });
    return { brief, modelUsed: normalizedModel, trace };
  } catch (e) {
    console.warn("[server-auto-brief] Generation failed:", e instanceof Error ? e.message : e);
    return null;
  }
}
