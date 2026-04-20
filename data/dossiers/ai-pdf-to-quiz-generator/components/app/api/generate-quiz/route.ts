import { google } from "@ai-sdk/google";
import { streamObject } from "ai";
import { questionSchema, questionsSchema } from "@/lib/schemas";
import { extractBase64Payload, pdfUploadSchema } from "@/lib/ai-pdf";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const parsed = pdfUploadSchema.safeParse(json);

    if (!parsed.success) {
      return Response.json(
        { error: "Invalid request body", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const firstFile = parsed.data.files[0];

    const result = streamObject({
      model: google("gemini-1.5-pro-latest"),
      schema: questionSchema,
      output: "array",
      messages: [
        {
          role: "system",
          content:
            "You are a teacher. Create exactly 4 multiple-choice questions from the provided PDF. Each question must have 4 answer options, exactly one correct answer, and options should be similar in length. Only use information supported by the document.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Create a multiple-choice quiz based on this PDF.",
            },
            {
              type: "file",
              data: extractBase64Payload(firstFile.data),
              mimeType: "application/pdf",
            },
          ],
        },
      ],
      onFinish: ({ object }) => {
        const res = questionsSchema.safeParse(object);
        if (!res.success) {
          throw new Error(
            res.error.issues.map((issue) => issue.message).join("\n"),
          );
        }
      },
    });

    return result.toTextStreamResponse();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}
