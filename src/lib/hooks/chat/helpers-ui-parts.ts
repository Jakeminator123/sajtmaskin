import type { UiMessagePart } from "@/lib/builder/types";
import type { SetMessages } from "./types";
import { mergeStreamingText } from "./helpers-streaming-text";

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
