import { auth } from "@/auth"
import { google } from "@ai-sdk/google"
import { streamText, convertToModelMessages } from "ai"

export const runtime = "edge"

export async function POST(req: Request) {
  const session = await auth()

  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { messages } = await req.json()

  const result = streamText({
    model: google("gemini-2.0-flash"),
    messages: convertToModelMessages(messages),
    system: "You are a helpful assistant.",
  })

  return result.toUIMessageStreamResponse()
}
