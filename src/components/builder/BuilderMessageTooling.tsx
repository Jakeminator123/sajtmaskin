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
import {
  openIntegrationsPanel,
  openProjectEnvVarsPanel,
} from "@/lib/builder/project-env-events";
import { cn } from "@/lib/utils";
import { ChevronDown, Loader2 } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useState } from "react";
import type { ToolUIPart } from "ai";
import {
  PostCheckPanel,
  ReviewBlock,
  ActionStrip,
  QualityGatePanel,
  ServerRepairPanel,
} from "./review-panels";

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

type CompactToolPartsProps = StructuredToolPartsProps & {
  /**
   * F2 vs F3 lifecycle gate. Env / integrations buttons inside compact
   * tool parts are hidden during F2 because the target panel
   * (`ProjectEnvVarsPanel`) is not mounted there. Only used by
   * `CompactToolParts`; structured rendering does not surface env actions.
   */
  lifecycleStage?:
    | import("@/lib/db/engine-version-lifecycle").EngineVersionLifecycleStage
    | null;
};

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
  qualityGatePending: boolean;
  autoFixQueued: boolean;
};

type SeoReviewSummary = {
  passed: boolean;
  issueCount: number;
  topIssues: string[];
  suggestedPrompts: string[];
  suggestedLabels: string[];
  canonical: boolean;
  ogImage: boolean;
  homeH1Count: number | null;
};

type SeoActionPrompt = {
  question: string;
  options: string[];
  labels: string[];
};

type AnalyticsReviewSummary = {
  passed: boolean;
  issueCount: number;
  topIssues: string[];
  suggestedPrompts: string[];
  suggestedLabels: string[];
  trackerDetected: boolean;
  trackerProviders: string[];
  conversionSurfaceCount: number;
  conversionEventCount: number;
};

type AnalyticsActionPrompt = {
  question: string;
  options: string[];
  labels: string[];
};

type EditorialReviewSummary = {
  packCount: number;
  labels: string[];
  suggestedPrompts: string[];
  hasBlogCollection: boolean;
  hasContactFlow: boolean;
};

type EditorialActionPrompt = {
  question: string;
  options: string[];
};

type BusinessWorkflowSummary = {
  packCount: number;
  labels: string[];
  suggestedPrompts: string[];
  recommendedIntegrations: string[];
  hasLeadCapture: boolean;
  hasBookingFlow: boolean;
  hasCrmSync: boolean;
};

type BusinessWorkflowActionPrompt = {
  question: string;
  options: string[];
  labels: string[];
};

type QualityGateCheckInfo = {
  check: string;
  passed: boolean;
  exitCode: number;
  output: string;
  durationMs?: number | null;
};

type QualityGateSummary = {
  passed: boolean;
  /** F2 render-first: promoted with typecheck warnings (advisory) — amber, not green. */
  designAdvisory?: boolean;
  skipped: boolean;
  reason?: string;
  checks: QualityGateCheckInfo[];
  verifyLaneDurationMs: number | null;
  firstFailureCheck: string | null;
  jobStartedAt: string | null;
  jobFinishedAt: string | null;
  visualQA: {
    overallScore: number;
    passed: boolean;
    checks: Array<{ check: string; passed: boolean; score: number; detail: string }>;
  } | null;
};

type ServerRepairSummary = {
  repaired: boolean;
  status: string | null;
  reason: string | null;
  method: string | null;
  newVersionId: string | null;
  remainingErrors: number | null;
  improvedSyntax: boolean | null;
  earlyStopReason: string | null;
};

