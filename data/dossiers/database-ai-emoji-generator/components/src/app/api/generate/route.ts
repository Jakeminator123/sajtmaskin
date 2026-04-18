import { NextRequest, NextResponse } from "next/server"
import { jwtVerify } from "jose"
import Replicate from "replicate"

export const runtime = "nodejs"

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
})

async function verifyToken(token: string) {
  const secret = new TextEncoder().encode(process.env.API_SECRET || "")
  const { payload } = await jwtVerify(token, secret)
  return payload
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization")
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null

    if (!token) {
      return NextResponse.json({ error: "Missing bearer token" }, { status: 401 })
    }

    await verifyToken(token)

    const body = await request.json()
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : ""

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 })
    }

    const output = await replicate.run("black-forest-labs/flux-schnell", {
      input: {
        prompt: `Generate a single emoji-style icon on a transparent or plain background: ${prompt}`,
        aspect_ratio: "1:1",
        output_format: "png",
        output_quality: 90,
      },
    })

    return NextResponse.json({ output }, { status: 200 })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: "Failed to generate emoji" }, { status: 500 })
  }
}
