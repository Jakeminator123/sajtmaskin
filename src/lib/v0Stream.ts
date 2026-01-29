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

      return {
        type: "tool-call",
        toolCallId: id,
        toolName: name,
        name,
        input,
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

export function extractChatId(parsed: unknown, currentEvent?: string): string | null {
  if (!parsed || typeof parsed !== "object") return null;

  const obj = parsed as any;
  const explicitCandidates = [obj.chatId, obj.chat_id, obj.chat?.id];
  for (const c of explicitCandidates) {
    if (looksLikeV0ChatId(c)) return c;
  }

  if (looksLikeV0ChatId(obj.id)) {
    const eventHint = (currentEvent || "").toLowerCase();
    const hasChatHints =
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
      obj.object === "chat";

    if (hasChatHints) return obj.id;
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

export function extractContentText(parsed: unknown, _raw: string): string | null {
  if (typeof parsed === "string") return parsed;
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as any;
  if (typeof obj.content === "string") return obj.content;
  if (typeof obj.text === "string") return obj.text;
  if (typeof obj.delta === "string") return obj.delta;
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
