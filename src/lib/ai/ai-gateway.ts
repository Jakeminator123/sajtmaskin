/**
 * AI Gateway Provider
 * ===================
 *
 * Provides a unified interface for AI model access that can use either:
 * 1. Vercel AI Gateway (with AI_GATEWAY_API_KEY)
 * 2. Direct OpenAI API (with OPENAI_API_KEY)
 *
 * The gateway is OPTIONAL - if not configured, falls back to direct OpenAI.
 * Users can configure their own API keys via the settings modal.
 *
 * USAGE:
 * ```typescript
 * import { getAIProvider, streamTextWithProvider } from "@/lib/ai/ai-gateway";
 *
 * // Get the appropriate provider
 * const provider = await getAIProvider(userId);
 *
 * // Use with AI SDK
 * const result = await streamTextWithProvider(provider, {
 *   model: "gpt-4o-mini",
 *   prompt: "Hello!",
 * });
 * ```
 */

import { openai as openaiProvider } from "@ai-sdk/openai";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText, generateText, type LanguageModel } from "ai";
import { getUserSettings, type UserSettings } from "@/lib/data/database";

// ============================================================================
// TYPES
// ============================================================================

export interface AIProviderConfig {
  type: "gateway" | "openai" | "anthropic";
  model: LanguageModel;
  isUserKey: boolean;
  userId?: string;
}

export interface ProviderOptions {
  userId?: string;
  preferGateway?: boolean;
}

// ============================================================================
// PROVIDER FACTORY
// ============================================================================

/**
 * Get AI provider based on user settings and environment config.
 * Priority:
 * 1. User's own API key (if configured)
 * 2. AI Gateway (if user enabled and key available)
 * 3. Platform's OpenAI key (fallback)
 */
