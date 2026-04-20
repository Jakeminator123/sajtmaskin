import { streamText, convertToModelMessages, UIMessage } from 'ai';
import { z } from 'zod';
import {
  DEFAULT_MODEL,
  isAvailableModel,
  providerRegistry,
} from '@/components/lib/ai/provider-registry';

export const maxDuration = 30;

const bodySchema = z.object({
  messages: z.array(z.custom<UIMessage>()),
  model: z.string().optional(),
});

export async function POST(req: Request) {
  const json = await req.json();
  const { messages, model } = bodySchema.parse(json);

  const selectedModel = model && isAvailableModel(model) ? model : DEFAULT_MODEL;

  const result = streamText({
    model: providerRegistry.languageModel(selectedModel),
    messages: convertToModelMessages(messages),
    system:
      'You are a helpful assistant. Keep answers accurate, concise, and well-structured.',
  });

  return result.toUIMessageStreamResponse();
}
