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
  "När en riktig OpenAI-nyckel sparas under \"Byggblock\" i byggaren (och sajten publiceras om) svarar jag på riktigt utifrån din fråga.";

/** Output cap for short visitor replies. Counts reasoning tokens toward the same budget. */
const VISITOR_OUTPUT_TOKEN_BUDGET = 8192;

const SAFE_PROVIDER_ERROR = "The assistant could not answer. Try again.";

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "APIUserAbortError")
  );
}

function abortedResponse(): Response {
  return new Response(null, { status: 499 });
}

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
  if (req.signal.aborted) {
    return abortedResponse();
  }

  const apiKey = process.env.OPENAI_API_KEY;

  let messages: UIMessage[];
  try {
    const body = (await req.json()) as { messages?: UIMessage[] };
    messages = body.messages ?? [];
  } catch (error) {
    if (req.signal.aborted || isAbortError(error)) {
      return abortedResponse();
    }
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

  if (req.signal.aborted) {
    return abortedResponse();
  }

  try {
    const modelMessages = await convertToModelMessages(messages);
    if (req.signal.aborted) {
      return abortedResponse();
    }

    const result = streamText({
      model: openai.responses("gpt-6.1-sol"),
      system:
        "You are a helpful assistant for this site's visitors. Answer concisely. If a question is outside your knowledge, say so.",
      messages: modelMessages,
      maxOutputTokens: VISITOR_OUTPUT_TOKEN_BUDGET,
      maxRetries: 0,
      abortSignal: req.signal,
      providerOptions: {
        openai: { reasoningEffort: "medium" },
      },
    });

    return result.toUIMessageStreamResponse({
      onError: () => SAFE_PROVIDER_ERROR,
    });
  } catch (error) {
    if (req.signal.aborted || isAbortError(error)) {
      return abortedResponse();
    }
    console.error("[openai-chat] request failed");
    return new Response(JSON.stringify({ error: SAFE_PROVIDER_ERROR }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}