export function AgentLogCard({ items }: { items: AgentLogItem[] }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="border-border bg-muted/30 mb-3 rounded-md border"
    >
      <CollapsibleTrigger className="text-muted-foreground hover:bg-muted/50 flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-xs font-medium transition-colors">
        <span>Slutsteg ({items.length}) — visa detaljer</span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="text-muted-foreground space-y-1 px-3 pb-3 text-xs">
          {items.map((item, index) => (
            <li key={`agent-${index}`} className="flex gap-2">
              <span className="bg-muted-foreground/70 mt-1 h-1.5 w-1.5 rounded-full" />
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
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
        const summaries = extractToolSummaries(toolType, tool.output);
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
              {summaries.postCheck && <PostCheckPanel {...summaries.postCheck} />}
              {summaries.seo ? (
                <ReviewBlock
                  variant="full"
                  title="SEO review"
                  passed={summaries.seo.passed}
                  passedLabel="SEO-baseline ser bra ut."
                  failedLabel={`${summaries.seo.issueCount} SEO-varning(ar) hittades.`}
                  details={[
                    `Canonical: ${summaries.seo.canonical ? "ja" : "nej"}`,
                    `OG image-strategi: ${summaries.seo.ogImage ? "ja" : "nej"}`,
                    ...(summaries.seo.homeH1Count !== null ? [`Startsidans h1-count: ${summaries.seo.homeH1Count}`] : []),
                  ]}
                  issues={summaries.seo.topIssues}
                  tips={summaries.seo.suggestedPrompts}
                />
              ) : null}
              {summaries.seoAction && (
                <ActionStrip
                  variant="full"
                  show={!pendingReply && !hasUserAfterCurrentMessage && Boolean(onQuickReply)}
                  color="cyan"
                  title="Snabb SEO-fix"
                  question={summaries.seoAction.question}
                  options={summaries.seoAction.options}
                  labels={summaries.seoAction.labels}
                  keyPrefix="seo"
                  messageId={messageId}
                  pendingQuickReplyKey={pendingQuickReplyKey}
                  onQuickReply={onQuickReply}
                  quickReplyDisabled={quickReplyDisabled}
                  formatButtonLabel={(option, idx, total) => idx === total - 1 ? "Annat" : `Fixa ${summaries.seoAction!.labels[idx] ?? option}`}
                />
              )}
              {summaries.analytics ? (
                <ReviewBlock
                  variant="full"
                  title="Analytics review"
                  passed={summaries.analytics.passed}
                  passedLabel="Tracking-baseline ser rimlig ut."
                  failedLabel={`${summaries.analytics.issueCount} tracking-varning(ar) hittades.`}
                  details={[
                    `Tracker hittad: ${summaries.analytics.trackerDetected ? "ja" : "nej"}`,
                    ...(summaries.analytics.trackerProviders.length > 0 ? [`Providers: ${summaries.analytics.trackerProviders.join(", ")}`] : []),
                    `Konverteringsytor: ${summaries.analytics.conversionSurfaceCount} • events: ${summaries.analytics.conversionEventCount}`,
                  ]}
                  issues={summaries.analytics.topIssues}
                  tips={summaries.analytics.suggestedPrompts}
                  maxIssues={3}
                />
              ) : null}
              {summaries.analyticsAction && (
                <ActionStrip
                  variant="full"
                  show={!pendingReply && !hasUserAfterCurrentMessage && Boolean(onQuickReply)}
                  color="violet"
                  title="Snabb tracking-fix"
                  question={summaries.analyticsAction.question}
                  options={summaries.analyticsAction.options}
                  labels={summaries.analyticsAction.labels}
                  keyPrefix="analytics"
                  messageId={messageId}
                  pendingQuickReplyKey={pendingQuickReplyKey}
                  onQuickReply={onQuickReply}
                  quickReplyDisabled={quickReplyDisabled}
                  formatButtonLabel={(option, idx, total) => idx === total - 1 ? "Annat" : `Fixa ${summaries.analyticsAction!.labels[idx] ?? option}`}
                />
              )}
              {summaries.editorial ? (
                <ReviewBlock
                  variant="full"
                  title="Editorial inventory"
                  passed={true}
                  passedLabel={`${summaries.editorial.packCount} redigerbara innehållspack hittades.`}
                  failedLabel=""
                  details={[
                    ...(summaries.editorial.labels.length > 0 ? [`Packs: ${summaries.editorial.labels.join(", ")}`] : []),
                    `Blogg/content: ${summaries.editorial.hasBlogCollection ? "ja" : "nej"} • kontaktflöde: ${summaries.editorial.hasContactFlow ? "ja" : "nej"}`,
                  ]}
                  issues={[]}
                  tips={summaries.editorial.suggestedPrompts}
                />
              ) : null}
              {summaries.business ? (
                <ReviewBlock
                  variant="full"
                  title="Business workflows"
                  passed={true}
                  passedLabel={`${summaries.business.packCount} affärspack hittades.`}
                  failedLabel=""
                  details={[
                    ...(summaries.business.labels.length > 0 ? [`Packs: ${summaries.business.labels.join(", ")}`] : []),
                    ...(summaries.business.recommendedIntegrations.length > 0 ? [`Rekommenderade integrationer: ${summaries.business.recommendedIntegrations.join(", ")}`] : []),
                    `Lead capture: ${summaries.business.hasLeadCapture ? "ja" : "nej"} • booking: ${summaries.business.hasBookingFlow ? "ja" : "nej"} • CRM: ${summaries.business.hasCrmSync ? "ja" : "nej"}`,
                  ]}
                  issues={[]}
                  tips={summaries.business.suggestedPrompts}
                />
              ) : null}
              {summaries.editorialAction && (
                <ActionStrip
                  variant="full"
                  show={!pendingReply && !hasUserAfterCurrentMessage && Boolean(onQuickReply)}
                  color="sky"
                  title="Snabb redigering"
                  question={summaries.editorialAction.question}
                  options={summaries.editorialAction.options}
                  labels={summaries.editorialAction.options}
                  keyPrefix="editorial"
                  messageId={messageId}
                  pendingQuickReplyKey={pendingQuickReplyKey}
                  onQuickReply={onQuickReply}
                  quickReplyDisabled={quickReplyDisabled}
                  formatButtonLabel={(option, idx, total) => idx === total - 1 ? "Annat" : `Redigera ${option.split(" ").slice(1, 3).join(" ") || option}`}
                />
              )}
              {summaries.businessAction && (
                <ActionStrip
                  variant="full"
                  show={!pendingReply && !hasUserAfterCurrentMessage && Boolean(onQuickReply)}
                  color="emerald"
                  title="Snabb konfigurering"
                  question={summaries.businessAction.question}
                  options={summaries.businessAction.options}
                  labels={summaries.businessAction.labels}
                  keyPrefix="business"
                  messageId={messageId}
                  pendingQuickReplyKey={pendingQuickReplyKey}
                  onQuickReply={onQuickReply}
                  quickReplyDisabled={quickReplyDisabled}
                  formatButtonLabel={(option, idx, total) => idx === total - 1 ? "Annat" : `Konfigurera ${summaries.businessAction!.labels[idx] ?? option}`}
                />
              )}
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
        const summaries = extractToolSummaries(toolType, tool.output);
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
                {summaries.seo ? (
                  <ReviewBlock
                    variant="compact"
                    title="SEO"
                    passed={summaries.seo.passed}
                    passedLabel="SEO-baseline OK"
                    failedLabel={`${summaries.seo.issueCount} SEO-varning(ar)`}
                    details={[`Canonical: ${summaries.seo.canonical ? "ja" : "nej"} • OG image: ${summaries.seo.ogImage ? "ja" : "nej"}`]}
                    issues={summaries.seo.topIssues}
                    tips={summaries.seo.suggestedPrompts}
                  />
                ) : null}
                {summaries.seoAction && (
                  <ActionStrip variant="compact" show color="cyan" title="" question={summaries.seoAction.question} options={summaries.seoAction.options} labels={summaries.seoAction.labels} keyPrefix="seo" messageId={messageId} pendingQuickReplyKey={pendingQuickReplyKey} />
                )}
                {summaries.analytics ? (
                  <ReviewBlock
                    variant="compact"
                    title="Analytics"
                    passed={summaries.analytics.passed}
                    passedLabel="Analytics-baseline OK"
                    failedLabel={`${summaries.analytics.issueCount} analytics-varning(ar)`}
                    details={[`Tracker: ${summaries.analytics.trackerDetected ? "ja" : "nej"} • events: ${summaries.analytics.conversionEventCount}`]}
                    issues={summaries.analytics.topIssues}
                    tips={summaries.analytics.suggestedPrompts}
                  />
                ) : null}
                {summaries.analyticsAction && (
                  <ActionStrip variant="compact" show color="violet" title="" question={summaries.analyticsAction.question} options={summaries.analyticsAction.options} labels={summaries.analyticsAction.labels} keyPrefix="analytics" messageId={messageId} pendingQuickReplyKey={pendingQuickReplyKey} />
                )}
                {summaries.editorial ? (
                  <ReviewBlock
                    variant="compact"
                    title="Editorial"
                    passed={true}
                    passedLabel={`Editorial packs: ${summaries.editorial.labels.join(", ")}`}
                    failedLabel=""
                    details={[]}
                    issues={[]}
                    tips={summaries.editorial.suggestedPrompts}
                  />
                ) : null}
                {summaries.editorialAction && (
                  <ActionStrip variant="compact" show color="sky" title="" question={summaries.editorialAction.question} options={summaries.editorialAction.options} labels={summaries.editorialAction.options} keyPrefix="editorial" messageId={messageId} pendingQuickReplyKey={pendingQuickReplyKey} />
                )}
                {summaries.business ? (
                  <ReviewBlock
                    variant="compact"
                    title="Business"
                    passed={true}
                    passedLabel={`Business packs: ${summaries.business.labels.join(", ")}`}
                    failedLabel=""
                    details={[
                      ...(summaries.business.recommendedIntegrations.length > 0 ? [`Rekommenderat: ${summaries.business.recommendedIntegrations.join(", ")}`] : []),
                    ]}
                    issues={[]}
                    tips={summaries.business.suggestedPrompts}
                  />
                ) : null}
                {summaries.businessAction && (
                  <ActionStrip variant="compact" show color="emerald" title="" question={summaries.businessAction.question} options={summaries.businessAction.options} labels={summaries.businessAction.labels} keyPrefix="business" messageId={messageId} pendingQuickReplyKey={pendingQuickReplyKey} />
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
              </>
            )}
            {isIntegrations ? (
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
            ) : null}
          </div>
        );
      })}
    </>
  );
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

    if (typeof obj.repaired === "boolean") {
      const lines: string[] = [
        obj.repaired ? "Server repair lyckades." : "Server repair blev inte fullständig.",
      ];
      if (typeof obj.method === "string" && obj.method.trim()) {
        lines.push(`Metod: ${obj.method.trim()}`);
      }
      const syntaxCleanGateFailed = obj.syntaxCleanGateFailed === true;
      if (syntaxCleanGateFailed) {
        lines.push("Kvarvarande fel: 0 syntaxfel (esbuild) — men quality gate (typecheck/build) failar fortfarande");
      } else if (typeof obj.remainingErrors === "number" && Number.isFinite(obj.remainingErrors)) {
        const sourceLabel =
          obj.remainingErrorsSource === "esbuild_syntax"
            ? "syntax (esbuild)"
            : obj.remainingErrorsSource === "quality_gate"
              ? "quality gate"
              : null;
        lines.push(
          sourceLabel
            ? `Kvarvarande fel: ${obj.remainingErrors} (${sourceLabel})`
            : `Kvarvarande fel: ${obj.remainingErrors}`,
        );
      }
      if (typeof obj.improvedSyntax === "boolean") {
        lines.push(`Syntax förbättrades: ${obj.improvedSyntax ? "ja" : "nej"}`);
      }
      if (typeof obj.earlyStopReason === "string" && obj.earlyStopReason.trim()) {
        lines.push(`Stopporsak: ${obj.earlyStopReason.trim()}`);
      }
      if (typeof obj.newVersionId === "string" && obj.newVersionId.trim()) {
        lines.push(`Ny version: ${obj.newVersionId.trim()}`);
      }
      return lines;
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
      const shouldUseSyntheticApprovalOptions =
        state === "approval-requested" || looksLikeApprovalQuestion(normalizedPrompt.question);
      return {
        question: normalizedPrompt.question,
        options: shouldUseSyntheticApprovalOptions
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

function looksLikeApprovalQuestion(question: string): boolean {
  const normalized = question.trim().toLowerCase();
  if (!normalized) return false;
  return [
    "approve",
    "approval",
    "confirm",
    "continue",
    "proceed",
    "accept",
    "reject",
    "deny",
    "godkänn",
    "godkanna",
    "bekräfta",
    "bekrafta",
    "fortsätt",
    "fortsatt",
    "fortsätta",
    "avvisa",
    "tillåt",
    "tillat",
    "tillåta",
  ].some((token) => normalized.includes(token));
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

export { openIntegrationsPanel, openProjectEnvVarsPanel };

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
    qualityGatePending: Boolean(summary?.qualityGatePending ?? obj.qualityGatePending),
    autoFixQueued: Boolean(summary?.autoFixQueued ?? obj.autoFixQueued),
  };

  const hasAnyValue = [
    summaryData.files,
    summaryData.added,
    summaryData.modified,
    summaryData.removed,
    summaryData.warnings,
    summaryData.demoUrl,
    summaryData.previousVersionId,
    summaryData.provisional ? true : null,
    summaryData.qualityGatePending ? true : null,
    summaryData.autoFixQueued ? true : null,
  ].some((value) => value !== null);
  return hasAnyValue ? summaryData : null;
}

function parseNestedSummary(output: unknown, key: string): Record<string, unknown> | null {
  if (!output || typeof output !== "object") return null;
  const obj = output as Record<string, unknown>;
  const nested = obj[key];
  if (!nested || typeof nested !== "object") return null;
  return nested as Record<string, unknown>;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function readFiniteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getSeoReviewSummary(output: unknown): SeoReviewSummary | null {
  const summary = parseNestedSummary(output, "seoSummary");
  if (!summary) return null;
  return {
    passed: Boolean(summary.passed),
    issueCount: readFiniteNumber(summary.issueCount),
    topIssues: readStringArray(summary.topIssues),
    suggestedPrompts: readStringArray(summary.suggestedPrompts),
    suggestedLabels: readStringArray(summary.suggestedLabels),
    canonical: Boolean(summary.canonical),
    ogImage: Boolean(summary.ogImage),
    homeH1Count:
      typeof summary.homeH1Count === "number" && Number.isFinite(summary.homeH1Count)
        ? summary.homeH1Count
        : null,
  };
}

function getAnalyticsReviewSummary(output: unknown): AnalyticsReviewSummary | null {
  const summary = parseNestedSummary(output, "analyticsSummary");
  if (!summary) return null;
  return {
    passed: Boolean(summary.passed),
    issueCount: readFiniteNumber(summary.issueCount),
    topIssues: readStringArray(summary.topIssues),
    suggestedPrompts: readStringArray(summary.suggestedPrompts),
    suggestedLabels: readStringArray(summary.suggestedLabels),
    trackerDetected: Boolean(summary.trackerDetected),
    trackerProviders: readStringArray(summary.trackerProviders),
    conversionSurfaceCount: readFiniteNumber(summary.conversionSurfaceCount),
    conversionEventCount: readFiniteNumber(summary.conversionEventCount),
  };
}

function getEditorialReviewSummary(output: unknown): EditorialReviewSummary | null {
  const summary = parseNestedSummary(output, "editorialSummary");
  if (!summary) return null;
  return {
    packCount: readFiniteNumber(summary.packCount),
    labels: readStringArray(summary.labels),
    suggestedPrompts: readStringArray(summary.suggestedPrompts),
    hasBlogCollection: Boolean(summary.hasBlogCollection),
    hasContactFlow: Boolean(summary.hasContactFlow),
  };
}

function getBusinessWorkflowSummary(output: unknown): BusinessWorkflowSummary | null {
  const summary = parseNestedSummary(output, "businessWorkflowSummary");
  if (!summary) return null;
  return {
    packCount: readFiniteNumber(summary.packCount),
    labels: readStringArray(summary.labels),
    suggestedPrompts: readStringArray(summary.suggestedPrompts),
    recommendedIntegrations: readStringArray(summary.recommendedIntegrations),
    hasLeadCapture: Boolean(summary.hasLeadCapture),
    hasBookingFlow: Boolean(summary.hasBookingFlow),
    hasCrmSync: Boolean(summary.hasCrmSync),
  };
}

type ActionPromptConfig = {
  question: string;
  defaultLabel: string;
};

function buildActionPrompt(
  suggestedPrompts: string[],
  suggestedLabels: string[] | undefined,
  config: ActionPromptConfig,
): { question: string; options: string[]; labels: string[] } | null {
  if (suggestedPrompts.length === 0) return null;
  const prompts = suggestedPrompts.slice(0, 3);
  const labels = suggestedLabels && suggestedLabels.length > 0
    ? suggestedLabels.slice(0, 3)
    : prompts.map(() => config.defaultLabel);
  return {
    question: config.question,
    options: [...prompts, "Annat"],
    labels: [...labels, "Annat"],
  };
}

function getSeoActionPrompt(output: unknown): SeoActionPrompt | null {
  const summary = getSeoReviewSummary(output);
  if (!summary) return null;
  return buildActionPrompt(summary.suggestedPrompts, summary.suggestedLabels, {
    question: "Vilken SEO-del vill du förbättra härnäst?",
    defaultLabel: "SEO",
  });
}

function getAnalyticsActionPrompt(output: unknown): AnalyticsActionPrompt | null {
  const summary = getAnalyticsReviewSummary(output);
  if (!summary) return null;
  return buildActionPrompt(summary.suggestedPrompts, summary.suggestedLabels, {
    question: "Vilken tracking-del vill du förbättra härnäst?",
    defaultLabel: "tracking",
  });
}

function getEditorialActionPrompt(output: unknown): EditorialActionPrompt | null {
  const summary = getEditorialReviewSummary(output);
  if (!summary) return null;
  if (summary.suggestedPrompts.length === 0) return null;
  return {
    question: "Vilken innehållsdel vill du redigera härnäst?",
    options: [...summary.suggestedPrompts.slice(0, 3), "Annat"],
  };
}

function getBusinessWorkflowActionPrompt(output: unknown): BusinessWorkflowActionPrompt | null {
  const summary = getBusinessWorkflowSummary(output);
  if (!summary) return null;
  return buildActionPrompt(summary.suggestedPrompts, summary.labels, {
    question: "Vilket affärsflöde vill du konfigurera härnäst?",
    defaultLabel: "workflow",
  });
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
      verifyLaneDurationMs: null,
      firstFailureCheck: null,
      jobStartedAt: null,
      jobFinishedAt: null,
      visualQA: null,
    };
  }
  const checks = Array.isArray(obj.checks)
    ? (obj.checks as QualityGateCheckInfo[]).filter((check) => check && typeof check.check === "string")
    : [];
  if (checks.length === 0) return null;
  return {
    passed: Boolean(obj.passed),
    designAdvisory: obj.designAdvisory === true,
    skipped: false,
    checks,
    verifyLaneDurationMs:
      typeof obj.verifyLaneDurationMs === "number" ? obj.verifyLaneDurationMs : null,
    firstFailureCheck:
      typeof obj.firstFailureCheck === "string" && obj.firstFailureCheck.trim()
        ? obj.firstFailureCheck.trim()
        : null,
    jobStartedAt:
      typeof obj.jobStartedAt === "string" && obj.jobStartedAt.trim()
        ? obj.jobStartedAt.trim()
        : null,
    jobFinishedAt:
      typeof obj.jobFinishedAt === "string" && obj.jobFinishedAt.trim()
        ? obj.jobFinishedAt.trim()
        : null,
    visualQA:
      obj.visualQA &&
      typeof obj.visualQA === "object" &&
      typeof (obj.visualQA as Record<string, unknown>).overallScore === "number" &&
      typeof (obj.visualQA as Record<string, unknown>).passed === "boolean" &&
      Array.isArray((obj.visualQA as Record<string, unknown>).checks)
        ? {
            overallScore: (obj.visualQA as Record<string, unknown>).overallScore as number,
            passed: (obj.visualQA as Record<string, unknown>).passed as boolean,
            checks: ((obj.visualQA as Record<string, unknown>).checks as Array<Record<string, unknown>>)
              .filter((check) => check && typeof check.check === "string")
              .map((check) => ({
                check: String(check.check),
                passed: check.passed === true,
                score:
                  typeof check.score === "number" && Number.isFinite(check.score) ? check.score : 0,
                detail: typeof check.detail === "string" ? check.detail : "",
              })),
          }
        : null,
  };
}

