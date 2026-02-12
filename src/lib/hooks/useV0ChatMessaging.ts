import { consumeSseResponse } from "@/lib/builder/sse";
import type { ChatMessage, UiMessagePart } from "@/lib/builder/types";
import type { BuildIntent, BuildMethod } from "@/lib/builder/build-intent";
import type { ModelTier } from "@/lib/validations/chatSchemas";
import { formatPromptForV0 } from "@/lib/builder/promptAssist";
import {
  orchestratePromptMessage,
  type PromptStrategyMeta,
} from "@/lib/builder/promptOrchestration";
import { debugLog, warnLog } from "@/lib/utils/debug";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

type RouterLike = { replace: (href: string) => void };

type V0Attachment = {
  type: "user_file";
  url: string;
  filename: string;
  mimeType?: string;
  size?: number;
  purpose?: string;
};

type MessageOptions = {
  attachments?: V0Attachment[];
  attachmentPrompt?: string;
};

type CreateChatLock = {
  key: string;
  createdAt: number;
  chatId?: string | null;
};

type AutoFixPayload = {
  chatId: string;
  versionId: string;
  reasons: string[];
  meta?: Record<string, unknown>;
};

const CREATE_CHAT_LOCK_KEY = "sajtmaskin:createChatLock";
const CREATE_CHAT_LOCK_TTL_MS = 2 * 60 * 1000;
// Max time a stream can be active before force-clearing isStreaming
const STREAM_SAFETY_TIMEOUT_MS = 10 * 60 * 1000;

function getSessionStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readCreateChatLock(): CreateChatLock | null {
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

function buildAutoFixPrompt(payload: AutoFixPayload): string {
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

function writeCreateChatLock(lock: CreateChatLock) {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    storage.setItem(CREATE_CHAT_LOCK_KEY, JSON.stringify(lock));
  } catch {
    // ignore storage errors
  }
}

function clearCreateChatLock() {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    storage.removeItem(CREATE_CHAT_LOCK_KEY);
  } catch {
    // ignore storage errors
  }
}

function getActiveCreateChatLock(key: string): CreateChatLock | null {
  const lock = readCreateChatLock();
  if (!lock) return null;
  if (Date.now() - lock.createdAt > CREATE_CHAT_LOCK_TTL_MS) {
    clearCreateChatLock();
    return null;
  }
  return lock.key === key ? lock : null;
}

function updateCreateChatLockChatId(key: string, chatId: string) {
  const lock = readCreateChatLock();
  if (!lock || lock.key !== key) return;
  if (lock.chatId === chatId) return;
  writeCreateChatLock({ ...lock, chatId });
}

