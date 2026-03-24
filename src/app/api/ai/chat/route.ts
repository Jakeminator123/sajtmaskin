import { createAnthropic } from "@ai-sdk/anthropic";
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
  normalizeAssistModel,
  resolvePromptAssistProvider,
} from "@/lib/builder/promptAssist";
import {
  createDirectModel,
  getTemperatureConfig,
} from "@/lib/builder/gateway-policy";
import { MAX_AI_CHAT_MESSAGE_CHARS } from "@/lib/builder/promptLimits";
export const runtime = "nodejs";
export const maxDuration = 600;

import { ASSIST_MAX_OUTPUT_TOKENS } from "@/lib/gen/defaults";

const ENV_MAX_TOKENS = Number(process.env.AI_CHAT_MAX_TOKENS) || 81_920;

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
  provider: z.enum(["gateway", "anthropic"]).optional(),
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

function getAnthropicProvider(apiKey: string) {
  return createAnthropic({
    apiKey,
  });
}

function getAnthropicApiKey(): string | null {
  return process.env.ANTHROPIC_API_KEY?.trim() || null;
}

function resolveAnthropicModelId(model: string): string {
  const stripped = model.replace(/^anthropic-direct\//, "").replace(/^anthropic\//, "");
  return stripped.replace(/(\d+)\.(\d+)$/g, "$1-$2");
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
      const resolvedProvider = resolvePromptAssistProvider(normalizedModel);
      const maxTokens = resolveMaxTokens(requestedMaxTokens);

      if (!isPromptAssistModelAllowed(normalizedModel)) {
        return NextResponse.json(
          {
            error: "Model not allowed for prompt assist",
            setup: "Välj en modell från listan i buildern (OpenAI eller Anthropic).",
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
              setup: "Set model to a supported OpenAI prompt-assist model.",
            },
            { status: 400 },
          );
        }

        const hasOpenAI = Boolean(process.env.OPENAI_API_KEY?.trim());
        if (!hasOpenAI) {
          warnLog("AI", "OPENAI_API_KEY missing for OpenAI prompt assist");
          return NextResponse.json(
            {
              error: "Missing OpenAI API key",
              setup:
                "Set OPENAI_API_KEY. Prompt-assist OpenAI models use the OpenAI API directly (see createDirectModel in gateway-policy), not Vercel AI Gateway.",
            },
            { status: 401 },
          );
        }

        debugLog("AI", "OpenAI prompt assist (direct API)", {
          provider: resolvedProvider,
          model: normalizedModel,
        });

        const result = streamText({
          model: createDirectModel(normalizedModel),
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
            "X-Key-Source": "OPENAI_API_KEY",
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

      return NextResponse.json(
        {
          error: "Unsupported prompt-assist configuration",
          setup: "Välj en tillåten assist-modell (OpenAI eller Anthropic).",
        },
        { status: 500 },
      );
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
