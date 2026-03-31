import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/lib/rateLimit";
import { OPENCLAW } from "@/lib/config";

export const runtime = "nodejs";
export const maxDuration = 15;

const CLASSIFY_SYSTEM_PROMPT = `You are a message intent classifier for a Swedish website builder called Sajtmaskin.

Classify the user's message as exactly one of:
- "build" — the user wants to create, modify, or generate website content (pages, components, styling, features, code, templates, images, layout changes, etc.)
- "help" — the user is asking a question about the platform, pricing, how things work, troubleshooting, or needs guidance that does NOT require code generation.

Respond with ONLY the single word "build" or "help". No explanation, no punctuation.`;

export async function POST(req: NextRequest) {
  return withRateLimit(req, "ai:classify-intent", async () => {
    let body: { message?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ intent: "build" }, { status: 200 });
    }

    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) {
      return NextResponse.json({ intent: "build" }, { status: 200 });
    }

    const gatewayUrl = OPENCLAW.gatewayUrl;
    const gatewayToken = OPENCLAW.gatewayToken;

    if (!gatewayUrl || !OPENCLAW.surfaceEnabled) {
      return NextResponse.json({ intent: "build" }, { status: 200 });
    }

    try {
      const upstream = await fetch(`${gatewayUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(gatewayToken ? { Authorization: `Bearer ${gatewayToken}` } : {}),
        },
        body: JSON.stringify({
          model: "openclaw:sajtagenten",
          messages: [
            { role: "system", content: CLASSIFY_SYSTEM_PROMPT },
            { role: "user", content: message.slice(0, 500) },
          ],
          max_tokens: 4,
          temperature: 0,
          stream: false,
        }),
        signal: AbortSignal.timeout(5_000),
      });

      if (!upstream.ok) {
        return NextResponse.json({ intent: "build" }, { status: 200 });
      }

      const data = await upstream.json();
      const raw =
        (data?.choices?.[0]?.message?.content ?? "").trim().toLowerCase();

      const intent = raw === "help" ? "help" : "build";
      return NextResponse.json({ intent }, { status: 200 });
    } catch {
      return NextResponse.json({ intent: "build" }, { status: 200 });
    }
  });
}
