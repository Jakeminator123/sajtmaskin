export function looksLikeV0ChatId(id: unknown): id is string {
  return typeof id === "string" && /^[A-Za-z0-9_-]{8,}$/.test(id);
}

export function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

const UI_PART_TYPES = new Set(["plan", "sources", "source"]);

export type IntegrationSignalIntent = "install" | "connect" | "configure" | "env_vars";

export type IntegrationSignal = {
  key: string;
  name?: string;
  provider?: string;
  status?: string;
  intent?: IntegrationSignalIntent;
  envVars?: string[];
  marketplaceUrl?: string | null;
  sourceEvent?: string | null;
};

function isUiPartType(type: unknown): type is string {
  return typeof type === "string" && (UI_PART_TYPES.has(type) || type.startsWith("tool"));
}

function extractPartsArray(value: unknown): Array<Record<string, unknown>> | null {
  if (!Array.isArray(value)) return null;
  const parts = value.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object" && isUiPartType((item as { type?: unknown }).type),
  );
  return parts.length > 0 ? parts : null;
}

function extractToolCallParts(value: unknown): Array<Record<string, unknown>> | null {
  if (!Array.isArray(value)) return null;
  const normalizeToolType = (rawType: unknown, fallbackName?: string): string => {
    const directType = typeof rawType === "string" ? rawType.trim() : "";
    if (directType) return directType;
    const safeName =
      typeof fallbackName === "string"
        ? fallbackName
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
        : "";
    return safeName ? `tool:${safeName}` : "tool-call";
  };
  const normalizeToolState = (rawState: unknown): string | undefined => {
    const candidate = typeof rawState === "string" ? rawState.trim().toLowerCase() : "";
    if (!candidate) return undefined;
    if (candidate === "approval-requested") return "approval-requested";
    if (candidate === "approval-responded") return "approval-responded";
    if (candidate === "output-denied" || candidate === "denied") return "output-denied";
    if (candidate === "output-error" || candidate === "error" || candidate === "failed") {
      return "output-error";
    }
    if (candidate === "output-available" || candidate === "completed" || candidate === "complete") {
      return "output-available";
    }
    if (candidate === "input-streaming" || candidate === "streaming") return "input-streaming";
    if (candidate === "input-available" || candidate === "pending") return "input-available";
    return undefined;
  };
  const hasQuestionHints = (payload: unknown, depth = 0): boolean => {
    if (!payload || depth > 4 || typeof payload !== "object") return false;
    if (Array.isArray(payload)) {
      return payload.some((item) => hasQuestionHints(item, depth + 1));
    }
    const obj = payload as Record<string, unknown>;
    const keys = Object.keys(obj).map((key) => key.toLowerCase());
    const directKeyHit = keys.some(
      (key) =>
        key.includes("question") ||
        key.includes("questions") ||
        key.includes("option") ||
        key.includes("choice") ||
        key.includes("select"),
    );
    if (directKeyHit) return true;
    return Object.values(obj).some((next) => hasQuestionHints(next, depth + 1));
  };
  const parts = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const obj = item as Record<string, unknown>;
      const id =
        (typeof obj.toolCallId === "string" && obj.toolCallId) ||
        (typeof obj.id === "string" && obj.id) ||
        undefined;
      const name =
        (typeof obj.toolName === "string" && obj.toolName) ||
        (typeof obj.name === "string" && obj.name) ||
        (typeof (obj.function as { name?: unknown })?.name === "string" &&
          (obj.function as { name?: string }).name) ||
        undefined;
      const input =
        obj.input ??
        obj.args ??
        obj.parameters ??
        obj.arguments ??
        (obj.function as { arguments?: unknown } | undefined)?.arguments;
      const output =
        obj.output ?? obj.result ?? obj.response ?? obj.toolOutput ?? obj.tool_output;
      const approval =
        obj.approval && typeof obj.approval === "object"
          ? (obj.approval as Record<string, unknown>)
          : undefined;
      const errorText =
        (typeof obj.errorText === "string" && obj.errorText) ||
        (typeof obj.error === "string" && obj.error) ||
        undefined;
      const explicitState = normalizeToolState(obj.state ?? obj.status);
      const inferredState =
        explicitState ??
        (typeof approval?.approved === "boolean"
          ? "approval-responded"
          : approval
            ? "approval-requested"
            : hasQuestionHints(input) || hasQuestionHints(output)
              ? "approval-requested"
              : errorText
                ? "output-error"
                : output !== undefined
                  ? "output-available"
                  : "input-available");

      return {
        type: normalizeToolType(obj.type, name),
        toolCallId: id,
        toolName: name,
        name,
        input,
        output,
        state: inferredState,
        approval,
        errorText,
      } as Record<string, unknown>;
    })
    .filter((part): part is Record<string, unknown> => Boolean(part));
  return parts.length > 0 ? parts : null;
}

