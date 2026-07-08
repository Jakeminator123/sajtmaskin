import { openai } from '@ai-sdk/openai';
import { streamText, tool, convertToModelMessages, stepCountIs } from 'ai';
import { z } from 'zod';

export const maxDuration = 30;

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
  if (!process.env.OPENAI_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'Chat is not configured (missing OPENAI_API_KEY)' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const { messages } = await req.json();

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
