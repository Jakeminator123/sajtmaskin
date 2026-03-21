import { generateObject } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireNotBot } from "@/lib/botProtection";
import { withRateLimit } from "@/lib/rateLimit";
import { debugLog, errorLog } from "@/lib/utils/debug";
import { devLogAppend } from "@/lib/logging/devLog";
import {
  isAnthropicAssistModel,
  isGatewayAssistModel,
  isPromptAssistModelAllowed,
  isV0AssistModel,
  normalizeAssistModel,
  resolvePromptAssistProvider,
} from "@/lib/builder/promptAssist";
import {
  createDirectModel,
  getAnthropicAssistThinkingOptions,
  getOpenAIAssistReasoningOptions,
  getTemperatureConfig,
} from "@/lib/builder/gateway-policy";
import { MAX_AI_BRIEF_PROMPT_CHARS } from "@/lib/builder/promptLimits";
export const runtime = "nodejs";
export const maxDuration = 600;

import { ASSIST_MAX_OUTPUT_TOKENS } from "@/lib/gen/defaults";

const ENV_MAX_TOKENS = Number(process.env.AI_BRIEF_MAX_TOKENS) || 131_072;

const briefRequestSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(1, "prompt is required")
    .max(MAX_AI_BRIEF_PROMPT_CHARS, `prompt too long (max ${MAX_AI_BRIEF_PROMPT_CHARS} chars)`),
  provider: z.enum(["gateway", "v0", "anthropic"]).optional(),
  // gpt-5.2 provides best quality briefs; used as default for prompt assist
  model: z.string().min(1).optional().default("openai/gpt-5.2"),
  temperature: z.number().min(0).max(2).optional(),
  imageGenerations: z.boolean().optional().default(true),
  maxTokens: z.number().int().positive().max(ENV_MAX_TOKENS).optional(),
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

// Full schema - used when model can handle complexity
const siteBriefSchema = z.object({
  projectTitle: z.string().describe("Short internal project title"),
  brandName: z.string().describe("Brand/company name if present, else empty string"),
  oneSentencePitch: z.string().describe("A single sentence describing what the site is about"),
  targetAudience: z.string().describe("Primary audience / persona"),
  primaryCallToAction: z.string().describe('Main CTA label, e.g. "Book a demo"'),
  toneAndVoice: z.array(z.string()).max(8).describe("Tone keywords"),
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
              bullets: z.array(z.string()).max(8),
            }),
          )
          .max(14),
      }),
    )
    .min(1)
    .max(10),
  visualDirection: z.object({
    styleKeywords: z.array(z.string()).max(12),
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
    styleKeywords: z.array(z.string()).max(12),
    suggestedSubjects: z.array(z.string()).max(16),
    altTextRules: z.array(z.string()).max(8),
  }),
  uiNotes: z.object({
    components: z.array(z.string()).max(16),
    interactions: z.array(z.string()).max(16),
    accessibility: z.array(z.string()).max(16),
  }),
  seo: z.object({
    titleTemplate: z.string().describe('e.g. "{page} | Brand"'),
    metaDescription: z.string().describe("One concise meta description"),
    keywords: z.array(z.string()).max(30),
  }),
});

// Simplified fallback schema — fewer optional parameters to stay within
// Anthropic's grammar compilation limit (24 optionals max).
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
      colorPalette: z.object({
        primary: z.string().default("#3b82f6"),
        secondary: z.string().default("#6366f1"),
        accent: z.string().default("#f59e0b"),
        background: z.string().default("#0a0a0a"),
        text: z.string().default("#ffffff"),
      }),
      typography: z.object({
        headings: z.string().default("Inter"),
        body: z.string().default("Inter"),
      }),
    })
    .optional(),
  imagery: z
    .object({
      needsImages: z.boolean().default(true),
      styleKeywords: z.array(z.string()).default([]),
      suggestedSubjects: z.array(z.string()).default([]),
      altTextRules: z.array(z.string()).default([]),
    })
    .optional(),
  uiNotes: z
    .object({
      components: z.array(z.string()).default([]),
      interactions: z.array(z.string()).default([]),
      accessibility: z.array(z.string()).default([]),
    })
    .optional(),
  seo: z
    .object({
      titleTemplate: z.string().default("{page} | Site"),
      metaDescription: z.string().default(""),
      keywords: z.array(z.string()).default([]),
    })
    .optional(),
});

type SiteTypeRule = {
  hint: string;
  keywords: string[];
};

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