function collectUiParts(value: unknown, acc: Array<Record<string, unknown>>): void {
  if (!value) return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectUiParts(item, acc));
    return;
  }
  if (typeof value !== "object") return;
  const obj = value as Record<string, unknown>;
  if (isUiPartType(obj.type)) {
    acc.push(obj);
  }
  for (const next of Object.values(obj)) {
    collectUiParts(next, acc);
  }
}

function isIntegrationHint(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    normalized.includes("integration") ||
    normalized.includes("marketplace") ||
    normalized.includes("install") ||
    normalized.includes("connect") ||
    normalized.includes("database") ||
    normalized.includes("supabase") ||
    normalized.includes("neon") ||
    normalized.includes("upstash") ||
    normalized.includes("redis") ||
    normalized.includes("vercel") ||
    normalized.includes("env var") ||
    normalized.includes("environment variable") ||
    normalized.includes("api key") ||
    normalized.includes("mcp")
  );
}

function isEnvVarKey(value: string): boolean {
  return /^[A-Z][A-Z0-9_]+$/.test(value.trim());
}

function coerceString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function collectEnvVars(value: unknown, acc: Set<string>, depth = 0): void {
  if (!value || depth > 8 || acc.size >= 32) return;
  if (typeof value === "string") {
    if (isEnvVarKey(value)) acc.add(value.trim());
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectEnvVars(item, acc, depth + 1));
    return;
  }
  if (typeof value !== "object") return;
  const obj = value as Record<string, unknown>;
  const explicitKey = coerceString(obj.key);
  if (explicitKey && isEnvVarKey(explicitKey)) {
    acc.add(explicitKey);
  }
  for (const [key, next] of Object.entries(obj)) {
    if (isEnvVarKey(key)) {
      acc.add(key);
      continue;
    }
    collectEnvVars(next, acc, depth + 1);
  }
}

function normalizeIntent(value: string): IntegrationSignalIntent | undefined {
  const normalized = value.toLowerCase();
  if (normalized.includes("install")) return "install";
  if (normalized.includes("connect")) return "connect";
  if (
    normalized.includes("env") &&
    (normalized.includes("var") || normalized.includes("variable"))
  ) {
    return "env_vars";
  }
  if (normalized.includes("configure") || normalized.includes("setup")) return "configure";
  return undefined;
}

function buildIntegrationKey(params: {
  name?: string | null;
  provider?: string | null;
  intent?: IntegrationSignalIntent;
  envVars: string[];
  eventHint?: string | null;
}): string {
  const parts = [
    params.name || "",
    params.provider || "",
    params.intent || "",
    params.envVars.join(","),
    params.eventHint || "",
  ]
    .join("|")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_|,.-]/g, "");
  return parts || "integration:unknown";
}

function collectIntegrationCandidates(
  value: unknown,
  acc: Array<Record<string, unknown>>,
  depth = 0,
): void {
  if (!value || depth > 8 || acc.length >= 128) return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectIntegrationCandidates(item, acc, depth + 1));
    return;
  }
  if (typeof value !== "object") return;

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).map((key) => key.toLowerCase());
  const keyHint = keys.some(
    (key) =>
      key.includes("integration") ||
      key.includes("marketplace") ||
      key.includes("install") ||
      key.includes("provider") ||
      key.includes("service") ||
      key.includes("environment") ||
      key.includes("env"),
  );
  const valueHint = [
    obj.type,
    obj.event,
    obj.action,
    obj.status,
    obj.state,
    obj.toolName,
    obj.name,
    obj.provider,
    obj.service,
  ]
    .map((item) => coerceString(item))
    .filter((item): item is string => Boolean(item))
    .some((item) => isIntegrationHint(item));

  if (keyHint || valueHint) {
    acc.push(obj);
  }

  Object.values(obj).forEach((next) => {
    if (next && typeof next === "object") {
      collectIntegrationCandidates(next, acc, depth + 1);
    }
  });
}

