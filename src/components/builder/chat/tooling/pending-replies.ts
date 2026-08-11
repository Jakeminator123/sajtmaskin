import type { AIElementsMessage } from "@/lib/builder/messageAdapter";
import type { ToolUIPart } from "ai";
import type { EnvRequirementHint, PendingReplyModalData, ToolPart } from "./types";
import {
  dedupeStrings,
  getToolIntegrationSummary,
  isIntegrationOrEnvToolPart,
  looksLikeEnvVarEvent,
} from "./output-parsers";
import {
  extractQuestionPrompt,
  getActionPrompt,
  isPlanAwaitingInput,
  normalizeApprovalOptionLabel,
  normalizeQuestionText,
} from "./prompt-helpers";

function extractPendingReplyKind(tool: { output?: unknown }): string | undefined {
  const output = tool.output;
  if (output && typeof output === "object") {
    const kind = (output as Record<string, unknown>).kind;
    if (typeof kind === "string" && kind.trim().length > 0) return kind.trim();
  }
  return undefined;
}

function extractParentVersionId(tool: { output?: unknown }): string | null {
  const output = tool.output;
  if (output && typeof output === "object") {
    const parentVersionId = (output as Record<string, unknown>).parentVersionId;
    if (typeof parentVersionId === "string" && parentVersionId.trim()) {
      return parentVersionId.trim();
    }
  }
  return null;
}

export function getLatestPendingReply(messages: AIElementsMessage[]): PendingReplyModalData | null {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    if (message.role !== "assistant") continue;
    if (hasUserMessageAfter(messages, messageIndex)) continue;
    const toolParts = message.parts.filter(
      (part): part is ToolPart => part.type === "tool",
    );
    for (let toolIndex = toolParts.length - 1; toolIndex >= 0; toolIndex -= 1) {
      const toolPart = toolParts[toolIndex];
      const tool = toolPart.tool as Partial<ToolUIPart> & {
        type?: string;
        approval?: unknown;
      };
      const toolState = (
        typeof tool.state === "string" ? tool.state : "input-available"
      ) as ToolUIPart["state"];
      const replyPrompt = getActionPrompt(tool, toolState);
      if (!replyPrompt) continue;
      if (isIntegrationOrEnvToolPart(tool) && !isPlanAwaitingInput(tool)) continue;
      const toolCallId =
        (typeof tool.toolCallId === "string" && tool.toolCallId) || `tool-${toolIndex}`;
      const key = [message.id, toolCallId, replyPrompt.question, replyPrompt.options.join("|")].join(
        ":",
      );
      return {
        key,
        messageId: message.id,
        question: replyPrompt.question,
        options: replyPrompt.options,
        planMode: isPlanAwaitingInput(tool),
        kind: extractPendingReplyKind(tool),
        parentVersionId: extractParentVersionId(tool),
      };
    }
    const hasAwaitingInput = toolParts.some((part) => {
      const tool = part.tool as Partial<ToolUIPart> & {
        input?: unknown;
        output?: unknown;
        type?: string;
        toolName?: string;
      };
      const toolRecord = part.tool as { type?: string; state?: string };
      const toolType = typeof toolRecord.type === "string" ? toolRecord.type : "";
      const toolState = typeof toolRecord.state === "string" ? toolRecord.state : "";
      if (isIntegrationOrEnvToolPart(tool) && !isPlanAwaitingInput(tool)) {
        return false;
      }
      return toolType === "tool:awaiting-input" || toolState === "approval-requested";
    });
    const hasPlanAwaitingInput = toolParts.some((part) =>
      isPlanAwaitingInput(
        part.tool as Partial<ToolUIPart> & {
          input?: unknown;
          output?: unknown;
          type?: string;
          toolName?: string;
        },
      ),
    );
    if (hasAwaitingInput) {
      for (let ti = toolParts.length - 1; ti >= 0; ti -= 1) {
        const tool = toolParts[ti]!.tool as Partial<ToolUIPart> & {
          type?: string;
          output?: unknown;
        };
        const t = tool as { type?: string };
        if (t.type !== "tool:awaiting-input") continue;
        const fromOutput = extractQuestionPrompt(tool.output);
        if (fromOutput?.question?.trim()) {
          return {
            key: `${message.id}:awaiting-input-output`,
            messageId: message.id,
            question: normalizeQuestionText(fromOutput.question.trim()),
            options: fromOutput.options.map(normalizeApprovalOptionLabel),
            planMode: hasPlanAwaitingInput,
            kind: extractPendingReplyKind(tool),
            parentVersionId: extractParentVersionId(tool),
          };
        }
      }
      return {
        key: `${message.id}:awaiting-input-fallback`,
        messageId: message.id,
        question: "AI väntar på ditt svar. Kontrollera meddelandet ovan och skriv ett svar.",
        options: [],
        planMode: hasPlanAwaitingInput,
      };
    }
  }
  return null;
}

export function getLatestEnvRequirement(messages: AIElementsMessage[]): EnvRequirementHint | null {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    if (message.role !== "assistant") continue;
    const toolParts = message.parts.filter(
      (part): part is ToolPart => part.type === "tool",
    );
    for (let toolIndex = toolParts.length - 1; toolIndex >= 0; toolIndex -= 1) {
      const toolPart = toolParts[toolIndex];
      const tool = toolPart.tool as Partial<ToolUIPart> & {
        type?: string;
        output?: unknown;
        input?: unknown;
      };
      const toolState = (
        typeof tool.state === "string" ? tool.state : "input-available"
      ) as ToolUIPart["state"];
      const summary = getToolIntegrationSummary(tool);
      const envKeys = dedupeStrings(summary?.envKeys ?? []);
      const looksEnvLike = looksLikeEnvVarEvent(typeof tool.type === "string" ? tool.type : "");
      const shouldPrompt =
        envKeys.length > 0 &&
        (toolState === "approval-requested" ||
          toolState === "output-available" ||
          toolState === "input-available" ||
          looksEnvLike);
      if (!shouldPrompt) continue;
      if (hasUserMessageAfter(messages, messageIndex)) continue;
      const toolCallId =
        (typeof tool.toolCallId === "string" && tool.toolCallId) || `tool-${toolIndex}`;
      return {
        key: [message.id, toolCallId, envKeys.join("|")].join(":"),
        envKeys,
      };
    }
  }
  return null;
}

export function hasUserMessageAfter(messages: AIElementsMessage[], assistantMessageIndex: number): boolean {
  for (let index = assistantMessageIndex + 1; index < messages.length; index += 1) {
    if (messages[index]?.role === "user") return true;
  }
  return false;
}

export function isActionableToolPart(tool: Partial<ToolUIPart> & { type?: string }) {
  const state = typeof tool.state === "string" ? tool.state : "input-available";
  const type = typeof tool.type === "string" ? tool.type.toLowerCase() : "";
  if (state === "approval-requested") return true;
  if (type === "tool-post-check" || type === "tool-quality-gate") return true;
  return isIntegrationOrEnvToolPart(tool);
}
