import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";

export const CLIENT_ERROR_KINDS = ["uncaught", "unhandledrejection", "hydration"] as const;
export type ClientErrorKind = (typeof CLIENT_ERROR_KINDS)[number];

export type SanitizedClientErrorPayload = {
  kind: ClientErrorKind;
  message: string;
  stack?: string;
  href: string;
};

const MESSAGE_MAX = 500;
const STACK_MAX = 1000;
const MAX_PER_VERSION = 5;

type GateEntry = { count: number; messages: Set<string> };

const gateByVersion = new Map<string, GateEntry>();

function isClientErrorKind(value: unknown): value is ClientErrorKind {
  return typeof value === "string" && (CLIENT_ERROR_KINDS as readonly string[]).includes(value);
}

/**
 * Validera + trunkera untrusted payload från preview-iframen.
 * Returnerar null om obligatoriska fält saknas eller har fel typ.
 */
export function sanitizeClientErrorPayload(raw: unknown): SanitizedClientErrorPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (!isClientErrorKind(obj.kind)) return null;
  if (typeof obj.message !== "string") return null;
  const message = obj.message.trim().slice(0, MESSAGE_MAX);
  if (!message) return null;
  if (typeof obj.href !== "string") return null;
  const href = obj.href.trim().slice(0, MESSAGE_MAX);
  if (!href) return null;

  const out: SanitizedClientErrorPayload = { kind: obj.kind, message, href };
  if (typeof obj.stack === "string" && obj.stack.length > 0) {
    out.stack = obj.stack.slice(0, STACK_MAX);
  }
  return out;
}

/** Session-tak: max 5 unika meddelanden per versionId. */
export function acceptClientErrorReport(versionId: string, message: string): boolean {
  if (!versionId || !message) return false;
  let entry = gateByVersion.get(versionId);
  if (!entry) {
    entry = { count: 0, messages: new Set() };
    gateByVersion.set(versionId, entry);
  }
  if (entry.messages.has(message)) return false;
  if (entry.count >= MAX_PER_VERSION) return false;
  entry.messages.add(message);
  entry.count += 1;
  return true;
}

/**
 * Släpp tillbaka ett meddelande i gaten när POST:en misslyckades (nätverksfel
 * eller icke-2xx, t.ex. routens retryable 503 vid row contention). Utan detta
 * blockeras ett äkta fel för resten av flik-sessionen efter en transient miss
 * (bugbot 2026-08-05).
 */
export function releaseClientErrorReport(versionId: string, message: string): void {
  const entry = gateByVersion.get(versionId);
  if (!entry || !entry.messages.has(message)) return;
  entry.messages.delete(message);
  entry.count = Math.max(0, entry.count - 1);
}

/** Test-only: nollställ session-taket. */
export function resetClientErrorReportGateForTests(): void {
  gateByVersion.clear();
}

/**
 * Fire-and-forget POST till versionens error-log. Saknas chatId/versionId eller
 * payloaden är ogiltig/dup → no-op. Fel/503 sväljs tyst (men släpper gaten så
 * ett omförsök är möjligt).
 *
 * Attribuering är best-effort: vid ett pågående versionsbyte kan ett sent
 * meddelande från föregående preview-dokument tillskrivas den nya versionen.
 * Accepterad begränsning för Advisory-diagnostik (bugbot 2026-08-05) — raderna
 * är fel-speglar, inte grund för automatiska beslut per version.
 */
export function reportPreviewClientError(
  chatId: string | null | undefined,
  versionId: string | null | undefined,
  raw: unknown,
): void {
  if (!chatId || !versionId) return;
  const payload = sanitizeClientErrorPayload(raw);
  if (!payload) return;
  if (!acceptClientErrorReport(versionId, payload.message)) return;

  const url = `${engineChatBaseUrl(chatId)}/versions/${encodeURIComponent(versionId)}/error-log`;
  try {
    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        level: "warning",
        category: "preview:client-error",
        message: `[${payload.kind}] ${payload.message}`,
        meta: {
          kind: payload.kind,
          href: payload.href,
          stack: payload.stack ?? null,
        },
      }),
    })
      .then((res) => {
        if (!res.ok) releaseClientErrorReport(versionId, payload.message);
      })
      .catch(() => {
        releaseClientErrorReport(versionId, payload.message);
      });
  } catch {
    releaseClientErrorReport(versionId, payload.message);
  }
}
