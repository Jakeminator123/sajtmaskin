/**
 * Inbound OpenAI platform webhooks (Standard Webhooks spec).
 *
 * OpenAI signs each delivery with the endpoint's `whsec_…` signing secret
 * (env: `OPENAI_WEBHOOK`) using HMAC-SHA256 over
 * `${webhook-id}.${webhook-timestamp}.${rawBody}` — the same Standard
 * Webhooks spec used by Resend/Clerk. Events fire for asynchronous jobs
 * (`response.completed` etc. for Responses API calls with `background: true`,
 * Batch API, fine-tuning) — NOT for the synchronous/streaming calls the
 * codegen pipeline makes today. The receiver is therefore a durable
 * receipt/audit trail (table `openai_webhook_events`), not a live progress
 * channel; builder-chat progress stays on the existing SSE stream.
 *
 * Verification is hand-rolled (mirrors `api/webhooks/vercel`) instead of
 * `openai.webhooks.unwrap()` so the route never needs an OpenAI client or
 * `OPENAI_API_KEY` just to receive events.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { pool, dbConfigured } from "@/lib/db/client";

/** Replay-protection window, per the Standard Webhooks recommendation. */
export const OPENAI_WEBHOOK_TOLERANCE_SECONDS = 300;

export type OpenAiWebhookVerification = { ok: true } | { ok: false; reason: string };

export function verifyOpenAiWebhookSignature(params: {
  rawBody: string;
  webhookId: string | null;
  webhookTimestamp: string | null;
  signatureHeader: string | null;
  secret: string;
  nowMs?: number;
  toleranceSeconds?: number;
}): OpenAiWebhookVerification {
  const { rawBody, webhookId, webhookTimestamp, signatureHeader, secret } = params;
  if (!webhookId || !webhookTimestamp || !signatureHeader) {
    return { ok: false, reason: "missing webhook headers" };
  }

  const timestampSeconds = Number.parseInt(webhookTimestamp, 10);
  if (!Number.isFinite(timestampSeconds)) {
    return { ok: false, reason: "invalid webhook timestamp" };
  }
  const nowSeconds = Math.floor((params.nowMs ?? Date.now()) / 1000);
  const tolerance = params.toleranceSeconds ?? OPENAI_WEBHOOK_TOLERANCE_SECONDS;
  if (Math.abs(nowSeconds - timestampSeconds) > tolerance) {
    return { ok: false, reason: "webhook timestamp outside tolerance" };
  }

  const decodedSecret = secret.startsWith("whsec_")
    ? Buffer.from(secret.slice("whsec_".length), "base64")
    : Buffer.from(secret, "utf8");
  const expected = createHmac("sha256", decodedSecret)
    .update(`${webhookId}.${webhookTimestamp}.${rawBody}`, "utf8")
    .digest();

  // The header may carry several space-separated `v1,<base64>` signatures
  // (secret rotation) — accept if any matches.
  for (const part of signatureHeader.split(" ")) {
    const candidateB64 = part.startsWith("v1,") ? part.slice(3) : part;
    const candidate = Buffer.from(candidateB64, "base64");
    if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) {
      return { ok: true };
    }
  }
  return { ok: false, reason: "signature mismatch" };
}

export interface ParsedOpenAiWebhookEvent {
  /** OpenAI event id (`evt_…`) — idempotency key across retries. */
  eventId: string;
  /** e.g. `response.completed`, `batch.failed`, `fine_tuning.job.succeeded`. */
  eventType: string;
  /** Unix seconds when the event was created at OpenAI (null if absent). */
  createdAt: number | null;
  /** `data.id` — the response/batch/job the event refers to (`resp_…` etc.). */
  objectId: string | null;
}

export function parseOpenAiWebhookEvent(body: unknown): ParsedOpenAiWebhookEvent | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.id !== "string" || b.id.length === 0) return null;
  if (typeof b.type !== "string" || b.type.length === 0) return null;
  const data = b.data && typeof b.data === "object" ? (b.data as Record<string, unknown>) : null;
  return {
    eventId: b.id,
    eventType: b.type,
    createdAt: typeof b.created_at === "number" ? b.created_at : null,
    objectId: data && typeof data.id === "string" ? data.id : null,
  };
}

export type OpenAiWebhookInsertResult = "inserted" | "duplicate" | "db_unconfigured";

/**
 * Store one verified event. Throws on DB failure so the route can answer
 * non-2xx and let OpenAI's retry policy (exponential backoff, up to 72h)
 * redeliver instead of silently losing the event. `ON CONFLICT (event_id)
 * DO NOTHING` makes redeliveries idempotent.
 */
export async function insertOpenAiWebhookEvent(
  event: ParsedOpenAiWebhookEvent,
  payload: unknown,
): Promise<OpenAiWebhookInsertResult> {
  if (!dbConfigured || !pool) return "db_unconfigured";
  const res = await pool.query(
    `INSERT INTO openai_webhook_events (event_id, event_type, object_id, event_created_at, payload)
     VALUES ($1, $2, $3, to_timestamp($4), $5)
     ON CONFLICT (event_id) DO NOTHING`,
    [event.eventId, event.eventType, event.objectId, event.createdAt, JSON.stringify(payload)],
  );
  return (res.rowCount ?? 0) > 0 ? "inserted" : "duplicate";
}
