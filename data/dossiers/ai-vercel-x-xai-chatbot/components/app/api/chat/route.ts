import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { defaultModel, getLanguageModel, type ModelID } from "@/components/ai/providers";

export const maxDuration = 30;

type ChatRequestBody = {
  messages: UIMessage[];
  selectedModel?: ModelID;
};

export async function POST(req: Request) {
  try {
    const { messages, selectedModel }: ChatRequestBody = await req.json();

    const result = streamText({
      model: getLanguageModel(selectedModel ?? defaultModel),
      system: "You are a helpful assistant.",
      messages: convertToModelMessages(messages),
      experimental_telemetry: {
        isEnabled: false,
      },
    });

    return result.toUIMessageStreamResponse({
      sendReasoning: true,
      onError: (error) => {
        if (error instanceof Error && /rate limit/i.test(error.message)) {
          return "Rate limit exceeded. Please try again later.";
        }

        console.error(error);
        return "An error occurred.";
      },
    });
  } catch (error) {
    console.error(error);
    return new Response("Invalid request", { status: 400 });
  }
}
