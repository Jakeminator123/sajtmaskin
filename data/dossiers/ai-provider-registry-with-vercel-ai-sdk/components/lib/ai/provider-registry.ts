import { customProvider, extractReasoningMiddleware, wrapLanguageModel } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';

export const providerRegistry = customProvider({
  languageModels: {
    'openai/gpt-4o-mini': openai('gpt-4o-mini'),
    'openai/gpt-4o': openai('gpt-4o'),
    'google/gemini-2.0-flash': google('gemini-2.0-flash'),
    'anthropic/claude-3-5-sonnet': anthropic('claude-3-5-sonnet-latest'),
    'anthropic/claude-3-5-haiku': anthropic('claude-3-5-haiku-latest'),
  },
  middleware: {
    reasoning: extractReasoningMiddleware({
      tagName: 'think',
    }),
  },
});

export const DEFAULT_MODEL = 'openai/gpt-4o-mini';

export const AVAILABLE_MODELS = [
  {
    id: 'openai/gpt-4o-mini',
    label: 'GPT-4o mini',
    provider: 'OpenAI',
  },
  {
    id: 'openai/gpt-4o',
    label: 'GPT-4o',
    provider: 'OpenAI',
  },
  {
    id: 'google/gemini-2.0-flash',
    label: 'Gemini 2.0 Flash',
    provider: 'Google',
  },
  {
    id: 'anthropic/claude-3-5-sonnet',
    label: 'Claude 3.5 Sonnet',
    provider: 'Anthropic',
  },
  {
    id: 'anthropic/claude-3-5-haiku',
    label: 'Claude 3.5 Haiku',
    provider: 'Anthropic',
  },
] as const;

export type AvailableModelId = (typeof AVAILABLE_MODELS)[number]['id'];

export function isAvailableModel(model: string): model is AvailableModelId {
  return AVAILABLE_MODELS.some((item) => item.id === model);
}