function toIntegrationSignal(
  candidate: Record<string, unknown>,
  eventHint: string,
): IntegrationSignal | null {
  const name =
    coerceString(candidate.integration) ||
    coerceString(candidate.provider) ||
    coerceString(candidate.service) ||
    coerceString(candidate.name) ||
    coerceString(candidate.title);
  const provider = coerceString(candidate.provider) || coerceString(candidate.service);
  const status =
    coerceString(candidate.status) ||
    coerceString(candidate.state) ||
    coerceString(candidate.result);
  const hintText = [
    coerceString(candidate.type),
    coerceString(candidate.event),
    coerceString(candidate.action),
    coerceString(candidate.name),
    coerceString(candidate.toolName),
    eventHint,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");
  const intent = normalizeIntent(hintText);
  const marketplaceUrl =
    coerceString(candidate.marketplaceUrl) ||
    coerceString(candidate.installUrl) ||
    coerceString(candidate.url) ||
    null;

  const envVarsSet = new Set<string>();
  collectEnvVars(
    candidate.envVars ??
      candidate.environmentVariables ??
      candidate.requiredEnv ??
      candidate.variables ??
      candidate.vars ??
      candidate.keys ??
      candidate.env ??
      candidate,
    envVarsSet,
  );
  const envVars = Array.from(envVarsSet).sort();

  const hasSignalData =
    Boolean(name) ||
    Boolean(provider) ||
    Boolean(status) ||
    Boolean(intent) ||
    envVars.length > 0 ||
    Boolean(marketplaceUrl) ||
    isIntegrationHint(hintText);
  if (!hasSignalData) return null;

  return {
    key: buildIntegrationKey({ name, provider, intent, envVars, eventHint }),
    name: name || undefined,
    provider: provider || undefined,
    status: status || undefined,
    intent,
    envVars: envVars.length > 0 ? envVars : undefined,
    marketplaceUrl,
    sourceEvent: eventHint || null,
  };
}

export function extractIntegrationSignals(
  parsed: unknown,
  currentEvent = "",
  uiParts?: Array<Record<string, unknown>>,
): IntegrationSignal[] {
  const eventHint = currentEvent.toLowerCase();
  const candidates: Array<Record<string, unknown>> = [];

  collectIntegrationCandidates(parsed, candidates);
  if (Array.isArray(uiParts) && uiParts.length > 0) {
    collectIntegrationCandidates(uiParts, candidates);
  }
  if (eventHint && isIntegrationHint(eventHint) && parsed && typeof parsed === "object") {
    candidates.push(parsed as Record<string, unknown>);
  }

  const seen = new Set<string>();
  const signals: IntegrationSignal[] = [];
  for (const candidate of candidates) {
    const signal = toIntegrationSignal(candidate, eventHint);
    if (!signal) continue;
    if (seen.has(signal.key)) continue;
    seen.add(signal.key);
    signals.push(signal);
    if (signals.length >= 16) break;
  }
  return signals;
}

export function extractUiParts(parsed: unknown): Array<Record<string, unknown>> | null {
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;

  if (isUiPartType(obj.type)) {
    return [obj];
  }

  const candidates = [
    obj.parts,
    obj.ui,
    obj.uiParts,
    obj.ui_parts,
    (obj.delta as { parts?: unknown } | undefined)?.parts,
    (obj.delta as { ui?: unknown } | undefined)?.ui,
    (obj.delta as { uiParts?: unknown } | undefined)?.uiParts,
    (obj.delta as { ui_parts?: unknown } | undefined)?.ui_parts,
    (obj.message as { parts?: unknown } | undefined)?.parts,
    (obj.message as { ui?: unknown } | undefined)?.ui,
    (obj.message as { uiParts?: unknown } | undefined)?.uiParts,
    (obj.message as { ui_parts?: unknown } | undefined)?.ui_parts,
    (obj.delta as { content?: unknown } | undefined)?.content,
    obj.content,
    (obj.message as { content?: unknown } | undefined)?.content,
    obj.output,
    (obj.delta as { output?: unknown } | undefined)?.output,
    (obj.message as { output?: unknown } | undefined)?.output,
  ];

  for (const candidate of candidates) {
    const parts = extractPartsArray(candidate) ?? extractToolCallParts(candidate);
    if (parts) return parts;
  }

  const toolParts =
    extractToolCallParts(obj.tool_calls) ||
    extractToolCallParts(obj.toolCalls) ||
    extractToolCallParts((obj.delta as { tool_calls?: unknown } | undefined)?.tool_calls) ||
    extractToolCallParts((obj.delta as { toolCalls?: unknown } | undefined)?.toolCalls) ||
    extractToolCallParts((obj.message as { tool_calls?: unknown } | undefined)?.tool_calls) ||
    extractToolCallParts((obj.message as { toolCalls?: unknown } | undefined)?.toolCalls);
  if (toolParts) return toolParts;

  const collected: Array<Record<string, unknown>> = [];
  collectUiParts(obj, collected);
  return collected.length > 0 ? collected : null;
}

function collectStrings(value: unknown, acc: string[], options?: { skipKeys?: Set<string> }): void {
  if (typeof value === "string") {
    acc.push(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, acc, options));
    return;
  }
  if (!value || typeof value !== "object") return;

  for (const [key, next] of Object.entries(value as Record<string, unknown>)) {
    if (options?.skipKeys?.has(key)) continue;
    collectStrings(next, acc, options);
  }
}

