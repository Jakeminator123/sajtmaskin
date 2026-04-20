import { openai } from '@ai-sdk/openai';
import { convertToModelMessages, stepCountIs, streamText, UIMessage } from 'ai';
import { addReasoningStep } from '../../../lib/reasoning-tool';

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: openai('gpt-4.1-mini'),
    messages: convertToModelMessages(messages),
    system:
      'Be concise and helpful. When a response benefits from showing intermediate progress, call addReasoningStep one or more times before the final answer. Do not expose hidden chain-of-thought; only emit short, user-safe summaries of reasoning progress.',
    tools: {
      addReasoningStep,
    },
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}
