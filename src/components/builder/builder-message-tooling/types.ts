import type { MessagePart } from "@/lib/builder/messageAdapter";

export type ToolPart = Extract<MessagePart, { type: "tool" }>;

export type QuickReplyHandler = (
  messageId: string,
  optionIndex: number,
  text: string,
  options?: { planMode?: boolean },
) => Promise<boolean>;

export type StructuredToolPartsProps = {
  messageId: string;
  toolParts: ToolPart[];
  pendingReply: PendingReplyModalData | null;
  hasUserAfterCurrentMessage: boolean;
  pendingQuickReplyKey: string | null;
  onQuickReply?: QuickReplyHandler;
  quickReplyDisabled?: boolean;
};

export type CompactToolPartsProps = StructuredToolPartsProps & {
  /**
   * F2 vs F3 lifecycle gate. Env / integrations buttons inside compact
   * tool parts are hidden during F2 to keep the chat env-silent
   * (env-flow-f2-mute); the buttons open the Byggblock popover. Only used
   * by `CompactToolParts`; structured rendering does not surface env actions.
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
  /**
   * `output.kind` discriminator of the awaiting-input tool part, when present
   * (e.g. `"f3-continuation"`). Lets the consumer (MessageList) special-case
   * the F3-continuation marker — auto-continue instead of a dialog.
   */
  kind?: string;
  /** F3-continuation marker's parent design version (when present). */
  parentVersionId?: string | null;
};

export type EnvRequirementHint = {
  key: string;
  envKeys: string[];
};

export type AgentLogItem = {
  label: string;
  /** Satt bara när steget faktiskt felade, så en bock aldrig hamnar på ett fel. */
  failed?: boolean;
};

export type ToolQuestionPrompt = {
  question: string;
  options: string[];
};

export type ToolIntegrationSummary = {
  name?: string;
  envKeys?: string[];
  status?: string;
};

export type IntegrationCardData = {
  name?: string;
  status?: string;
  intentLabel?: string;
  envKeys: string[];
  marketplaceUrl?: string | null;
  sourceEvent?: string | null;
};

export type PostCheckSummary = {
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

export type QualityGateCheckInfo = {
  check: string;
  passed: boolean;
  advisory?: boolean;
  exitCode: number;
  output: string;
  durationMs?: number | null;
};

export type QualityGateSummary = {
  passed: boolean;
  /** F2 render-first: promoted with typecheck warnings (advisory) — amber, not green. */
  designAdvisory?: boolean;
  /** F3 ReleaseGate passed with lint warnings — amber, still promotable. */
  qualityGateAdvisory?: boolean;
  advisoryChecks?: string[];
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

export type ServerRepairSummary = {
  repaired: boolean;
  status: string | null;
  reason: string | null;
  method: string | null;
  newVersionId: string | null;
  remainingErrors: number | null;
  improvedSyntax: boolean | null;
  earlyStopReason: string | null;
};
