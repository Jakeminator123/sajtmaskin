"use client";

import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ai-elements/code-block";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { hasToolData, type AIElementsMessage, type MessagePart } from "@/lib/builder/messageAdapter";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import type { ToolUIPart } from "ai";

type ToolPart = Extract<MessagePart, { type: "tool" }>;

type QuickReplyHandler = (
  messageId: string,
  optionIndex: number,
  text: string,
  options?: { planMode?: boolean },
) => Promise<boolean>;

type StructuredToolPartsProps = {
  messageId: string;
  toolParts: ToolPart[];
  pendingReply: PendingReplyModalData | null;
  hasUserAfterCurrentMessage: boolean;
  pendingQuickReplyKey: string | null;
  onQuickReply?: QuickReplyHandler;
  quickReplyDisabled?: boolean;
};

type CompactToolPartsProps = StructuredToolPartsProps;

export type PendingReplyModalData = {
  key: string;
  messageId: string;
  question: string;
  options: string[];
  planMode?: boolean;
};

export type EnvRequirementHint = {
  key: string;
  envKeys: string[];
};

type AgentLogItem = {
  label: string;
};

type ToolQuestionPrompt = {
  question: string;
  options: string[];
};

type ToolIntegrationSummary = {
  name?: string;
  envKeys?: string[];
  status?: string;
};

type IntegrationCardData = {
  name: string;
  status?: string;
  intentLabel?: string;
  envKeys: string[];
  marketplaceUrl?: string | null;
  sourceEvent?: string | null;
};

type PostCheckSummary = {
  files: number | null;
  added: number | null;
  modified: number | null;
  removed: number | null;
  warnings: number | null;
  demoUrl: string | null;
  previousVersionId: string | null;
  provisional: boolean;
};

type QualityGateCheckInfo = {
  check: string;
  passed: boolean;
  exitCode: number;
  output: string;
};

type QualityGateSummary = {
  passed: boolean;
  skipped: boolean;
  reason?: string;
  checks: QualityGateCheckInfo[];
  sandboxDurationMs: number | null;
};

