import { openai } from '@ai-sdk/openai';
import {
  streamText,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from 'ai';

import { findRelevantChunks } from '@/lib/rag/retrieval';
import { isRagConfigured } from '@/lib/rag/config';

export const maxDuration = 30;

const DEMO_REPLY =
  'Hej! Det här är ett förhandsvisat demo-svar — RAG-chatten är i demo-läge och söker inte i era dokument ännu. ' +
  'Så här kommer assistenten att kännas när den är igång. ' +
  'När sajten kopplas till en riktig OpenAI-nyckel och en pgvector-databas under "Bygg integrationer" svarar jag på riktigt, grundat i ert indexerade innehåll.';

/**
 * Demo/mock mode (mock: canned): stream a canned reply over the same
 * UI-message-stream protocol the client's `useChat` hook consumes for real
 * responses, so the demo renders identically (token-by-token) without any
 * client change.
 */
function streamCannedDemoReply(): Response {
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const id = 'demo-message';
      writer.write({ type: 'text-start', id });
      const words = DEMO_REPLY.split(' ');
      for (let i = 0; i < words.length; i++) {
        writer.write({
          type: 'text-delta',
          id,
          delta: i === 0 ? words[i] : ` ${words[i]}`,
        });
        // Small pacing so the demo visibly streams like a real completion.
        await new Promise((resolve) => setTimeout(resolve, 18));
      }
      writer.write({ type: 'text-end', id });
    },
  });
  return createUIMessageStreamResponse({ stream });
}

function extractLatestUserText(messages: UIMessage[]): string {
  const latestUser = [...messages].reverse().find((message) => message.role === 'user');
  if (!latestUser) return '';
  return (latestUser.parts ?? [])
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join(' ')
    .trim();
}

export async function POST(req: Request) {
  let messages: UIMessage[];
  try {
    const body = (await req.json()) as { messages?: UIMessage[] };
    messages = body.messages ?? [];
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Demo/mock mode: OPENAI_API_KEY or DATABASE_URL missing/placeholder →
  // stream a canned reply instead of calling OpenAI or Postgres (a stubbed
  // key would 401, the loopback DB stub would time out). Real path resumes
  // once BOTH keys hold real values.
  if (!isRagConfigured()) {
    return streamCannedDemoReply();
  }

  const query = extractLatestUserText(messages);

  let contextText = '';
  try {
    const contextChunks = query ? await findRelevantChunks(query) : [];
    contextText = contextChunks
      .map((chunk, index) => `[${index + 1}] ${chunk.content}`)
      .join('\n\n');
  } catch (error) {
    // Retrieval failure (e.g. migration not applied / pgvector missing) must
    // not 500 the chat — log server-side and answer without context.
    console.error('RAG retrieval failed', error);
  }

  const result = streamText({
    model: openai('gpt-4o-mini'),
    system: [
      'You are a retrieval-augmented assistant for this site.',
      'Answer using the provided context when it is relevant.',
      'If the answer is not supported by the context, say you do not know.',
      'Do not invent citations or facts.',
      contextText
        ? `Relevant context:\n\n${contextText}`
        : 'No indexed context was found for this question.',
    ].join('\n\n'),
    messages: convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
