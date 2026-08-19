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
import { hasToolData } from "@/lib/builder/message-adapter";
import { labelForDossierOverviewStatus } from "@/lib/builder/dossier-overview";
import { openDossiersPanel } from "@/lib/builder/project-env-events";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import type { ToolUIPart } from "ai";
import {
  PostCheckPanel,
  QualityGatePanel,
  ServerRepairPanel,
} from "../review-panels";
import { LiveReviewRow } from "../LiveReviewRow";
import type { LiveReviewResult } from "@/lib/gen/verify/live-review-types";
import type { CompactToolPartsProps, StructuredToolPartsProps } from "./types";
import {
  dedupeStrings,
  extractToolSummaries,
  getIntegrationCardData,
  getToolIntegrationSummary,
  getToolStateLabel,
  resolveToolLabels,
} from "./output-parsers";
import { getActionPrompt, isPlanAwaitingInput } from "./prompt-helpers";

export function StructuredToolParts({
  messageId,
  toolParts,
  pendingReply,
  hasUserAfterCurrentMessage,
  pendingQuickReplyKey,
  onQuickReply,
  quickReplyDisabled = false,
}: StructuredToolPartsProps) {
  // Codex P1 on #482: while ANY reply is pending, every card's quick actions
  // are suppressed. The inline block at the list bottom owns the pending
  // interaction, and an unrelated quick action would send a user message
  // that the pending gate consumes as its answer
  // (`collectFollowUpClarificationAnswer` reads the NEXT user message) —
  // silently mis-answering the active gate. This also prevents duplicate
  // button sets for the pending message itself.
  const suppressQuickActions = Boolean(pendingReply);
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
        const summaries = extractToolSummaries(toolType, tool.output);
        const toolHasData = hasToolData(tool as ToolUIPart);

        return (
          <Tool key={`${messageId}-tool-${toolType}-${index}`} defaultOpen={toolHasData}>
            <ToolHeader title={toolTitle} type={toolType} state={toolState} />
            <ToolContent>
              {!suppressQuickActions && !hasUserAfterCurrentMessage && replyPrompt && (
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
              {summaries.postCheck && <PostCheckPanel {...summaries.postCheck} />}
              {summaries.liveReview && <LiveReviewRow result={summaries.liveReview} />}
              {summaries.qualityGate && (
                <QualityGatePanel variant="full" {...summaries.qualityGate} />
              )}
              {summaries.serverRepair && (
                <ServerRepairPanel variant="full" {...summaries.serverRepair} />
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
  lifecycleStage = null,
}: CompactToolPartsProps) {
  const isIntegrations = lifecycleStage === "integrations";
  // See StructuredToolParts above for the rationale (Codex P1 on #482).
  const suppressQuickActions = Boolean(pendingReply);
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
        const summaries = extractToolSummaries(toolType, tool.output);
        if (toolType === "tool-live-review") {
          return summaries.liveReview ? (
            <LiveReviewRow
              key={`${messageId}-live-review-${index}`}
              result={summaries.liveReview}
            />
          ) : null;
        }
        const integrationSummary = getToolIntegrationSummary(tool);
        const integrationCard = getIntegrationCardData(tool);
        const qualityGateErrorText =
          toolType === "tool-quality-gate" &&
          typeof tool.errorText === "string" &&
          tool.errorText.trim().length > 0
            ? tool.errorText.trim()
            : null;
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
              <div className="min-w-0 truncate text-sm font-medium">{toolTitle}</div>
              <span className="text-muted-foreground shrink-0 text-xs">{getToolStateLabel(toolState)}</span>
            </div>
            {replyPrompt ? (
              !suppressQuickActions && !hasUserAfterCurrentMessage ? (
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
                    Status: {labelForDossierOverviewStatus(integrationSummary.status)}
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
                    eller Byggblock i previewen.
                  </p>
                )}
                {(summaries.qualityGate || qualityGateErrorText) && (
                  <QualityGatePanel
                    variant="compact"
                    {...(summaries.qualityGate ?? {
                      passed: false,
                      skipped: false,
                      checks: [],
                      verifyLaneDurationMs: null,
                      firstFailureCheck: null,
                      jobStartedAt: null,
                      jobFinishedAt: null,
                      visualQA: null,
                    })}
                    errorText={qualityGateErrorText}
                  />
                )}
                {summaries.serverRepair && (
                  <ServerRepairPanel variant="compact" {...summaries.serverRepair} />
                )}
                {summaries.liveReview && <LiveReviewRow result={summaries.liveReview} />}
              </>
            )}
            {isIntegrations ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {!replyPrompt && projectEnvKeys.length > 0 && (
                  <Button size="sm" onClick={() => openDossiersPanel(projectEnvKeys)}>
                    Öppna Byggblock
                  </Button>
                )}
                {!replyPrompt && (
                  <Button size="sm" variant="outline" onClick={() => openDossiersPanel()}>
                    Visa integrationer
                  </Button>
                )}
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}