function normalizePrompt(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function hashString(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

function buildCreateChatKey(
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

function mergeStreamingText(previous: string, incoming: string): string {
  if (!previous) return incoming;
  if (!incoming) return previous;
  if (incoming.startsWith(previous)) return incoming;
  if (previous.startsWith(incoming)) return previous;
  if (incoming.length > 16 && previous.includes(incoming)) return previous;
  if (previous.length > 16 && incoming.includes(previous)) return incoming;

  const maxOverlap = Math.min(previous.length, incoming.length);
  for (let size = maxOverlap; size > 1; size -= 1) {
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

type StreamDebugStats = {
  streamType: "create" | "send";
  assistantMessageId: string;
  startedAt: number;
  contentEvents: number;
  thinkingEvents: number;
  partsEvents: number;
  contentChars: number;
  thinkingChars: number;
  contentNoopEvents: number;
  thinkingNoopEvents: number;
  maxContentChunk: number;
  maxThinkingChunk: number;
  finalContentLength: number;
  finalThinkingLength: number;
  didReceiveDone: boolean;
  chatId?: string | null;
  versionId?: string | null;
};

function initStreamStats(streamType: StreamDebugStats["streamType"], assistantMessageId: string) {
  const now = Date.now();
  const stats: StreamDebugStats = {
    streamType,
    assistantMessageId,
    startedAt: now,
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
  return stats;
}

function recordStreamText(
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

function recordStreamParts(stats: StreamDebugStats, partsCount: number) {
  if (partsCount <= 0) return;
  stats.partsEvents += 1;
}

function finalizeStreamStats(stats: StreamDebugStats) {
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

  const shouldWarn =
    !stats.didReceiveDone ||
    (stats.contentEvents > 0 && stats.finalContentLength === 0) ||
    (stats.thinkingEvents > 0 && stats.finalThinkingLength === 0);

  if (shouldWarn) {
    warnLog("v0", "Stream anomaly detected", summary);
  }
}

function appendAttachmentPrompt(
  message: string,
  attachmentPrompt?: string,
  attachments?: V0Attachment[],
): string {
  if (attachments && attachments.length > 0) return message;
  if (!attachmentPrompt) return message;
  return `${message}${attachmentPrompt}`.trim();
}

function coerceUiParts(data: unknown): UiMessagePart[] {
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

function mergeUiParts(prev: UiMessagePart[] | undefined, next: UiMessagePart[]): UiMessagePart[] {
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

type VersionEntry = {
  versionId?: string | null;
  id?: string | null;
  demoUrl?: string | null;
  createdAt?: string | null;
};

type FileEntry = { name: string; content: string };

const POST_CHECK_MARKER = "[Post-check]";
const DESIGN_TOKEN_FILES = [
  "src/app/globals.css",
  "app/globals.css",
  "styles/globals.css",
  "globals.css",
];

type ModelInfoData = {
  modelId?: string | null;
  thinking?: boolean | null;
  imageGenerations?: boolean | null;
  chatPrivacy?: string | null;
};

function buildModelInfoSteps(info: ModelInfoData): string[] {
  const steps: string[] = [];
  const modelId = info.modelId ? String(info.modelId) : null;
  steps.push(`Model: ${modelId || "okänd"}`);
  if (modelId && modelId !== "v0-max") {
    steps.push("Varning: inte V0 Max");
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

function appendModelInfoPart(
  setMessages: (next: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void,
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

function appendPromptStrategyPart(
  setMessages: (next: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void,
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

function buildApiErrorMessage(params: {
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
    return "Kvoten är slut för v0. Kontrollera plan/billing.";
  }
  if (status === 401 || code === "unauthorized") {
    return "V0_API_KEY saknas eller är ogiltig.";
  }
  if (status === 403 || code === "forbidden") {
    return "Åtkomst nekad av v0 (403). Kontrollera behörigheter.";
  }
  if (status === 422 || code === "unprocessable_entity_error") {
    // Extract the nested error message from v0's error format
    const nestedMsg =
      typeof (errorData?.error as Record<string, unknown>)?.message === "string"
        ? (errorData!.error as Record<string, unknown>).message as string
        : typeof errorData?.message === "string"
          ? errorData.message
          : null;
    if (nestedMsg?.toLowerCase().includes("attachment size")) {
      return "Bilagan är för stor (max 3 MB). Försök med en mindre fil.";
    }
    if (looksLikeUnsupportedModelError(nestedMsg)) {
      return `Model ID avvisades av v0: "${nestedMsg}". Prova ett annat custom modelId eller byt tillbaka till mini/pro/max.`;
    }
    return nestedMsg || "Ogiltigt anrop (422). Kontrollera bilagor och meddelande.";
  }

  const directMessage =
    (typeof errorData?.error === "string" && errorData.error) ||
    (typeof errorData?.message === "string" && errorData.message) ||
    "";
  if (looksLikeUnsupportedModelError(directMessage)) {
    return `Model ID avvisades av v0: "${directMessage}". Prova ett annat custom modelId eller byt tillbaka till mini/pro/max.`;
  }

  let message =
    directMessage ||
    fallbackMessage;
  if (!message.includes("HTTP")) {
    message = `${message} (HTTP ${status})`;
  }
  return message;
}

function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (error instanceof Error) {
    return /network|fetch|connection|reset/i.test(error.message);
  }
  return false;
}

function buildStreamErrorMessage(errorData: Record<string, unknown> | null): string {
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
    return "Kvoten är slut för v0. Kontrollera plan/billing.";
  }
  if (code === "unauthorized") {
    return "V0_API_KEY saknas eller är ogiltig.";
  }
  if (code === "forbidden") {
    return "Åtkomst nekad av v0 (403). Kontrollera behörigheter.";
  }
  if (looksLikeUnsupportedModelError(rawMessage)) {
    return `Model ID avvisades av v0: "${rawMessage}". Prova ett annat custom modelId eller byt tillbaka till mini/pro/max.`;
  }
  return (
    rawMessage ||
    "Stream error"
  );
}

function looksLikeUnsupportedModelError(message: string | null | undefined): boolean {
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

function appendToolPartToMessage(
  setMessages: (next: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void,
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

async function fetchChatVersions(chatId: string, signal?: AbortSignal): Promise<VersionEntry[]> {
  const response = await fetch(`/api/v0/chats/${encodeURIComponent(chatId)}/versions`, { signal });
  const data = (await response.json().catch(() => null)) as { versions?: VersionEntry[] } | null;
  if (!response.ok) {
    throw new Error(
      (data as { error?: string } | null)?.error ||
        `Failed to fetch versions (HTTP ${response.status})`,
    );
  }
  return Array.isArray(data?.versions) ? data?.versions : [];
}

async function fetchChatFiles(
  chatId: string,
  versionId: string,
  signal?: AbortSignal,
  waitForReady = false,
): Promise<FileEntry[]> {
  const waitParam = waitForReady ? "&wait=1" : "";
  const response = await fetch(
    `/api/v0/chats/${encodeURIComponent(chatId)}/files?versionId=${encodeURIComponent(
      versionId,
    )}${waitParam}`,
    { signal },
  );
  const data = (await response.json().catch(() => null)) as {
    files?: FileEntry[];
    error?: string;
  } | null;
  if (!response.ok) {
    throw new Error(data?.error || `Failed to fetch files (HTTP ${response.status})`);
  }
  return Array.isArray(data?.files) ? data.files : [];
}

function resolvePreviousVersionId(
  currentVersionId: string,
  versions: VersionEntry[],
): string | null {
  const byDate = [...versions].sort((a, b) => {
    const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
    const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
    return bTime - aTime;
  });
  const index = byDate.findIndex(
    (entry) => entry.versionId === currentVersionId || entry.id === currentVersionId,
  );
  if (index === -1) {
    return byDate[0]?.versionId || byDate[0]?.id || null;
  }
  return byDate[index + 1]?.versionId || byDate[index + 1]?.id || null;
}

function buildFileHashMap(files: FileEntry[]): Map<string, string> {
  const map = new Map<string, string>();
  files.forEach((file) => {
    map.set(file.name, hashString(file.content ?? ""));
  });
  return map;
}

function diffFiles(previous: FileEntry[], current: FileEntry[]) {
  const prevMap = buildFileHashMap(previous);
  const nextMap = buildFileHashMap(current);
  const added: string[] = [];
  const removed: string[] = [];
  const modified: string[] = [];

  nextMap.forEach((hash, name) => {
    if (!prevMap.has(name)) {
      added.push(name);
      return;
    }
    if (prevMap.get(name) !== hash) {
      modified.push(name);
    }
  });

  prevMap.forEach((_hash, name) => {
    if (!nextMap.has(name)) removed.push(name);
  });

  return { added, removed, modified };
}

type DesignTokenSummary = {
  source: string;
  tokens: Array<{ name: string; value: string }>;
};

function extractDesignTokens(files: FileEntry[]): DesignTokenSummary | null {
  const candidate = files.find((file) =>
    DESIGN_TOKEN_FILES.some((path) => file.name.endsWith(path)),
  );
  if (!candidate?.content) return null;

  const tokens: Array<{ name: string; value: string }> = [];
  const regex = /--([a-zA-Z0-9-_]+)\s*:\s*([^;\n]+);/g;
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(candidate.content)) && tokens.length < 24) {
    tokens.push({ name: `--${match[1]}`, value: match[2].trim() });
  }
  if (tokens.length === 0) return null;

  return { source: candidate.name, tokens };
}

function findSuspiciousUseCalls(files: FileEntry[]) {
  const results: Array<{ file: string; line: number; snippet: string }> = [];
  const pattern = /\b(?:React\.)?use\s*\(/g;
  files.forEach((file) => {
    const lines = file.content.split(/\r?\n/);
    lines.forEach((line, index) => {
      let match: RegExpExecArray | null;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(line))) {
        const after = line.slice(match.index + match[0].length);
        const nextChar = after.trim()[0];
        if (nextChar && ("{[\"'`".includes(nextChar) || /[0-9]/.test(nextChar))) {
          results.push({ file: file.name, line: index + 1, snippet: line.trim() });
          break;
        }
      }
    });
  });
  return results;
}

function formatChangeSteps(label: string, items: string[], prefix: string, limit = 8) {
  if (items.length === 0) return [];
  const head = items.slice(0, limit).map((item) => `${prefix} ${item}`);
  const suffix = items.length > limit ? [`${label}: +${items.length - limit} till...`] : [];
  return [...head, ...suffix];
}

function isLikelyQuestionOrPrompt(content: string) {
  const lower = content.toLowerCase();
  if (content.includes("?")) return true;
  return [
    "vill du",
    "vill ni",
    "ska vi",
    "ska jag",
    "kan du",
    "kan ni",
    "kan jag",
    "behöver du",
    "behöver ni",
    "vill jag",
    "installera",
    "integrera",
    "supabase",
    "redis",
    "environment variable",
    "miljövariabel",
    "api-nyckel",
    "nyckel",
  ].some((token) => lower.includes(token));
}

function shouldAppendPostCheckSummary(content: string) {
  const trimmed = content.trim();
  if (!trimmed) return true;
  if (isLikelyQuestionOrPrompt(trimmed)) return false;
  if (trimmed.endsWith(":")) return true;
  const tail = trimmed.slice(-160).toLowerCase();
  if (
    ["summera", "sammanfatta", "ändring", "changes", "summary"].some((token) =>
      tail.includes(token),
    )
  ) {
    return true;
  }
  return trimmed.length >= 24;
}

function buildPostCheckSummary(params: {
  changes: { added: string[]; modified: string[]; removed: string[] } | null;
  warnings: string[];
  demoUrl: string | null;
}) {
  const { changes, warnings, demoUrl } = params;
  const lines: string[] = [];

  if (changes) {
    lines.push(
      `${POST_CHECK_MARKER} Ändringar: +${changes.added.length} ~${changes.modified.length} -${changes.removed.length}`,
    );
    lines.push(...formatChangeSteps("Tillagda", changes.added, "+", 4));
    lines.push(...formatChangeSteps("Ändrade", changes.modified, "~", 4));
    lines.push(...formatChangeSteps("Borttagna", changes.removed, "-", 4));
  } else {
    lines.push(`${POST_CHECK_MARKER} Ingen tidigare version att jämföra.`);
  }

  if (!demoUrl) {
    lines.push("Varning: Ingen preview-länk hittades för versionen.");
  }

  warnings.forEach((warning) => {
    lines.push(`Varning: ${warning}`);
  });

  return lines.length > 0 ? lines.join("\n") : "";
}

function normalizeInternalHref(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return null;
  if (trimmed.startsWith("//")) return null;
  if (trimmed.startsWith("/api")) return null;
  if (trimmed.startsWith("/_next")) return null;
  if (trimmed.startsWith("/favicon")) return null;
  if (trimmed.startsWith("/robots")) return null;
  if (trimmed.startsWith("/sitemap")) return null;
  if (trimmed.includes("${")) return null;
  const cleaned = trimmed.split("#")[0].split("?")[0];
  if (!cleaned) return null;
  return cleaned === "" ? "/" : cleaned;
}

function extractStaticInternalLinks(files: FileEntry[]): string[] {
  const results = new Set<string>();
  const hrefRegex = /href\s*=\s*(?:"([^"]+)"|'([^']+)'|\{\s*["']([^"']+)["']\s*\})/g;
  for (const file of files) {
    if (!file?.content) continue;
    const content = file.content;
    let match: RegExpExecArray | null = null;
    hrefRegex.lastIndex = 0;
    while ((match = hrefRegex.exec(content))) {
      const raw = match[1] || match[2] || match[3] || "";
      const normalized = normalizeInternalHref(raw);
      if (normalized) results.add(normalized);
    }
  }
  return Array.from(results);
}

function extractAppRoutePaths(files: FileEntry[]): string[] {
  const routes = new Set<string>();
  for (const file of files) {
    const rawName = file.name.replace(/^\/+/, "");
    if (/^page\.(t|j)sx?$/.test(rawName)) {
      routes.add("/");
      continue;
    }
    let rest: string | null = null;
    if (rawName.startsWith("src/app/")) rest = rawName.slice("src/app/".length);
    if (rawName.startsWith("app/")) rest = rawName.slice("app/".length);
    if (!rest) continue;
    if (!/page\.(t|j)sx?$/.test(rest)) continue;
    const parts = rest.split("/");
    parts.pop();
    const segments = parts
      .filter(Boolean)
      .filter((segment) => !(segment.startsWith("(") && segment.endsWith(")")))
      .filter((segment) => !segment.startsWith("@"));
    const route = `/${segments.join("/")}`;
    routes.add(route === "/" ? "/" : route.replace(/\/+$/, ""));
  }
  return Array.from(routes);
}

function routePatternToRegex(route: string): RegExp {
  const cleaned = route.replace(/\/+$/, "") || "/";
  if (cleaned === "/") return /^\/$/;
  const segments = cleaned.split("/").filter(Boolean);
  let pattern = "^";
  for (const segment of segments) {
    if (segment.startsWith("[[...") && segment.endsWith("]]")) {
      pattern += "(?:/.*)?";
      break;
    }
    if (segment.startsWith("[...") && segment.endsWith("]")) {
      pattern += "/.+";
      continue;
    }
    if (segment.startsWith("[") && segment.endsWith("]")) {
      pattern += "/[^/]+";
      continue;
    }
    const escaped = segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    pattern += `/${escaped}`;
  }
  pattern += "$";
  return new RegExp(pattern);
}

function findMissingRoutes(links: string[], routes: string[]): string[] {
  if (routes.length === 0) return links;
  const matchers = routes.map(routePatternToRegex);
  return links.filter((link) => !matchers.some((matcher) => matcher.test(link)));
}

function appendPostCheckSummaryToMessage(
  setMessages: (next: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void,
  messageId: string,
  summary: string,
) {
  if (!summary) return;
  setMessages((prev) =>
    prev.map((message) => {
      if (message.id !== messageId) return message;
      const content = message.content || "";
      if (content.includes(POST_CHECK_MARKER)) return message;
      if (!shouldAppendPostCheckSummary(content)) return message;
      const separator = content.trim() ? "\n" : "";
      return { ...message, content: `${content}${separator}${summary}`.trimEnd() };
    }),
  );
}

type VersionErrorLogPayload = {
  level: "info" | "warning" | "error";
  category?: string | null;
  message: string;
  meta?: Record<string, unknown> | null;
};

async function persistVersionErrorLogs(params: {
  chatId: string;
  versionId: string;
  logs: VersionErrorLogPayload[];
}) {
  const { chatId, versionId, logs } = params;
  if (!logs.length) return;
  try {
    await fetch(
      `/api/v0/chats/${encodeURIComponent(chatId)}/versions/${encodeURIComponent(versionId)}/error-log`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logs }),
      },
    );
  } catch {
    // Best-effort only
  }
}

async function runPostGenerationChecks(params: {
  chatId: string;
  versionId: string;
  demoUrl?: string | null;
  assistantMessageId: string;
  setMessages: (next: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  onAutoFix?: (payload: {
    chatId: string;
    versionId: string;
    reasons: string[];
    meta?: Record<string, unknown>;
  }) => void;
}) {
  const { chatId, versionId, demoUrl, assistantMessageId, setMessages, onAutoFix } = params;
  const toolCallId = `post-check:${versionId}`;
  const controller = new AbortController();

  try {
    const [currentFiles, versions] = await Promise.all([
      fetchChatFiles(chatId, versionId, controller.signal, true),
      fetchChatVersions(chatId, controller.signal),
    ]);
    const previousVersionId = resolvePreviousVersionId(versionId, versions);
    const previousFiles = previousVersionId
      ? await fetchChatFiles(chatId, previousVersionId, controller.signal, true)
      : [];
    const changes = previousVersionId ? diffFiles(previousFiles, currentFiles) : null;
    const suspiciousUseCalls = findSuspiciousUseCalls(currentFiles);
    const warnings: string[] = [];
    if (suspiciousUseCalls.length > 0) {
      warnings.push(
        `Möjlig React use()-missbruk i ${
          new Set(suspiciousUseCalls.map((entry) => entry.file)).size
        } fil(er).`,
      );
    }
    const routePaths = extractAppRoutePaths(currentFiles);
    const internalLinks = extractStaticInternalLinks(currentFiles);
    const missingRoutes = findMissingRoutes(internalLinks, routePaths);
    if (missingRoutes.length > 0) {
      const preview = missingRoutes.slice(0, 6).join(", ");
      const suffix = missingRoutes.length > 6 ? " …" : "";
      warnings.push(`Saknar route för ${preview}${suffix}.`);
    }
    const versionEntry = versions.find(
      (entry) => entry.versionId === versionId || entry.id === versionId,
    );
    const resolvedDemoUrl = demoUrl ?? versionEntry?.demoUrl ?? null;
    const designTokens = extractDesignTokens(currentFiles);

    const steps: string[] = [];
    if (changes) {
      steps.push(
        `Ändringar: +${changes.added.length} ~${changes.modified.length} -${changes.removed.length}`,
      );
      steps.push(...formatChangeSteps("Tillagda", changes.added, "+"));
      steps.push(...formatChangeSteps("Ändrade", changes.modified, "~"));
      steps.push(...formatChangeSteps("Borttagna", changes.removed, "-"));
    } else {
      steps.push("Ingen tidigare version att jämföra.");
    }
    if (warnings.length > 0) {
      steps.push(...warnings);
    }
    if (designTokens) {
      const names = designTokens.tokens.map((token) => token.name);
      const preview = names.slice(0, 8).join(", ");
      const suffix = names.length > 8 ? " …" : "";
      steps.push(`Design tokens (${designTokens.source}): ${preview}${suffix}`);
    }
    // Image URL validation — runs in background, auto-fixes broken Unsplash URLs
    let imageValidation: {
      valid?: boolean;
      total?: number;
      broken?: { url: string; alt: string; file: string; status: number | string; replacementUrl: string | null }[];
      replacedCount?: number;
      warnings?: string[];
      fixed?: boolean;
      demoUrl?: string;
    } | null = null;
    try {
      const imgRes = await fetch(
        `/api/v0/chats/${encodeURIComponent(chatId)}/validate-images`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ versionId, autoFix: true }),
          signal: controller.signal,
        },
      );
      if (imgRes.ok) {
        imageValidation = await imgRes.json();
        if (imageValidation?.warnings?.length) {
          warnings.push(...imageValidation.warnings);
        }
        if (imageValidation?.broken?.length) {
          const brokenCount = imageValidation.broken.length;
          const fixedCount = imageValidation.replacedCount ?? 0;
          steps.push(
            `Bilder: ${brokenCount} trasig(a) URL:er hittade${fixedCount > 0 ? `, ${fixedCount} ersatt(a) med Unsplash-alternativ` : ""}`,
          );
        } else if (imageValidation?.total && imageValidation.total > 0) {
          steps.push(`Bilder: alla ${imageValidation.total} URL:er giltiga ✓`);
        }
      }
    } catch {
      // Image validation is best-effort; don't block post-check
    }

    // Check demo URL after image validation (which may produce a new demoUrl)
    const finalDemoUrl = imageValidation?.demoUrl || resolvedDemoUrl;
    if (!finalDemoUrl) {
      steps.push("Preview-länk saknas för versionen.");
    }

    const output = {
      steps,
      summary: {
        files: currentFiles.length,
        added: changes?.added.length ?? 0,
        modified: changes?.modified.length ?? 0,
        removed: changes?.removed.length ?? 0,
        warnings: warnings.length,
      },
      warnings,
      missingRoutes,
      suspiciousUseCalls,
      designTokens,
      imageValidation,
      previousVersionId,
      demoUrl: finalDemoUrl,
    };

    const logItems: VersionErrorLogPayload[] = [];
    if (!finalDemoUrl) {
      logItems.push({
        level: "error",
        category: "preview",
        message: "Preview-lank saknas for versionen.",
        meta: { versionId },
      });
    }
    if (missingRoutes.length > 0) {
      logItems.push({
        level: "warning",
        category: "routes",
        message: "Saknade interna routes.",
        meta: { missingRoutes },
      });
    }
    if (suspiciousUseCalls.length > 0) {
      logItems.push({
        level: "warning",
        category: "react",
        message: "Misstankt React use()-anvandning.",
        meta: { suspiciousUseCalls },
      });
    }
    if (imageValidation?.broken?.length) {
      logItems.push({
        level: "warning",
        category: "images",
        message: "Trasiga bild-URL:er hittade.",
        meta: {
          broken: imageValidation.broken,
          replacedCount: imageValidation.replacedCount ?? 0,
        },
      });
    }
    if (imageValidation?.warnings?.length) {
      logItems.push({
        level: "warning",
        category: "images",
        message: "Bildvalidering rapporterade varningar.",
        meta: { warnings: imageValidation.warnings },
      });
    }

    void persistVersionErrorLogs({ chatId, versionId, logs: logItems });

    const autoFixReasons: string[] = [];
    if (!finalDemoUrl) autoFixReasons.push("preview saknas");
    if (missingRoutes.length > 0) autoFixReasons.push("saknade routes");
    if (suspiciousUseCalls.length > 0) autoFixReasons.push("misstankt use()");
    if (imageValidation?.broken?.length) autoFixReasons.push("trasiga bilder");
    if (autoFixReasons.length > 0) {
      onAutoFix?.({
        chatId,
        versionId,
        reasons: autoFixReasons,
        meta: {
          missingRoutes,
          suspiciousUseCalls,
          imageValidation,
          demoUrl: finalDemoUrl,
        },
      });
    }

    appendToolPartToMessage(setMessages, assistantMessageId, {
      type: "tool:post-check",
      toolName: "Post-check",
      toolCallId,
      state: "output-available",
      input: { chatId, versionId, previousVersionId },
      output,
    });

    appendPostCheckSummaryToMessage(
      setMessages,
      assistantMessageId,
      buildPostCheckSummary({ changes, warnings, demoUrl: finalDemoUrl }),
    );
  } catch (error) {
    void persistVersionErrorLogs({
      chatId,
      versionId,
      logs: [
        {
          level: "error",
          category: "post-check",
          message: error instanceof Error ? error.message : "Post-check failed",
        },
      ],
    });
    appendToolPartToMessage(setMessages, assistantMessageId, {
      type: "tool:post-check",
      toolName: "Post-check",
      toolCallId,
      state: "output-error",
      input: { chatId, versionId },
      errorText: error instanceof Error ? error.message : "Post-check failed",
    });
  } finally {
    controller.abort();
  }
}

async function triggerImageMaterialization(params: {
  chatId: string;
  versionId: string;
  enabled: boolean;
}): Promise<void> {
  if (!params.enabled) return;
  const { chatId, versionId } = params;
  try {
    const url = `/api/v0/chats/${encodeURIComponent(chatId)}/files?versionId=${encodeURIComponent(
      versionId,
    )}&materialize=1`;
    await fetch(url, { method: "GET" });
  } catch {
    // best-effort only
  }
}

export function useV0ChatMessaging(params: {
  chatId: string | null;
  setChatId: (id: string | null) => void;
  chatIdParam: string | null;
  router: RouterLike;
  appProjectId?: string | null;
  v0ProjectId?: string | null;
  selectedModelTier: ModelTier;
  selectedModelId: string;
  enableImageGenerations: boolean;
  enableImageMaterialization?: boolean;
  enableThinking: boolean;
  planModeFirstPromptEnabled?: boolean;
  systemPrompt?: string;
  promptAssistModel?: string | null;
  promptAssistDeep?: boolean;
  promptAssistMode?: "polish" | "rewrite" | null;
  buildIntent?: BuildIntent;
  buildMethod?: BuildMethod | null;
  mutateVersions: () => void;
  setCurrentDemoUrl: (url: string | null) => void;
  onPreviewRefresh?: () => void;
  onGenerationComplete?: (data: { chatId: string; versionId?: string; demoUrl?: string }) => void;
  onV0ProjectId?: (projectId: string) => void;
  setMessages: (next: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  resetBeforeCreateChat: () => void;
}) {
  const {
    chatId,
    setChatId,
    chatIdParam,
    router,
    appProjectId,
    v0ProjectId,
    selectedModelTier,
    selectedModelId,
    enableImageGenerations,
    enableImageMaterialization = false,
    enableThinking,
    planModeFirstPromptEnabled = false,
    systemPrompt,
    promptAssistModel,
    promptAssistDeep,
    promptAssistMode,
    buildIntent,
    buildMethod,
    mutateVersions,
    setCurrentDemoUrl,
    onPreviewRefresh,
    onGenerationComplete,
    onV0ProjectId,
    setMessages,
    resetBeforeCreateChat,
  } = params;

  const buildBuilderParams = useCallback(
    (entries: Record<string, string | null | undefined>) => {
      const params = new URLSearchParams();
      Object.entries(entries).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });
      if (buildIntent) params.set("buildIntent", buildIntent);
      if (buildMethod) params.set("buildMethod", buildMethod);
      return params;
    },
    [buildIntent, buildMethod],
  );

  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const createChatInFlightRef = useRef(false);
  const pendingCreateKeyRef = useRef<string | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const autoFixAttemptsRef = useRef<Record<string, number>>({});
  const autoFixHandlerRef = useRef<(payload: AutoFixPayload) => void>(() => {});
  const lastSentSystemPromptRef = useRef<string | null>(null);

  const streamingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startStreamSafetyTimer = useCallback(() => {
    if (streamingTimerRef.current) clearTimeout(streamingTimerRef.current);
    streamingTimerRef.current = setTimeout(() => {
      streamingTimerRef.current = null;
      warnLog("v0", "Stream safety timeout reached — force-clearing isStreaming");
      streamAbortRef.current?.abort();
      setMessages((prev: ChatMessage[]) =>
        prev.map((m: ChatMessage) => (m.isStreaming ? { ...m, isStreaming: false } : m)),
      );
    }, STREAM_SAFETY_TIMEOUT_MS);
  }, [setMessages]);
  const clearStreamSafetyTimer = useCallback(() => {
    if (streamingTimerRef.current) {
      clearTimeout(streamingTimerRef.current);
      streamingTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!chatId) {
      lastSentSystemPromptRef.current = null;
    }
  }, [chatId]);

  const createNewChat = useCallback(
    async (initialMessage: string, options: MessageOptions = {}, systemPromptOverride?: string) => {
      if (isCreatingChat || createChatInFlightRef.current) return;
      if (!initialMessage?.trim()) {
        toast.error("Please enter a message to start a new chat");
        return;
      }

      // Use override if provided (for dynamic instructions), otherwise fall back to hook param
      const effectiveSystemPrompt = systemPromptOverride ?? systemPrompt;

      const createKey = buildCreateChatKey(
        initialMessage,
        options,
        selectedModelId,
        enableImageGenerations,
        effectiveSystemPrompt,
      );
      const existingLock = getActiveCreateChatLock(createKey);
      if (existingLock) {
        if (existingLock.chatId) {
          setChatId(existingLock.chatId);
          if (chatIdParam !== existingLock.chatId) {
            const params = buildBuilderParams({
              chatId: existingLock.chatId,
              project: appProjectId ?? undefined,
            });
            router.replace(`/builder?${params.toString()}`);
          }
          toast.success("Återansluter till pågående skapning");
        } else {
          toast("En skapning med samma prompt pågår redan. Vänta en stund och försök igen.");
        }
        return;
      }

      pendingCreateKeyRef.current = createKey;
      writeCreateChatLock({ key: createKey, createdAt: Date.now() });
      createChatInFlightRef.current = true;
      resetBeforeCreateChat();

      const now = Date.now();
      const userMessageId = `user-${now}`;
      const assistantMessageId = `assistant-${now}`;

      debugLog("AI", "Create chat requested", {
        messageLength: initialMessage.length,
        attachments: options.attachments?.length ?? 0,
        imageGenerations: enableImageGenerations,
        modelTier: selectedModelTier,
        modelId: selectedModelId,
        systemPromptProvided: Boolean(effectiveSystemPrompt?.trim()),
      });

      setMessages([
        { id: userMessageId, role: "user", content: initialMessage },
        {
          id: assistantMessageId,
          role: "assistant",
          content: "",
          thinking: "",
          isStreaming: true,
          uiParts: [],
        },
      ]);
      setIsCreatingChat(true);
      const handleNonStreamingCreate = async (data: any) => {
        const meta =
          data &&
          typeof data === "object" &&
          (data as any).meta &&
          typeof (data as any).meta === "object"
            ? ((data as any).meta as Record<string, unknown>)
            : null;
        appendModelInfoPart(setMessages, assistantMessageId, {
          modelId: (typeof meta?.modelId === "string" && meta?.modelId) || selectedModelId || null,
          thinking: typeof meta?.thinking === "boolean" ? (meta?.thinking as boolean) : null,
          imageGenerations:
            typeof meta?.imageGenerations === "boolean"
              ? (meta?.imageGenerations as boolean)
              : null,
          chatPrivacy: typeof meta?.chatPrivacy === "string" ? (meta?.chatPrivacy as string) : null,
        });
        const newChatId = data.id || data.chatId || data.v0ChatId || data.chat?.id;
        const newV0ProjectId = data.v0ProjectId || data.v0_project_id || null;
        const resolvedVersionId =
          data.versionId || data.latestVersion?.id || data.latestVersion?.versionId || null;

        if (!newChatId) {
          throw new Error("No chat ID returned from API");
        }

        setChatId(newChatId);
        if (newV0ProjectId) {
          onV0ProjectId?.(String(newV0ProjectId));
        }
        {
          const params = buildBuilderParams({
            chatId: newChatId,
            project: appProjectId ?? undefined,
          });
          router.replace(`/builder?${params.toString()}`);
        }
        if (pendingCreateKeyRef.current) {
          updateCreateChatLockChatId(pendingCreateKeyRef.current, newChatId);
        }
        toast.success("Chat created!");

        if (data.latestVersion?.demoUrl) {
          setCurrentDemoUrl(data.latestVersion.demoUrl);
          onPreviewRefresh?.();
        }
        onGenerationComplete?.({
          chatId: newChatId,
          versionId: resolvedVersionId ?? undefined,
          demoUrl: data.latestVersion?.demoUrl,
        });
        if (resolvedVersionId) {
          void triggerImageMaterialization({
            chatId: String(newChatId),
            versionId: String(resolvedVersionId),
            enabled: enableImageMaterialization,
          });
        }
        if (resolvedVersionId) {
          void runPostGenerationChecks({
            chatId: String(newChatId),
            versionId: String(resolvedVersionId),
            demoUrl: data.latestVersion?.demoUrl ?? null,
            assistantMessageId,
            setMessages,
            onAutoFix: (payload) => autoFixHandlerRef.current(payload),
          });
        }

        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMessageId ? { ...m, isStreaming: false } : m)),
        );
      };
      let requestBody: Record<string, unknown> | null = null;

      try {
        const orchestration = orchestratePromptMessage({
          message: initialMessage,
          buildMethod,
          buildIntent,
          isFirstPrompt: true,
          planModeFirstPromptEnabled,
          attachmentsCount: options.attachments?.length ?? 0,
        });
        if (orchestration.strategyMeta.strategy !== "direct") {
          appendPromptStrategyPart(setMessages, assistantMessageId, orchestration.strategyMeta);
          toast.success(
            orchestration.strategyMeta.strategy === "phase_plan_build_polish"
              ? "Prompt optimerad: fasad"
              : "Prompt optimerad: sammanfattad",
          );
        }

        const formattedMessage = formatPromptForV0(orchestration.finalMessage);
        debugLog("AI", "Prompt formatting result", {
          originalLength: initialMessage.length,
          optimizedLength: orchestration.strategyMeta.optimizedLength,
          finalLength: formattedMessage.length,
          strategy: orchestration.strategyMeta.strategy,
          changed: formattedMessage.trim() !== initialMessage.trim(),
        });
        const finalMessage = appendAttachmentPrompt(
          formattedMessage,
          options.attachmentPrompt,
          options.attachments,
        );
        const thinkingForTier = enableThinking && selectedModelTier !== "v0-mini";
        // Only trim whitespace; no model is involved here.
        const trimmedSystemPrompt = effectiveSystemPrompt?.trim();
        const promptMeta: Record<string, unknown> = {
          promptOriginal: initialMessage,
          promptFormatted: formattedMessage,
          formattedChanged: formattedMessage.trim() !== initialMessage.trim(),
          promptLength: initialMessage.length,
          promptOptimizedLength: orchestration.strategyMeta.optimizedLength,
          formattedLength: formattedMessage.length,
          attachmentsCount: options.attachments?.length ?? 0,
          promptStrategy: orchestration.strategyMeta.strategy,
          promptType: orchestration.strategyMeta.promptType,
          promptBudgetTarget: orchestration.strategyMeta.budgetTarget,
          promptReductionRatio: orchestration.strategyMeta.reductionRatio,
          promptStrategyReason: orchestration.strategyMeta.reason,
          promptComplexityScore: orchestration.strategyMeta.complexityScore,
        };
        if (promptAssistModel) {
          promptMeta.promptAssistModel = promptAssistModel;
        }
        if (typeof promptAssistDeep === "boolean") {
          promptMeta.promptAssistDeep = promptAssistDeep;
        }
        if (promptAssistMode) {
          promptMeta.promptAssistMode = promptAssistMode;
        }
        if (buildIntent) {
          promptMeta.buildIntent = buildIntent;
        }
        if (buildMethod) {
          promptMeta.buildMethod = buildMethod;
        }
        promptMeta.modelId = selectedModelId;
        promptMeta.modelTier = selectedModelTier;
        promptMeta.planModeFirstPrompt = Boolean(planModeFirstPromptEnabled);
        requestBody = {
          message: finalMessage,
          modelId: selectedModelId,
          thinking: thinkingForTier,
          imageGenerations: enableImageGenerations,
          meta: promptMeta,
        };
        if (v0ProjectId) requestBody.projectId = v0ProjectId;
        if (trimmedSystemPrompt) {
          requestBody.system = trimmedSystemPrompt;
          lastSentSystemPromptRef.current = trimmedSystemPrompt;
        } else {
          lastSentSystemPromptRef.current = null;
        }
        if (options.attachments && options.attachments.length > 0) {
          requestBody.attachments = options.attachments;
        }

        // Abort any previous stream before starting a new one
        streamAbortRef.current?.abort();
        const streamController = new AbortController();
        streamAbortRef.current = streamController;
        startStreamSafetyTimer();

        const response = await fetch("/api/v0/chats/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
          signal: streamController.signal,
        });

        if (!response.ok) {
          let errorData: Record<string, unknown> | null = null;
          try {
            errorData = (await response.json()) as Record<string, unknown>;
          } catch {
            // ignore
          }
          const errorMessage = buildApiErrorMessage({
            response,
            errorData,
            fallbackMessage: "Failed to create chat",
          });
          throw new Error(errorMessage);
        }

        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("text/event-stream")) {
          let chatIdFromStream: string | null = null;
          let v0ProjectIdFromStream: string | null = null;
          let accumulatedThinking = "";
          let accumulatedContent = "";
          let didReceiveDone = false;
          const streamStats = initStreamStats("create", assistantMessageId);

          try {
            await consumeSseResponse(response, (event, data) => {
              switch (event) {
                case "meta": {
                  const meta = typeof data === "object" && data ? (data as any) : {};
                  appendModelInfoPart(setMessages, assistantMessageId, {
                    modelId: meta.modelId ?? selectedModelId,
                    thinking: typeof meta.thinking === "boolean" ? meta.thinking : null,
                    imageGenerations:
                      typeof meta.imageGenerations === "boolean" ? meta.imageGenerations : null,
                    chatPrivacy: typeof meta.chatPrivacy === "string" ? meta.chatPrivacy : null,
                  });
                  break;
                }
                case "thinking": {
                  const thinkingText =
                    typeof data === "string"
                      ? data
                      : (data as any)?.thinking || (data as any)?.reasoning || null;
                  if (thinkingText) {
                    const incoming = String(thinkingText);
                    const previous = accumulatedThinking;
                    // V0 can send full text or deltas; merge to avoid dropping fragments.
                    const mergedThought = mergeStreamingText(previous, incoming);
                    recordStreamText(streamStats, "thinking", previous, mergedThought, incoming.length);
                    if (mergedThought !== accumulatedThinking) {
                      accumulatedThinking = mergedThought;
                      setMessages((prev) =>
                        prev.map((m) =>
                          m.id === assistantMessageId
                            ? { ...m, thinking: accumulatedThinking, isStreaming: true }
                            : m,
                        ),
                      );
                    }
                  }
                  break;
                }
                case "content": {
                  const contentText =
                    typeof data === "string"
                      ? data
                      : (data as any)?.content || (data as any)?.text || (data as any)?.delta || null;
                  if (contentText) {
                    const incoming = String(contentText);
                    const previous = accumulatedContent;
                    const merged = mergeStreamingText(previous, incoming);
                    recordStreamText(streamStats, "content", previous, merged, incoming.length);
                    accumulatedContent = merged;
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === assistantMessageId
                          ? { ...m, content: accumulatedContent, isStreaming: true }
                          : m,
                      ),
                    );
                  }
                  break;
                }
                case "parts": {
                  const nextParts = coerceUiParts(data);
                  if (nextParts.length > 0) {
                    recordStreamParts(streamStats, nextParts.length);
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === assistantMessageId
                          ? {
                              ...m,
                              uiParts: mergeUiParts(m.uiParts, nextParts),
                              isStreaming: true,
                            }
                          : m,
                      ),
                    );
                  }
                  break;
                }
                case "chatId": {
                  const nextChatId =
                    typeof data === "string"
                      ? data
                      : (data as any)?.id || (data as any)?.chatId || null;
                  if (nextChatId && !chatIdFromStream) {
                    const id = String(nextChatId);
                    chatIdFromStream = id;
                    streamStats.chatId = id;
                    setChatId(id);
                    if (chatIdParam !== id) {
                      const params = buildBuilderParams({
                        chatId: id,
                        project: appProjectId ?? undefined,
                      });
                      router.replace(`/builder?${params.toString()}`);
                    }
                    if (pendingCreateKeyRef.current) {
                      updateCreateChatLockChatId(pendingCreateKeyRef.current, id);
                    }
                  }
                  break;
                }
                case "projectId": {
                  const nextV0ProjectId =
                    typeof data === "string"
                      ? data
                      : (data as any)?.v0ProjectId || (data as any)?.v0_project_id || null;
                  if (nextV0ProjectId && !v0ProjectIdFromStream) {
                    const id = String(nextV0ProjectId);
                    v0ProjectIdFromStream = id;
                    onV0ProjectId?.(id);
                  }
                  break;
                }
                case "done": {
                  didReceiveDone = true;
                  streamStats.didReceiveDone = true;
                  const doneData = typeof data === "object" && data ? (data as any) : {};
                  const doneV0ProjectId = doneData.v0ProjectId || doneData.v0_project_id || null;
                  if (doneV0ProjectId && !v0ProjectIdFromStream) {
                    v0ProjectIdFromStream = String(doneV0ProjectId);
                    onV0ProjectId?.(v0ProjectIdFromStream);
                  }
                  if (doneData.demoUrl) {
                    setCurrentDemoUrl(doneData.demoUrl);
                  }
                  onPreviewRefresh?.();
                  const resolvedChatId = doneData.chatId || doneData.id || chatIdFromStream || null;
                  const resolvedVersionId =
                    doneData.versionId ||
                    doneData.version_id ||
                    doneData.latestVersion?.id ||
                    doneData.latestVersion?.versionId ||
                    null;
                  if (!resolvedChatId) {
                    throw new Error("No chat ID returned from stream");
                  }
                  const nextId = String(resolvedChatId);
                  streamStats.chatId = nextId;
                  streamStats.versionId = resolvedVersionId ? String(resolvedVersionId) : null;
                  if (!chatIdFromStream) {
                    chatIdFromStream = nextId;
                    setChatId(nextId);
                    if (chatIdParam !== nextId) {
                      const params = buildBuilderParams({
                        chatId: nextId,
                        project: appProjectId ?? undefined,
                      });
                      router.replace(`/builder?${params.toString()}`);
                    }
                  }
                  if (pendingCreateKeyRef.current) {
                    updateCreateChatLockChatId(pendingCreateKeyRef.current, nextId);
                  }
                  setMessages((prev) =>
                    prev.map((m) => (m.id === assistantMessageId ? { ...m, isStreaming: false } : m)),
                  );
                  toast.success("Chat created!");
                  mutateVersions();
                  // Call generation complete callback with resolved data
                  onGenerationComplete?.({
                    chatId: nextId,
                    versionId: resolvedVersionId ? String(resolvedVersionId) : undefined,
                    demoUrl: doneData.demoUrl,
                  });
                  if (resolvedChatId && resolvedVersionId) {
                    void triggerImageMaterialization({
                      chatId: String(resolvedChatId),
                      versionId: String(resolvedVersionId),
                      enabled: enableImageMaterialization,
                    });
                  }
                  if (resolvedChatId && resolvedVersionId) {
                    void runPostGenerationChecks({
                      chatId: String(resolvedChatId),
                      versionId: String(resolvedVersionId),
                      demoUrl: doneData.demoUrl ?? null,
                      assistantMessageId,
                      setMessages,
                      onAutoFix: (payload) => autoFixHandlerRef.current(payload),
                    });
                  }
                  break;
                }
                case "error": {
                  const errorData =
                    typeof data === "object" && data ? (data as any) : { message: data };
                  throw new Error(buildStreamErrorMessage(errorData as Record<string, unknown>));
                }
              }
            }, { signal: streamController.signal });
          } finally {
            streamAbortRef.current = null;
            streamStats.chatId = streamStats.chatId ?? chatIdFromStream ?? null;
            streamStats.didReceiveDone = streamStats.didReceiveDone || didReceiveDone;
            finalizeStreamStats(streamStats);
          }

          if (!chatIdFromStream && !didReceiveDone) {
            throw new Error("No chat ID returned from stream");
          }

          // Ensure isStreaming is false even if stream ends without "done" event (fail-safe)
          setMessages((prev) => {
            const msg = prev.find((m) => m.id === assistantMessageId);
            // Skip update if already not streaming (avoid duplicate render)
            if (!msg?.isStreaming) return prev;
            return prev.map((m) =>
              m.id === assistantMessageId ? { ...m, isStreaming: false } : m,
            );
          });
        } else {
          const data = await response.json();
          await handleNonStreamingCreate(data);
        }
      } catch (error) {
        let finalError = error;
        if (isNetworkError(error) && requestBody) {
          try {
            const fallbackRes = await fetch("/api/v0/chats", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(requestBody),
            });
            if (!fallbackRes.ok) {
              let errorData: Record<string, unknown> | null = null;
              try {
                errorData = (await fallbackRes.json()) as Record<string, unknown>;
              } catch {
                // ignore
              }
              const errorMessage = buildApiErrorMessage({
                response: fallbackRes,
                errorData,
                fallbackMessage: "Failed to create chat",
              });
              throw new Error(errorMessage);
            }
            const data = await fallbackRes.json();
            await handleNonStreamingCreate(data);
            return;
          } catch (fallbackErr) {
            finalError = fallbackErr;
          }
        }
        console.error("Error creating chat:", finalError);
        const message = finalError instanceof Error ? finalError.message : "Failed to create chat";
        toast.error(message);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId && !m.content
              ? { ...m, content: `Varning: ${message}`, isStreaming: false }
              : m,
          ),
        );
      } finally {
        clearStreamSafetyTimer();
        pendingCreateKeyRef.current = null;
        clearCreateChatLock();
        createChatInFlightRef.current = false;
        setIsCreatingChat(false);
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMessageId ? { ...m, isStreaming: false } : m)),
        );
      }
    },
    [
      isCreatingChat,
      resetBeforeCreateChat,
      selectedModelTier,
      selectedModelId,
      enableImageGenerations,
      enableImageMaterialization,
      enableThinking,
      planModeFirstPromptEnabled,
      systemPrompt,
      setMessages,
      setChatId,
      chatIdParam,
      router,
      appProjectId,
      v0ProjectId,
      setCurrentDemoUrl,
      onPreviewRefresh,
      onGenerationComplete,
      onV0ProjectId,
      mutateVersions,
      buildBuilderParams,
      buildIntent,
      buildMethod,
      promptAssistModel,
      promptAssistDeep,
      promptAssistMode,
      startStreamSafetyTimer,
      clearStreamSafetyTimer,
    ],
  );

  const sendMessage = useCallback(
    async (messageText: string, options: MessageOptions = {}) => {
      if (!messageText?.trim()) return;

      if (!chatId) {
        await createNewChat(messageText, options);
        return;
      }

      const now = Date.now();
      const userMessageId = `user-${now}`;
      const assistantMessageId = `assistant-${now}`;

      debugLog("AI", "Send message requested", {
        messageLength: messageText.length,
        attachments: options.attachments?.length ?? 0,
        modelTier: selectedModelTier,
        modelId: selectedModelId,
      });

      setMessages((prev) => [
        ...prev,
        { id: userMessageId, role: "user", content: messageText },
        {
          id: assistantMessageId,
          role: "assistant",
          content: "",
          thinking: "",
          isStreaming: true,
          uiParts: [],
        },
      ]);
      const handleNonStreamingSend = async (data: any) => {
        const demoUrl = data?.demoUrl || data?.latestVersion?.demoUrl || null;
        if (demoUrl) setCurrentDemoUrl(demoUrl);
        onPreviewRefresh?.();
        const resolvedVersionId =
          data?.versionId || data?.latestVersion?.id || data?.latestVersion?.versionId || null;
        const responseText =
          (typeof data?.text === "string" && data.text) ||
          (typeof data?.message === "string" && data.message) ||
          null;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? { ...m, content: responseText ?? m.content, isStreaming: false }
              : m,
          ),
        );
        mutateVersions();
        onGenerationComplete?.({
          chatId: chatId || "",
          versionId: resolvedVersionId ?? undefined,
          demoUrl: demoUrl ?? undefined,
        });
        if (chatId && resolvedVersionId) {
          void triggerImageMaterialization({
            chatId: String(chatId),
            versionId: String(resolvedVersionId),
            enabled: enableImageMaterialization,
          });
        }
        if (chatId && resolvedVersionId) {
          void runPostGenerationChecks({
            chatId: String(chatId),
            versionId: String(resolvedVersionId),
            demoUrl: demoUrl ?? null,
            assistantMessageId,
            setMessages,
            onAutoFix: (payload) => autoFixHandlerRef.current(payload),
          });
        }
      };
      let requestBody: Record<string, unknown> | null = null;

      try {
        const orchestration = orchestratePromptMessage({
          message: messageText,
          buildMethod,
          buildIntent,
          isFirstPrompt: false,
          planModeFirstPromptEnabled,
          attachmentsCount: options.attachments?.length ?? 0,
        });
        if (orchestration.strategyMeta.strategy !== "direct") {
          appendPromptStrategyPart(setMessages, assistantMessageId, orchestration.strategyMeta);
          toast.success(
            orchestration.strategyMeta.strategy === "phase_plan_build_polish"
              ? "Prompt optimerad: fasad"
              : "Prompt optimerad: sammanfattad",
          );
        }

        const formattedMessage = formatPromptForV0(orchestration.finalMessage);
        const finalMessage = appendAttachmentPrompt(
          formattedMessage,
          options.attachmentPrompt,
          options.attachments,
        );
        const thinkingForTier = enableThinking && selectedModelTier !== "v0-mini";
        const promptMeta: Record<string, unknown> = {
          promptOriginal: messageText,
          promptFormatted: formattedMessage,
          promptLength: messageText.length,
          promptOptimizedLength: orchestration.strategyMeta.optimizedLength,
          formattedLength: formattedMessage.length,
          attachmentsCount: options.attachments?.length ?? 0,
          promptStrategy: orchestration.strategyMeta.strategy,
          promptType: orchestration.strategyMeta.promptType,
          promptBudgetTarget: orchestration.strategyMeta.budgetTarget,
          promptReductionRatio: orchestration.strategyMeta.reductionRatio,
          promptStrategyReason: orchestration.strategyMeta.reason,
          promptComplexityScore: orchestration.strategyMeta.complexityScore,
        };
        if (buildIntent) {
          promptMeta.buildIntent = buildIntent;
        }
        if (buildMethod) {
          promptMeta.buildMethod = buildMethod;
        }
        requestBody = {
          message: finalMessage,
          modelId: selectedModelId,
          thinking: thinkingForTier,
          imageGenerations: enableImageGenerations,
          meta: promptMeta,
        };
        // Avoid redundant large system payloads on every follow-up.
        // Send only when changed since last create/send call.
        const trimmedSystem = systemPrompt?.trim();
        const shouldSendSystem =
          Boolean(trimmedSystem) && trimmedSystem !== lastSentSystemPromptRef.current;
        if (trimmedSystem && shouldSendSystem) {
          requestBody.system = trimmedSystem;
          lastSentSystemPromptRef.current = trimmedSystem;
        }
        if (options.attachments && options.attachments.length > 0) {
          requestBody.attachments = options.attachments;
        }

        // Abort any previous stream before starting a new one
        streamAbortRef.current?.abort();
        const streamController = new AbortController();
        streamAbortRef.current = streamController;
        startStreamSafetyTimer();

        const response = await fetch(`/api/v0/chats/${chatId}/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
          signal: streamController.signal,
        });

        if (!response.ok) {
          let errorData: Record<string, unknown> | null = null;
          try {
            errorData = (await response.json()) as Record<string, unknown>;
          } catch {
            // ignore
          }
          const errorMessage = buildApiErrorMessage({
            response,
            errorData,
            fallbackMessage: "Failed to send message",
          });
          throw new Error(errorMessage);
        }

        let accumulatedThinking = "";
        let accumulatedContent = "";
        const streamStats = initStreamStats("send", assistantMessageId);

        try {
          await consumeSseResponse(response, (event, data) => {
            switch (event) {
              case "thinking": {
                const thinkingText =
                  typeof data === "string"
                    ? data
                    : (data as any)?.thinking || (data as any)?.reasoning || null;
                if (thinkingText) {
                  const incoming = String(thinkingText);
                  const previous = accumulatedThinking;
                  // V0 can send full text or deltas; merge to avoid dropping fragments.
                  const mergedThought = mergeStreamingText(previous, incoming);
                  recordStreamText(streamStats, "thinking", previous, mergedThought, incoming.length);
                  if (mergedThought !== accumulatedThinking) {
                    accumulatedThinking = mergedThought;
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === assistantMessageId
                          ? { ...m, thinking: accumulatedThinking, isStreaming: true }
                          : m,
                      ),
                    );
                  }
                }
                break;
              }
              case "content": {
                const contentText =
                  typeof data === "string"
                    ? data
                    : (data as any)?.content || (data as any)?.text || (data as any)?.delta || null;
                if (contentText) {
                  const incoming = String(contentText);
                  const previous = accumulatedContent;
                  const merged = mergeStreamingText(previous, incoming);
                  recordStreamText(streamStats, "content", previous, merged, incoming.length);
                  accumulatedContent = merged;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMessageId
                        ? { ...m, content: accumulatedContent, isStreaming: true }
                        : m,
                    ),
                  );
                }
                break;
              }
              case "parts": {
                const nextParts = coerceUiParts(data);
                if (nextParts.length > 0) {
                  recordStreamParts(streamStats, nextParts.length);
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMessageId
                        ? {
                            ...m,
                            uiParts: mergeUiParts(m.uiParts, nextParts),
                            isStreaming: true,
                          }
                        : m,
                    ),
                  );
                }
                break;
              }
              case "done": {
                streamStats.didReceiveDone = true;
                const doneData = typeof data === "object" && data ? (data as any) : {};
                if (doneData?.demoUrl) setCurrentDemoUrl(doneData.demoUrl);
                onPreviewRefresh?.();
                const resolvedVersionId =
                  doneData.versionId ||
                  doneData.version_id ||
                  doneData.latestVersion?.id ||
                  doneData.latestVersion?.versionId ||
                  null;
                streamStats.chatId = chatId ?? null;
                streamStats.versionId = resolvedVersionId ? String(resolvedVersionId) : null;
                setMessages((prev) =>
                  prev.map((m) => (m.id === assistantMessageId ? { ...m, isStreaming: false } : m)),
                );
                mutateVersions();
                // Call generation complete callback with available data
                onGenerationComplete?.({
                  chatId: chatId || "",
                  versionId: resolvedVersionId ?? undefined,
                  demoUrl: doneData.demoUrl,
                });
                if (chatId && resolvedVersionId) {
                  void triggerImageMaterialization({
                    chatId: String(chatId),
                    versionId: String(resolvedVersionId),
                    enabled: enableImageMaterialization,
                  });
                }
                if (chatId && resolvedVersionId) {
                  void runPostGenerationChecks({
                    chatId: String(chatId),
                    versionId: String(resolvedVersionId),
                    demoUrl: doneData.demoUrl ?? null,
                    assistantMessageId,
                    setMessages,
                    onAutoFix: (payload) => autoFixHandlerRef.current(payload),
                  });
                }
                break;
              }
              case "error": {
                const errorData =
                  typeof data === "object" && data ? (data as any) : { message: data };
                throw new Error(buildStreamErrorMessage(errorData as Record<string, unknown>));
              }
            }
          }, { signal: streamController.signal });
        } finally {
          streamAbortRef.current = null;
          streamStats.chatId = streamStats.chatId ?? chatId ?? null;
          finalizeStreamStats(streamStats);
        }

        // Ensure isStreaming is false even if stream ends without "done" event (fail-safe)
        setMessages((prev) => {
          const msg = prev.find((m) => m.id === assistantMessageId);
          if (!msg?.isStreaming) return prev;
          return prev.map((m) =>
            m.id === assistantMessageId ? { ...m, isStreaming: false } : m,
          );
        });
      } catch (error) {
        let finalError = error;
        if (isNetworkError(error) && requestBody) {
          try {
            const fallbackRes = await fetch(`/api/v0/chats/${chatId}/messages`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(requestBody),
            });
            if (!fallbackRes.ok) {
              let errorData: Record<string, unknown> | null = null;
              try {
                errorData = (await fallbackRes.json()) as Record<string, unknown>;
              } catch {
                // ignore
              }
              const errorMessage = buildApiErrorMessage({
                response: fallbackRes,
                errorData,
                fallbackMessage: "Failed to send message",
              });
              throw new Error(errorMessage);
            }
            const data = await fallbackRes.json();
            await handleNonStreamingSend(data);
            return;
          } catch (fallbackErr) {
            finalError = fallbackErr;
          }
        }
        console.error("Error sending streaming message:", finalError);
        const message = finalError instanceof Error ? finalError.message : "Failed to send message";
        toast.error(message);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId && !m.content
              ? { ...m, content: `Varning: ${message}`, isStreaming: false }
              : m,
          ),
        );
      } finally {
        clearStreamSafetyTimer();
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMessageId ? { ...m, isStreaming: false } : m)),
        );
      }
    },
    [
      chatId,
      createNewChat,
      enableImageGenerations,
      enableImageMaterialization,
      enableThinking,
      systemPrompt,
      setMessages,
      setCurrentDemoUrl,
      onPreviewRefresh,
      onGenerationComplete,
      selectedModelTier,
      selectedModelId,
      buildIntent,
      buildMethod,
      planModeFirstPromptEnabled,
      mutateVersions,
      startStreamSafetyTimer,
      clearStreamSafetyTimer,
    ],
  );

  const handleAutoFix = useCallback(
    (payload: AutoFixPayload) => {
      const attemptKey = payload.chatId;
      const attempts = autoFixAttemptsRef.current[attemptKey] ?? 0;
      if (attempts >= 2) return;
      autoFixAttemptsRef.current[attemptKey] = attempts + 1;

      const prompt = buildAutoFixPrompt(payload);
      const delayMs = attempts === 0 ? 1500 : 4000;
      setTimeout(() => {
        void sendMessage(prompt);
      }, delayMs);
    },
    [sendMessage],
  );

  autoFixHandlerRef.current = handleAutoFix;

  useEffect(() => {
    const handler = (event: Event) => {
      const payload = (event as CustomEvent<AutoFixPayload>).detail;
      if (!payload?.chatId || !payload?.versionId) return;
      handleAutoFix(payload);
    };
    window.addEventListener("sajtmaskin:auto-fix", handler as EventListener);
    return () => window.removeEventListener("sajtmaskin:auto-fix", handler as EventListener);
  }, [handleAutoFix]);

  return { isCreatingChat, createNewChat, sendMessage };
}
