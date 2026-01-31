import { createOpenAI } from "@ai-sdk/openai";
import { gateway, generateText } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { withRateLimit } from "@/lib/rateLimit";
import { requireNotBot } from "@/lib/botProtection";
import { debugLog, errorLog, warnLog } from "@/lib/utils/debug";

export const runtime = "nodejs";
export const maxDuration = 420; // 7 minutes for prompt assist with slow models

const BASE_URL = "https://api.v0.dev/v1";

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
  model: z.string().optional().default("openai/gpt-5.2"),
  temperature: z.number().min(0).max(2).optional(),
  provider: z.enum(["openai-compat", "gateway"]).optional().default("gateway"),
});

function getV0ModelApiKey(): { apiKey: string | null; source: string } {
  const v0ApiKey = process.env.V0_API_KEY;

  if (v0ApiKey && v0ApiKey.trim()) {
    return { apiKey: v0ApiKey, source: "V0_API_KEY" };
  }

  return { apiKey: null, source: "none" };
}

function getOpenAICompatProvider(apiKey: string) {
  return createOpenAI({
    apiKey,
    baseURL: BASE_URL,
  });
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

      debugLog("AI", "AI chat request received", {
        provider,
        model,
        messages: messages.length,
        temperature: typeof temperature === "number" ? temperature : null,
      });

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

        const hasGatewayApiKey = Boolean(process.env.AI_GATEWAY_API_KEY?.trim());
        const hasOidcToken = Boolean(process.env.VERCEL_OIDC_TOKEN?.trim());
        if (!hasGatewayApiKey && !hasOidcToken && !isProbablyOnVercel()) {
          warnLog("AI", "AI Gateway auth missing for prompt assist");
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
        debugLog("AI", "AI Gateway auth resolved", {
          auth: gatewayAuth,
          provider: "gateway",
          model,
          onVercel: isProbablyOnVercel(),
        });

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

      const { apiKey, source } = getV0ModelApiKey();
      if (!apiKey) {
        warnLog("AI", "V0 Model API key missing for openai-compat");
        return NextResponse.json(
          {
            error: "Missing V0 API key",
            setup: "Set V0_API_KEY for the v0 Model API.",
          },
          { status: 401 },
        );
      }
      debugLog("AI", "AI chat using v0 Model API (openai-compat)", { model, keySource: source });

      const modelProvider = getOpenAICompatProvider(apiKey);
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
      errorLog("AI", "AI chat error", err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Unknown error" },
        { status: 500 },
      );
    }
  });
}
