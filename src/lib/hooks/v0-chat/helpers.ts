import type { ChatMessage, UiMessagePart } from "@/lib/builder/types";
import type { PromptStrategyMeta } from "@/lib/builder/promptOrchestration";
import { CREATE_CHAT_LOCK_KEY, CREATE_CHAT_LOCK_TTL_MS, POST_CHECK_MARKER } from "./constants";
import type {
  AutoFixPayload,
  CreateChatLock,
  IntegrationSseSignal,
  MessageOptions,
  ModelInfoData,
  SetMessages,
  StreamDebugStats,
  StreamQualitySignal,
  V0Attachment,
} from "./types";
import { debugLog, warnLog } from "@/lib/utils/debug";

// ---------------------------------------------------------------------------
// Session-storage lock helpers
// ---------------------------------------------------------------------------

function getSessionStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function readCreateChatLock(): CreateChatLock | null {
  const storage = getSessionStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(CREATE_CHAT_LOCK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CreateChatLock;
    if (!parsed || typeof parsed.key !== "string" || typeof parsed.createdAt !== "number") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeCreateChatLock(lock: CreateChatLock) {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    storage.setItem(CREATE_CHAT_LOCK_KEY, JSON.stringify(lock));
  } catch {
    // ignore storage errors
  }
}

export function clearCreateChatLock() {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    storage.removeItem(CREATE_CHAT_LOCK_KEY);
  } catch {
    // ignore storage errors
  }
}

export function getActiveCreateChatLock(key: string): CreateChatLock | null {
  const lock = readCreateChatLock();
  if (!lock) return null;
  if (Date.now() - lock.createdAt > CREATE_CHAT_LOCK_TTL_MS) {
    clearCreateChatLock();
    return null;
  }
  return lock.key === key ? lock : null;
}

export function updateCreateChatLockChatId(key: string, chatId: string) {
  const lock = readCreateChatLock();
  if (!lock || lock.key !== key) return;
  if (lock.chatId === chatId) return;
  writeCreateChatLock({ ...lock, chatId });
}

// ---------------------------------------------------------------------------
// String utilities
// ---------------------------------------------------------------------------

