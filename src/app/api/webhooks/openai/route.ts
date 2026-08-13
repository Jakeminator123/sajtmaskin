import { NextResponse } from "next/server";
import {
  insertOpenAiWebhookEvent,
  parseOpenAiWebhookEvent,
  verifyOpenAiWebhookSignature,
} from "@/lib/openai/openai-webhooks";

export const runtime = "nodejs";

/**
 * Receiver for OpenAI platform webhooks (see `src/lib/openai/openai-webhooks.ts`).
 * This path is the endpoint URL registered in the OpenAI dashboard
 * (Settings → Webhooks). Verified events land in `openai_webhook_events`
 * (surfaced via `dump-logs.mjs --kinds=openai` / backoffice Logg-export).
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
      // 503, not 200. A missing database is a configuration state we can come
      // back from — the deploy that lacks `POSTGRES_URL` gets one, or traffic
      // moves to an instance that has it — but only if the event still exists
      // to come back to. Acking it spends OpenAI's single delivery on a write
      // that never happened, and there is no queue, blob or replay path behind
      // this endpoint: the event is simply gone, with a `console.warn` as the
      // only trace. `Retry-After` keeps the redelivery backoff honest rather
      // than letting it hammer an instance that cannot store anything.
      console.warn(
        `[openai-webhook] DB unconfigured — asking for redelivery of ${event.eventType} (${event.eventId})`,
      );
      return NextResponse.json(
        { error: "Storage unavailable", stored: false, retry: true },
        { status: 503, headers: { "Retry-After": "60" } },
      );
    }
    return NextResponse.json({ ok: true, stored: result === "inserted" });
  } catch (err) {
    // Non-2xx → OpenAI redelivers with backoff, so a transient DB failure
    // does not silently lose the event.
    console.error("[openai-webhook] insert failed:", err);
    return NextResponse.json({ error: "Failed to store event" }, { status: 500 });
  }
}
