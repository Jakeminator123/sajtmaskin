import { NextResponse } from "next/server";
import {
  insertOpenAiWebhookEvent,
  parseOpenAiWebhookEvent,
  verifyOpenAiWebhookSignature,
} from "@/lib/openai-webhooks";

export const runtime = "nodejs";

/**
 * Receiver for OpenAI platform webhooks (see `src/lib/openai-webhooks.ts`).
 * Registered dashboard URLs `/recevie-openai-webhook` / `/receive-openai-webhook`
 * are rewritten here (next.config.ts). Verified events land in
 * `openai_webhook_events` (surfaced via `dump-logs.mjs --kinds=openai` /
 * backoffice Logg-export).
 */
export async function POST(req: Request) {
  const secret = process.env.OPENAI_WEBHOOK;
  if (!secret) {
    return NextResponse.json({ error: "Missing OPENAI_WEBHOOK" }, { status: 500 });
  }

  const rawBody = await req.text();
  const verification = verifyOpenAiWebhookSignature({
    rawBody,
    webhookId: req.headers.get("webhook-id"),
    webhookTimestamp: req.headers.get("webhook-timestamp"),
    signatureHeader: req.headers.get("webhook-signature"),
    secret,
  });
  if (!verification.ok) {
    return NextResponse.json({ error: verification.reason }, { status: 401 });
  }

  let body: unknown = null;
  try {
    body = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const event = parseOpenAiWebhookEvent(body);
  if (!event) {
    // Correctly signed but not an event envelope we recognize — ack (2xx) so
    // OpenAI does not retry it for 72h, but flag that nothing was stored.
    return NextResponse.json({ ok: true, ignored: true, reason: "unrecognized event envelope" });
  }

  try {
    const result = await insertOpenAiWebhookEvent(event, body);
    if (result === "db_unconfigured") {
      console.warn(
        `[openai-webhook] DB unconfigured — dropped ${event.eventType} (${event.eventId})`,
      );
      return NextResponse.json({ ok: true, stored: false });
    }
    return NextResponse.json({ ok: true, stored: result === "inserted" });
  } catch (err) {
    // Non-2xx → OpenAI redelivers with backoff, so a transient DB failure
    // does not silently lose the event.
    console.error("[openai-webhook] insert failed:", err);
    return NextResponse.json({ error: "Failed to store event" }, { status: 500 });
  }
}