export async function getAIProvider(
  userId?: string,
  modelId: string = "gpt-4o-mini"
): Promise<AIProviderConfig> {
  // Get user settings if userId provided
  let userSettings: UserSettings | null = null;
  if (userId) {
    try {
      userSettings = getUserSettings(userId);
    } catch (error) {
      console.warn("[AIGateway] Could not fetch user settings:", error);
    }
  }

  // Check if user has AI Gateway enabled and has a key
  if (userSettings?.use_ai_gateway && userSettings.ai_gateway_api_key) {
    console.log("[AIGateway] Using user's AI Gateway key");
    const gateway = createOpenAI({
      apiKey: userSettings.ai_gateway_api_key,
      baseURL: "https://ai-gateway.vercel.sh/v1",
    });

    return {
      type: "gateway",
      model: gateway(modelId),
      isUserKey: true,
      userId,
    };
  }

  // Check if user has their own OpenAI key
  if (userSettings?.openai_api_key) {
    console.log("[AIGateway] Using user's OpenAI key");
    const userOpenAI = createOpenAI({
      apiKey: userSettings.openai_api_key,
    });

    return {
      type: "openai",
      model: userOpenAI(modelId),
      isUserKey: true,
      userId,
    };
  }

  // Check environment for AI Gateway
  const gatewayKey = process.env.AI_GATEWAY_API_KEY;
  if (gatewayKey) {
    console.log("[AIGateway] Using platform AI Gateway");
    const gateway = createOpenAI({
      apiKey: gatewayKey,
      baseURL: "https://ai-gateway.vercel.sh/v1",
    });

    return {
      type: "gateway",
      model: gateway(modelId),
      isUserKey: false,
    };
  }

  // Fallback to platform OpenAI
  console.log("[AIGateway] Using platform OpenAI key");
  return {
    type: "openai",
    model: openaiProvider(modelId),
    isUserKey: false,
  };
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Stream text with the appropriate provider
 */
export async function streamTextWithProvider(options: {
  userId?: string;
  model?: string;
  system?: string;
  prompt: string;
  maxTokens?: number;
}) {
  const provider = await getAIProvider(options.userId, options.model);

  return streamText({
    model: provider.model,
    system: options.system,
    prompt: options.prompt,
    maxOutputTokens: options.maxTokens,
  });
}

/**
 * Generate text with the appropriate provider
 */
export async function generateTextWithProvider(options: {
  userId?: string;
  model?: string;
  system?: string;
  prompt: string;
  maxTokens?: number;
}) {
  const provider = await getAIProvider(options.userId, options.model);

  return generateText({
    model: provider.model,
    system: options.system,
    prompt: options.prompt,
    maxOutputTokens: options.maxTokens,
  });
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if AI Gateway is available (either user or platform level)
 */
export function isGatewayAvailable(userId?: string): boolean {
  // Check platform level
  if (process.env.AI_GATEWAY_API_KEY) {
    return true;
  }

  // Check user level
  if (userId) {
    try {
      const settings = getUserSettings(userId);
      return !!(settings?.use_ai_gateway && settings.ai_gateway_api_key);
    } catch {
      return false;
    }
  }

  return false;
}

// ============================================================================
// AVAILABLE MODELS (Vercel AI Gateway)
// ============================================================================

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  category: "chat" | "code" | "reasoning" | "fast" | "vision" | "embedding";
  contextWindow: number;
  recommended?: boolean;
}

/**
 * Curated models for Vercel AI Gateway
 *
 * PREMIUM TIER (3 models):
 * - anthropic/claude-opus-4.5 - Smartaste, bäst för komplex analys
 * - openai/gpt-5.2-pro - OpenAIs mest kapabla
 * - xai/grok-code-fast-1 - Bäst för kod
 *
 * FAST TIER (3 models):
 * - openai/gpt-4o-mini - Default, snabb & billig
 * - google/gemini-2.5-flash - 1M context, blixtsnabb
 * - anthropic/claude-haiku-4.5 - Billig Claude
 */
export const GATEWAY_MODELS: ModelInfo[] = [
  // ═══ PREMIUM TIER - Supermodeller ═══
  {
    id: "anthropic/claude-opus-4.5",
    name: "Claude Opus 4.5",
    provider: "Anthropic",
    category: "reasoning",
    contextWindow: 200000,
    recommended: true,
  },
  {
    id: "openai/gpt-5.2-pro",
    name: "GPT-5.2 Pro",
    provider: "OpenAI",
    category: "reasoning",
    contextWindow: 400000,
    recommended: true,
  },
  {
    id: "xai/grok-code-fast-1",
    name: "Grok Code Fast 1",
    provider: "xAI",
    category: "code",
    contextWindow: 256000,
    recommended: true,
  },

  // ═══ FAST TIER - Snabba modeller ═══
  {
    id: "openai/gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "OpenAI",
    category: "fast",
    contextWindow: 128000,
    recommended: true,
  },
  {
    id: "google/gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "Google",
    category: "fast",
    contextWindow: 1000000,
    recommended: true,
  },
  {
    id: "anthropic/claude-haiku-4.5",
    name: "Claude Haiku 4.5",
    provider: "Anthropic",
    category: "fast",
    contextWindow: 200000,
    recommended: true,
  },
];

/**
 * Get available models based on provider type
 */
export function getAvailableModels(
  providerType: "gateway" | "openai" | "anthropic"
): string[] {
  switch (providerType) {
    case "gateway":
      return GATEWAY_MODELS.map((m) => m.id);
    case "openai":
      return GATEWAY_MODELS.filter((m) => m.provider === "OpenAI").map(
        (m) => m.id
      );
    case "anthropic":
      return GATEWAY_MODELS.filter((m) => m.provider === "Anthropic").map(
        (m) => m.id
      );
    default:
      return ["openai/gpt-4o-mini"];
  }
}

/**
 * Get models filtered by category
 */
export function getModelsByCategory(
  category: ModelInfo["category"]
): ModelInfo[] {
  return GATEWAY_MODELS.filter((m) => m.category === category);
}

/**
 * Get recommended models for quick selection
 */
export function getRecommendedModels(): ModelInfo[] {
  return GATEWAY_MODELS.filter((m) => m.recommended);
}

/**
 * Get model info by ID
 */
export function getModelInfo(modelId: string): ModelInfo | undefined {
  return GATEWAY_MODELS.find((m) => m.id === modelId);
}

/**
 * Log provider usage (for debugging/analytics)
 */
export function logProviderUsage(
  config: AIProviderConfig,
  operation: string
): void {
  console.log(
    `[AIGateway] ${operation} | Provider: ${config.type} | UserKey: ${
      config.isUserKey
    } | User: ${config.userId || "platform"}`
  );
}
