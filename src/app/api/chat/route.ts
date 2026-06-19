import { generateText, type ModelMessage } from "ai";
import { NextResponse } from "next/server";

import { createDirectModel } from "@/lib/builder/direct-model";

/**
 * Chat endpoint for the ported studio ("Fråga utan att bygga" / floating-chat
 * ask). Integrates OpenClaw (Sajtagenten) as the primary brain: it proxies to
 * the native `/api/openclaw/chat` gateway and, if that's unavailable (gateway
 * suspended/disabled), falls back to a direct OpenAI completion so the chat
 * always answers. Returns `{ message: { role, content } }`.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/** Call OpenClaw and aggregate its OpenAI-compatible SSE stream into text. */
async function askOpenClaw(
  origin: string,
  headers: Record<string, string>,
  messages: ChatMessage[],
): Promise<string | null> {
  try {
    const res = await fetch(`${origin}/api/openclaw/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({ messages }),
    });
    if (!res.ok || !res.body) return null;
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let content = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const json = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
          };
          const delta =
            json.choices?.[0]?.delta?.content ??
            json.choices?.[0]?.message?.content;
          if (typeof delta === "string") content += delta;
        } catch {
          /* ignore non-JSON keepalive lines */
        }
      }
    }
    return content.trim() || null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  let body: { messages?: ChatMessage[] };
  try {
    body = (await req.json()) as { messages?: ChatMessage[] };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) {
    return NextResponse.json({ error: "messages krävs" }, { status: 400 });
  }

  const origin = new URL(req.url).origin;
  const cookie = req.headers.get("cookie");
  const ocHeaders: Record<string, string> = { "Content-Type": "application/json" };
  if (cookie) ocHeaders.cookie = cookie;

  // 1. OpenClaw (Sajtagenten) — the integrated assistant brain.
  const openClaw = await askOpenClaw(origin, ocHeaders, messages);
  if (openClaw) {
    return NextResponse.json({
      message: { role: "assistant", content: openClaw },
      source: "openclaw",
    });
  }

  // 2. Fallback: direct OpenAI (keeps the chat usable when the OpenClaw gateway
  //    is suspended/unreachable).
  try {
    const { text } = await generateText({
      model: createDirectModel("openai/gpt-5.4-mini"),
      messages: messages as ModelMessage[],
    });
    return NextResponse.json({
      message: { role: "assistant", content: text },
      source: "openai-fallback",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Chat misslyckades." },
      { status: 502 },
    );
  }
}
