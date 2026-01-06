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
 * All available models via Vercel AI Gateway
 * Organized by provider and use case
 */
export const GATEWAY_MODELS: ModelInfo[] = [
  // ═══ RECOMMENDED (Best balance of quality/cost) ═══
  { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", provider: "OpenAI", category: "chat", contextWindow: 128000, recommended: true },
  { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4", provider: "Anthropic", category: "chat", contextWindow: 200000, recommended: true },
  { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "Google", category: "fast", contextWindow: 1000000, recommended: true },
  
  // ═══ OPENAI ═══
  { id: "openai/gpt-5", name: "GPT-5", provider: "OpenAI", category: "chat", contextWindow: 400000 },
  { id: "openai/gpt-5-mini", name: "GPT-5 Mini", provider: "OpenAI", category: "chat", contextWindow: 400000 },
  { id: "openai/gpt-5-nano", name: "GPT-5 Nano", provider: "OpenAI", category: "fast", contextWindow: 400000 },
  { id: "openai/gpt-5-pro", name: "GPT-5 Pro", provider: "OpenAI", category: "reasoning", contextWindow: 400000 },
  { id: "openai/gpt-5-codex", name: "GPT-5 Codex", provider: "OpenAI", category: "code", contextWindow: 400000 },
  { id: "openai/gpt-4o", name: "GPT-4o", provider: "OpenAI", category: "chat", contextWindow: 128000 },
  { id: "openai/gpt-4.1", name: "GPT-4.1", provider: "OpenAI", category: "chat", contextWindow: 128000 },
  { id: "openai/gpt-4.1-mini", name: "GPT-4.1 Mini", provider: "OpenAI", category: "chat", contextWindow: 128000 },
  { id: "openai/o3", name: "O3", provider: "OpenAI", category: "reasoning", contextWindow: 200000 },
  { id: "openai/o3-mini", name: "O3 Mini", provider: "OpenAI", category: "reasoning", contextWindow: 200000 },
  { id: "openai/o4-mini", name: "O4 Mini", provider: "OpenAI", category: "reasoning", contextWindow: 200000 },
  { id: "openai/o1", name: "O1", provider: "OpenAI", category: "reasoning", contextWindow: 200000 },
  
  // ═══ ANTHROPIC ═══
  { id: "anthropic/claude-opus-4.5", name: "Claude Opus 4.5", provider: "Anthropic", category: "reasoning", contextWindow: 200000 },
  { id: "anthropic/claude-opus-4", name: "Claude Opus 4", provider: "Anthropic", category: "reasoning", contextWindow: 200000 },
  { id: "anthropic/claude-sonnet-4.5", name: "Claude Sonnet 4.5", provider: "Anthropic", category: "chat", contextWindow: 200000 },
  { id: "anthropic/claude-haiku-4.5", name: "Claude Haiku 4.5", provider: "Anthropic", category: "fast", contextWindow: 200000 },
  { id: "anthropic/claude-3.7-sonnet", name: "Claude 3.7 Sonnet", provider: "Anthropic", category: "chat", contextWindow: 200000 },
  { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet", provider: "Anthropic", category: "chat", contextWindow: 200000 },
  { id: "anthropic/claude-3.5-haiku", name: "Claude 3.5 Haiku", provider: "Anthropic", category: "fast", contextWindow: 200000 },
  { id: "anthropic/claude-3-opus", name: "Claude 3 Opus", provider: "Anthropic", category: "reasoning", contextWindow: 200000 },
  
  // ═══ GOOGLE ═══
  { id: "google/gemini-3-pro-preview", name: "Gemini 3 Pro", provider: "Google", category: "chat", contextWindow: 1000000 },
  { id: "google/gemini-3-flash", name: "Gemini 3 Flash", provider: "Google", category: "fast", contextWindow: 1000000 },
  { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "Google", category: "chat", contextWindow: 1000000 },
  { id: "google/gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite", provider: "Google", category: "fast", contextWindow: 1000000 },
  { id: "google/gemini-2.0-flash", name: "Gemini 2.0 Flash", provider: "Google", category: "fast", contextWindow: 1000000 },
  { id: "google/gemini-2.0-flash-lite", name: "Gemini 2.0 Flash Lite", provider: "Google", category: "fast", contextWindow: 1000000 },
  
  // ═══ XAI (GROK) ═══
  { id: "xai/grok-4", name: "Grok 4", provider: "xAI", category: "chat", contextWindow: 256000 },
  { id: "xai/grok-4-fast-reasoning", name: "Grok 4 Fast Reasoning", provider: "xAI", category: "reasoning", contextWindow: 256000 },
  { id: "xai/grok-3", name: "Grok 3", provider: "xAI", category: "chat", contextWindow: 131000 },
  { id: "xai/grok-3-fast", name: "Grok 3 Fast", provider: "xAI", category: "fast", contextWindow: 131000 },
  { id: "xai/grok-3-mini", name: "Grok 3 Mini", provider: "xAI", category: "fast", contextWindow: 131000 },
  { id: "xai/grok-code-fast-1", name: "Grok Code Fast", provider: "xAI", category: "code", contextWindow: 256000 },
  
  // ═══ DEEPSEEK ═══
  { id: "deepseek/deepseek-v3.2", name: "DeepSeek V3.2", provider: "DeepSeek", category: "chat", contextWindow: 128000 },
  { id: "deepseek/deepseek-v3.2-thinking", name: "DeepSeek V3.2 Thinking", provider: "DeepSeek", category: "reasoning", contextWindow: 128000 },
  { id: "deepseek/deepseek-r1", name: "DeepSeek R1", provider: "DeepSeek", category: "reasoning", contextWindow: 128000 },
  { id: "deepseek/deepseek-v3", name: "DeepSeek V3", provider: "DeepSeek", category: "chat", contextWindow: 128000 },
  
  // ═══ MISTRAL ═══
  { id: "mistral/mistral-large-3", name: "Mistral Large 3", provider: "Mistral", category: "chat", contextWindow: 128000 },
  { id: "mistral/mistral-medium", name: "Mistral Medium", provider: "Mistral", category: "chat", contextWindow: 128000 },
  { id: "mistral/mistral-small", name: "Mistral Small", provider: "Mistral", category: "fast", contextWindow: 128000 },
  { id: "mistral/codestral", name: "Codestral", provider: "Mistral", category: "code", contextWindow: 256000 },
  { id: "mistral/devstral-2", name: "Devstral 2", provider: "Mistral", category: "code", contextWindow: 256000 },
  
  // ═══ META (LLAMA) ═══
  { id: "meta/llama-4-maverick", name: "Llama 4 Maverick", provider: "Meta", category: "chat", contextWindow: 128000 },
  { id: "meta/llama-4-scout", name: "Llama 4 Scout", provider: "Meta", category: "fast", contextWindow: 128000 },
  { id: "meta/llama-3.3-70b", name: "Llama 3.3 70B", provider: "Meta", category: "chat", contextWindow: 128000 },
  { id: "meta/llama-3.1-70b", name: "Llama 3.1 70B", provider: "Meta", category: "chat", contextWindow: 128000 },
  { id: "meta/llama-3.1-8b", name: "Llama 3.1 8B", provider: "Meta", category: "fast", contextWindow: 128000 },
  
  // ═══ ALIBABA (QWEN) ═══
  { id: "alibaba/qwen3-max", name: "Qwen3 Max", provider: "Alibaba", category: "chat", contextWindow: 128000 },
  { id: "alibaba/qwen3-coder", name: "Qwen3 Coder", provider: "Alibaba", category: "code", contextWindow: 128000 },
  { id: "alibaba/qwen-3-235b", name: "Qwen 3 235B", provider: "Alibaba", category: "chat", contextWindow: 128000 },
  
  // ═══ PERPLEXITY (with search) ═══
  { id: "perplexity/sonar-pro", name: "Sonar Pro", provider: "Perplexity", category: "chat", contextWindow: 128000 },
  { id: "perplexity/sonar-reasoning-pro", name: "Sonar Reasoning Pro", provider: "Perplexity", category: "reasoning", contextWindow: 128000 },
  { id: "perplexity/sonar", name: "Sonar", provider: "Perplexity", category: "chat", contextWindow: 128000 },
  
  // ═══ COHERE ═══
  { id: "cohere/command-a", name: "Command A", provider: "Cohere", category: "chat", contextWindow: 128000 },
  
  // ═══ AMAZON ═══
  { id: "amazon/nova-pro", name: "Nova Pro", provider: "Amazon", category: "chat", contextWindow: 300000 },
  { id: "amazon/nova-lite", name: "Nova Lite", provider: "Amazon", category: "fast", contextWindow: 300000 },
];

/**
 * Get available models based on provider type
 */
export function getAvailableModels(providerType: "gateway" | "openai" | "anthropic"): string[] {
  switch (providerType) {
    case "gateway":
      return GATEWAY_MODELS.map(m => m.id);
    case "openai":
      return GATEWAY_MODELS.filter(m => m.provider === "OpenAI").map(m => m.id);
    case "anthropic":
      return GATEWAY_MODELS.filter(m => m.provider === "Anthropic").map(m => m.id);
    default:
      return ["openai/gpt-4o-mini"];
  }
}

/**
 * Get models filtered by category
 */
export function getModelsByCategory(category: ModelInfo["category"]): ModelInfo[] {
  return GATEWAY_MODELS.filter(m => m.category === category);
}

/**
 * Get recommended models for quick selection
 */
export function getRecommendedModels(): ModelInfo[] {
  return GATEWAY_MODELS.filter(m => m.recommended);
}

/**
 * Get model info by ID
 */
export function getModelInfo(modelId: string): ModelInfo | undefined {
  return GATEWAY_MODELS.find(m => m.id === modelId);
}

/**
 * Log provider usage (for debugging/analytics)
 */
export function logProviderUsage(config: AIProviderConfig, operation: string): void {
  console.log(
    `[AIGateway] ${operation} | Provider: ${config.type} | UserKey: ${config.isUserKey} | User: ${config.userId || "platform"}`
  );
}

