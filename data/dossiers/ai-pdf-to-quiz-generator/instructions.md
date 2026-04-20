# When to use

Use this dossier when a user should be able to upload a PDF and get a short structured quiz generated from its contents.

Typical fits:
- study tools
- internal training portals
- onboarding flows
- content apps that turn documents into assessments
- dashboard features where users upload source material and review answers

This dossier is a good fit when you need:
- PDF file input
- AI-generated multiple-choice questions
- strict structured output validation
- a review UI showing correct vs incorrect answers

# How to integrate

## 1) Install and configure the model provider

This integration uses the Vercel AI SDK with Google Gemini PDF/file input support.

Required package pattern:

```ts
import { google } from "@ai-sdk/google";
import { streamObject } from "ai";
```

Set the provider API key in your environment:

```env
GOOGLE_GENERATIVE_AI_API_KEY=your_api_key_here
```

## 2) Keep a strict shared schema for the AI output

The model should not return free-form text. Constrain it to a fixed quiz shape.

```ts
import { z } from "zod";

export const questionSchema = z.object({
  question: z.string(),
  options: z.array(z.string()).length(4),
  answer: z.enum(["A", "B", "C", "D"]),
});

export const questionsSchema = z.array(questionSchema).length(4);
export type Question = z.infer<typeof questionSchema>;
```

Use `streamObject` with `schema: questionSchema` and `output: "array"` when generating the quiz.

## 3) Add the API route

Create a server route that:
- accepts one uploaded PDF
- validates the request body
- sends the file to the model as `type: "file"`
- validates the final generated object with Zod
- streams the result back

```ts
import { google } from "@ai-sdk/google";
import { streamObject } from "ai";
import { questionSchema, questionsSchema } from "@/lib/schemas";
import { extractBase64Payload, pdfUploadSchema } from "@/lib/ai-pdf";

export const maxDuration = 60;

export async function POST(req: Request) {
  const json = await req.json();
  const parsed = pdfUploadSchema.safeParse(json);

  if (!parsed.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const file = parsed.data.files[0];

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
          { type: "text", text: "Create a multiple-choice quiz based on this PDF." },
          {
            type: "file",
            data: extractBase64Payload(file.data),
            mimeType: "application/pdf",
          },
        ],
      },
    ],
    onFinish: ({ object }) => {
      const res = questionsSchema.safeParse(object);
      if (!res.success) {
        throw new Error(res.error.issues.map((issue) => issue.message).join("\n"));
      }
    },
  });

  return result.toTextStreamResponse();
}
```

## 4) Validate and normalize the uploaded file payload

Many clients send PDFs as a data URL. Normalize before passing to the model.

```ts
import { z } from "zod";

export const pdfUploadSchema = z.object({
  files: z
    .array(
      z.object({
        data: z.string().min(1),
        mimeType: z.literal("application/pdf"),
        name: z.string().optional(),
      }),
    )
    .min(1)
    .max(1),
});

export function extractBase64Payload(data: string) {
  const match = data.match(/^data:application\/pdf;base64,(.+)$/);
  return match ? match[1] : data;
}
```

## 5) Build the upload client

Any client is acceptable as long as it POSTs JSON shaped like this:

```json
{
  "files": [
    {
      "data": "data:application/pdf;base64,JVBERi0xLjQ...",
      "mimeType": "application/pdf",
      "name": "lesson.pdf"
    }
  ]
}
```

A minimal browser upload flow:

```ts
async function fileToDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function generateQuiz(file: File) {
  const data = await fileToDataUrl(file);

  const res = await fetch("/api/generate-quiz", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      files: [{
        data,
        mimeType: file.type || "application/pdf",
        name: file.name,
      }],
    }),
  });

  if (!res.ok) throw new Error("Failed to generate quiz");

  return res;
}
```

If you consume the text stream, parse the streamed structured output according to your app's AI SDK setup. The server-side contract is an array of questions matching the schema.

## 6) Render quiz review state

The provided review component is suitable after a user has answered the generated quiz.

Expected props:

```ts
interface QuizReviewProps {
  questions: Question[];
  userAnswers: string[];
}
```

It highlights:
- correct options
- incorrect user selections
- per-question review after submission

# UX rules

- Accept only PDF uploads for this route.
- Tell the user the quiz is generated from the uploaded document, not guaranteed to be perfect.
- Show loading/progress state while the model processes the PDF.
- Require exactly one PDF per generation request unless you intentionally extend the API.
- Let users retry generation if validation fails or the model output is incomplete.
- Present answer options in a stable A/B/C/D order.
- If the generated quiz is used for grading, clearly label it as AI-generated unless reviewed by a human.

# Avoid

- Do not send arbitrary file types to this route.
- Do not trust raw model output without Zod validation.
- Do not allow the model to choose the number of options or questions if your UI expects a fixed structure.
- Do not keep template branding, Vercel promo UI, or unrelated icon/demo components.
- Do not assume every PDF is parseable or contains enough material for high-quality questions.
- Do not use this pattern for high-stakes testing without human review.

# Verification

Check all of the following:

1. Environment is configured:

```env
GOOGLE_GENERATIVE_AI_API_KEY=...
```

2. POST a valid PDF payload to the route.

3. Confirm the response is a streamed structured quiz with:
- exactly 4 questions
- exactly 4 options per question
- `answer` limited to `A | B | C | D`

4. Confirm invalid payloads return `400`.

5. Confirm malformed final model output fails validation instead of silently rendering broken UI.

6. Confirm the review UI correctly marks:
- the true answer in green
- an incorrect selected answer in red

Example expected object shape:

```json
[
  {
    "question": "What is the main purpose of the document?",
    "options": [
      "To explain the onboarding process",
      "To advertise a new product",
      "To summarize quarterly revenue",
      "To list office locations"
    ],
    "answer": "A"
  }
]
```
