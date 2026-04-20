import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";

import { buildContext, findRelevantChunks } from "@/lib/ai/retrieval";

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const latestUserMessage = [...messages]
    .reverse()
    .find((message: { role: string; content: string }) => message.role === "user");

  const query = latestUserMessage?.content?.trim();

  if (!query) {
    return new Response("Missing user query", { status: 400 });
  }

  const chunks = await findRelevantChunks(query);
  const context = buildContext(chunks);

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: [
      "You answer questions using the provided internal knowledge base context.",
      "If the answer is not in the context, say you do not know and ask the user to refine the question or add documentation.",
      "Do not invent policies, pricing, or procedures.",
      context ? `Context:\n\n${context}` : "No relevant context was found.",
    ].join("\n\n"),
    messages,
  });

  return result.toDataStreamResponse();
}
