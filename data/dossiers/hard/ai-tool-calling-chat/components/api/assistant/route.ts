import { openai } from '@ai-sdk/openai';
import {
  streamText,
  tool,
  convertToModelMessages,
  stepCountIs,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from 'ai';
import { z } from 'zod';

export const maxDuration = 30;

/**
 * Demo/mock detection (mock: canned). No real key → missing OR a preview stub
 * (`placeholder` / `not_real` / `dummy`). Mirrors the stub vocabulary so a
 * seeded preview value is treated as "not configured", not a real credential.
 */
function isPlaceholderValue(value: string | undefined | null): boolean {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return true;
  return /placeholder|not[_-]?a?[_-]?real|dummy|changeme|^your[_-]/i.test(trimmed);
}

const DEMO_REPLY =
  'Hej! Jag är en demo-assistent och det här är ett förhandsvisat exempelsvar — inget riktigt AI- eller verktygsanrop görs ännu. ' +
  'Så här kommer assistenten att kännas i chatten. ' +
  'När sajten kopplas till en riktig nyckel under "Bygg integrationer" svarar jag på riktigt och kan använda verktygen.';

/**
 * Stream a canned reply over the same UI-message-stream protocol the client's
 * `useChat` hook consumes for real responses, so the demo renders identically.
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
        await new Promise((resolve) => setTimeout(resolve, 18));
      }
      writer.write({ type: 'text-end', id });
    },
  });
  return createUIMessageStreamResponse({ stream });
}

// EXAMPLE TOOLS — integration demos, not real domain behavior. Replace
// `getWeather`/`searchDocs` (implementations, names, descriptions and the
// system prompt) with the project's real server-side tools before production.
async function getWeather(city: string) {
  return {
    city,
    temperatureC: 22,
    condition: 'Sunny',
  };
}

async function searchDocs(query: string) {
  return {
    query,
    results: [
      {
        title: 'Getting Started',
        excerpt: 'Basic setup instructions for your app.',
        href: '/docs/getting-started',
      },
    ],
  };
}

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;

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

  // Demo/mock mode: no real key → stream a canned reply instead of calling
  // OpenAI (a placeholder key would 401). Real path resumes with a real key.
  if (isPlaceholderValue(apiKey)) {
    return streamCannedDemoReply();
  }

  const result = streamText({
    model: openai('gpt-4o-mini'),
    system:
      'You are a helpful assistant. Use tools when live or structured data is needed. After receiving tool results, continue the answer naturally and summarize the result for the user.',
    messages: convertToModelMessages(messages),
    stopWhen: stepCountIs(5),
    tools: {
      getWeather: tool({
        description: 'Get the current weather for a city.',
        inputSchema: z.object({
          city: z.string().min(1),
        }),
        execute: async ({ city }) => {
          return getWeather(city);
        },
      }),
      searchDocs: tool({
        description: 'Search product or app documentation.',
        inputSchema: z.object({
          query: z.string().min(1),
        }),
        execute: async ({ query }) => {
          return searchDocs(query);
        },
      }),
    },
  });

  return result.toUIMessageStreamResponse();
}
