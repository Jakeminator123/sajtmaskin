import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createVercel } from "@ai-sdk/vercel";
import { gateway, generateText } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { withRateLimit } from "@/lib/rateLimit";
import { requireNotBot } from "@/lib/botProtection";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes for prompt assist with slow models

const BASE_URL = "https://api.v0.dev/v1";

type ProviderType = "openai-compat" | "vercel" | "gateway" | "openai" | "anthropic";

const messageSchema = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("system"),
    content: z.string(),
  }),
  z.object({
    role: z.literal("user"),
    content: z.string(),
  }),
  z.object({
    role: z.literal("assistant"),
    content: z.string(),
  }),
]);

const chatRequestSchema = z.object({
  messages: z.array(messageSchema).min(1, "messages is required"),
  model: z.string().optional().default("v0-1.5-md"),
  temperature: z.number().min(0).max(2).optional(),
  provider: z
    .enum(["openai-compat", "vercel", "gateway", "openai", "anthropic"])
    .optional()
    .default("openai-compat"),
});

function getV0ModelApiKey(): { apiKey: string | null; source: string } {
  const vercelApiKey = process.env.VERCEL_API_KEY;
  const v0ApiKey = process.env.V0_API_KEY;
  const vercelToken = process.env.VERCEL_TOKEN;

  if (vercelApiKey && vercelApiKey.trim() && (!vercelToken || vercelApiKey !== vercelToken)) {
    return { apiKey: vercelApiKey, source: "VERCEL_API_KEY" };
  }

  if (v0ApiKey && v0ApiKey.trim()) {
    return { apiKey: v0ApiKey, source: "V0_API_KEY" };
  }

  if (vercelApiKey && vercelApiKey.trim()) {
    return { apiKey: vercelApiKey, source: "VERCEL_API_KEY (matches VERCEL_TOKEN?)" };
  }

  return { apiKey: null, source: "none" };
}

function getOpenAIApiKey(): { apiKey: string | null; source: string } {
  const apiKey = process.env.OPENAI_API_KEY;
  return apiKey && apiKey.trim()
    ? { apiKey, source: "OPENAI_API_KEY" }
    : { apiKey: null, source: "none" };
}

function getAnthropicApiKey(): { apiKey: string | null; source: string } {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_ANTROPIC_API_KEY;
  const source = process.env.ANTHROPIC_API_KEY
    ? "ANTHROPIC_API_KEY"
    : process.env.CLAUDE_ANTROPIC_API_KEY
      ? "CLAUDE_ANTROPIC_API_KEY"
      : "none";
  return apiKey && apiKey.trim() ? { apiKey, source } : { apiKey: null, source: "none" };
}

function getProvider(providerType: Exclude<ProviderType, "gateway">, apiKey: string) {
  switch (providerType) {
    case "vercel":
      return createVercel({ apiKey });
    case "openai":
      return createOpenAI({ apiKey });
    case "anthropic":
      return createAnthropic({ apiKey });
    case "openai-compat":
    default:
      return createOpenAI({
        apiKey,
        baseURL: BASE_URL,
      });
  }
}

function isProbablyOnVercel(): boolean {
  return process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
}

function getGatewayPreferredProvider(model: string): string | null {
  const slashIdx = model.indexOf("/");
  if (slashIdx <= 0) return null;
  return model.slice(0, slashIdx) || null;
}

function defaultGatewayFallbackModels(primaryModel: string): string[] {
  const m = primaryModel.toLowerCase();
  const fallbacks = m.startsWith("openai/gpt-5")
    ? ["anthropic/claude-sonnet-4.5", "google/gemini-2.5-flash", "openai/gpt-4o"]
    : m.startsWith("anthropic/")
      ? ["openai/gpt-5.2", "google/gemini-2.5-flash"]
      : m.startsWith("google/")
        ? ["openai/gpt-5.2", "anthropic/claude-sonnet-4.5"]
        : ["openai/gpt-5.2", "anthropic/claude-sonnet-4.5", "google/gemini-2.5-flash"];
  return fallbacks.filter((x) => x !== primaryModel);
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
  if (isReasoningModel(model)) {
    return {};
  }
  return { temperature };
}

export async function POST(req: Request) {
  return withRateLimit(req, "ai:chat", async () => {
    try {
      const botError = requireNotBot(req);
      if (botError) return botError;

      const body = await req.json().catch(() => null);
      const parsed = chatRequestSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Validation failed", details: parsed.error.issues },
          { status: 400 },
        );
      }

      const { messages, model, temperature, provider } = parsed.data;

      if (provider === "gateway") {
        if (!model.includes("/")) {
          return NextResponse.json(
            {
              error: "Invalid model for gateway provider",
              setup:
                'When provider="gateway", set model to "provider/model" (e.g. "openai/gpt-5.2").',
            },
            { status: 400 },
          );
        }

        if (!process.env.AI_GATEWAY_API_KEY && !isProbablyOnVercel()) {
          return NextResponse.json(
            {
              error: "Missing AI_GATEWAY_API_KEY for gateway provider",
              setup:
                "Set AI_GATEWAY_API_KEY for local dev, or deploy on Vercel to use OIDC authentication.",
            },
            { status: 401 },
          );
        }

        const preferred = getGatewayPreferredProvider(model);

        const result = await generateText({
          model: gateway(model),
          messages,
          providerOptions: {
            gateway: {
              ...(preferred ? { order: [preferred] } : {}),
              models: defaultGatewayFallbackModels(model),
            } as any,
          },
          ...getTemperatureConfig(model, temperature),
        });

        return new Response(result.text, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Provider": provider,
          },
        });
      }

      if (provider === "openai") {
        const { apiKey, source } = getOpenAIApiKey();
        if (!apiKey) {
          return NextResponse.json(
            {
              error: "Missing OPENAI_API_KEY",
              setup: 'Set OPENAI_API_KEY for provider="openai".',
            },
            { status: 401 },
          );
        }
        const modelProvider = getProvider("openai", apiKey);
        const result = await generateText({
          model: modelProvider(model),
          messages,
          ...getTemperatureConfig(model, temperature),
        });
        return new Response(result.text, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Provider": provider,
            "X-Key-Source": source,
          },
        });
      }

      if (provider === "anthropic") {
        const { apiKey, source } = getAnthropicApiKey();
        if (!apiKey) {
          return NextResponse.json(
            {
              error: "Missing ANTHROPIC_API_KEY",
              setup: 'Set ANTHROPIC_API_KEY for provider="anthropic".',
            },
            { status: 401 },
          );
        }
        const modelProvider = getProvider("anthropic", apiKey);
        const result = await generateText({
          model: modelProvider(model),
          messages,
          ...getTemperatureConfig(model, temperature),
        });
        return new Response(result.text, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Provider": provider,
            "X-Key-Source": source,
          },
        });
      }

      const { apiKey, source } = getV0ModelApiKey();
      if (!apiKey) {
        return NextResponse.json(
          {
            error: "Missing V0 API key",
            setup: "Set VERCEL_API_KEY or V0_API_KEY for the v0 Model API.",
          },
          { status: 401 },
        );
      }

      const modelProvider = getProvider(provider, apiKey);
      const result = await generateText({
        model: modelProvider(model),
        messages,
        ...getTemperatureConfig(model, temperature),
      });

      return new Response(result.text, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Provider": provider,
          "X-Key-Source": source,
        },
      });
    } catch (err) {
      console.error("AI chat error:", err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Unknown error" },
        { status: 500 },
      );
    }
  });
}