export function AgentLogCard({ items }: { items: AgentLogItem[] }) {
  if (items.length === 0) return null;

  return (
    <div className="border-border bg-muted/30 mb-3 rounded-md border p-3">
      <div className="text-muted-foreground text-xs font-medium">Agentlogg</div>
      <ul className="text-muted-foreground mt-2 space-y-1 text-xs">
        {items.map((item, index) => (
          <li key={`agent-${index}`} className="flex gap-2">
            <span className="bg-muted-foreground/70 mt-1 h-1.5 w-1.5 rounded-full" />
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StructuredToolParts({
  messageId,
  toolParts,
  pendingReply,
  hasUserAfterCurrentMessage,
  pendingQuickReplyKey,
  onQuickReply,
  quickReplyDisabled = false,
}: StructuredToolPartsProps) {
  return (
    <>
      {toolParts.map((part, index) => {
        const tool = part.tool as Partial<ToolUIPart> & {
          type?: string;
          approval?: unknown;
        };
        const toolState = (
          typeof tool.state === "string" ? tool.state : "input-available"
        ) as ToolUIPart["state"];
        const { toolType, toolTitle } = resolveToolLabels(tool);
        const replyPrompt = getActionPrompt(tool, toolState);
        const canQuickReply =
          Boolean(onQuickReply) &&
          !quickReplyDisabled &&
          replyPrompt &&
          replyPrompt.options.length > 0;
        const hasInput = tool.input !== undefined && tool.input !== null;
        const hasOutput = tool.output !== undefined && tool.output !== null;
        const hasErrorText = typeof tool.errorText === "string" && tool.errorText.trim().length > 0;
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
        const qualityGateSummary =
          toolType === "tool-quality-gate" ? getQualityGateSummary(tool.output) : null;
        const toolHasData = hasToolData(tool as ToolUIPart);

        return (
          <Tool key={`${messageId}-tool-${toolType}-${index}`} defaultOpen={toolHasData}>
            <ToolHeader title={toolTitle} type={toolType} state={toolState} />
            <ToolContent>
              {!pendingReply && !hasUserAfterCurrentMessage && replyPrompt && (
                <div className="mb-3 rounded-md border border-amber-500/60 bg-amber-500/10 p-3 text-xs">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-200">
                    Svar krävs
                  </p>
                  <p className="text-foreground text-sm font-semibold">{replyPrompt.question}</p>
                  {replyPrompt.options.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {replyPrompt.options.map((option, optionIndex) => {
                        const replyKey = `${messageId}:${optionIndex}:${option}`;
                        const isPending = pendingQuickReplyKey === replyKey;
                        return (
                          <Button
                            key={replyKey}
                            size="sm"
                            variant="secondary"
                            disabled={!canQuickReply || pendingQuickReplyKey !== null}
                            onClick={() =>
                              void onQuickReply?.(messageId, optionIndex, option, {
                                planMode: isPlanAwaitingInput(tool),
                              })
                            }
                          >
                            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                            {option}
                          </Button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              {hasInput && <ToolInput input={tool.input} />}
              <ToolOutput
                output={tool.output}
                errorText={typeof tool.errorText === "string" ? tool.errorText : undefined}
              />
              {postCheckSummary && (
                <div className="border-border bg-muted/40 mb-3 rounded-md border p-3 text-xs">
                  <div className="text-muted-foreground mb-1 text-xs font-medium uppercase">
                    Post-check-sammanfattning
                  </div>
                  <div className="text-muted-foreground space-y-1">
                    {postCheckSummary.files !== null && <div>Filer: {postCheckSummary.files}</div>}
                    {postCheckSummary.added !== null &&
                      postCheckSummary.modified !== null &&
                      postCheckSummary.removed !== null && (
                        <div>
                          Ändringar: +{postCheckSummary.added} ~{postCheckSummary.modified} -
                          {postCheckSummary.removed}
                        </div>
                      )}
                    {postCheckSummary.warnings !== null && (
                      <div>Varningar: {postCheckSummary.warnings}</div>
                    )}
                    {postCheckSummary.provisional && (
                      <div className="text-amber-300">
                        Status: preliminär version medan efterkontroller eller autofix fortsätter
                      </div>
                    )}
                    {postCheckSummary.previousVersionId && (
                      <div>Föregående version: {postCheckSummary.previousVersionId}</div>
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
              {qualityGateSummary && (
                <div className="border-border bg-muted/40 mb-3 rounded-md border p-3 text-xs">
                  <div className="text-muted-foreground mb-1 text-xs font-medium uppercase">
                    Quality gate
                  </div>
                  {qualityGateSummary.skipped ? (
                    <div className="text-muted-foreground">
                      Hoppades över
                      {qualityGateSummary.reason ? `: ${qualityGateSummary.reason}` : ""}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div className={qualityGateSummary.passed ? "text-emerald-400" : "text-rose-400"}>
                        {qualityGateSummary.passed ? "PASS" : "FAIL"}
                      </div>
                      {qualityGateSummary.checks.map((check) => (
                        <div
                          key={check.check}
                          className="text-muted-foreground flex items-center gap-1.5"
                        >
                          <span className={check.passed ? "text-emerald-400" : "text-rose-400"}>
                            {check.passed ? "\u2713" : "\u2717"}
                          </span>
                          <span>{check.check}</span>
                          {!check.passed && check.output && (
                            <span
                              className="ml-1 max-w-[280px] truncate text-[10px] text-rose-400/70"
                              title={check.output}
                            >
                              {check.output.split("\n")[0]?.slice(0, 80)}
                            </span>
                          )}
                        </div>
                      ))}
                      {qualityGateSummary.sandboxDurationMs !== null && (
                        <div className="text-muted-foreground/50 text-[10px]">
                          {Math.round(qualityGateSummary.sandboxDurationMs / 1000)}s
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {!hasInput && !hasOutput && !hasErrorText && (
                <div className="text-muted-foreground p-4 text-xs">
                  AI-motorn skickade en tool-call, men data har inte anlänt än. Detta är normalt
                  under streaming. Output läggs till när svaret är redo. Post-check är en snabb
                  statisk kontroll och verifierar inte att sidan fungerar fullt ut.
                </div>
              )}
              <div className="border-border border-t p-4">
                <div className="text-muted-foreground mb-2 text-xs font-medium uppercase">
                  Tool debug
                </div>
                <div className="text-muted-foreground mb-2 space-y-1 text-xs">
                  <p>
                    <span className="font-medium">hasInput</span> visar om tool-callen innehåller
                    en input-payload (parametrar).
                  </p>
                  <p>
                    <span className="font-medium">hasOutput</span> visar om tool-callen redan har
                    ett resultat/response.
                  </p>
                  <p>
                    <span className="font-medium">state</span> beskriver status (t.ex.
                    input-available, output-available, output-error).
                  </p>
                  <p>
                    <span className="font-medium">toolCallId</span> identifierar verktygsanropet
                    och kan saknas tills det registrerats.
                  </p>
                </div>
                <CodeBlock code={JSON.stringify(toolDebug, null, 2)} language="json" />
              </div>
            </ToolContent>
          </Tool>
        );
      })}
    </>
  );
}

export function CompactToolParts({
  messageId,
  toolParts,
  pendingReply,
  hasUserAfterCurrentMessage,
  pendingQuickReplyKey,
  onQuickReply,
  quickReplyDisabled = false,
}: CompactToolPartsProps) {
  return (
    <>
      {toolParts.map((part, index) => {
        const tool = part.tool as Partial<ToolUIPart> & {
          type?: string;
          approval?: unknown;
        };
        const toolState = (
          typeof tool.state === "string" ? tool.state : "input-available"
        ) as ToolUIPart["state"];
        const { toolType, toolTitle } = resolveToolLabels(tool);
        const integrationSummary = getToolIntegrationSummary(tool);
        const integrationCard = getIntegrationCardData(tool);
        const replyPrompt = getActionPrompt(tool, toolState);
        const requiresUserReply = toolState === "approval-requested" || Boolean(replyPrompt);
        const canQuickReply =
          Boolean(onQuickReply) &&
          !quickReplyDisabled &&
          replyPrompt &&
          replyPrompt.options.length > 0;
        const isRealEnvKey = (value: string) => /^[A-Z][A-Z0-9_]+$/.test(value.trim());
        const realEnvKeys = dedupeStrings((integrationSummary?.envKeys ?? []).filter(isRealEnvKey));
        const realCardEnvKeys = dedupeStrings((integrationCard?.envKeys ?? []).filter(isRealEnvKey));
        const projectEnvKeys = dedupeStrings([...realEnvKeys, ...realCardEnvKeys]);

        return (
          <div
            key={`${messageId}-tool-compact-${toolType}-${index}`}
            className="border-border bg-card mb-3 rounded-md border p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium">{toolTitle}</div>
              <span className="text-muted-foreground text-xs">{getToolStateLabel(toolState)}</span>
            </div>
            {replyPrompt ? (
              !pendingReply && !hasUserAfterCurrentMessage ? (
                <div
                  className={cn(
                    "mt-2 rounded-md border p-2 text-xs",
                    requiresUserReply
                      ? "border-amber-500/60 bg-amber-500/10"
                      : "border-border bg-muted/20",
                  )}
                >
                  {requiresUserReply && (
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-200">
                      Svar krävs
                    </p>
                  )}
                  <p className="text-foreground text-sm font-semibold">{replyPrompt.question}</p>
                  {replyPrompt.options.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {replyPrompt.options.map((option, optionIndex) => {
                        const replyKey = `${messageId}:${optionIndex}:${option}`;
                        const isPending = pendingQuickReplyKey === replyKey;
                        return (
                          <Button
                            key={replyKey}
                            size="sm"
                            variant="secondary"
                            disabled={!canQuickReply || pendingQuickReplyKey !== null}
                            onClick={() =>
                              void onQuickReply?.(messageId, optionIndex, option, {
                                planMode: isPlanAwaitingInput(tool),
                              })
                            }
                          >
                            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                            {option}
                          </Button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-muted-foreground mt-2">
                      Svara i chatten för att fortsätta genereringen.
                    </p>
                  )}
                </div>
              ) : null
            ) : (
              <>
                {integrationSummary?.name && (
                  <p className="text-muted-foreground mt-1 text-xs">
                    Integration: {integrationSummary.name}
                  </p>
                )}
                {realEnvKeys.length > 0 && (
                  <p className="text-muted-foreground mt-1 text-xs">
                    Miljövariabler: {realEnvKeys.join(", ")}
                  </p>
                )}
                {integrationSummary?.status && (
                  <p className="text-muted-foreground mt-1 text-xs">
                    Status: {integrationSummary.status}
                  </p>
                )}
                {integrationCard ? (
                  <div className="border-border bg-muted/20 mt-2 rounded-md border p-2 text-xs">
                    {integrationCard.intentLabel && (
                      <p className="text-muted-foreground">Åtgärd: {integrationCard.intentLabel}</p>
                    )}
                    {realCardEnvKeys.length > 0 && (
                      <p className="text-muted-foreground mt-1">
                        Miljövariabler: {realCardEnvKeys.join(", ")}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-muted-foreground mt-2 text-xs">
                    Den genererade sajten behöver denna integration. Konfigurera via miljövariabler
                    eller Integrationspanelen.
                  </p>
                )}
              </>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              {!replyPrompt && projectEnvKeys.length > 0 && (
                <Button size="sm" onClick={() => openProjectEnvVarsPanel(projectEnvKeys)}>
                  Konfigurera miljövariabler
                </Button>
              )}
              {!replyPrompt && (
                <Button size="sm" variant="outline" onClick={openIntegrationsPanel}>
                  Visa integrationer
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

export function resolveToolLabels(tool: Partial<ToolUIPart> & { type?: string }) {
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

export function buildAgentLogItems(toolParts: ToolPart[]) {
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
      };
    }
    const hasAwaitingInput = toolParts.some((part) => {
      const tool = part.tool as { type?: string; state?: string };
      return tool.type === "tool:awaiting-input" || tool.state === "approval-requested";
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
      return {
        key: `${message.id}:awaiting-input-fallback`,
        messageId: message.id,
        question: "V0 väntar på ditt svar. Kontrollera meddelandet ovan och skriv ett svar.",
        options: [],
        planMode: hasPlanAwaitingInput,
      };
    }
  }
  return null;
}

function isPlanAwaitingInput(
  tool: Partial<ToolUIPart> & {
    input?: unknown;
    output?: unknown;
    type?: string;
    toolName?: string;
  },
) {
  const outputObj =
    tool.output && typeof tool.output === "object" ? (tool.output as Record<string, unknown>) : null;
  if (Array.isArray(outputObj?.planBlockers)) return true;
  const toolName = typeof tool.toolName === "string" ? tool.toolName.toLowerCase() : "";
  return toolName.includes("plan");
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

function getToolQuestionPrompt(
  tool: Partial<ToolUIPart> & {
    input?: unknown;
    output?: unknown;
    type?: string;
    approval?: unknown;
  },
): ToolQuestionPrompt | null {
  const fromApproval = extractQuestionPrompt(tool.approval);
  if (fromApproval) return fromApproval;
  const fromOutput = extractQuestionPrompt(tool.output);
  if (fromOutput) return fromOutput;
  const fromInput = extractQuestionPrompt(tool.input);
  if (fromInput) return fromInput;

  const type = typeof tool.type === "string" ? tool.type.toLowerCase() : "";
  const toolWithName = tool as { name?: string; toolName?: string };
  const name = `${toolWithName.name ?? ""} ${toolWithName.toolName ?? ""}`.toLowerCase();
  const hasQuestionHint =
    type.includes("question") ||
    type.includes("clarif") ||
    type.includes("approval") ||
    name.includes("question") ||
    name.includes("clarif") ||
    name.includes("approval");
  if (!hasQuestionHint) return null;

  return {
    question: "Välj ett svar för att fortsätta.",
    options: [],
  };
}

function getActionPrompt(
  tool: Partial<ToolUIPart> & {
    input?: unknown;
    output?: unknown;
    type?: string;
    approval?: unknown;
  },
  state: ToolUIPart["state"],
): ToolQuestionPrompt | null {
  const explicitPrompt = getToolQuestionPrompt(tool);
  const isActionableState =
    state === "approval-requested" ||
    ((state === "input-available" || state === "input-streaming") && Boolean(explicitPrompt));
  if (!isActionableState) return null;

  if (explicitPrompt) {
    const normalizedPrompt = {
      question: normalizeQuestionText(explicitPrompt.question),
      options: explicitPrompt.options.map(normalizeApprovalOptionLabel),
    };
    if (normalizedPrompt.options.length === 0) {
      const question = normalizedPrompt.question;
      const looksLikeApprovalQuestion = question.length <= 120 || question.slice(-25).includes("?");
      return {
        question: normalizedPrompt.question,
        options: looksLikeApprovalQuestion
          ? ["Godkänn förslag", "Avvisa förslag", "Annat"]
          : [],
      };
    }
    return normalizedPrompt;
  }

  const approvalOptions = extractApprovalOptions(tool);
  return {
    question: "AI väntar på ditt svar innan nästa steg kan fortsätta.",
    options:
      approvalOptions.length > 0
        ? approvalOptions.map(normalizeApprovalOptionLabel)
        : ["Godkänn förslag", "Avvisa förslag", "Annat"],
  };
}

function normalizeQuestionText(value: string): string {
  return value
    .replace(/\bv0\b/gi, "AI")
    .replace(
      /needs your answer before the next version can be generated\.?/gi,
      "behöver ditt svar innan nästa version kan genereras.",
    )
    .replace(
      /needs your answer to a follow-up question before the next version can be generated\.?/gi,
      "behöver ditt svar på en följdfråga innan nästa version kan genereras.",
    )
    .replace(
      /pick an option in chat or reply with free text\.?/gi,
      "Välj ett alternativ i chatten eller svara med fri text.",
    );
}

function normalizeApprovalOptionLabel(value: string): string {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  if (lower === "approve plan") return "Godkänn förslag";
  if (lower === "deny plan") return "Avvisa förslag";
  if (lower === "other") return "Annat";
  return trimmed.replace(/\bv0\b/gi, "AI");
}

function extractQuestionPrompt(value: unknown, depth = 0): ToolQuestionPrompt | null {
  if (depth > 4) return null;
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const question =
    (typeof obj.question === "string" && obj.question.trim()) ||
    (typeof obj.prompt === "string" && obj.prompt.trim()) ||
    (typeof obj.title === "string" && obj.title.trim()) ||
    (typeof obj.message === "string" && obj.message.trim()) ||
    (typeof obj.text === "string" && obj.text.trim()) ||
    (typeof obj.description === "string" && obj.description.trim()) ||
    (typeof obj.label === "string" && obj.label.trim()) ||
    null;

  const options = readQuestionOptions(
    obj.options ??
      obj.choices ??
      obj.answers ??
      obj.buttons ??
      obj.values ??
      obj.items ??
      obj.questions,
  );
  if (question || options.length > 0) {
    return {
      question: question || "Choose an answer to continue.",
      options,
    };
  }

  const nestedValues = [obj.input, obj.output, obj.data, obj.payload, obj.approval];
  for (const nested of nestedValues) {
    const nestedPrompt = extractQuestionPrompt(nested, depth + 1);
    if (nestedPrompt) return nestedPrompt;
  }

  return null;
}

function readQuestionOptions(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => {
        if (typeof item === "string") return [item];
        if (item && typeof item === "object") {
          const obj = item as Record<string, unknown>;
          const candidate =
            (typeof obj.label === "string" && obj.label) ||
            (typeof obj.title === "string" && obj.title) ||
            (typeof obj.text === "string" && obj.text) ||
            (typeof obj.value === "string" && obj.value) ||
            null;
          return candidate ? [candidate] : [];
        }
        return [];
      })
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value === "object") {
    return readQuestionOptions(Object.values(value as Record<string, unknown>));
  }
  return [];
}

function extractApprovalOptions(
  tool: Partial<ToolUIPart> & {
    approval?: unknown;
    input?: unknown;
    output?: unknown;
  },
): string[] {
  const values = [tool.approval, tool.output, tool.input];
  for (const value of values) {
    const prompt = extractQuestionPrompt(value);
    if (prompt?.options.length) return prompt.options;
  }
  return [];
}

export function isActionableToolPart(tool: Partial<ToolUIPart> & { type?: string }) {
  const state = typeof tool.state === "string" ? tool.state : "input-available";
  const type = typeof tool.type === "string" ? tool.type.toLowerCase() : "";
  const name = `${(tool as { name?: string }).name ?? ""} ${(tool as { toolName?: string }).toolName ?? ""}`.toLowerCase();
  if (state === "approval-requested") return true;
  if (type === "tool-post-check" || type === "tool-quality-gate") return true;
  return (
    name.includes("integration") ||
    looksLikeEnvVarEvent(type) ||
    looksLikeEnvVarEvent(name)
  );
}

function looksLikeEnvVarEvent(value: string): boolean {
  if (!value) return false;
  const normalized = value.toLowerCase();
  if (normalized.includes("environment")) return true;
  if (normalized.includes("env-var") || normalized.includes("env_var") || normalized.includes("envvar")) {
    return true;
  }
  if (normalized.includes("env") && (normalized.includes("var") || normalized.includes("variable"))) {
    return true;
  }
  return false;
}

function getToolIntegrationSummary(
  tool: Partial<ToolUIPart> & { input?: unknown; output?: unknown; type?: string },
): ToolIntegrationSummary | null {
  const name =
    extractIntegrationName(tool.input) ||
    extractIntegrationName(tool.output) ||
    extractIntegrationName(tool);
  const envKeys = dedupeStrings([
    ...extractEnvKeys(tool.input),
    ...extractEnvKeys(tool.output),
  ]);
  let status = extractStatus(tool.output) || extractStatus(tool.input);
  const type = typeof tool.type === "string" ? tool.type.toLowerCase() : "";
  if (!status && type.includes("added-environment-variables")) {
    status = "Miljövariabler tillagda";
  }
  if (!status && type.includes("added-integration")) {
    status = "Integration tillagd";
  }

  if (!name && envKeys.length === 0 && !status) return null;
  return {
    name: name || undefined,
    envKeys: envKeys.length > 0 ? envKeys : undefined,
    status: status || undefined,
  };
}

function getIntegrationCardData(
  tool: Partial<ToolUIPart> & { input?: unknown; output?: unknown; type?: string },
): IntegrationCardData | null {
  const summary = getToolIntegrationSummary(tool);
  const output =
    tool.output && typeof tool.output === "object" ? (tool.output as Record<string, unknown>) : null;
  const intentRaw = typeof output?.intent === "string" ? output.intent : null;
  const intentLabel =
    intentRaw === "install"
      ? "Installera"
      : intentRaw === "connect"
        ? "Koppla"
        : intentRaw === "env_vars"
          ? "Konfigurera miljövariabler"
          : intentRaw === "configure"
            ? "Konfigurera"
            : undefined;
  const marketplaceUrl =
    (typeof output?.marketplaceUrl === "string" && output.marketplaceUrl) ||
    (typeof output?.installUrl === "string" && output.installUrl) ||
    null;
  const sourceEvent = typeof output?.sourceEvent === "string" ? output.sourceEvent : null;
  const name = summary?.name || (typeof output?.name === "string" ? output.name : null) || null;
  const envKeys = summary?.envKeys ?? [];
  const status = summary?.status || (typeof output?.status === "string" ? output.status : undefined);

  if (!name && envKeys.length === 0 && !marketplaceUrl && !intentLabel) return null;
  return {
    name: name || "Integration",
    status,
    intentLabel,
    envKeys,
    marketplaceUrl,
    sourceEvent,
  };
}

function looksLikeFilePath(value: string): boolean {
  return /[/\\]/.test(value) || /\.\w{1,4}$/.test(value);
}

function extractIntegrationName(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || looksLikeFilePath(trimmed)) return null;
    return trimmed;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const candidates = [obj.integration, obj.provider, obj.service, obj.name, obj.title];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim() && !looksLikeFilePath(candidate.trim())) {
        return candidate.trim();
      }
    }
  }
  return null;
}

function extractEnvKeys(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") {
    return looksLikeEnvKey(value) ? [value.trim()] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => extractEnvKeys(item));
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const directKey = typeof obj.key === "string" && looksLikeEnvKey(obj.key) ? obj.key.trim() : null;
    const containers = [
      obj.envVars,
      obj.environmentVariables,
      obj.requiredEnv,
      obj.variables,
      obj.vars,
      obj.keys,
      obj.env,
    ];
    const fromContainers = containers.flatMap((item) => extractEnvKeys(item));
    if (directKey) fromContainers.push(directKey);
    if (fromContainers.length > 0) return fromContainers;

    if (Array.isArray(obj.steps)) {
      const fromSteps = (obj.steps as unknown[])
        .filter((step): step is string => typeof step === "string")
        .flatMap((step) => {
          const match = step.match(/Milj.variabler:\s*(.+)/i);
          if (!match) return [];
          return match[1].split(",").map((key) => key.trim()).filter(looksLikeEnvKey);
        });
      if (fromSteps.length > 0) return fromSteps;
    }
  }
  return [];
}

function extractStatus(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const candidate =
    (typeof obj.status === "string" && obj.status) ||
    (typeof obj.state === "string" && obj.state) ||
    (typeof obj.result === "string" && obj.result) ||
    null;
  return candidate ? String(candidate) : null;
}

function looksLikeEnvKey(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^[A-Z][A-Z0-9_]+$/.test(trimmed);
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
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

function openIntegrationsPanel() {
  window.dispatchEvent(new CustomEvent("integrations-panel-open"));
}

export function openProjectEnvVarsPanel(envKeys?: string[]) {
  const payload = Array.isArray(envKeys) && envKeys.length > 0 ? { envKeys } : undefined;
  window.dispatchEvent(new CustomEvent("project-env-vars-open", { detail: payload }));
}

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
  const warningsCount = Array.isArray(warningsValue) ? warningsValue.length : toNumber(warningsValue);

  const summaryData: PostCheckSummary = {
    files: toNumber(summary?.files ?? obj.files),
    added: toNumber(summary?.added ?? obj.added),
    modified: toNumber(summary?.modified ?? obj.modified),
    removed: toNumber(summary?.removed ?? obj.removed),
    warnings: warningsCount,
    demoUrl: toString(obj.demoUrl),
    previousVersionId: toString(obj.previousVersionId),
    provisional: Boolean(summary?.provisional ?? obj.provisional),
  };

  const hasAnyValue = Object.values(summaryData).some((value) => value !== null);
  return hasAnyValue ? summaryData : null;
}

function getQualityGateSummary(output: unknown): QualityGateSummary | null {
  if (!output || typeof output !== "object") return null;
  const obj = output as Record<string, unknown>;
  if (obj.skipped) {
    return {
      passed: true,
      skipped: true,
      reason: typeof obj.reason === "string" ? obj.reason : undefined,
      checks: [],
      sandboxDurationMs: null,
    };
  }
  const checks = Array.isArray(obj.checks)
    ? (obj.checks as QualityGateCheckInfo[]).filter((check) => check && typeof check.check === "string")
    : [];
  if (checks.length === 0) return null;
  return {
    passed: Boolean(obj.passed),
    skipped: false,
    checks,
    sandboxDurationMs:
      typeof obj.sandboxDurationMs === "number" ? obj.sandboxDurationMs : null,
  };
}