export function normalizePrompt(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function hashString(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

export function buildCreateChatKey(
  message: string,
  options: MessageOptions,
  modelId: string,
  imageGenerations: boolean,
  systemPrompt?: string,
): string {
  const normalizedMessage = normalizePrompt(message);
  const normalizedSystem = normalizePrompt(systemPrompt ?? "");
  const attachmentSignature = (options.attachments ?? [])
    .map((attachment) => {
      const url = typeof attachment.url === "string" ? attachment.url.trim() : "";
      const filename = typeof attachment.filename === "string" ? attachment.filename.trim() : "";
      return url || filename || "";
    })
    .filter((value) => value.length > 0)
    .map((value) => encodeURIComponent(value))
    .join("|");
  const attachmentPrompt = normalizePrompt(options.attachmentPrompt ?? "");
  const fingerprint = [
    normalizedMessage,
    `model:${modelId}`,
    `images:${imageGenerations ? "1" : "0"}`,
    `system:${normalizedSystem}`,
    `attachments:${attachmentSignature}`,
    `attachmentPrompt:${attachmentPrompt}`,
  ].join("::");
  return hashString(fingerprint);
}

// ---------------------------------------------------------------------------
// Streaming text merge
// ---------------------------------------------------------------------------

export function mergeStreamingText(previous: string, incoming: string): string {
  if (!previous) return incoming;
  if (!incoming) return previous;
  if (incoming.startsWith(previous)) return incoming;
  if (previous.startsWith(incoming)) return previous;
  if (incoming.length > 16 && previous.includes(incoming)) return previous;
  if (previous.length > 16 && incoming.includes(previous)) return incoming;

  const MIN_SAFE_OVERLAP = 8;
  const maxOverlap = Math.min(previous.length, incoming.length);
  for (let size = maxOverlap; size >= MIN_SAFE_OVERLAP; size -= 1) {
    if (previous.slice(-size) === incoming.slice(0, size)) {
      return previous + incoming.slice(size);
    }
  }

  const last = previous.slice(-1);
  const first = incoming[0];
  const needsSpace =
    last && first && /[.!?:;]$/.test(last) && /[A-Za-z0-9]/.test(first) && !/\s/.test(first);

  return needsSpace ? `${previous} ${incoming}` : previous + incoming;
}

// ---------------------------------------------------------------------------
// Stream debug stats
// ---------------------------------------------------------------------------

export function initStreamStats(
  streamType: StreamDebugStats["streamType"],
  assistantMessageId: string,
): StreamDebugStats {
  return {
    streamType,
    assistantMessageId,
    startedAt: Date.now(),
    contentEvents: 0,
    thinkingEvents: 0,
    partsEvents: 0,
    contentChars: 0,
    thinkingChars: 0,
    contentNoopEvents: 0,
    thinkingNoopEvents: 0,
    maxContentChunk: 0,
    maxThinkingChunk: 0,
    finalContentLength: 0,
    finalThinkingLength: 0,
    didReceiveDone: false,
  };
}

export function recordStreamText(
  stats: StreamDebugStats,
  kind: "content" | "thinking",
  previous: string,
  merged: string,
  incomingLength: number,
) {
  if (kind === "content") {
    stats.contentEvents += 1;
    stats.contentChars += incomingLength;
    stats.maxContentChunk = Math.max(stats.maxContentChunk, incomingLength);
    if (merged.length === previous.length) {
      stats.contentNoopEvents += 1;
    }
    stats.finalContentLength = merged.length;
    return;
  }
  stats.thinkingEvents += 1;
  stats.thinkingChars += incomingLength;
  stats.maxThinkingChunk = Math.max(stats.maxThinkingChunk, incomingLength);
  if (merged.length === previous.length) {
    stats.thinkingNoopEvents += 1;
  }
  stats.finalThinkingLength = merged.length;
}

export function recordStreamParts(stats: StreamDebugStats, partsCount: number) {
  if (partsCount <= 0) return;
  stats.partsEvents += 1;
}

export function finalizeStreamStats(stats: StreamDebugStats): StreamQualitySignal {
  const durationMs = Date.now() - stats.startedAt;
  const summary = {
    streamType: stats.streamType,
    assistantMessageId: stats.assistantMessageId,
    chatId: stats.chatId ?? null,
    versionId: stats.versionId ?? null,
    durationMs,
    didReceiveDone: stats.didReceiveDone,
    contentEvents: stats.contentEvents,
    contentChars: stats.contentChars,
    contentNoopEvents: stats.contentNoopEvents,
    maxContentChunk: stats.maxContentChunk,
    finalContentLength: stats.finalContentLength,
    thinkingEvents: stats.thinkingEvents,
    thinkingChars: stats.thinkingChars,
    thinkingNoopEvents: stats.thinkingNoopEvents,
    maxThinkingChunk: stats.maxThinkingChunk,
    finalThinkingLength: stats.finalThinkingLength,
    partsEvents: stats.partsEvents,
  };

  debugLog("v0", "Stream summary", summary);

  const reasons: string[] = [];
  if (!stats.didReceiveDone) {
    reasons.push("done_event_missing");
  }
  if (stats.contentEvents > 0 && stats.finalContentLength === 0) {
    reasons.push("content_empty_after_events");
  }
  if (stats.thinkingEvents > 0 && stats.finalThinkingLength === 0) {
    reasons.push("thinking_empty_after_events");
  }

  const hasCriticalAnomaly = reasons.length > 0;
  if (hasCriticalAnomaly) {
    warnLog("v0", "Stream anomaly detected", { ...summary, reasons });
  }
  return { hasCriticalAnomaly, reasons };
}

// ---------------------------------------------------------------------------
// Attachment / message helpers
// ---------------------------------------------------------------------------

export function appendAttachmentPrompt(
  message: string,
  attachmentPrompt?: string,
  attachments?: V0Attachment[],
): string {
  if (attachments && attachments.length > 0) return message;
  if (!attachmentPrompt) return message;
  return `${message}${attachmentPrompt}`.trim();
}

// ---------------------------------------------------------------------------
// UI parts coercion & merging
// ---------------------------------------------------------------------------

export function coerceUiParts(data: unknown): UiMessagePart[] {
  if (Array.isArray(data)) {
    return data.filter((part): part is UiMessagePart => Boolean(part) && typeof part === "object");
  }
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (typeof obj.type === "string") {
      return [obj as UiMessagePart];
    }
    if (Array.isArray(obj.parts)) {
      return obj.parts.filter(
        (part): part is UiMessagePart => Boolean(part) && typeof part === "object",
      );
    }
  }
  return [];
}

function getUiPartKey(part: UiMessagePart): string | null {
  const type = typeof part.type === "string" ? part.type : "";
  if (type.startsWith("tool")) {
    const candidate =
      (typeof part.toolCallId === "string" && part.toolCallId) ||
      (typeof part.id === "string" && part.id) ||
      (typeof part.name === "string" && part.name) ||
      (typeof part.toolName === "string" && part.toolName) ||
      type;
    return candidate || null;
  }
  if (type === "plan") return "plan";
  if (type === "sources") return "sources";
  if (type === "source") {
    const candidate =
      (typeof part.url === "string" && part.url) ||
      (typeof (part.source as { url?: unknown })?.url === "string" &&
        (part.source as { url?: string }).url) ||
      null;
    return candidate;
  }
  return null;
}

function mergeUiPart(current: UiMessagePart, next: UiMessagePart): UiMessagePart {
  const merged = { ...current };
  const streamKeys = new Set([
    "output",
    "result",
    "response",
    "toolOutput",
    "tool_output",
    "content",
    "text",
    "summary",
  ]);
  Object.entries(next).forEach(([key, value]) => {
    if (value !== undefined) {
      if (
        typeof value === "string" &&
        streamKeys.has(key) &&
        typeof (merged as Record<string, unknown>)[key] === "string"
      ) {
        const prev = String((merged as Record<string, unknown>)[key]);
        merged[key] = mergeStreamingText(prev, value);
        return;
      }
      merged[key] = value;
    }
  });
  return merged;
}

export function mergeUiParts(
  prev: UiMessagePart[] | undefined,
  next: UiMessagePart[],
): UiMessagePart[] {
  if (next.length === 0) return prev ?? [];
  const merged = [...(prev ?? [])];
  next.forEach((part) => {
    const key = getUiPartKey(part);
    if (!key) {
      merged.push(part);
      return;
    }
    const index = merged.findIndex((existing) => getUiPartKey(existing) === key);
    if (index === -1) {
      merged.push(part);
      return;
    }
    merged[index] = mergeUiPart(merged[index], part);
  });
  return merged;
}

export function appendToolPartToMessage(
  setMessages: SetMessages,
  messageId: string,
  part: UiMessagePart,
) {
  setMessages((prev) =>
    prev.map((message) =>
      message.id === messageId
        ? { ...message, uiParts: mergeUiParts(message.uiParts, [part]) }
        : message,
    ),
  );
}

// ---------------------------------------------------------------------------
// Integration signals
// ---------------------------------------------------------------------------

export function coerceIntegrationSignals(data: unknown): IntegrationSseSignal[] {
  const rawItems =
    Array.isArray(data)
      ? data
      : data && typeof data === "object" && Array.isArray((data as { items?: unknown[] }).items)
        ? (data as { items: unknown[] }).items
        : data && typeof data === "object"
          ? [data]
          : [];

  return rawItems
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const signal = item as Record<string, unknown>;
      const envVars = Array.isArray(signal.envVars)
        ? signal.envVars.map((value) => String(value)).filter(Boolean)
        : [];
      return {
        key: typeof signal.key === "string" ? signal.key : undefined,
        name: typeof signal.name === "string" ? signal.name : undefined,
        provider: typeof signal.provider === "string" ? signal.provider : undefined,
        status: typeof signal.status === "string" ? signal.status : undefined,
        intent:
          signal.intent === "install" ||
          signal.intent === "connect" ||
          signal.intent === "configure" ||
          signal.intent === "env_vars"
            ? signal.intent
            : undefined,
        envVars: envVars.length > 0 ? envVars : undefined,
        marketplaceUrl:
          typeof signal.marketplaceUrl === "string" ? signal.marketplaceUrl : undefined,
        sourceEvent: typeof signal.sourceEvent === "string" ? signal.sourceEvent : undefined,
      } as IntegrationSseSignal;
    })
    .filter((item): item is IntegrationSseSignal => Boolean(item));
}

