import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createVercel } from "@ai-sdk/vercel";
import { generateObject, gateway } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireNotBot } from "@/lib/botProtection";
import { withRateLimit } from "@/lib/rateLimit";
import { debugLog } from "@/lib/utils/debug";

export const runtime = "nodejs";
export const maxDuration = 420; // 7 minutes for deep brief with slow models

const briefRequestSchema = z.object({
  prompt: z.string().min(1, "prompt is required"),
  provider: z.enum(["gateway", "openai", "anthropic", "vercel"]).optional().default("gateway"),
  // gpt-5.2 provides best quality briefs; used as default for prompt assist
  model: z.string().min(1).optional().default("openai/gpt-5.2"),
  temperature: z.number().min(0).max(2).optional(),
  imageGenerations: z.boolean().optional().default(true),
});

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

function isProbablyOnVercel(): boolean {
  return process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
}

function isReasoningModel(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return (
    /(^|\/)o[1-9]/.test(normalized) ||
    /(^|\/)gpt-5/.test(normalized) ||
    normalized.includes("thinking") ||
    normalized.includes("reasoning")
  );
}

function getTemperatureConfig(model: string, temperature?: number): { temperature?: number } {
  if (typeof temperature !== "number") return {};
  if (isReasoningModel(model)) return {};
  return { temperature };
}

function getOpenAIApiKey(): string | null {
  const apiKey = process.env.OPENAI_API_KEY;
  return apiKey && apiKey.trim() ? apiKey : null;
}

function getAnthropicApiKey(): string | null {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_ANTHROPIC_API_KEY;
  return apiKey && apiKey.trim() ? apiKey : null;
}

function getV0ModelApiKey(): string | null {
  const vercelApiKey = process.env.VERCEL_API_KEY;
  const v0ApiKey = process.env.V0_API_KEY;
  const vercelToken = process.env.VERCEL_TOKEN;

  if (vercelApiKey && vercelApiKey.trim() && (!vercelToken || vercelApiKey !== vercelToken)) {
    return vercelApiKey.trim();
  }
  if (v0ApiKey && v0ApiKey.trim()) {
    return v0ApiKey.trim();
  }
  if (vercelApiKey && vercelApiKey.trim()) {
    return vercelApiKey.trim();
  }
  return null;
}

function getGatewayPreferredProvider(model: string): string | null {
  const slashIdx = model.indexOf("/");
  if (slashIdx <= 0) return null;
  return model.slice(0, slashIdx) || null;
}

