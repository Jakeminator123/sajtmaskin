"use client";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Sources, SourcesContent, SourcesTrigger, Source } from "@/components/ai-elements/sources";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { Button } from "@/components/ui/button";
import {
  Plan,
  PlanAction,
  PlanContent,
  PlanDescription,
  PlanFooter,
  PlanHeader,
  PlanTitle,
  PlanTrigger,
} from "@/components/ai-elements/plan";
import { CodeBlock } from "@/components/ai-elements/code-block";
import { toAIElementsFormat, hasToolData } from "@/lib/builder/messageAdapter";
import type { MessagePart } from "@/lib/builder/messageAdapter";
import type { ChatMessage } from "@/lib/builder/types";
import { ChevronDown, ChevronUp, MessageSquare } from "lucide-react";
import { useState } from "react";
import type { ToolUIPart } from "ai";

interface MessageListProps {
  chatId: string | null;
  messages?: Array<ChatMessage>;
  showStructuredParts?: boolean;
}

export function MessageList({
  chatId,
  messages: externalMessages = [],
  showStructuredParts = false,
}: MessageListProps) {
  const messages = externalMessages.map(toAIElementsFormat);

  if (!chatId && messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-gray-500">
        <MessageSquare className="mb-3 h-10 w-10" />
        <p className="text-sm">Ingen chat vald ännu</p>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-gray-500">
        <MessageSquare className="mb-3 h-10 w-10" />
        <p className="text-sm">Inga meddelanden ännu</p>
      </div>
    );
  }

  return (
    <Conversation className="h-full">
      <ConversationContent>
        {messages.map((message) => {
          const reasoningPart = message.parts.find(
            (p): p is Extract<MessagePart, { type: "reasoning" }> => p.type === "reasoning",
          );
          const textParts = message.parts.filter(
            (p): p is Extract<MessagePart, { type: "text" }> => p.type === "text",
          );
          const toolParts = message.parts.filter(
            (p): p is Extract<MessagePart, { type: "tool" }> => p.type === "tool",
          );
          const compactToolParts = showStructuredParts
            ? []
            : toolParts.filter((part) => isActionableToolPart(part.tool));
          const agentLogItems = showStructuredParts ? [] : buildAgentLogItems(toolParts);
          const planParts = showStructuredParts
            ? message.parts.filter(
                (p): p is Extract<MessagePart, { type: "plan" }> => p.type === "plan",
              )
            : [];
          const sourcesParts = showStructuredParts
            ? message.parts.filter(
                (p): p is Extract<MessagePart, { type: "sources" }> => p.type === "sources",
              )
            : [];
          const sourceParts = showStructuredParts
            ? message.parts.filter(
                (p): p is Extract<MessagePart, { type: "source" }> => p.type === "source",
              )
            : [];

          const textContent = textParts.map((p) => p.text).join("");
          const sources = showStructuredParts
            ? dedupeSources([
                ...sourcesParts.flatMap((part) => part.sources),
                ...sourceParts.map((part) => part.source),
              ])
            : [];
          const hasStructuredParts =
            showStructuredParts &&
            (toolParts.length > 0 || planParts.length > 0 || sources.length > 0);

          return (
            <Message key={message.id} from={message.role}>
              <MessageContent>
                {message.role === "assistant" && reasoningPart && (
                  <Reasoning>
                    <ReasoningTrigger isStreaming={Boolean(message.isStreaming && !textContent)} />
                    <ReasoningContent>{reasoningPart.reasoning}</ReasoningContent>
                  </Reasoning>
                )}

                {showStructuredParts &&
                  message.role === "assistant" &&
                  toolParts.map((part, index) => {
                    const tool = part.tool as Partial<ToolUIPart> & { type?: string };
                    const toolState = (
                      typeof tool.state === "string" ? tool.state : "input-available"
                    ) as ToolUIPart["state"];
                    const { toolType, toolTitle } = resolveToolLabels(tool);
                    const hasInput = tool.input !== undefined && tool.input !== null;
                    const hasOutput = tool.output !== undefined && tool.output !== null;
                    const hasErrorText =
                      typeof tool.errorText === "string" && tool.errorText.trim().length > 0;
                    const toolRecord = tool as Record<string, unknown>;
                    const toolCallId =
                      (typeof tool.toolCallId === "string" && tool.toolCallId) ||
                      (typeof toolRecord.id === "string" && toolRecord.id) ||
                      null;
                    const toolDebug = {
                      type: toolType,
                      name: toolTitle,
                      state: toolState,
                      toolCallId,
                      hasInput,
                      hasOutput,
                    };
                    const postCheckSummary =
                      toolType === "tool-post-check" ? getPostCheckSummary(tool.output) : null;

                    // Collapse empty tool calls by default - they'll expand when data arrives
                    const toolHasData = hasToolData(tool as ToolUIPart);

                    return (
                      <Tool
                        key={`${message.id}-tool-${toolType}-${index}`}
                        defaultOpen={toolHasData}
                      >
                        <ToolHeader title={toolTitle} type={toolType} state={toolState} />
                        <ToolContent>
                          {hasInput && <ToolInput input={tool.input} />}
                          <ToolOutput
                            output={tool.output}
                            errorText={
                              typeof tool.errorText === "string" ? tool.errorText : undefined
                            }
                          />
                          {postCheckSummary && (
                            <div className="border-border bg-muted/40 mb-3 rounded-md border p-3 text-xs">
                              <div className="text-muted-foreground mb-1 text-xs font-medium uppercase">
                                Post-check-sammanfattning
                              </div>
                              <div className="text-muted-foreground space-y-1">
                                {postCheckSummary.files !== null && (
                                  <div>Filer: {postCheckSummary.files}</div>
                                )}
                                {postCheckSummary.added !== null &&
                                  postCheckSummary.modified !== null &&
                                  postCheckSummary.removed !== null && (
                                    <div>
                                      Ändringar: +{postCheckSummary.added} ~
                                      {postCheckSummary.modified} -{postCheckSummary.removed}
                                    </div>
                                  )}
                                {postCheckSummary.warnings !== null && (
                                  <div>Varningar: {postCheckSummary.warnings}</div>
                                )}
                                {postCheckSummary.previousVersionId && (
                                  <div>
                                    Föregående version: {postCheckSummary.previousVersionId}
                                  </div>
                                )}
                                {postCheckSummary.demoUrl && (
                                  <a
                                    className="text-primary inline-flex items-center gap-1"
                                    href={postCheckSummary.demoUrl}
                                    rel="noreferrer"
                                    target="_blank"
                                  >
                                    Öppna preview-länk
                                  </a>
                                )}
                              </div>
                            </div>
                          )}
                          {!hasInput && !hasOutput && !hasErrorText && (
                            <div className="text-muted-foreground p-4 text-xs">
                              v0 skickade en tool-call, men data har inte anlänt än. Detta är
                              normalt under streaming. Data läggs till när v0 är redo.
                            </div>
                          )}
                          <div className="border-border border-t p-4">
                            <div className="text-muted-foreground mb-2 text-xs font-medium uppercase">
                              Tool debug
                            </div>
                            <div className="text-muted-foreground mb-2 space-y-1 text-xs">
                              <p>
                                <span className="font-medium">hasInput</span> visar om tool-callen
                                innehåller en input-payload (parametrar).
                              </p>
                              <p>
                                <span className="font-medium">hasOutput</span> visar om tool-callen
                                redan har ett resultat/response.
                              </p>
                              <p>
                                <span className="font-medium">state</span> beskriver status (t.ex.
                                input-available, output-available, output-error).
                              </p>
                              <p>
                                <span className="font-medium">toolCallId</span> identifierar
                                verktygsanropet och kan saknas tills det registrerats.
                              </p>
                            </div>
                            <CodeBlock code={JSON.stringify(toolDebug, null, 2)} language="json" />
                          </div>
                        </ToolContent>
                      </Tool>
                    );
                  })}

                {!showStructuredParts &&
                  message.role === "assistant" &&
                  agentLogItems.length > 0 && (
                    <div className="border-border bg-muted/30 mb-3 rounded-md border p-3">
                      <div className="text-muted-foreground text-xs font-medium">Agentlogg</div>
                      <ul className="text-muted-foreground mt-2 space-y-1 text-xs">
                        {agentLogItems.map((item, index) => (
                          <li key={`${message.id}-agent-${index}`} className="flex gap-2">
                            <span className="bg-muted-foreground/70 mt-1 h-1.5 w-1.5 rounded-full" />
                            <span>{item.label}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                {!showStructuredParts &&
                  message.role === "assistant" &&
                  compactToolParts.map((part, index) => {
                    const tool = part.tool as Partial<ToolUIPart> & { type?: string };
                    const toolState = (
                      typeof tool.state === "string" ? tool.state : "input-available"
                    ) as ToolUIPart["state"];
                    const { toolType, toolTitle } = resolveToolLabels(tool);
                    const summary = getToolSummary(tool);
                    const canOpen = Boolean(chatId);

                    return (
                      <div
                        key={`${message.id}-tool-compact-${toolType}-${index}`}
                        className="border-border bg-card mb-3 rounded-md border p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-medium">{toolTitle}</div>
                          <span className="text-muted-foreground text-xs">
                            {getToolStateLabel(toolState)}
                          </span>
                        </div>
                        {summary && (
                          <p className="text-muted-foreground mt-1 text-xs">
                            Integration: {summary}
                          </p>
                        )}
                        <p className="text-muted-foreground mt-2 text-xs">
                          Den här åtgärden hanteras av v0. Öppna chatten i v0 om du vill installera.
                        </p>
                        <p className="text-muted-foreground mt-1 text-xs">
                          Om integration krävs: kontrollera Integrationspanelen för saknade nycklar.
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            onClick={() => openChatInV0(chatId)}
                            disabled={!canOpen}
                          >
                            Öppna i v0
                          </Button>
                        </div>
                      </div>
                    );
                  })}

                {showStructuredParts &&
                  message.role === "assistant" &&
                  planParts.map((part, index) => (
                    <Plan
                      key={`${message.id}-plan-${index}`}
                      isStreaming={Boolean(part.isStreaming || message.isStreaming)}
                      defaultOpen
                    >
                      <PlanHeader>
                        <div className="space-y-1">
                          <PlanTitle>{part.plan.title}</PlanTitle>
                          {part.plan.description && (
                            <PlanDescription>{part.plan.description}</PlanDescription>
                          )}
                        </div>
                        <PlanAction>
                          <PlanTrigger />
                        </PlanAction>
                      </PlanHeader>
                      <PlanContent>
                        {part.plan.content && (
                          <p className="text-muted-foreground text-sm whitespace-pre-wrap">
                            {part.plan.content}
                          </p>
                        )}
                        {part.plan.steps && part.plan.steps.length > 0 && (
                          <ol className="text-muted-foreground mt-2 list-decimal space-y-1 pl-4 text-sm">
                            {part.plan.steps.map((step) => (
                              <li key={step}>{step}</li>
                            ))}
                          </ol>
                        )}
                        {!part.plan.content &&
                          (!part.plan.steps || part.plan.steps.length === 0) &&
                          part.plan.raw && (
                            <div className="bg-muted/50 rounded-md p-3">
                              <CodeBlock
                                code={JSON.stringify(part.plan.raw, null, 2)}
                                language="json"
                              />
                            </div>
                          )}
                      </PlanContent>
                      {part.plan.actions && part.plan.actions.length > 0 && (
                        <PlanFooter>
                          <div className="text-muted-foreground mb-2 text-xs font-medium uppercase">
                            Plan actions
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {part.plan.actions.map((action) => (
                              <span
                                key={action}
                                className="border-border text-muted-foreground rounded-full border px-2 py-1 text-xs"
                              >
                                {action}
                              </span>
                            ))}
                          </div>
                        </PlanFooter>
                      )}
                    </Plan>
                  ))}

                {message.role === "assistant" ? (
                  textContent ? (
                    <MessageResponse>{textContent}</MessageResponse>
                  ) : message.isStreaming && !reasoningPart && !hasStructuredParts ? (
                    <span className="text-sm text-gray-500">Ansluter...</span>
                  ) : null
                ) : (
                  <CollapsibleUserMessage content={textContent} />
                )}

                {showStructuredParts && message.role === "assistant" && sources.length > 0 && (
                  <Sources>
                    <SourcesTrigger count={sources.length} />
                    <SourcesContent>
                      {sources.map((source) => (
                        <Source
                          key={source.url}
                          href={source.url}
                          title={source.title ?? source.url}
                        />
                      ))}
                    </SourcesContent>
                  </Sources>
                )}
              </MessageContent>
            </Message>
          );
        })}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}

/**
 * CollapsibleUserMessage - Truncates long user messages (especially shadcn/ui block prompts)
 * Shows first few lines with expand button for long technical messages.
 */
function CollapsibleUserMessage({ content }: { content: string }) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Check if this is a long technical message (shadcn block prompt pattern)
  const isTechnicalPrompt = content.includes("---") && content.includes("Registry files");
  const lineCount = content.split("\n").length;
  const charCount = content.length;

  // Only collapse if message is long (>500 chars or >10 lines) and contains technical content
  const shouldCollapse = isTechnicalPrompt && (charCount > 500 || lineCount > 10);

  if (!shouldCollapse) {
    return <p className="text-sm whitespace-pre-wrap text-white">{content}</p>;
  }

  // Extract summary line (first line before ---)
  const lines = content.split("\n");
  const summaryEndIndex = lines.findIndex((line) => line.trim() === "---");
  const summaryLines = summaryEndIndex > 0 ? lines.slice(0, summaryEndIndex) : lines.slice(0, 3);
  const summary = summaryLines.join("\n").trim();

  if (isExpanded) {
    return (
      <div className="space-y-2">
        <p className="text-sm whitespace-pre-wrap text-white">{content}</p>
        <button
          onClick={() => setIsExpanded(false)}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
        >
          <ChevronUp className="h-3 w-3" />
          Dölj detaljer
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm whitespace-pre-wrap text-white">{summary}</p>
      <button
        onClick={() => setIsExpanded(true)}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
      >
        <ChevronDown className="h-3 w-3" />
        Visa tekniska instruktioner ({lineCount} rader)
      </button>
    </div>
  );
}

function dedupeSources(sources: Array<{ url: string; title?: string }>) {
  const seen = new Map<string, { url: string; title?: string }>();
  sources.forEach((source) => {
    if (!seen.has(source.url)) {
      seen.set(source.url, source);
    }
  });
  return Array.from(seen.values());
}

function resolveToolLabels(tool: Partial<ToolUIPart> & { type?: string }) {
  const rawToolType = typeof tool.type === "string" ? `${tool.type}` : "";
  const toolType = (() => {
    if (!rawToolType || rawToolType === "tool") return "tool-unknown";
    if (rawToolType.startsWith("tool-")) return rawToolType;
    if (rawToolType.startsWith("tool:")) return `tool-${rawToolType.slice(5)}`;
    if (rawToolType.startsWith("tool_")) return `tool-${rawToolType.slice(5)}`;
    return `tool-${rawToolType}`;
  })() as ToolUIPart["type"];
  const toolTitle =
    typeof (tool as { name?: string }).name === "string"
      ? (tool as { name?: string }).name
      : typeof (tool as { toolName?: string }).toolName === "string"
        ? (tool as { toolName?: string }).toolName
        : toolType.replace(/^tool[-_:]/, "") || "Tool";

  return { toolType, toolTitle };
}

type AgentLogItem = {
  label: string;
};

function buildAgentLogItems(toolParts: Array<Extract<MessagePart, { type: "tool" }>>) {
  const items: AgentLogItem[] = [];
  toolParts.forEach((part) => {
    const tool = part.tool as Partial<ToolUIPart> & { type?: string; input?: unknown };
    const toolState = (
      typeof tool.state === "string" ? tool.state : "input-available"
    ) as ToolUIPart["state"];
    const { toolTitle } = resolveToolLabels(tool);
    const steps = extractToolSteps(tool);

    if (steps.length > 0) {
      steps.forEach((step) => {
        items.push({ label: step });
      });
    } else {
      items.push({ label: `${toolTitle} • ${getToolStateLabel(toolState)}` });
    }
  });

  return items;
}

function extractToolSteps(tool: Partial<ToolUIPart> & { input?: unknown }) {
  const output = tool.output;
  if (typeof output === "string") {
    return splitToSteps(output);
  }
  if (Array.isArray(output)) {
    return output
      .map((item) => extractStepFromValue(item))
      .filter((item): item is string => Boolean(item));
  }
  if (output && typeof output === "object") {
    const obj = output as Record<string, unknown>;
    const listFromKeys = coerceStringArray(
      obj.steps ?? obj.actions ?? obj.results ?? obj.messages ?? obj.items,
    );
    if (listFromKeys.length > 0) return listFromKeys;

    if (Array.isArray(obj.files)) {
      const fileSteps = obj.files
        .map((item) => extractStepFromValue(item))
        .filter((item): item is string => Boolean(item));
      if (fileSteps.length > 0) return fileSteps;
    }

    if (Array.isArray(obj.images) || Array.isArray(obj.assets)) {
      const assets = (obj.images ?? obj.assets) as unknown[];
      if (assets.length > 0) {
        return assets
          .map((item) => extractStepFromValue(item))
          .filter((item): item is string => Boolean(item));
      }
    }
  }

  const input = tool.input;
  if (input && typeof input === "object") {
    const inputObj = input as Record<string, unknown>;
    const integrationName =
      (typeof inputObj.integration === "string" && inputObj.integration) ||
      (typeof inputObj.provider === "string" && inputObj.provider) ||
      (typeof inputObj.service === "string" && inputObj.service) ||
      (typeof inputObj.name === "string" && inputObj.name) ||
      null;
    if (integrationName) {
      return [`Begär integration: ${integrationName}`];
    }
  }

  return [];
}

function extractStepFromValue(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const label =
      (typeof obj.label === "string" && obj.label) ||
      (typeof obj.title === "string" && obj.title) ||
      (typeof obj.name === "string" && obj.name) ||
      (typeof obj.status === "string" && obj.status) ||
      null;
    return label ? String(label) : null;
  }
  return null;
}

function splitToSteps(text: string) {
  const normalized = text.trim();
  if (!normalized) return [];
  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.length > 0 ? lines : [normalized];
}

function coerceStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter((item) => item.trim().length > 0);
}

function isActionableToolPart(tool: Partial<ToolUIPart> & { type?: string }) {
  const state = typeof tool.state === "string" ? tool.state : "";
  if (state === "approval-requested") return true;
  const type = typeof tool.type === "string" ? tool.type.toLowerCase() : "";
  const toolWithName = tool as { name?: string; toolName?: string };
  const name = (toolWithName.name ?? toolWithName.toolName ?? "").toLowerCase();
  return type.includes("install") || name.includes("install") || type.includes("integration");
}

function getToolSummary(tool: Partial<ToolUIPart> & { input?: unknown }) {
  const input = tool.input;
  if (typeof input === "string") return input.trim().slice(0, 80) || null;
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  const candidate =
    (typeof obj.integration === "string" && obj.integration) ||
    (typeof obj.provider === "string" && obj.provider) ||
    (typeof obj.service === "string" && obj.service) ||
    (typeof obj.name === "string" && obj.name) ||
    null;
  return candidate ? String(candidate) : null;
}

function getToolStateLabel(state: ToolUIPart["state"]) {
  switch (state) {
    case "approval-requested":
      return "Behöver godkännande";
    case "input-streaming":
      return "Förbereder";
    case "input-available":
      return "Redo";
    case "output-available":
      return "Klart";
    case "output-error":
      return "Fel";
    case "output-denied":
      return "Nekad";
    case "approval-responded":
      return "Besvarad";
    default:
      return "Åtgärd";
  }
}

function openChatInV0(chatId: string | null) {
  if (!chatId) return;
  const url = `https://v0.app/chat/${encodeURIComponent(chatId)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

type PostCheckSummary = {
  files: number | null;
  added: number | null;
  modified: number | null;
  removed: number | null;
  warnings: number | null;
  demoUrl: string | null;
  previousVersionId: string | null;
};

function getPostCheckSummary(output: unknown): PostCheckSummary | null {
  if (!output || typeof output !== "object") return null;
  const obj = output as Record<string, unknown>;
  const summary =
    obj.summary && typeof obj.summary === "object"
      ? (obj.summary as Record<string, unknown>)
      : null;
  const toNumber = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) ? value : null;
  const toString = (value: unknown): string | null =>
    typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
  const warningsValue = summary?.warnings ?? obj.warnings;
  const warningsCount = Array.isArray(warningsValue)
    ? warningsValue.length
    : toNumber(warningsValue);

  const summaryData: PostCheckSummary = {
    files: toNumber(summary?.files ?? obj.files),
    added: toNumber(summary?.added ?? obj.added),
    modified: toNumber(summary?.modified ?? obj.modified),
    removed: toNumber(summary?.removed ?? obj.removed),
    warnings: warningsCount,
    demoUrl: toString(obj.demoUrl),
    previousVersionId: toString(obj.previousVersionId),
  };

  const hasAnyValue = Object.values(summaryData).some((value) => value !== null);
  return hasAnyValue ? summaryData : null;
}
