import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
import { DEFAULT_OWN_MODEL_ID } from "@/lib/models/catalog";
import { debugLog } from "@/lib/utils/debug";

/** Default model for code generation. Aligned with the shared model catalog. */
export const DEFAULT_MODEL = DEFAULT_OWN_MODEL_ID;

const ANTHROPIC_PREFIX_RE = /^claude-/;
const AI_GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh/v1";

type ModelRoute = "ai-gateway" | "direct-openai" | "direct-anthropic";

function getAIGatewayKey(): string | undefined {
  return (
    process.env.AI_GATEWAY_API_KEY?.trim() ||
    process.env.AI_GATEWAY?.trim() ||
    undefined
  );
}

/** True when Vercel AI Gateway is configured (enables gateway-only features like model fallbacks). */
export function isAIGatewayEnabled(): boolean {
  return Boolean(getAIGatewayKey());
}

/**
 * Returns an AI SDK LanguageModel with automatic route selection:
 *
 *  1. Anthropic models (claude-*)  -> direct Anthropic API (ANTHROPIC_API_KEY)
 *  2. OpenAI models + AI Gateway key present -> Vercel AI Gateway
 *  3. OpenAI models + no gateway key        -> direct OpenAI API (OPENAI_API_KEY)
 *
 * Every call logs the chosen route via debugLog("model", ...).
 */
export function resolveModel(modelId?: string): LanguageModel {
  const id = modelId ?? DEFAULT_MODEL;

  if (ANTHROPIC_PREFIX_RE.test(id)) {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not configured. Set it in your environment to use Anthropic models.",
      );
    }
    const normalizedId = id.replace(/(\d+)\.(\d+)$/g, "$1-$2");
    logRoute("direct-anthropic", normalizedId);
    return createAnthropic({ apiKey })(normalizedId);
  }

  const gatewayKey = getAIGatewayKey();

  if (gatewayKey) {
    logRoute("ai-gateway", id);
    return createOpenAI({ apiKey: gatewayKey, baseURL: AI_GATEWAY_BASE_URL })(id);
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "No AI key configured. Set AI_GATEWAY_API_KEY (Vercel AI Gateway) or OPENAI_API_KEY (direct OpenAI).",
    );
  }

  logRoute("direct-openai", id);
  return createOpenAI({ apiKey })(id);
}

function logRoute(route: ModelRoute, modelId: string) {
  const labels: Record<ModelRoute, string> = {
    "ai-gateway": "AI Gateway (ai-gateway.vercel.sh)",
    "direct-openai": "Direct OpenAI",
    "direct-anthropic": "Direct Anthropic",
  };
  debugLog("model", `Route: ${labels[route]}`, { model: modelId });
}

/**
 * Resolves a "provider/model" string (e.g. "openai/gpt-5.4" or
 * "anthropic/claude-sonnet-4.6") into a LanguageModel.
 *
 * Used by prompt-assist and other routes that work with prefixed model IDs.
 */
export function resolveModelFromPrefixed(model: string): LanguageModel {
  const { provider, modelId } = parseModelString(model);

  if (provider === "anthropic") {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is required for Anthropic models.");
    }
    const normalizedModelId = normalizeAnthropicModelId(modelId);
    logRoute("direct-anthropic", normalizedModelId);
    return createAnthropic({ apiKey })(normalizedModelId);
  }

  const gatewayKey = getAIGatewayKey();

  if (gatewayKey) {
    logRoute("ai-gateway", modelId);
    return createOpenAI({ apiKey: gatewayKey, baseURL: AI_GATEWAY_BASE_URL })(modelId);
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "No AI key configured. Set AI_GATEWAY_API_KEY (Vercel AI Gateway) or OPENAI_API_KEY (direct OpenAI).",
    );
  }

  logRoute("direct-openai", modelId);
  return createOpenAI({ apiKey })(modelId);
}

function parseModelString(model: string): { provider: string; modelId: string } {
  const slashIdx = model.indexOf("/");
  if (slashIdx <= 0) return { provider: "openai", modelId: model };
  return { provider: model.slice(0, slashIdx), modelId: model.slice(slashIdx + 1) };
}

/**
 * Strip provider prefixes and normalize Anthropic dot-version notation
 * (e.g. "anthropic/claude-sonnet-4.6" → "claude-sonnet-4-6").
 */
export function normalizeAnthropicModelId(model: string): string {
  const stripped = model.replace(/^anthropic-direct\//, "").replace(/^anthropic\//, "");
  return stripped.replace(/(\d+)\.(\d+)$/g, "$1-$2");
}

/**
 * Returns the active OpenAI-compatible route info for non-AI-SDK callers
 * (e.g. routes that use the raw `openai` npm package directly).
 */
export function getOpenAIClientConfig(): {
  apiKey: string;
  baseURL?: string;
  route: ModelRoute;
} {
  const gatewayKey = getAIGatewayKey();
  if (gatewayKey) {
    return { apiKey: gatewayKey, baseURL: AI_GATEWAY_BASE_URL, route: "ai-gateway" };
  }

  const directKey = process.env.OPENAI_API_KEY?.trim();
  if (directKey) {
    return { apiKey: directKey, route: "direct-openai" };
  }

  throw new Error(
    "No AI key configured. Set AI_GATEWAY_API_KEY (Vercel AI Gateway) or OPENAI_API_KEY (direct OpenAI).",
  );
}

/** @deprecated Use resolveModel() instead. Kept for backward compatibility. */
export const getOpenAIModel = resolveModel;
