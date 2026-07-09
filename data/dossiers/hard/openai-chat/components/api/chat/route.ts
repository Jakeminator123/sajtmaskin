import { openai } from "@ai-sdk/openai";
import {
  streamText,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from "ai";

export const runtime = "edge";
export const maxDuration = 30;

/**
 * Demo/mock detection. The chat renders a working demo whenever there is no
 * REAL OpenAI key — either the value is absent or it is a preview stub such as
 * `sk-placeholder-preview-not-real`. Mirrors the stub vocabulary
 * (`placeholder` / `not_real` / `dummy`) so a seeded preview value is treated
 * as "not configured", never mistaken for a real credential. When a genuine
 * key is present the real streaming path runs unchanged.
 */
function isPlaceholderValue(value: string | undefined | null): boolean {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return true;
  return /placeholder|not[_-]?a?[_-]?real|dummy|changeme|^your[_-]/i.test(trimmed);
}

const DEMO_REPLY =
  "Hej! Jag är en demo-assistent och svarar med ett förhandsvisat exempel just nu — " +
  "det här är inte ett riktigt AI-svar. Så här kommer chatten att kännas och se ut. " +
  "När sajten kopplas till en riktig nyckel under \"Bygg integrationer\" svarar jag på riktigt utifrån din fråga.";

/**
 * Stream a canned reply using the same UI message stream protocol the client's
 * `useChat` hook already consumes for real responses — so the demo renders
 * identically (token-by-token) without any client change.
 */
function streamCannedDemoReply(): Response {
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const id = "demo-message";
      writer.write({ type: "text-start", id });
      const words = DEMO_REPLY.split(" ");
      for (let i = 0; i < words.length; i++) {
        writer.write({
          type: "text-delta",
          id,
          delta: i === 0 ? words[i] : ` ${words[i]}`,
        });
        // Small pacing so the demo visibly streams like a real completion.
        await new Promise((resolve) => setTimeout(resolve, 18));
      }
      writer.write({ type: "text-end", id });
    },
  });
  return createUIMessageStreamResponse({ stream });
}

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;

  let messages: UIMessage[];
  try {
    const body = (await req.json()) as { messages?: UIMessage[] };
    messages = body.messages ?? [];
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Demo/mock mode: no real key configured → stream a believable canned reply
  // instead of calling OpenAI (which would throw / 401 with a placeholder).
  if (isPlaceholderValue(apiKey)) {
    return streamCannedDemoReply();
  }

  const modelMessages = await convertToModelMessages(messages);
  const result = streamText({
    model: openai("gpt-4o-mini"),
    system:
      "You are a helpful assistant for this site's visitors. Answer concisely. If a question is outside your knowledge, say so.",
    messages: modelMessages,
  });

  return result.toUIMessageStreamResponse();
}
