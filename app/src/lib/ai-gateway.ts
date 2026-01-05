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
 * import { getAIProvider, streamTextWithProvider } from "@/lib/ai-gateway";
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
import { getUserSettings, type UserSettings } from "./database";

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
export async function streamTextWithProvider(
  options: {
    userId?: string;
    model?: string;
    system?: string;
    prompt: string;
    maxTokens?: number;
  }
) {
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
export async function generateTextWithProvider(
  options: {
    userId?: string;
    model?: string;
    system?: string;
    prompt: string;
    maxTokens?: number;
  }
) {
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

/**
 * Get available models based on provider type
 */
export function getAvailableModels(providerType: "gateway" | "openai" | "anthropic"): string[] {
  switch (providerType) {
    case "gateway":
      // AI Gateway supports multiple providers
      return [
        // OpenAI
        "gpt-4o",
        "gpt-4o-mini",
        "gpt-5",
        "o1",
        "o1-mini",
        "o3-mini",
        // Anthropic (via gateway)
        "claude-3-5-sonnet-20241022",
        "claude-3-opus-20240229",
        // Google (via gateway)
        "gemini-1.5-pro",
        "gemini-1.5-flash",
        // xAI (via gateway)
        "grok-beta",
      ];
    case "openai":
      return [
        "gpt-4o",
        "gpt-4o-mini",
        "gpt-5",
        "o1",
        "o1-mini",
        "o3-mini",
      ];
    case "anthropic":
      return [
        "claude-3-5-sonnet-20241022",
        "claude-3-opus-20240229",
        "claude-3-5-haiku-20241022",
      ];
    default:
      return ["gpt-4o-mini"];
  }
}

/**
 * Log provider usage (for debugging/analytics)
 */
export function logProviderUsage(config: AIProviderConfig, operation: string): void {
  console.log(
    `[AIGateway] ${operation} | Provider: ${config.type} | UserKey: ${config.isUserKey} | User: ${config.userId || "platform"}`
  );
}

