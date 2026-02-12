export function validateWebhookSecret(request: Request, secret: string): boolean {
  const headerSecret = request.headers.get("x-webhook-secret");
  if (headerSecret && headerSecret === secret) {
    return true;
  }

  return false;
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
    demoUrl?: string;
    url?: string;
    error?: string;
    [key: string]: any;
  };
}

export function parseWebhookEvent(body: any): V0WebhookEvent | null {
  if (!body || !body.type) {
    return null;
  }

  const rawType = String(body.type) as V0WebhookEventType;
  const normalizedType = rawType === "message.completed" ? ("message.finished" as const) : rawType;

  return {
    type: normalizedType,
    timestamp: body.timestamp || new Date().toISOString(),
    data: body.data || body,
  };
}
