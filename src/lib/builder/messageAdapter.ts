import type { ToolUIPart } from "ai";
import type { ChatMessage, UiMessagePart } from "./types";

type TextPart = { type: "text"; text: string };
type ReasoningPart = { type: "reasoning"; reasoning: string };
type ToolPart = { type: "tool"; tool: ToolUIPart };

type SourceItem = { url: string; title?: string };
type SourcesPart = { type: "sources"; sources: SourceItem[] };
type SourcePart = { type: "source"; source: SourceItem };

type PlanData = {
  title: string;
  description?: string;
  steps?: string[];
  actions?: string[];
  content?: string;
  raw?: Record<string, unknown>;
};
type PlanPart = { type: "plan"; plan: PlanData; isStreaming?: boolean };

export type MessagePart = TextPart | ReasoningPart | ToolPart | SourcesPart | SourcePart | PlanPart;

export type AIElementsMessage = {
  id: string;
  role: "user" | "assistant";
  parts: MessagePart[];
  isStreaming?: boolean;
};

export function toAIElementsFormat(msg: ChatMessage): AIElementsMessage {
  const parts: MessagePart[] = [];

  if (msg.thinking) {
    parts.push({
      type: "reasoning",
      reasoning: msg.thinking,
    });
  }

  const uiParts = (msg.uiParts ?? [])
    .map(normalizeUiPart)
    .filter((part): part is MessagePart => Boolean(part));
  parts.push(...uiParts);

  parts.push({ type: "text", text: msg.content || "" });

  return {
    id: msg.id,
    role: msg.role,
    parts,
    isStreaming: msg.isStreaming,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function normalizeUiPart(part: UiMessagePart): MessagePart | null {
  const type = typeof part.type === "string" ? part.type : "";
  if (!type) return null;

  if (type === "plan") {
    const planSource = isRecord(part.plan) ? part.plan : part;
    return {
      type: "plan",
      plan: toPlanData(planSource),
      isStreaming: Boolean(part.isStreaming),
    };
  }

  if (type === "sources") {
    const sources = extractSources(part.sources ?? part);
    if (sources.length > 0) {
      return { type: "sources", sources };
    }
    return null;
  }

  if (type === "source") {
    const source = extractSource(part.source ?? part);
    return source ? { type: "source", source } : null;
  }

  if (type.startsWith("tool")) {
    return { type: "tool", tool: normalizeToolPart(part) };
  }

  return null;
}

function normalizeToolPart(part: UiMessagePart): ToolUIPart {
  const raw = part as Record<string, unknown>;
  const toolType = typeof raw.type === "string" ? raw.type : "tool";
  const toolCallId =
    (typeof raw.toolCallId === "string" && raw.toolCallId) ||
    (typeof raw.id === "string" && raw.id) ||
    undefined;
  const toolName =
    (typeof raw.toolName === "string" && raw.toolName) ||
    (typeof raw.name === "string" && raw.name) ||
    (typeof (raw.function as { name?: unknown })?.name === "string" &&
      (raw.function as { name?: string }).name) ||
    undefined;
  const input =
    raw.input ??
    raw.args ??
    raw.parameters ??
    raw.arguments ??
    (raw.function as { arguments?: unknown } | undefined)?.arguments;
  const output = raw.output ?? raw.result ?? raw.response ?? raw.toolOutput ?? raw.tool_output;
  const approval = raw.approval && typeof raw.approval === "object" ? raw.approval : undefined;
  const errorText =
    (typeof raw.errorText === "string" && raw.errorText) ||
    (typeof raw.error === "string" && raw.error) ||
    (typeof raw.message === "string" && raw.message) ||
    undefined;

  const resolvedInput = parseJsonIfPossible(input);
  const resolvedOutput = parseJsonIfPossible(output);
  const state =
    (typeof raw.state === "string" && raw.state) ||
    (errorText ? "output-error" : output !== undefined ? "output-available" : "input-available");

  return {
    type: toolType as ToolUIPart["type"],
    state: state as ToolUIPart["state"],
    toolCallId,
    toolName,
    input: resolvedInput as ToolUIPart["input"],
    output: resolvedOutput as ToolUIPart["output"],
    approval,
    errorText,
  } as ToolUIPart;
}

/**
 * Check if a tool part has meaningful data to display.
 * Empty tool calls (no input, no output, no error) are considered "pending"
 * and may not be worth rendering until v0 sends more data.
 */
export function hasToolData(tool: ToolUIPart): boolean {
  const hasInput = tool.input !== undefined && tool.input !== null;
  const hasOutput = tool.output !== undefined && tool.output !== null;
  const hasError = typeof tool.errorText === "string" && tool.errorText.trim().length > 0;
  const isTerminalState =
    tool.state === "output-available" ||
    tool.state === "output-error" ||
    tool.state === "output-denied" ||
    tool.state === "approval-requested" ||
    tool.state === "approval-responded";

  return hasInput || hasOutput || hasError || isTerminalState;
}

function parseJsonIfPossible(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (!(trimmed.startsWith("{") || trimmed.startsWith("[") || trimmed.startsWith('"'))) {
    return value;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function extractSources(value: unknown): SourceItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => extractSource(item))
    .filter((item): item is SourceItem => Boolean(item));
}

function extractSource(value: unknown): SourceItem | null {
  if (!isRecord(value)) return null;
  const url = typeof value.url === "string" ? value.url : null;
  if (!url) return null;
  const title = typeof value.title === "string" ? value.title : undefined;
  return { url, title };
}

function toPlanData(value: Record<string, unknown>): PlanData {
  const title =
    (typeof value.title === "string" && value.title) ||
    (typeof value.name === "string" && value.name) ||
    "Plan";
  const description =
    (typeof value.description === "string" && value.description) ||
    (typeof value.summary === "string" && value.summary) ||
    undefined;
  const content =
    (typeof value.content === "string" && value.content) ||
    (typeof value.text === "string" && value.text) ||
    undefined;

  const steps = coerceStringArray(value.steps ?? value.items ?? value.checklist);
  const actions = coerceStringArray(value.actions ?? value.nextActions);

  return {
    title,
    description,
    content,
    steps: steps.length > 0 ? steps : undefined,
    actions: actions.length > 0 ? actions : undefined,
    raw: value,
  };
}

function coerceStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter((item) => item.trim().length > 0);
}
