import { openai } from '@ai-sdk/openai';
import { streamText, tool, convertToModelMessages, stepCountIs } from 'ai';
import { z } from 'zod';

export const maxDuration = 30;

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