function buildIntegrationSteps(signal: IntegrationSseSignal): string[] {
  const steps: string[] = [];
  if (signal.name) steps.push(`Integration: ${signal.name}`);
  if (signal.provider && signal.provider !== signal.name) {
    steps.push(`Provider: ${signal.provider}`);
  }
  if (signal.intent) {
    const label =
      signal.intent === "env_vars"
        ? "Konfigurera miljövariabler"
        : signal.intent === "install"
          ? "Installera integration"
          : signal.intent === "connect"
            ? "Koppla integration"
            : "Konfigurera integration";
    steps.push(`Åtgärd: ${label}`);
  }
  if (signal.envVars && signal.envVars.length > 0) {
    steps.push(`Miljövariabler: ${signal.envVars.join(", ")}`);
  }
  if (signal.status) {
    steps.push(`Status: ${signal.status}`);
  }
  if (signal.marketplaceUrl) {
    steps.push(`Marketplace: ${signal.marketplaceUrl}`);
  }
  return steps;
}

export function integrationSignalToToolPart(
  signal: IntegrationSseSignal,
  fallbackId: string,
): UiMessagePart {
  const toolCallId = signal.key ? `integration:${signal.key}` : `integration:${fallbackId}`;
  return {
    type: "tool:integration-suggestion",
    toolName: "Integration suggestion",
    toolCallId,
    state: "output-available",
    output: {
      ...signal,
      steps: buildIntegrationSteps(signal),
    },
  } as UiMessagePart;
}