function collectKeyedStrings(value: unknown, keys: Set<string>, acc: string[]): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectKeyedStrings(item, keys, acc));
    return;
  }
  for (const [key, next] of Object.entries(value as Record<string, unknown>)) {
    if (keys.has(key)) {
      collectStrings(next, acc);
    } else {
      collectKeyedStrings(next, keys, acc);
    }
  }
}

function hasChatHints(obj: Record<string, unknown>, eventHint: string): boolean {
  return (
    eventHint.includes("chat") ||
    typeof obj.webUrl === "string" ||
    typeof obj.url === "string" ||
    typeof obj.projectId === "string" ||
    typeof obj.project_id === "string" ||
    typeof obj.chatPrivacy === "string" ||
    typeof obj.chat_privacy === "string" ||
    typeof obj.privacy === "string" ||
    typeof obj.shareable === "boolean" ||
    typeof obj.title === "string" ||
    typeof obj.modelId === "string" ||
    typeof obj.model_id === "string" ||
    typeof obj.modelConfiguration === "object" ||
    typeof obj.latestVersion === "object" ||
    obj.object === "chat"
  );
}

function extractChatIdFromObject(value: unknown, eventHint: string): string | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as any;
  const explicitCandidates = [
    obj.chatId,
    obj.chat_id,
    obj.chat?.id,
    obj.data?.chatId,
    obj.data?.chat_id,
    obj.data?.chat?.id,
  ];
  for (const c of explicitCandidates) {
    if (looksLikeV0ChatId(c)) return c;
  }

  if (looksLikeV0ChatId(obj.id) && hasChatHints(obj as Record<string, unknown>, eventHint)) {
    return obj.id;
  }

  return null;
}

export function extractChatId(parsed: unknown, currentEvent?: string): string | null {
  if (!parsed) return null;
  const eventHint = (currentEvent || "").toLowerCase();

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      const found = extractChatId(item, currentEvent);
      if (found) return found;
    }
    return null;
  }

  if (typeof parsed !== "object") return null;

  const direct = extractChatIdFromObject(parsed, eventHint);
  if (direct) return direct;

  const obj = parsed as Record<string, unknown>;
  const nestedCandidates = [
    obj.data,
    obj.payload,
    obj.result,
    obj.message,
    obj.delta,
    obj.chat,
    obj.latestChat,
  ];
  for (const candidate of nestedCandidates) {
    const found = extractChatIdFromObject(candidate, eventHint);
    if (found) return found;
  }

  const nested: string[] = [];
  collectKeyedStrings(obj, new Set(["chatId", "chat_id"]), nested);
  for (const value of nested) {
    if (looksLikeV0ChatId(value)) return value;
  }

  return null;
}

