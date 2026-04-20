import { streamText, convertToModelMessages, type UIMessage } from "ai";
import { getGroqModel, type GroqModelId, defaultGroqModel } from "@/components/lib/ai/providers";

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const {
      messages,
      selectedModel,
    }: {
      messages: UIMessage[];
      selectedModel?: GroqModelId;
    } = await request.json();

    const result = streamText({
      model: getGroqModel(selectedModel ?? defaultGroqModel),
      system: "You are a helpful assistant.",
      messages: convertToModelMessages(messages),
    });

    return result.toUIMessageStreamResponse({
      onError: (error) => {
        if (error instanceof Error && /rate limit/i.test(error.message)) {
          return "Rate limit exceeded. Please try again later.";
        }

        console.error(error);
        return "An error occurred while generating the response.";
      },
    });
  } catch (error) {
    console.error(error);
    return new Response("Invalid chat request.", { status: 400 });
  }
}