// ---------------------------------------------------------------------------
// Model info / prompt strategy tool parts
// ---------------------------------------------------------------------------

function buildModelInfoSteps(info: ModelInfoData): string[] {
  const steps: string[] = [];
  const modelId = info.modelId ? String(info.modelId) : null;
  steps.push(`Model: ${modelId || "okänd"}`);
  if (modelId && modelId !== "v0-max") {
    steps.push("Varning: inte Max-tier");
  }
  if (typeof info.thinking === "boolean") {
    steps.push(`Thinking: ${info.thinking ? "på" : "av"}`);
  }
  if (typeof info.imageGenerations === "boolean") {
    steps.push(`Bildgenerering: ${info.imageGenerations ? "på" : "av"}`);
  }
  if (typeof info.chatPrivacy === "string" && info.chatPrivacy.trim()) {
    steps.push(`Chat privacy: ${info.chatPrivacy}`);
  }
  return steps;
}

export function appendModelInfoPart(
  setMessages: SetMessages,
  messageId: string,
  info: ModelInfoData,
) {
  appendToolPartToMessage(setMessages, messageId, {
    type: "tool:model-info",
    toolName: "Model info",
    toolCallId: `model-info:${messageId}`,
    state: "output-available",
    output: {
      steps: buildModelInfoSteps(info),
      ...info,
    },
  });
}

function buildPromptStrategySteps(meta: PromptStrategyMeta): string[] {
  const strategyLabel =
    meta.strategy === "phase_plan_build_polish"
      ? "fasad (Plan -> Build -> Polish)"
      : meta.strategy === "summarize"
        ? "sammanfattad"
        : "direkt";
  const lengthLine =
    meta.originalLength !== meta.optimizedLength
      ? `Langd: ${meta.originalLength} -> ${meta.optimizedLength} (mal ~${meta.budgetTarget})`
      : `Langd: ${meta.originalLength} (mal ~${meta.budgetTarget})`;

  const steps = [`Prompt optimerad: ${strategyLabel}`, `Typ: ${meta.promptType}`, lengthLine];
  if (meta.reason) steps.push(`Orsak: ${meta.reason}`);
  return steps;
}

export function appendPromptStrategyPart(
  setMessages: SetMessages,
  messageId: string,
  meta: PromptStrategyMeta,
) {
  appendToolPartToMessage(setMessages, messageId, {
    type: "tool:prompt-strategy",
    toolName: "Prompt strategy",
    toolCallId: `prompt-strategy:${messageId}`,
    state: "output-available",
    output: {
      steps: buildPromptStrategySteps(meta),
      ...meta,
    },
  });
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

function toNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function getRetryAfterSeconds(
  response: Response | null,
  errorData: Record<string, unknown> | null,
): number | null {
  const direct = toNumber(errorData?.retryAfter ?? errorData?.retry_after);
  if (direct !== null) return direct;
  const header = response?.headers.get("Retry-After");
  return header ? toNumber(header) : null;
}

export function looksLikeUnsupportedModelError(message: string | null | undefined): boolean {
  const normalized = String(message ?? "").toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes("model") &&
    (normalized.includes("invalid") ||
      normalized.includes("unknown") ||
      normalized.includes("unsupported") ||
      normalized.includes("not allowed") ||
      normalized.includes("not supported"))
  );
}