export function extractDemoUrl(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as any;
  const direct =
    obj.demoUrl ||
    obj.demo_url ||
    obj.latestVersion?.demoUrl ||
    obj.latestVersion?.demo_url ||
    null;
  if (typeof direct === "string" && direct.trim()) return direct;
  const nested: string[] = [];
  collectKeyedStrings(obj, new Set(["demoUrl", "demo_url"]), nested);
  const found = nested.join("");
  return found ? found : null;
}

export function extractVersionId(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as any;
  const direct =
    obj.versionId ||
    obj.version_id ||
    obj.latestVersion?.id ||
    obj.latestVersion?.versionId ||
    null;
  if (typeof direct === "string" && direct.trim()) return direct;
  const nested: string[] = [];
  collectKeyedStrings(obj, new Set(["versionId", "version_id"]), nested);
  const found = nested.join("");
  return found ? found : null;
}

export function extractMessageId(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as any;
  const explicit =
    obj.messageId || obj.message_id || obj.latestVersion?.messageId || obj.message?.id || null;
  if (typeof explicit === "string" && explicit.trim()) return explicit;

  if (typeof obj.object === "string" && obj.object.startsWith("message")) {
    if (typeof obj.id === "string" && obj.id.trim()) return obj.id;
  }

  return null;
}

/**
 * Recursively search for "thought" arrays in v0's deeply nested delta structure.
 * V0 sends thought like: delta.0.1.0.1.part.parts.0.thought = ["partial", "full text"]
 * The last element in the array is the most complete version.
 */
function findThoughtInObject(obj: unknown, depth = 0): string | null {
  if (depth > 20 || !obj || typeof obj !== "object") return null;

  const record = obj as Record<string, unknown>;

  // Direct thought array - v0 format
  if (Array.isArray(record.thought) && record.thought.length > 0) {
    const lastThought = record.thought[record.thought.length - 1];
    if (typeof lastThought === "string" && lastThought.trim()) {
      return lastThought;
    }
  }

  // Direct thinking/reasoning strings
  if (typeof record.thinking === "string" && record.thinking.trim()) {
    return record.thinking;
  }
  if (typeof record.reasoning === "string" && record.reasoning.trim()) {
    return record.reasoning;
  }

  // Recurse into nested objects and arrays
  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findThoughtInObject(item, depth + 1);
        if (found) return found;
      }
    } else if (value && typeof value === "object") {
      const found = findThoughtInObject(value, depth + 1);
      if (found) return found;
    }
  }

  return null;
}

export function extractThinkingText(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== "object") return null;
  return findThoughtInObject(parsed);
}

/**
 * Extract text fragment from V0's JSON-patch delta format.
 * V0 sends content as: {"delta":[[0,1,6,2,2,"text fragment"],9,9]}
 * The text is the last string element in the first array.
 */
function extractDeltaText(delta: unknown): string | null {
  if (!Array.isArray(delta)) return null;

  // Format: [[path..., "text"], 9, 9] or [[path..., "text"]]
  const firstElement = delta[0];
  if (!Array.isArray(firstElement)) return null;

  // The text fragment is the last element in the path array
  const lastElement = firstElement[firstElement.length - 1];
  if (typeof lastElement === "string") {
    return lastElement;
  }

  return null;
}

export function extractContentText(parsed: unknown, _raw: string): string | null {
  if (typeof parsed === "string") return parsed;
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as any;
  if (typeof obj.content === "string") return obj.content;
  if (typeof obj.text === "string") return obj.text;
  if (typeof obj.delta === "string") return obj.delta;

  // Handle V0's JSON-patch delta format: {"delta":[[0,1,6,2,2,"text"],9,9]}
  if (Array.isArray(obj.delta)) {
    const deltaText = extractDeltaText(obj.delta);
    if (deltaText) return deltaText;
  }

  return null;
}

export function isDoneLikeEvent(currentEvent: string, parsed: unknown): boolean {
  const evt = (currentEvent || "").toLowerCase();
  if (evt.includes("done") || evt.includes("complete")) return true;

  if (parsed && typeof parsed === "object") {
    const obj = parsed as any;
    return Boolean(obj.done || obj.completed);
  }

  return false;
}
