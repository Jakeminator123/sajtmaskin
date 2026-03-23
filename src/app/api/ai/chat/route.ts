import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { withRateLimit } from "@/lib/rateLimit";
import { requireNotBot } from "@/lib/botProtection";
import { debugLog, errorLog, warnLog } from "@/lib/utils/debug";
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
import { MAX_AI_CHAT_MESSAGE_CHARS } from "@/lib/builder/promptLimits";
export const runtime = "nodejs";
export const maxDuration = 600;

const BASE_URL = "https://api.v0.dev/v1";

import { ASSIST_MAX_OUTPUT_TOKENS } from "@/lib/gen/defaults";

const ENV_MAX_TOKENS = Number(process.env.AI_CHAT_MAX_TOKENS) || 131_072;

const messageSchema = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("system"),
    content: z.string().max(MAX_AI_CHAT_MESSAGE_CHARS),
  }),
  z.object({
    role: z.literal("user"),
    content: z.string().max(MAX_AI_CHAT_MESSAGE_CHARS),
  }),
  z.object({
    role: z.literal("assistant"),
    content: z.string().max(MAX_AI_CHAT_MESSAGE_CHARS),
  }),
]);

const chatRequestSchema = z.object({
  messages: z.array(messageSchema).min(1, "messages is required").max(40, "Too many messages"),
  model: z.string().optional().default("openai/gpt-5.3-codex"),
  temperature: z.number().min(0).max(2).optional(),
  provider: z.enum(["gateway", "v0", "anthropic"]).optional(),
  maxTokens: z.number().int().positive().max(ENV_MAX_TOKENS).optional(),
});

function resolveMaxTokens(requested: number | undefined): number {
  const base = typeof requested === "number" ? requested : ASSIST_MAX_OUTPUT_TOKENS;
  const capped = Math.min(base, ENV_MAX_TOKENS);
  if (typeof requested === "number" && capped !== requested) {
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

function getAnthropicProvider(apiKey: string) {
  return createAnthropic({
    apiKey,
  });
}

function getAnthropicApiKey(): string | null {
  return process.env.ANTHROPIC_API_KEY?.trim() || null;
}

import { normalizeAnthropicModelId as resolveAnthropicModelId } from "@/lib/gen/models";

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
      const resolvedProvider = resolvePromptAssistProvider(normalizedModel);
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
      const lastUserMessage = [...messages].reverse().find((entry) => entry.role === "user")?.content;
      devLogAppend("latest", {
        type: "assist.chat.request",
        provider: resolvedProvider,
        model: normalizedModel,
        messages: messages.length,
        userPrompt: typeof lastUserMessage === "string" ? lastUserMessage : null,
      });

      if (resolvedProvider === "gateway") {
        if (!isGatewayAssistModel(normalizedModel) || normalizedModel.startsWith("anthropic/")) {
          return NextResponse.json(
            {
              error: "Invalid model for gateway provider",
              setup: 'Set model to a supported OpenAI gateway-class prompt-assist model.',
            },
            { status: 400 },
          );
        }

        const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY?.trim());
        if (!hasOpenAiKey) {
          warnLog("AI", "OPENAI_API_KEY missing for prompt assist");
          return NextResponse.json(
            {
              error: "Missing OPENAI_API_KEY for prompt assist",
              setup: "Set OPENAI_API_KEY in .env.local for local prompt assist and brief routes.",
            },
            { status: 401 },
          );
        }

        const keySource = "OPENAI_API_KEY";
        debugLog("AI", "AI Gateway auth resolved", {
          auth: keySource,
          provider: "gateway",
          model: normalizedModel,
        });

        const result = streamText({
          model: createDirectModel(normalizedModel),
          messages,
          maxOutputTokens: maxTokens,
          ...getTemperatureConfig(normalizedModel, temperature),
          ...getOpenAIAssistReasoningOptions(normalizedModel),
          onFinish({ text }) {
            devLogAppend("latest", {
              type: "assist.chat.response",
              provider: resolvedProvider,
              model: normalizedModel,
              text,
            });
          },
        });

        return result.toTextStreamResponse({
          headers: {
            "Cache-Control": "no-store",
            "X-Provider": resolvedProvider,
            "X-Key-Source": keySource,
          },
        });
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

        const apiKey = getAnthropicApiKey();
        if (!apiKey) {
          return NextResponse.json(
            {
              error: "Missing Anthropic API key",
              setup: "Set ANTHROPIC_API_KEY to use direct Claude prompt assist.",
            },
            { status: 401 },
          );
        }

        const anthropic = getAnthropicProvider(apiKey);
        const anthropicModel = resolveAnthropicModelId(normalizedModel);
        const result = streamText({
          model: anthropic(anthropicModel),
          messages,
          maxOutputTokens: maxTokens,
          ...getTemperatureConfig(anthropicModel, temperature),
          ...getAnthropicAssistThinkingOptions(),
          onFinish({ text }) {
            devLogAppend("latest", {
              type: "assist.chat.response",
              provider: resolvedProvider,
              model: normalizedModel,
              text,
            });
          },
        });

        return result.toTextStreamResponse({
          headers: {
            "Cache-Control": "no-store",
            "X-Provider": resolvedProvider,
            "X-Key-Source": "ANTHROPIC_API_KEY",
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
      const result = streamText({
        model: modelProvider(normalizedModel),
        messages,
        maxOutputTokens: maxTokens,
        ...getTemperatureConfig(normalizedModel, temperature),
        onFinish({ text }) {
          devLogAppend("latest", {
            type: "assist.chat.response",
            provider: resolvedProvider,
            model: normalizedModel,
            text,
          });
        },
      });

      return result.toTextStreamResponse({
        headers: {
          "Cache-Control": "no-store",
          "X-Provider": resolvedProvider,
          "X-Key-Source": source,
        },
      });
    } catch (err) {
      errorLog("AI", "AI chat error", err);
      devLogAppend("latest", {
        type: "assist.chat.error",
        message: err instanceof Error ? err.message : "Unknown error",
      });
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Unknown error" },
        { status: 500 },
      );
    }
  });
}
