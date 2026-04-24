import { timingSafeEqual } from "node:crypto";

export function validateWebhookSecret(request: Request, secret: string): boolean {
  const headerSecret = request.headers.get("x-webhook-secret");
  if (!headerSecret) return false;

  const a = Buffer.from(headerSecret, "utf-8");
  const b = Buffer.from(secret, "utf-8");
  if (a.byteLength !== b.byteLength) return false;

  return timingSafeEqual(a, b);
}

export function getWebhookSecret(): string {
  const secret = process.env.INBOUND_WEBHOOK_SHARED_SECRET;
  if (!secret) {
    throw new Error("INBOUND_WEBHOOK_SHARED_SECRET is not configured");
  }
  return secret;
}

export type V0WebhookEventType =
  | "chat.created"
  | "message.created"
  | "message.finished"
  | "message.completed"
  | "deployment.created"
  | "deployment.ready"
  | "deployment.error";

export interface V0WebhookEvent {
  type: V0WebhookEventType;
  timestamp: string;
  data: {
    chatId?: string;
    messageId?: string;
    versionId?: string;
    deploymentId?: string;
    /** @deprecated Prefer previewUrl in inbound payloads; both accepted during dual-key phase. */
    // TODO(after-wave-5): drop after deadline 2026-Q3 if no inbound payloads.
    demoUrl?: string;
    previewUrl?: string;
    url?: string;
    error?: string;
    [key: string]: unknown;
  };
}

export function parseWebhookEvent(body: unknown): V0WebhookEvent | null {
  if (!body || typeof body !== "object" || !("type" in body)) {
    return null;
  }
  const b = body as Record<string, unknown>;

  const rawType = String(b.type) as V0WebhookEventType;
  const normalizedType = rawType === "message.completed" ? ("message.finished" as const) : rawType;

  return {
    type: normalizedType,
    timestamp: (typeof b.timestamp === "string" ? b.timestamp : null) || new Date().toISOString(),
    data: (b.data && typeof b.data === "object" ? b.data : b) as V0WebhookEvent["data"],
  };
}