export function buildApiErrorMessage(params: {
  response: Response;
  errorData: Record<string, unknown> | null;
  fallbackMessage: string;
}): string {
  const { response, errorData, fallbackMessage } = params;
  const status = response.status;
  const code = typeof errorData?.code === "string" ? errorData.code : "";
  const retryAfter = getRetryAfterSeconds(response, errorData);

  if (status === 429 || code === "rate_limit") {
    const suffix = retryAfter ? ` Prova igen om ${retryAfter}s.` : "";
    return `Rate limit: för många förfrågningar.${suffix}`;
  }
  if (status === 402 || code === "quota_exceeded") {
    return "Kvoten är slut för AI-tjänsten. Kontrollera plan/billing.";
  }
  if (status === 401 || code === "unauthorized") {
    return "API-nyckel saknas eller är ogiltig.";
  }
  if (status === 403 || code === "forbidden") {
    return "Åtkomst nekad av AI-tjänsten (403). Kontrollera behörigheter.";
  }
  if (status === 422 || code === "unprocessable_entity_error") {
    const nestedMsg =
      typeof (errorData?.error as Record<string, unknown>)?.message === "string"
        ? ((errorData!.error as Record<string, unknown>).message as string)
        : typeof errorData?.message === "string"
          ? errorData.message
          : null;
    if (nestedMsg?.toLowerCase().includes("attachment size")) {
      return "Bilagan är för stor (max 3 MB). Försök med en mindre fil.";
    }
    if (looksLikeUnsupportedModelError(nestedMsg)) {
      return `Model ID avvisades av AI-tjänsten: "${nestedMsg}". Prova ett annat custom modelId eller byt tillbaka till mini/pro/max.`;
    }
    return nestedMsg || "Ogiltigt anrop (422). Kontrollera bilagor och meddelande.";
  }

  const directMessage =
    (typeof errorData?.error === "string" && errorData.error) ||
    (typeof errorData?.message === "string" && errorData.message) ||
    "";
  if (looksLikeUnsupportedModelError(directMessage)) {
    return `Model ID avvisades av AI-tjänsten: "${directMessage}". Prova ett annat custom modelId eller byt tillbaka till mini/pro/max.`;
  }

  let message = directMessage || fallbackMessage;
  if (!message.includes("HTTP")) {
    message = `${message} (HTTP ${status})`;
  }
  return message;
}

export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (error instanceof Error) {
    return /network|fetch|connection|reset/i.test(error.message);
  }
  return false;
}

export function buildStreamErrorMessage(errorData: Record<string, unknown> | null): string {
  const code = typeof errorData?.code === "string" ? errorData.code : "";
  const retryAfter = toNumber(errorData?.retryAfter ?? errorData?.retry_after);
  const rawMessage =
    (typeof errorData?.message === "string" && errorData.message) ||
    (typeof errorData?.error === "string" && errorData.error) ||
    "";

  if (code === "rate_limit") {
    const suffix = retryAfter ? ` Prova igen om ${retryAfter}s.` : "";
    return `Rate limit: för många förfrågningar.${suffix}`;
  }
  if (code === "quota_exceeded") {
    return "Kvoten är slut för AI-tjänsten. Kontrollera plan/billing.";
  }
  if (code === "unauthorized") {
    return "API-nyckel saknas eller är ogiltig.";
  }
  if (code === "forbidden") {
    return "Åtkomst nekad av AI-tjänsten (403). Kontrollera behörigheter.";
  }
  if (code === "preview_unavailable") {
    return "Preview-version kunde inte fastställas från streamen. Försök igen eller kör reparera preview.";
  }
  if (looksLikeUnsupportedModelError(rawMessage)) {
    return `Model ID avvisades av AI-tjänsten: "${rawMessage}". Prova ett annat custom modelId eller byt tillbaka till mini/pro/max.`;
  }
  if (rawMessage.toLowerCase().includes("no preview version was generated")) {
    return "Preview-version saknas efter streamen. Försök igen eller kör reparera preview.";
  }
  return rawMessage || "Stream error";
}

// ---------------------------------------------------------------------------
// Auto-fix prompt
// ---------------------------------------------------------------------------

export function buildAutoFixPrompt(payload: AutoFixPayload): string {
  const reasons = payload.reasons.length > 0 ? payload.reasons.join(", ") : "unknown issues";
  const lines = [
    "Auto-fix request:",
    `Issues: ${reasons}.`,
    "Fix the issues without changing unrelated layout or content.",
    "Checklist:",
    "- Ensure the preview/demo URL works.",
    "- Add missing routes or update broken internal links.",
    "- Fix invalid React use() usage and broken images if present.",
    "Return with updated files only.",
  ];
  if (payload.meta) {
    lines.push("", "Context (for reference):", JSON.stringify(payload.meta, null, 2));
  }
  return lines.join("\n");
}
