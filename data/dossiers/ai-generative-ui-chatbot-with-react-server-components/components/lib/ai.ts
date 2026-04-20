import { createAI, getMutableAIState, streamUI, createStreamableValue } from "ai/rsc";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { Message, TextStreamMessage } from "@/components/components/message";
import type { ReactNode } from "react";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AIState = {
  messages: ChatMessage[];
};

export type UIState = {
  id: string;
  display: ReactNode;
}[];

async function submitUserMessage(input: string): Promise<ReactNode> {
  "use server";

  const aiState = getMutableAIState<typeof AI>();
  const current = aiState.get();

  aiState.update({
    ...current,
    messages: [...current.messages, { role: "user", content: input }],
  });

  const textStream = createStreamableValue("");

  const result = await streamUI({
    model: openai("gpt-4o-mini"),
    system:
      "You are a helpful assistant inside a Next.js application. Prefer concise answers. When a tool matches the user's request, use it to return structured UI.",
    messages: [...aiState.get().messages, { role: "user", content: input }],
    text: ({ content, done }) => {
      if (done) {
        textStream.done();

        aiState.done({
          ...aiState.get(),
          messages: [
            ...aiState.get().messages,
            { role: "assistant", content },
          ],
        });
      } else {
        textStream.update(content);
      }

      return <TextStreamMessage content={textStream.value} />;
    },
    tools: {
      showMetric: {
        description: "Render a simple metric card for a named value.",
        parameters: z.object({
          label: z.string(),
          value: z.string(),
          description: z.string().optional(),
        }),
        generate: async ({ label, value, description }) => {
          const toolSummary = `${label}: ${value}${description ? ` — ${description}` : ""}`;

          aiState.done({
            ...aiState.get(),
            messages: [
              ...aiState.get().messages,
              { role: "assistant", content: toolSummary },
            ],
          });

          return (
            <div className="w-full max-w-md rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">{label}</div>
              <div className="mt-1 text-2xl font-semibold">{value}</div>
              {description ? (
                <div className="mt-2 text-sm text-muted-foreground">{description}</div>
              ) : null}
            </div>
          );
        },
      },
    },
  });

  return result.value;
}

export const AI = createAI<AIState, UIState>({
  actions: {
    submitUserMessage,
  },
  initialAIState: {
    messages: [],
  },
  initialUIState: [],
});