export async function POST(req: Request) {
  return withRateLimit(req, "ai:brief", async () => {
    try {
      const botError = requireNotBot(req);
      if (botError) return botError;

      const body = await req.json().catch(() => null);
      const parsed = briefRequestSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Validation failed", details: parsed.error.issues },
          { status: 400 },
        );
      }

      const {
        prompt,
        provider,
        model,
        temperature,
        imageGenerations,
        maxTokens: requestedMaxTokens,
      } = parsed.data;
      const normalizedModel = normalizeAssistModel(model);
      const resolvedProvider = resolvePromptAssistProvider(normalizedModel);
      const maxTokens = resolveMaxTokens(requestedMaxTokens);

      if (provider && provider !== resolvedProvider) {
        return NextResponse.json(
          {
            error: "Provider does not match model",
            setup: `Model "${normalizedModel}" kräver provider "${resolvedProvider}".`,
          },
          { status: 400 },
        );
      }

      debugLog("AI", "AI brief request received", {
        provider: resolvedProvider,
        model: normalizedModel,
        promptLength: prompt.length,
        temperature: typeof temperature === "number" ? temperature : null,
        imageGenerations,
        maxTokens,
      });
      devLogAppend("latest", {
        type: "assist.brief.request",
        provider: resolvedProvider,
        model: normalizedModel,
        prompt,
        imageGenerations,
        maxTokens,
      });

      const systemPrompt =
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

      const siteTypeHint = inferSiteTypeHint(prompt);
      const userPrompt =
        prompt +
        (siteTypeHint ? `\n\nSite type hint: ${siteTypeHint}.` : "") +
        (imageGenerations
          ? "\n\nInclude imagery guidance because image generation is enabled."
          : "\n\nImage generation is disabled; prefer layout and iconography, keep imagery optional.");

      if (!isPromptAssistModelAllowed(normalizedModel)) {
        return NextResponse.json(
          {
            error: "Model not allowed for prompt assist",
            setup: "Välj en modell från listan i buildern (gateway eller v0-md/lg).",
          },
          { status: 400 },
        );
      }

      if (resolvedProvider === "v0" || isV0AssistModel(normalizedModel)) {
        return NextResponse.json(
          {
            error: "Deep brief is not supported via the v0 Model API",
            setup: "Välj en OpenAI- eller Anthropic-modell som stöder Deep Brief.",
          },
          { status: 400 },
        );
      }

      if (resolvedProvider === "anthropic") {
        if (
          !isAnthropicAssistModel(normalizedModel) &&
          !normalizedModel.startsWith("anthropic/")
        ) {
          return NextResponse.json(
            {
              error: "Invalid model for anthropic provider",
              setup: "Set model to a supported Anthropic prompt-assist model.",
            },
            { status: 400 },
          );
        }

        if (!process.env.ANTHROPIC_API_KEY?.trim()) {
          return NextResponse.json(
            {
              error: "Missing Anthropic API key",
              setup: "Set ANTHROPIC_API_KEY to use Anthropic Deep Brief.",
            },
            { status: 401 },
          );
        }

        const directModel = createDirectModel(
          `anthropic/${resolveAnthropicBriefModelId(normalizedModel)}`,
        );

        let usedSimplified = false;
        let result;

        try {
          result = await generateObject({
            model: directModel,
            schema: siteBriefSchema,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            maxRetries: 1,
            maxOutputTokens: maxTokens,
            ...getTemperatureConfig(normalizedModel, temperature),
            ...getAnthropicAssistThinkingOptions(),
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
                    systemPrompt +
                    "\n\nIMPORTANT: Keep your response concise. Arrays can be empty if you're unsure.",
                },
                { role: "user", content: userPrompt },
              ],
              maxRetries: 1,
              maxOutputTokens: Math.min(maxTokens, 65_536),
              ...getTemperatureConfig(normalizedModel, temperature),
              ...getAnthropicAssistThinkingOptions(),
            });
            usedSimplified = true;
          } catch (simplifiedErr) {
            const errMsg =
              simplifiedErr instanceof Error ? simplifiedErr.message : String(simplifiedErr);

            errorLog("AI", "Anthropic brief generation failed - both schemas", {
              model: normalizedModel,
              promptLength: prompt.length,
              fullError:
                fullSchemaErr instanceof Error ? fullSchemaErr.message : String(fullSchemaErr),
              simplifiedError: errMsg,
            });

            return NextResponse.json(
              {
                error: "AI kunde inte generera brief. Försök igen eller förenkla prompten.",
                details: errMsg.includes("could not parse")
                  ? "Modellen returnerade ett ogiltigt svar."
                  : errMsg,
                suggestion: "Prova att korta ner eller förtydliga din beskrivning.",
              },
              { status: 422 },
            );
          }
        }

        const briefObject = result.object as Record<string, unknown>;
        const pages = Array.isArray(briefObject.pages) ? briefObject.pages.length : 0;
        devLogAppend("latest", {
          type: "assist.brief.response",
          provider: "anthropic",
          model: normalizedModel,
          schema: usedSimplified ? "simplified" : "full",
          projectTitle:
            typeof briefObject.projectTitle === "string" ? briefObject.projectTitle : null,
          pages,
        });
        return NextResponse.json(result.object, {
          headers: {
            "Cache-Control": "no-store",
            "X-Provider": "anthropic",
            "X-Key-Source": "ANTHROPIC_API_KEY",
            ...(usedSimplified ? { "X-Schema": "simplified" } : {}),
          },
        });
      }

      if (!isGatewayAssistModel(normalizedModel) || normalizedModel.startsWith("anthropic/")) {
        return NextResponse.json(
          {
            error: "Invalid model for gateway provider",
            setup: 'Set model to a supported OpenAI prompt-assist model.',
          },
          { status: 400 },
        );
      }

      const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY?.trim());
      if (!hasOpenAiKey) {
        return NextResponse.json(
          {
            error: "Missing OPENAI_API_KEY for prompt assist",
            setup: "Set OPENAI_API_KEY in .env.local for local prompt assist and brief routes.",
          },
          { status: 401 },
        );
      }

      const keySource = "OPENAI_API_KEY";
      debugLog("AI", "AI Gateway auth resolved (brief)", {
        auth: keySource,
        provider: "gateway",
        model: normalizedModel,
      });

      const directModel = createDirectModel(normalizedModel);

      let usedSimplified = false;
      let result;

      try {
        result = await generateObject({
          model: directModel,
          schema: siteBriefSchema,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          maxRetries: 1,
          maxOutputTokens: maxTokens,
          ...getTemperatureConfig(normalizedModel, temperature),
          ...getOpenAIAssistReasoningOptions(normalizedModel),
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
              { role: "system", content: systemPrompt + "\n\nIMPORTANT: Keep your response concise. Arrays can be empty if you're unsure." },
              { role: "user", content: userPrompt },
            ],
            maxRetries: 1,
            maxOutputTokens: Math.min(maxTokens, 65_536),
            ...getTemperatureConfig(normalizedModel, temperature),
            ...getOpenAIAssistReasoningOptions(normalizedModel),
          });
          usedSimplified = true;
        } catch (simplifiedErr) {
          // Both schemas failed
          const errMsg = simplifiedErr instanceof Error ? simplifiedErr.message : String(simplifiedErr);

          errorLog("AI", "Brief generation failed - both schemas", {
            model: normalizedModel,
            promptLength: prompt.length,
            fullError: fullSchemaErr instanceof Error ? fullSchemaErr.message : String(fullSchemaErr),
            simplifiedError: errMsg,
          });

          return NextResponse.json(
            {
              error: "AI kunde inte generera brief. Försök igen eller förenkla prompten.",
              details: errMsg.includes("could not parse")
                ? "Modellen returnerade ett ogiltigt svar."
                : errMsg,
              suggestion: "Prova att korta ner eller förtydliga din beskrivning.",
            },
            { status: 422 },
          );
        }
      }

      const briefObject = result.object as Record<string, unknown>;
      const pages = Array.isArray(briefObject.pages) ? briefObject.pages.length : 0;
      devLogAppend("latest", {
        type: "assist.brief.response",
        provider: "gateway",
        model: normalizedModel,
        schema: usedSimplified ? "simplified" : "full",
        projectTitle:
          typeof briefObject.projectTitle === "string" ? briefObject.projectTitle : null,
        pages,
      });
      return NextResponse.json(result.object, {
        headers: {
          "Cache-Control": "no-store",
          "X-Provider": "gateway",
            "X-Key-Source": keySource,
          ...(usedSimplified ? { "X-Schema": "simplified" } : {}),
        },
      });
    } catch (err) {
      errorLog("AI", "AI brief error", err);
      devLogAppend("latest", {
        type: "assist.brief.error",
        message: err instanceof Error ? err.message : "Unknown error",
      });
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Unknown error" },
        { status: 500 },
      );
    }
  });
}
