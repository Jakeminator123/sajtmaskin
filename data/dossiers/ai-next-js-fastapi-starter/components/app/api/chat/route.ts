import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

const FASTAPI_CHAT_URL = process.env.FASTAPI_CHAT_URL;

export async function POST(req: Request) {
  if (!FASTAPI_CHAT_URL) {
    return new Response("Missing FASTAPI_CHAT_URL", { status: 500 });
  }

  const body = await req.json();

  const upstream = await fetch(FASTAPI_CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text();
    return new Response(text || "Upstream chat request failed", {
      status: upstream.status || 500,
    });
  }

  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.merge(upstream.body!);
    },
  });

  return createUIMessageStreamResponse({ stream });
}
