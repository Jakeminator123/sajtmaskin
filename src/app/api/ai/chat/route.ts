import { createOpenAI } from "@ai-sdk/openai";
import { gateway, generateText } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { withRateLimit } from "@/lib/rateLimit";
import { requireNotBot } from "@/lib/botProtection";
import { debugLog, errorLog, warnLog } from "@/lib/utils/debug";
import {
  isGatewayAssistModel,
  isPromptAssistModelAllowed,
  isV0AssistModel,
  normalizeAssistModel,
} from "@/lib/builder/promptAssist";

export const runtime = "nodejs";
export const maxDuration = 420; // 7 minutes for prompt assist with slow models

const BASE_URL = "https://api.v0.dev/v1";

// Token limits configurable via env (for server-side control)
const ENV_MAX_TOKENS = Number(process.env.AI_CHAT_MAX_TOKENS) || 8192;
const DEFAULT_CHAT_MAX_TOKENS = 2200;

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
  provider: z.enum(["gateway", "v0"]).optional().default("gateway"),
  maxTokens: z.number().int().positive().max(ENV_MAX_TOKENS).optional(),
});

function resolveMaxTokens(requested?: number): number | undefined {
  if (typeof requested !== "number") return DEFAULT_CHAT_MAX_TOKENS;
  const capped = Math.min(requested, ENV_MAX_TOKENS);
  if (capped !== requested) {
    warnLog("AI", "maxTokens capped by env limit", { requested, capped, envLimit: ENV_MAX_TOKENS });
  }
  return capped;
}

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
  const ordered = [
    "openai/gpt-5.2",
    "openai/gpt-5.2-pro",
    "anthropic/claude-opus-4.5",
    "anthropic/claude-sonnet-4.5",
  ];
  return ordered.filter((x) => x !== primaryModel);
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

      const { messages, model, temperature, provider, maxTokens: requestedMaxTokens } = parsed.data;
      const normalizedModel = normalizeAssistModel(model);
      const resolvedProvider = isV0AssistModel(normalizedModel) ? "v0" : "gateway";
      const maxTokens = resolveMaxTokens(requestedMaxTokens);

      if (!isPromptAssistModelAllowed(normalizedModel)) {
        return NextResponse.json(
          {
            error: "Model not allowed for prompt assist",
            setup: "Välj en modell från listan i buildern (gateway eller v0-md/lg).",
          },
          { status: 400 },
        );
      }

      if (provider && provider !== resolvedProvider) {
        return NextResponse.json(
          {
            error: "Provider does not match model",
            setup: `Model "${normalizedModel}" kräver provider "${resolvedProvider}".`,
          },
          { status: 400 },
        );
      }

      debugLog("AI", "AI chat request received", {
        provider: resolvedProvider,
        model: normalizedModel,
        messages: messages.length,
        temperature: typeof temperature === "number" ? temperature : null,
        maxTokens: typeof maxTokens === "number" ? maxTokens : null,
      });

      if (resolvedProvider === "gateway") {
        if (!isGatewayAssistModel(normalizedModel)) {
          return NextResponse.json(
            {
              error: "Invalid model for gateway provider",
              setup: 'Set model to "openai/gpt-5.2" or "anthropic/claude-4.5".',
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
          model: normalizedModel,
          onVercel: isProbablyOnVercel(),
        });

        const preferred = getGatewayPreferredProvider(normalizedModel);
        const result = await generateText({
          model: gateway(normalizedModel),
          messages,
          providerOptions: {
            gateway: {
              ...(preferred ? { order: [preferred] } : {}),
              models: defaultGatewayFallbackModels(normalizedModel),
            } as any,
          },
          maxOutputTokens: maxTokens,
          ...getTemperatureConfig(normalizedModel, temperature),
        });

        return new Response(result.text, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Provider": resolvedProvider,
            "X-Key-Source": gatewayAuth,
          },
        });
      }

      const { apiKey, source } = getV0ModelApiKey();
      if (!apiKey) {
        warnLog("AI", "V0 Model API key missing for v0 provider");
        return NextResponse.json(
          {
            error: "Missing V0 API key",
            setup: "Set V0_API_KEY for the v0 Model API.",
          },
          { status: 401 },
        );
      }
      debugLog("AI", "AI chat using v0 Model API", { model: normalizedModel, keySource: source });

      const modelProvider = getOpenAICompatProvider(apiKey);
      const result = await generateText({
        model: modelProvider(normalizedModel),
        messages,
        maxOutputTokens: maxTokens,
        ...getTemperatureConfig(normalizedModel, temperature),
      });

      return new Response(result.text, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Provider": resolvedProvider,
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