function defaultGatewayFallbackModels(primaryModel: string): string[] {
  const m = primaryModel.toLowerCase();
  // Fallback chain: try alternative models if primary fails
  const fallbacks = m.startsWith("openai/gpt-5")
    ? ["anthropic/claude-sonnet-4.5", "google/gemini-2.5-flash", "openai/gpt-4o"]
    : m.startsWith("anthropic/")
      ? ["openai/gpt-5.2", "google/gemini-2.5-flash"]
      : m.startsWith("google/")
        ? ["openai/gpt-5.2", "anthropic/claude-sonnet-4.5"]
        : ["openai/gpt-5.2", "anthropic/claude-sonnet-4.5", "google/gemini-2.5-flash"];
  return fallbacks.filter((x) => x !== primaryModel);
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

      const { prompt, provider, model, temperature, imageGenerations } = parsed.data;
      const resolvedModel =
        provider === "vercel"
          ? typeof model === "string" && model.trim().startsWith("v0-")
            ? model
            : "v0-1.5-md"
          : model;

      const systemPrompt =
        "You are a senior product designer + information architect. " +
        "Convert the user request into a concise website brief that is immediately usable for implementation. " +
        "Be specific about pages/sections, visual direction, and copy direction. " +
        "Include every field in the schema. If a value is unknown, use an empty string. " +
        "Do NOT include any extra keys beyond the schema. Keep strings short.";

      const userPrompt =
        prompt +
        (imageGenerations
          ? "\n\nInclude imagery guidance because image generation is enabled."
          : "\n\nImage generation is disabled; prefer layout and iconography, keep imagery optional.");

      if (provider === "gateway") {
        if (!resolvedModel.includes("/")) {
          return NextResponse.json(
            {
              error: "Invalid model for gateway provider",
              setup:
                'When provider="gateway", set model to "provider/model" (e.g. "openai/gpt-5.2").',
            },
            { status: 400 },
          );
        }

        const hasGatewayApiKey = Boolean(process.env.AI_GATEWAY_API_KEY?.trim());
        const hasOidcToken = Boolean(process.env.VERCEL_OIDC_TOKEN?.trim());
        if (!hasGatewayApiKey && !hasOidcToken && !isProbablyOnVercel()) {
          return NextResponse.json(
            {
              error: "Missing AI Gateway auth for gateway provider",
              setup:
                "Set AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN for local dev, or deploy on Vercel to use OIDC authentication.",
            },
            { status: 401 },
          );
        }

        const gatewayAuth = hasGatewayApiKey ? "api-key" : hasOidcToken ? "oidc" : "none";
        debugLog("AI", "AI Gateway auth resolved (brief)", {
          auth: gatewayAuth,
          provider: "gateway",
          model: resolvedModel,
          onVercel: isProbablyOnVercel(),
        });

        const preferred = getGatewayPreferredProvider(resolvedModel);
        const result = await generateObject({
          model: gateway(resolvedModel),
          schema: siteBriefSchema,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          providerOptions: {
            gateway: {
              ...(preferred ? { order: [preferred] } : {}),
              models: defaultGatewayFallbackModels(resolvedModel),
            } as any,
          },
          ...getTemperatureConfig(resolvedModel, temperature),
        });

        return NextResponse.json(result.object, {
          headers: {
            "Cache-Control": "no-store",
            "X-Provider": provider,
          },
        });
      }

      if (provider === "vercel") {
        const apiKey = getV0ModelApiKey();
        if (!apiKey) {
          return NextResponse.json(
            {
              error: "Missing V0 API key",
              setup: "Set VERCEL_API_KEY or V0_API_KEY for the v0 Model API.",
            },
            { status: 401 },
          );
        }

        const vercel = createVercel({ apiKey });
        const result = await generateObject({
          model: vercel(resolvedModel),
          schema: siteBriefSchema,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          ...getTemperatureConfig(resolvedModel, temperature),
        });

        return NextResponse.json(result.object, {
          headers: {
            "Cache-Control": "no-store",
            "X-Provider": provider,
          },
        });
      }

      if (provider === "openai") {
        const apiKey = getOpenAIApiKey();
        if (!apiKey) {
          return NextResponse.json(
            { error: "Missing OPENAI_API_KEY", setup: 'Set OPENAI_API_KEY for provider="openai".' },
            { status: 401 },
          );
        }
        const openai = createOpenAI({ apiKey });
        const result = await generateObject({
          model: openai(resolvedModel),
          schema: siteBriefSchema,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          ...getTemperatureConfig(resolvedModel, temperature),
        });
        return NextResponse.json(result.object, {
          headers: {
            "Cache-Control": "no-store",
            "X-Provider": provider,
          },
        });
      }

      if (provider === "anthropic") {
        const apiKey = getAnthropicApiKey();
        if (!apiKey) {
          return NextResponse.json(
            {
              error: "Missing Anthropic API key",
              setup:
                'Set ANTHROPIC_API_KEY (preferred) or CLAUDE_ANTHROPIC_API_KEY for provider="anthropic".',
            },
            { status: 401 },
          );
        }
        const anthropic = createAnthropic({ apiKey });
        const result = await generateObject({
          model: anthropic(resolvedModel),
          schema: siteBriefSchema,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          ...getTemperatureConfig(resolvedModel, temperature),
        });
        return NextResponse.json(result.object, {
          headers: {
            "Cache-Control": "no-store",
            "X-Provider": provider,
          },
        });
      }

      return NextResponse.json({ error: "Unsupported provider" }, { status: 400 });
    } catch (err) {
      console.error("AI brief error:", err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Unknown error" },
        { status: 500 },
      );
    }
  });
}
