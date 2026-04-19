import type { UiMessagePart } from "@/lib/builder/types";
import { getPromptAssistModelLabel } from "@/lib/builder/defaults";
import type { PromptStrategyMeta } from "@/lib/builder/promptOrchestration";
import { MODEL_LABELS, canonicalizeModelId, getBuildProfileId } from "@/lib/models/catalog";
import { CREATE_CHAT_LOCK_KEY, CREATE_CHAT_LOCK_TTL_MS } from "./constants";
import type {
  AutoFixPayload,
  CreateChatLock,
  IntegrationSseSignal,
  MessageOptions,
  ModelInfoData,
  SetMessages,
  StreamDebugStats,
  StreamQualitySignal,
  ChatAttachment,
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

function normalizePrompt(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function hashString(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

/** Extra fields so two distinct create jobs never share the same sessionStorage dedupe key. */
export type CreateChatKeyJobFields = {
  scaffoldMode?: string | null;
  scaffoldId?: string | null;
  buildMethod?: string | null;
  buildIntent?: string | null;
  planMode?: boolean;
  promptAssistMode?: string | null;
  promptAssistModel?: string | null;
  promptAssistDeep?: boolean;
  /** Serialized palette / theme snapshot (caller passes stable JSON-able value). */
  paletteState?: unknown;
};

function stablePaletteFingerprint(paletteState: unknown): string {
  if (paletteState === undefined || paletteState === null) return "";
  try {
    return JSON.stringify(paletteState);
  } catch {
    return String(paletteState);
  }
}

export function buildCreateChatKey(
  message: string,
  options: MessageOptions,
  modelId: string,
  imageGenerations: boolean,
  systemPrompt?: string,
  job?: CreateChatKeyJobFields,
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
  const planMode = job?.planMode ?? options.planMode ?? false;
  const fingerprint = [
    normalizedMessage,
    `model:${modelId}`,
    `images:${imageGenerations ? "1" : "0"}`,
    `system:${normalizedSystem}`,
    `attachments:${attachmentSignature}`,
    `attachmentPrompt:${attachmentPrompt}`,
    `scaffoldMode:${job?.scaffoldMode ?? ""}`,
    `scaffoldId:${job?.scaffoldId ?? ""}`,
    `buildMethod:${job?.buildMethod ?? ""}`,
    `buildIntent:${job?.buildIntent ?? ""}`,
    `planMode:${planMode ? "1" : "0"}`,
    `promptAssistMode:${job?.promptAssistMode ?? ""}`,
    `promptAssistModel:${job?.promptAssistModel ?? ""}`,
    `promptAssistDeep:${job?.promptAssistDeep ? "1" : "0"}`,
    `palette:${stablePaletteFingerprint(job?.paletteState)}`,
  ].join("::");
  return hashString(fingerprint);
}

// ---------------------------------------------------------------------------
// Streaming text merge
// ---------------------------------------------------------------------------

export function mergeStreamingText(previous: string, incoming: string): string {
  if (!previous) return incoming;
  if (!incoming) return previous;
  if (incoming === previous) return previous;
  if (incoming.length < 50 && previous.endsWith(incoming)) return previous;
  if (incoming.startsWith(previous)) return incoming;
  if (previous.startsWith(incoming)) return previous;

  // v0 sometimes sends full accumulated text (not just delta). If incoming
  // fully contains our previous text it's a safe full-replace.
  if (incoming.length > 64 && previous.length > 64 && incoming.includes(previous)) return incoming;
  // The reverse (previous includes incoming) means incoming is a subset we
  // already have -- only safe when previous is substantially longer.
  if (previous.length > 64 && previous.includes(incoming) && previous.length >= incoming.length) return previous;

  const MIN_SAFE_OVERLAP = 12;
  const maxOverlap = Math.min(previous.length, incoming.length);
  for (let size = maxOverlap; size >= MIN_SAFE_OVERLAP; size -= 1) {
    if (previous.slice(-size) === incoming.slice(0, size)) {
      return previous + incoming.slice(size);
    }
  }

  // Large incoming that doesn't overlap -- likely a full-content replace from
  // v0 (the provider restarted its accumulation). Keep the longer text to
  // avoid truncating content that was already displayed.
  if (incoming.length > 200 && incoming.length > previous.length * 0.8) {
    return incoming.length >= previous.length ? incoming : previous;
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
    errorEvents: 0,
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
    abortedByClient: Boolean(stats.abortedByClient),
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
    errorEvents: stats.errorEvents,
  };

  debugLog("build", "Stream summary", summary);

  const reasons: string[] = [];
  const criticalReasons: string[] = [];
  if (!stats.didReceiveDone) {
    reasons.push("done_event_missing");
    criticalReasons.push("done_event_missing");
  }
  if (stats.errorEvents > 0) {
    if (stats.didReceiveDone) {
      reasons.push("error_event_recovered");
    } else {
      reasons.push("error_event_received");
      criticalReasons.push("error_event_received");
    }
  }
  if (stats.contentEvents > 0 && stats.finalContentLength === 0) {
    reasons.push("content_empty_after_events");
    criticalReasons.push("content_empty_after_events");
  }
  if (stats.thinkingEvents > 0 && stats.finalThinkingLength === 0) {
    reasons.push("thinking_empty_after_events");
    criticalReasons.push("thinking_empty_after_events");
  }

  const onlyDoneMissingOnAbort =
    stats.abortedByClient &&
    criticalReasons.length === 1 &&
    criticalReasons[0] === "done_event_missing" &&
    stats.errorEvents === 0;

  if (onlyDoneMissingOnAbort) {
    reasons.push("client_abort_expected");
    debugLog(
      "build",
      `Stream ended before done (client abort): reasons=[${reasons.join(", ")}]`,
      summary,
    );
    return { hasCriticalAnomaly: false, reasons };
  }

  const hasCriticalAnomaly = criticalReasons.length > 0;
  const inlineCritical = criticalReasons.join(", ");
  const inlineReasons = reasons.join(", ");
  if (hasCriticalAnomaly) {
    warnLog(
      "build",
      `Stream anomaly detected — critical=[${inlineCritical}] reasons=[${inlineReasons}]`,
      { ...summary, reasons, criticalReasons },
    );
  } else if (stats.errorEvents > 0) {
    debugLog("build", "Stream recovered after error", { ...summary, reasons });
  }
  return { hasCriticalAnomaly, reasons };
}

// ---------------------------------------------------------------------------
// Attachment / message helpers
// ---------------------------------------------------------------------------

export function appendAttachmentPrompt(
  message: string,
  attachmentPrompt?: string,
  attachments?: ChatAttachment[],
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

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/** Merge engine progress `output` so repeated SSE updates dedupe consecutive `steps` lines. */
function mergeEngineProgressOutput(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...prev, ...next };
  const ps = prev.steps;
  const ns = next.steps;
  if (Array.isArray(ps) && Array.isArray(ns)) {
    const flat: string[] = [];
    for (const x of [...ps, ...ns]) {
      if (typeof x === "string") flat.push(x);
    }
    const deduped: string[] = [];
    for (const s of flat) {
      if (deduped.length === 0 || deduped[deduped.length - 1] !== s) deduped.push(s);
    }
    out.steps = deduped;
  }
  return out;
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
        key === "output" &&
        isPlainRecord(value) &&
        isPlainRecord((merged as Record<string, unknown>)[key])
      ) {
        const partType = typeof merged.type === "string" ? merged.type : "";
        if (partType.startsWith("tool:") && partType.includes("engine-")) {
          (merged as Record<string, unknown>)[key] = mergeEngineProgressOutput(
            (merged as Record<string, unknown>)[key] as Record<string, unknown>,
            value,
          );
          return;
        }
      }
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

  const parsed = rawItems
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

  return mergeIntegrationSignalsByProvider(parsed);
}

const KNOWN_PROVIDERS = [
  "supabase", "neon", "upstash", "redis", "stripe", "openai",
  "elevenlabs", "resend", "twilio", "sendgrid", "clerk", "auth0",
  "firebase", "mongodb", "planetscale", "turso", "drizzle",
  "prisma", "convex", "appwrite", "sanity", "contentful",
];

function stableIntegrationSignalKey(signal: IntegrationSseSignal): string {
  const payload = JSON.stringify({
    key: signal.key,
    name: signal.name,
    provider: signal.provider,
    status: signal.status,
    intent: signal.intent,
    envVars: signal.envVars,
  });
  let h = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function deriveProviderKey(signal: IntegrationSseSignal): string {
  const provider = signal.provider?.toLowerCase().trim();
  if (provider) {
    const match = KNOWN_PROVIDERS.find((k) => provider.includes(k));
    if (match) return match;
    return provider;
  }

  const name = signal.name?.toLowerCase().trim() ?? "";
  for (const known of KNOWN_PROVIDERS) {
    if (name.includes(known)) return known;
  }

  const envHint = signal.envVars?.join(" ").toLowerCase() ?? "";
  for (const known of KNOWN_PROVIDERS) {
    if (envHint.includes(known)) return known;
  }

  if (signal.key) return signal.key;
  if (name) return name;
  if (signal.envVars && signal.envVars.length > 0) {
    return `env:${signal.envVars.sort().join(",")}`;
  }
  return `signal:${stableIntegrationSignalKey(signal)}`;
}

function mergeIntegrationSignalsByProvider(
  signals: IntegrationSseSignal[],
): IntegrationSseSignal[] {
  if (signals.length <= 1) return signals;

  const groups = new Map<string, IntegrationSseSignal[]>();
  for (const signal of signals) {
    const key = deriveProviderKey(signal);
    const group = groups.get(key);
    if (group) {
      group.push(signal);
    } else {
      groups.set(key, [signal]);
    }
  }

  const merged: IntegrationSseSignal[] = [];
  for (const [, group] of groups) {
    if (group.length === 1) {
      merged.push(group[0]);
      continue;
    }
    const allEnvVars = new Set<string>();
    let bestName: string | undefined;
    let bestProvider: string | undefined;
    let bestStatus: string | undefined;
    let bestIntent: IntegrationSseSignal["intent"];
    let bestMarketplaceUrl: string | undefined;
    let bestSourceEvent: string | undefined;

    for (const s of group) {
      if (s.name && !bestName) bestName = s.name;
      if (s.provider && !bestProvider) bestProvider = s.provider;
      if (s.status && !bestStatus) bestStatus = s.status;
      if (s.intent && !bestIntent) bestIntent = s.intent;
      if (s.marketplaceUrl && !bestMarketplaceUrl) bestMarketplaceUrl = s.marketplaceUrl;
      if (s.sourceEvent && !bestSourceEvent) bestSourceEvent = s.sourceEvent;
      if (s.envVars) s.envVars.forEach((v) => allEnvVars.add(v));
    }

    const envArr = [...allEnvVars].filter((v) => /^[A-Z][A-Z0-9_]+$/.test(v));
    const mergedKey = bestProvider ?? bestName ?? group[0].key;
    merged.push({
      key: mergedKey ? `merged:${mergedKey}` : group[0].key,
      name: bestName,
      provider: bestProvider,
      status: bestStatus,
      intent: bestIntent,
      envVars: envArr.length > 0 ? envArr : undefined,
      marketplaceUrl: bestMarketplaceUrl,
      sourceEvent: bestSourceEvent,
    });
  }

  return merged;
}

function buildIntegrationSteps(signal: IntegrationSseSignal): string[] {
  const steps: string[] = [];
  const displayName =
    signal.provider ?? signal.name ?? "Integration";
  steps.push(`Integration: ${displayName}`);
  if (signal.intent) {
    const label =
      signal.intent === "env_vars"
        ? "Konfigurera miljövariabler"
        : signal.intent === "install"
          ? "Installera"
          : signal.intent === "connect"
            ? "Koppla"
            : "Konfigurera";
    steps.push(`Åtgärd: ${label}`);
  }
  if (signal.envVars && signal.envVars.length > 0) {
    const realKeys = signal.envVars.filter((v) => /^[A-Z][A-Z0-9_]+$/.test(v));
    if (realKeys.length > 0) {
      steps.push(`Miljövariabler: ${realKeys.join(", ")}`);
    }
  }
  if (signal.status) {
    steps.push(`Status: ${signal.status}`);
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

function formatEnginePathLabel(enginePath: string | null | undefined): string | null {
  if (!enginePath) return null;
  if (enginePath === "own-engine") return "egen motor";
  if (enginePath === "plan-mode") return "planlage";
  return enginePath;
}

function buildModelInfoSteps(info: ModelInfoData): string[] {
  const steps: string[] = [];
  const modelId = info.modelId ? String(info.modelId) : null;
  const modelTier =
    typeof info.modelTier === "string" && info.modelTier.trim().length > 0
      ? info.modelTier.trim()
      : null;
  const buildProfileId =
    typeof info.buildProfileId === "string" && info.buildProfileId.trim().length > 0
      ? info.buildProfileId.trim()
      : null;
  const buildProfileLabel =
    typeof info.buildProfileLabel === "string" && info.buildProfileLabel.trim().length > 0
      ? info.buildProfileLabel.trim()
      : null;
  const canonicalTier = modelTier ? canonicalizeModelId(modelTier) : null;
  const modelTierLabel = canonicalTier ? MODEL_LABELS[canonicalTier] : null;
  const resolvedProfileLabel = buildProfileLabel ?? modelTierLabel ?? modelTier;
  const resolvedProfileId = buildProfileId ?? (canonicalTier ? getBuildProfileId(canonicalTier) : modelTier);
  if (resolvedProfileLabel) {
    steps.push(`Byggprofil: ${resolvedProfileLabel}`);
  }
  if (resolvedProfileId) {
    steps.push(`Profil-ID: ${resolvedProfileId}`);
  }
  const enginePathLabel = formatEnginePathLabel(info.enginePath);
  if (enginePathLabel) {
    steps.push(`Motorvag: ${enginePathLabel}`);
  }
  steps.push(`${modelTier ? "Kormodell" : "Model"}: ${modelId || "okand"}`);
  if (typeof info.thinking === "boolean") {
    steps.push(`Thinking: ${info.thinking ? "på" : "av"}`);
  }
  if (typeof info.imageGenerations === "boolean") {
    steps.push(`Bildgenerering: ${info.imageGenerations ? "på" : "av"}`);
  }
  if (typeof info.chatPrivacy === "string" && info.chatPrivacy.trim()) {
    steps.push(`Chat privacy: ${info.chatPrivacy}`);
  }
  if (typeof info.promptAssistProvider === "string") {
    const providerLabel =
      info.promptAssistProvider === "openai" || info.promptAssistProvider === "gateway"
        ? "OpenAI"
        : info.promptAssistProvider === "anthropic"
          ? "Anthropic"
          : info.promptAssistProvider === "v0"
            ? "v0 (legacy)"
            : info.promptAssistProvider;
    steps.push(`Provider: ${providerLabel}`);
  }
  if (typeof info.promptAssistModel === "string") {
    steps.push(`Assist model: ${getPromptAssistModelLabel(info.promptAssistModel)}`);
  }
  if (typeof info.promptAssistDeep === "boolean") {
    steps.push(`Deep brief: ${info.promptAssistDeep ? "på" : "av"}`);
  }
  if (info.promptAssistMode === "polish" || info.promptAssistMode === "rewrite") {
    steps.push(`Assist mode: ${info.promptAssistMode}`);
  }
  if (info.scaffoldId) {
    const label = info.scaffoldLabel || info.scaffoldId;
    steps.push(`Scaffold: ${label}`);
  }
  if (info.capabilities && typeof info.capabilities === "object") {
    const active = Object.entries(info.capabilities)
      .filter(([, v]) => v === true)
      .map(([k]) => k.replace(/^needs/, "").replace(/([A-Z])/g, " $1").trim());
    if (active.length > 0) {
      steps.push(`Capabilities: ${active.join(", ")}`);
    }
  }
  if (typeof info.contractDataMode === "string" && info.contractDataMode.trim()) {
    steps.push(`Data mode: ${info.contractDataMode}`);
  }
  if (typeof info.contractDatabaseProvider === "string" && info.contractDatabaseProvider.trim()) {
    steps.push(`Databas: ${info.contractDatabaseProvider}`);
  }
  if (typeof info.contractAuthProvider === "string" && info.contractAuthProvider.trim()) {
    steps.push(`Auth: ${info.contractAuthProvider}`);
  }
  if (typeof info.contractPaymentProvider === "string" && info.contractPaymentProvider.trim()) {
    steps.push(`Betalning: ${info.contractPaymentProvider}`);
  }
  if (Array.isArray(info.contractIntegrations) && info.contractIntegrations.length > 0) {
    const labels = info.contractIntegrations
      .slice(0, 5)
      .map((entry) => {
        const name =
          (typeof entry.name === "string" && entry.name.trim()) ||
          (typeof entry.provider === "string" && entry.provider.trim()) ||
          "Integration";
        const status = typeof entry.status === "string" && entry.status.trim() ? ` (${entry.status})` : "";
        return `${name}${status}`;
      });
    if (labels.length > 0) {
      steps.push(`Kontrakt integrationer: ${labels.join(", ")}`);
    }
  }
  if (Array.isArray(info.contractEnvVars) && info.contractEnvVars.length > 0) {
    const keys = info.contractEnvVars
      .slice(0, 6)
      .map((entry) => (typeof entry.key === "string" ? entry.key.trim() : ""))
      .filter(Boolean);
    if (keys.length > 0) {
      steps.push(`Kontrakt env vars: ${keys.join(", ")}`);
    }
  }
  if (Array.isArray(info.unresolvedContractDecisions) && info.unresolvedContractDecisions.length > 0) {
    const unresolved = info.unresolvedContractDecisions
      .slice(0, 4)
      .map((entry) => {
        if (typeof entry === "string") return entry;
        return typeof entry.kind === "string" && entry.kind.trim()
          ? entry.kind.trim()
          : "";
      })
      .filter(Boolean);
    if (unresolved.length > 0) {
      steps.push(`Olösta kontrakt: ${unresolved.join(", ")}`);
    }
  }
  if (typeof info.systemPromptLength === "number" && info.systemPromptLength > 0) {
    steps.push(`Systempromt: ${Math.round(info.systemPromptLength / 1000)}K tecken`);
  }
  if (info.briefApplied === true) {
    steps.push("Brief: applicerad");
  }
  if (typeof info.customInstructionsLength === "number" && info.customInstructionsLength > 0) {
    steps.push(`Custom instructions: ${info.customInstructionsLength} tecken`);
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

function formatPromptStrategyReason(reason: string): string {
  const map: Record<string, string> = {
    within_budget:
      "Under mjuk orkestreringsgräns — prompten skickas direkt (ingen sammandragning)",
    empty_prompt: "Tom prompt",
    preserve_registry_payload: "Registry-data bevarad oförändrad",
    technical_content_preserved: "Tekniskt innehåll bevarat",
    force_phase_threshold: "Mycket lång prompt — fasadläge (Plan → Build → Polish)",
    high_complexity: "Hög komplexitet — fasadläge",
    over_budget_summarized: "Över mjuk gräns — prompt sammandragen",
    over_budget_summarized_design_safe: "Över mjuk gräns — sammandragning (designsäker)",
    over_soft_target_full_handoff:
      "Över mjuk gräns — hela prompten skickas (bevarande handoff, ingen aggressiv sammandragning)",
    over_soft_target_full_handoff_design_heavy:
      "Över mjuk gräns — hela prompten skickas (designtung kontext bevarad)",
  };
  if (reason.endsWith("_hard_cap")) {
    return "Hård teckengräns — sektionssparande komprimering eller nödsammandragning";
  }
  return map[reason] ?? reason;
}

function buildPromptStrategySteps(meta: PromptStrategyMeta): string[] {
  const strategyLabel =
    meta.strategy === "phase_plan_build_refine"
      ? "fasad (Plan -> Build -> Polish)"
      : meta.strategy === "preserved"
          ? "bevarad (full handoff)"
          : "redo";
  // budgetTarget = soft ceiling (ORCHESTRATION_SOFT_TARGET_*); NOT a goal length for the user prompt.
  const lengthLine =
    meta.originalLength !== meta.optimizedLength
      ? `Langd: ${meta.originalLength} → ${meta.optimizedLength} tecken (mjuk orkestreringsgräns ~${meta.budgetTarget})`
      : `Langd: ${meta.originalLength} tecken (mjuk orkestreringsgräns ~${meta.budgetTarget} innan ev. sammandragning)`;

  const steps = [`Prompt optimerad: ${strategyLabel}`, `Typ: ${meta.promptType}`, lengthLine];
  if (meta.reason) steps.push(`Orsak: ${formatPromptStrategyReason(meta.reason)}`);
  // Do not duplicate "Genererar innehåll och filer…" here — the engine progress tool
  // (generation / streaming) already emits the same line when output starts.
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
  if (status === 402) {
    const serverError =
      (typeof errorData?.error === "string" && errorData.error) ||
      (typeof errorData?.message === "string" && errorData.message) ||
      "";
    if (serverError) return serverError;
    return "Kvoten är slut för AI-tjänsten. Kontrollera plan/billing.";
  }
  if (code === "quota_exceeded") {
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
      return `Model ID avvisades av AI-tjänsten: "${nestedMsg}". Byt till en giltig byggmodell (GPT-4.1, GPT-5.3 Codex, GPT-5.4 eller GPT-5.1 Codex Max).`;
    }
    return nestedMsg || "Ogiltigt anrop (422). Kontrollera bilagor och meddelande.";
  }

  const directMessage =
    (typeof errorData?.error === "string" && errorData.error) ||
    (typeof errorData?.message === "string" && errorData.message) ||
    "";
  if (looksLikeUnsupportedModelError(directMessage)) {
    return `Model ID avvisades av AI-tjänsten: "${directMessage}". Byt till en giltig byggmodell (GPT-4.1, GPT-5.3 Codex, GPT-5.4 eller GPT-5.1 Codex Max).`;
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

export function isAbortLikeError(error: unknown): boolean {
  if (!error) return false;

  if (error instanceof DOMException) {
    return error.name === "AbortError";
  }

  if (error instanceof Error) {
    return (
      error.name === "AbortError" ||
      /aborted|aborterror|bodystreambuffer was aborted/i.test(error.message)
    );
  }

  if (typeof error === "object" && error !== null) {
    const maybeName = "name" in error ? error.name : null;
    const maybeMessage = "message" in error ? error.message : null;
    return (
      maybeName === "AbortError" ||
      (typeof maybeMessage === "string" &&
        /aborted|aborterror|bodystreambuffer was aborted/i.test(maybeMessage))
    );
  }

  return false;
}

/**
 * Distinguishes a *client-initiated* abort (user pressed stop, route
 * change, hot-reload, etc.) from an abort-shaped error that surfaced
 * because the *server/provider* tore down the stream. We swallow the
 * former silently; we surface the latter as a toast so the user knows
 * the model didn't actually finish.
 *
 * Pass the AbortController whose signal was attached to the original
 * `fetch()`. When that controller's `.aborted` is true at the time of
 * the catch, the abort came from us.
 */
export function isClientInitiatedAbort(
  error: unknown,
  controller: AbortController | null | undefined,
): boolean {
  if (!isAbortLikeError(error)) return false;
  return Boolean(controller?.signal?.aborted);
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
    return `Model ID avvisades av AI-tjänsten: "${rawMessage}". Byt till en giltig byggmodell (GPT-4.1, GPT-5.3 Codex, GPT-5.4 eller GPT-5.1 Codex Max).`;
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
  const repair = payload.repair;

  const currentVersionErrors = repair?.currentVersionErrors
    ?? (Array.isArray(payload.meta?.currentVersionErrors)
      ? payload.meta!.currentVersionErrors.filter((value): value is string => typeof value === "string")
      : []);
  const previousVersionErrors = repair?.previousVersionErrors
    ?? (Array.isArray(payload.meta?.previousVersionErrors)
      ? payload.meta!.previousVersionErrors.filter((value): value is string => typeof value === "string")
      : []);

  const scaffoldRetry = repair?.scaffoldRetry
    ?? (payload.meta?.scaffoldRetry && typeof payload.meta.scaffoldRetry === "object"
      ? (payload.meta.scaffoldRetry as {
          labels?: string[];
          currentScaffoldLabel?: string;
          suggestedScaffoldLabel?: string;
          reason?: string;
        })
      : null);

  const scaffoldRetryReason =
    scaffoldRetry && typeof scaffoldRetry.reason === "string" ? scaffoldRetry.reason : null;
  const scaffoldRetryLabels =
    scaffoldRetry && Array.isArray(scaffoldRetry.labels) && scaffoldRetry.labels.length >= 2
      ? scaffoldRetry.labels
      : null;
  const currentScaffoldLabel =
    scaffoldRetryLabels?.[0]
    ?? (scaffoldRetry && typeof scaffoldRetry.currentScaffoldLabel === "string"
      ? scaffoldRetry.currentScaffoldLabel
      : null);
  const suggestedScaffoldLabel =
    scaffoldRetryLabels?.[1]
    ?? (scaffoldRetry && typeof scaffoldRetry.suggestedScaffoldLabel === "string"
      ? scaffoldRetry.suggestedScaffoldLabel
      : null);

  const lines = [
    "AUTO-FIX REQUEST — TARGETED REPAIR",
    "",
    `Issues detected: ${reasons}.`,
    "",
    "Rules:",
    "1. Make the smallest change that fixes the listed issues.",
    "2. Do NOT change layout, naming, styling, or architecture unless required by the fix.",
    "3. You MAY add a missing dependency import or install if the error requires it.",
    "4. Return ONLY the changed files with minimal edits, but every returned file MUST be complete from first line to last line.",
    "5. NEVER ask the user questions, request confirmation, or wait for input. Fix immediately and silently.",
    "6. NEVER return snippets, diff hunks, partial import sections, or excerpted fragments of a file.",
    "",
    "Acceptance criteria (the fix MUST pass all):",
    "- TypeScript typecheck (tsc --noEmit) passes.",
    "- Build (next build) succeeds.",
    "- Preview/demo URL loads without errors.",
    "- All internal links resolve to existing routes.",
    "- No broken images or invalid React use() calls.",
    '- Every `file="..."` block is a complete file, not a partial snippet.',
  ];

  if (currentVersionErrors.length > 0) {
    lines.push("", "Persisted errors for this version:", ...currentVersionErrors.map((entry) => `- ${entry}`));
  }
  if (previousVersionErrors.length > 0) {
    lines.push("", "Related unresolved errors from previous version:", ...previousVersionErrors.map((entry) => `- ${entry}`));
  }

  if (
    scaffoldRetry &&
    scaffoldRetryReason &&
    currentScaffoldLabel &&
    suggestedScaffoldLabel
  ) {
    lines.push(
      "",
      "Scaffold-aware retry guidance:",
      `- Current scaffold: ${currentScaffoldLabel}`,
      `- Suggested repair scaffold: ${suggestedScaffoldLabel}`,
      `- Why: ${scaffoldRetryReason}`,
      "- Treat this as a hint only. Preserve the current scaffold unless the listed errors make the existing structure impossible to repair with a small change.",
    );
  }

  if (repair?.qualityGateMeta) {
    const {
      verifyLaneDurationMs,
      firstFailureCheck,
      jobStartedAt,
      jobFinishedAt,
    } = repair.qualityGateMeta;
    const qualityGateMetaLines = [
      firstFailureCheck ? `- First failure: ${firstFailureCheck}` : null,
      typeof verifyLaneDurationMs === "number" && Number.isFinite(verifyLaneDurationMs)
        ? `- Total verify duration: ${verifyLaneDurationMs}ms`
        : null,
      jobStartedAt ? `- Verify started: ${jobStartedAt}` : null,
      jobFinishedAt ? `- Verify finished: ${jobFinishedAt}` : null,
    ].filter((line): line is string => Boolean(line));
    if (qualityGateMetaLines.length > 0) {
      lines.push("", "Verify-lane context:", ...qualityGateMetaLines);
    }
  }

  if (repair?.qualityGate?.length) {
    for (const failure of repair.qualityGate) {
      const trimmed = failure.output.trim();
      if (trimmed) {
        const durationSuffix =
          typeof failure.durationMs === "number" && Number.isFinite(failure.durationMs)
            ? `, ${failure.durationMs}ms`
            : "";
        lines.push(
          "",
          `## ${failure.check} output (exit ${failure.exitCode}${durationSuffix})`,
          trimmed.slice(0, 4000),
        );
      }
    }
    if (repair.qualityGate.every((f) => !f.output.trim())) {
      lines.push(
        "",
        "NOTE: Quality gate failed but no error output was captured.",
        "Likely causes: missing type imports, undeclared variables, JSX errors, or missing dependencies.",
        "Review the generated files for obvious TypeScript and build errors.",
      );
    }
  } else if (payload.meta) {
    const qualityGate = payload.meta.qualityGate as Record<string, string> | undefined;
    if (qualityGate && typeof qualityGate === "object") {
      const hasOutput = Object.values(qualityGate).some((v) => typeof v === "string" && v.trim().length > 0);
      if (hasOutput) {
        for (const [check, output] of Object.entries(qualityGate)) {
          if (typeof output === "string" && output.trim()) {
            lines.push("", `## ${check} output`, output.trim().slice(0, 2000));
          }
        }
      } else {
        lines.push(
          "",
          "NOTE: Quality gate failed but no error output was captured.",
          "Likely causes: missing type imports, undeclared variables, JSX errors, or missing dependencies.",
          "Review the generated files for obvious TypeScript and build errors.",
        );
      }
    }
  }

  if (repair?.visualQA?.length) {
    lines.push("", "Visual QA failures:");
    for (const vq of repair.visualQA) {
      lines.push(`- ${vq.check}: score ${vq.score}/100 — ${vq.detail}`);
    }
  }

  if (payload.meta && !repair) {
    const metaStr = JSON.stringify(payload.meta, null, 2);
    const truncated = metaStr.length > 3000 ? metaStr.slice(0, 3000) + "\n..." : metaStr;
    lines.push("", "Diagnostic context:", truncated);
  }

  return lines.join("\n");
}
