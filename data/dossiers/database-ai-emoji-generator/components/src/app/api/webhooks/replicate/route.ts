import { NextRequest, NextResponse } from "next/server"
import crypto from "node:crypto"

export const runtime = "nodejs"

function verifySignature(body: string, signature: string | null) {
  if (!signature || !process.env.WEBHOOK_SECRET) return false

  const expected = crypto
    .createHmac("sha256", process.env.WEBHOOK_SECRET)
    .update(body)
    .digest("hex")

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const signature = request.headers.get("x-webhook-signature")

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  const payload = JSON.parse(rawBody)

  // Persist prediction status/output here.
  // Typical flow:
  // 1. match payload.id to your pending generation record
  // 2. store payload.output / payload.error / payload.status
  // 3. optionally save final image to Blob storage

  return NextResponse.json({ ok: true })
}