function getServerRepairSummary(output: unknown): ServerRepairSummary | null {
  if (!output || typeof output !== "object") return null;
  const obj = output as Record<string, unknown>;
  if (typeof obj.repaired !== "boolean") return null;
  return {
    repaired: obj.repaired,
    status: typeof obj.status === "string" && obj.status.trim() ? obj.status.trim() : null,
    reason: typeof obj.reason === "string" && obj.reason.trim() ? obj.reason.trim() : null,
    method: typeof obj.method === "string" && obj.method.trim() ? obj.method.trim() : null,
    newVersionId:
      typeof obj.newVersionId === "string" && obj.newVersionId.trim()
        ? obj.newVersionId.trim()
        : null,
    remainingErrors:
      typeof obj.remainingErrors === "number" && Number.isFinite(obj.remainingErrors)
        ? obj.remainingErrors
        : null,
    improvedSyntax: typeof obj.improvedSyntax === "boolean" ? obj.improvedSyntax : null,
    earlyStopReason:
      typeof obj.earlyStopReason === "string" && obj.earlyStopReason.trim()
        ? obj.earlyStopReason.trim()
        : null,
  };
}

function extractToolSummaries(toolType: string, output: unknown) {
  const isPostCheck = toolType === "tool-post-check";
  const isQualityGate = toolType === "tool-quality-gate";
  return {
    postCheck: isPostCheck ? getPostCheckSummary(output) : null,
    seo: isPostCheck ? getSeoReviewSummary(output) : null,
    seoAction: isPostCheck ? getSeoActionPrompt(output) : null,
    analytics: isPostCheck ? getAnalyticsReviewSummary(output) : null,
    analyticsAction: isPostCheck ? getAnalyticsActionPrompt(output) : null,
    editorial: isPostCheck ? getEditorialReviewSummary(output) : null,
    editorialAction: isPostCheck ? getEditorialActionPrompt(output) : null,
    business: isPostCheck ? getBusinessWorkflowSummary(output) : null,
    businessAction: isPostCheck ? getBusinessWorkflowActionPrompt(output) : null,
    qualityGate: isQualityGate ? getQualityGateSummary(output) : null,
    serverRepair: isQualityGate ? getServerRepairSummary(output) : null,
  };
}
