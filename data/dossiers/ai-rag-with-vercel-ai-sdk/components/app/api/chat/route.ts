import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { findRelevantChunks } from '@/lib/rag/retrieval';

const openai = createOpenAI({
  apiKey: process.env.AI_GATEWAY_API_KEY,
  baseURL: 'https://gateway.ai.vercel.com/v1'
});

export async function POST(req: Request) {
  const { messages } = await req.json();

  const latestUserMessage = [...(messages ?? [])]
    .reverse()
    .find((message) => message.role === 'user');

  const query = latestUserMessage?.content
    ?.map?.((part: any) => (part?.type === 'text' ? part.text : ''))
    ?.join(' ') || '';

  const contextChunks = query ? await findRelevantChunks(query) : [];

  const contextText = contextChunks
    .map((chunk, index) => `[${index + 1}] ${chunk.content}`)
    .join('\n\n');

  const result = streamText({
    model: openai('gpt-4.1-mini'),
    system: [
      'You are a retrieval-augmented assistant.',
      'Answer using the provided context when it is relevant.',
      'If the answer is not supported by the context, say you do not know.',
      'Do not invent citations or facts.'
    ].join(' '),
    messages,
    prompt: contextText
      ? `Relevant context:\n\n${contextText}`
      : undefined
  });

  return result.toDataStreamResponse();
}
