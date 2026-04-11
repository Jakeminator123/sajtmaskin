/**
 * Chat hook types — shared by both the own engine and v0 fallback.
 */
import type { ChatMessage } from "@/lib/builder/types";
import type { BuildIntent, BuildMethod } from "@/lib/builder/build-intent";
import type { PaletteState } from "@/lib/builder/palette";
import type { PromptSourceMeta } from "@/lib/builder/prompt-builder";
import type { ScaffoldMode } from "@/lib/gen/scaffolds";
import type { ModelTier } from "@/lib/validations/chatSchemas";
import type { DesignTheme, ThemeColors } from "@/lib/builder/theme-presets";
import type { MutableRefObject } from "react";

export type RouterLike = { replace: (href: string) => void };

export type ChatAttachment = {
  type: "user_file";
  url: string;
  filename: string;
  mimeType?: string;
  size?: number;
  purpose?: string;
};

export type MessageOptions = {
  attachments?: ChatAttachment[];
  attachmentPrompt?: string;
  planMode?: boolean;
  promptSourceMeta?: PromptSourceMeta;
  scaffoldModeOverride?: ScaffoldMode;
  scaffoldIdOverride?: string | null;
  /** Override the follow-up base version instead of using current builder selection. */
  engineBaseVersionIdOverride?: string | null;
};

export type CreateChatLock = {
  key: string;
  createdAt: number;
  chatId?: string | null;
};

export type QualityGateFailure = {
  check: "typecheck" | "build" | "lint";
  exitCode: number;
  /** Truncated check output (max ~4000 chars). */
  output: string;
  errorCount?: number;
  durationMs?: number | null;
};

export type RepairQualityGateMeta = {
  verifyLaneDurationMs?: number | null;
  firstFailureCheck?: string | null;
  jobStartedAt?: string | null;
  jobFinishedAt?: string | null;
};

export type RepairScaffoldRetry = {
  /** New compact form for prompts. */
  labels?: string[];
  /** Legacy / preview-preflight shape still used in runtime metadata. */
  currentScaffoldId?: string;
  currentScaffoldLabel?: string;
  suggestedScaffoldId?: string;
  suggestedScaffoldLabel?: string;
  reason: string;
};

export type RepairContext = {
  qualityGate?: QualityGateFailure[];
  qualityGateMeta?: RepairQualityGateMeta;
  visualQA?: { check: string; score: number; detail: string }[];
  previousVersionErrors?: string[];
  currentVersionErrors?: string[];
  scaffoldRetry?: RepairScaffoldRetry | null;
};

export type AutoFixPayload = {
  chatId: string;
  versionId: string;
  reasons: string[];
  /** Structured repair context from quality gate / post-checks. */
  repair?: RepairContext;
  /** General metadata — kept for backward compat with preview/diagnostics callers. */
  meta?: Record<string, unknown>;
};

export type StreamDebugStats = {
  streamType: "create" | "send";
  assistantMessageId: string;
  startedAt: number;
  contentEvents: number;
  thinkingEvents: number;
  partsEvents: number;
  errorEvents: number;
  contentChars: number;
  thinkingChars: number;
  contentNoopEvents: number;
  thinkingNoopEvents: number;
  maxContentChunk: number;
  maxThinkingChunk: number;
  finalContentLength: number;
  finalThinkingLength: number;
  didReceiveDone: boolean;
  chatId?: string | null;
  versionId?: string | null;
  /** True when the fetch/stream was aborted (user cancel or navigation). */
  abortedByClient?: boolean;
};

export type StreamQualitySignal = {
  hasCriticalAnomaly: boolean;
  reasons: string[];
};

export type VersionEntry = {
  versionId?: string | null;
  id?: string | null;
  previewUrl?: string | null;
  /** @deprecated Prefer `previewUrl` from API responses. */
  demoUrl?: string | null;
  createdAt?: string | null;
  versionNumber?: number | null;
  previewPending?: boolean;
  releaseState?: string | null;
  verificationState?: string | null;
  verificationSummary?: string | null;
  promotedAt?: string | null;
};

export type FileEntry = { name: string; content: string };

export type ModelInfoData = {
  modelId?: string | null;
  modelTier?: string | null;
  buildProfileId?: string | null;
  buildProfileLabel?: string | null;
  enginePath?: string | null;
  thinking?: boolean | null;
  imageGenerations?: boolean | null;
  chatPrivacy?: string | null;
  promptAssistProvider?: string | null;
  promptAssistModel?: string | null;
  promptAssistDeep?: boolean | null;
  promptAssistMode?: "polish" | "rewrite" | null;
  scaffoldId?: string | null;
  scaffoldFamily?: string | null;
  scaffoldLabel?: string | null;
  capabilities?: Record<string, boolean> | null;
  contractDataMode?: string | null;
  contractDatabaseProvider?: string | null;
  contractAuthProvider?: string | null;
  contractPaymentProvider?: string | null;
  contractIntegrations?: Array<{ provider?: string; name?: string; status?: string; envVars?: string[] }> | null;
  contractEnvVars?: Array<{ key?: string; reason?: string; required?: boolean }> | null;
  unresolvedContractDecisions?: Array<{ kind?: string; reason?: string } | string> | null;
  systemPromptLength?: number | null;
  briefApplied?: boolean | null;
  customInstructionsLength?: number | null;
};

export type IntegrationSseSignal = {
  key?: string;
  name?: string;
  provider?: string;
  status?: string;
  intent?: "install" | "connect" | "configure" | "env_vars";
  envVars?: string[];
  marketplaceUrl?: string | null;
  sourceEvent?: string | null;
};

export type DesignTokenSummary = {
  source: string;
  tokens: Array<{ name: string; value: string }>;
};

export type PreviewBuildErrorPayload = {
  stage: string;
  message: string;
};

/** `npm run build` in the tier-2 preview runtime after dev. */
export type PreviewProdBuildPayload = {
  verified: boolean;
  logSnippet?: string;
};

export type VersionErrorLogPayload = {
  level: "info" | "warning" | "error";
  category?: string | null;
  message: string;
  meta?: Record<string, unknown> | null;
};

export type SetMessages = (next: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;

export type ChatMessagingParams = {
  chatId: string | null;
  /** When set, follow-up stream sends `meta.engineBaseVersionId` so the server merges from that version. */
  activeVersionId?: string | null;
  setChatId: (id: string | null) => void;
  chatIdParam: string | null;
  router: RouterLike;
  appProjectId?: string | null;
  /** Maps to API `projectId` / legacy `v0ProjectId` in responses. */
  linkedProjectId?: string | null;
  selectedModelTier: ModelTier;
  enableImageGenerations: boolean;
  enableImageMaterialization?: boolean;
  enableThinking: boolean;
  chatPrivacy?: "private" | "unlisted";
  /** Internal Sajtmaskin theme preset used to derive theme colors. */
  designThemePreset?: DesignTheme;
  systemPrompt?: string;
  promptAssistModel?: string | null;
  promptAssistDeep?: boolean;
  promptAssistMode?: "polish" | "rewrite" | null;
  buildIntent?: BuildIntent;
  buildMethod?: BuildMethod | null;
  scaffoldMode?: ScaffoldMode;
  scaffoldId?: string | null;
  themeColors?: ThemeColors | null;
  paletteState?: PaletteState | null;
  pendingBriefRef?: MutableRefObject<Record<string, unknown> | null>;
  mutateVersions: () => void;
  setCurrentPreviewUrl: (url: string | null) => void;
  /** Cleared on `preview-ready`; set on SSE build-error for inline preview UI. */
  setPreviewBuildError?: (payload: PreviewBuildErrorPayload | null) => void;
  setPreviewProdBuild?: (payload: PreviewProdBuildPayload | null) => void;
  setPreviewPending?: (pending: boolean) => void;
  onPreviewRefresh?: () => void;
  onGenerationComplete?: (data: {
    chatId: string;
    versionId?: string;
    previewUrl?: string;
    onlySelectVersionIfWasLatest?: boolean;
  }) => void;
  /** SSE `preview-ready`: bind session id to the current stream version for heartbeat/status. */
  onPreviewSessionMeta?: (meta: { previewSessionId: string; versionId: string | null } | null) => void;
  onLinkedProjectId?: (projectId: string) => void;
  setMessages: SetMessages;
  resetBeforeCreateChat: () => void;
};

export type ChatMessagingReturn = {
  isCreatingChat: boolean;
  createNewChat: (
    initialMessage: string,
    options?: MessageOptions,
    systemPromptOverride?: string,
  ) => Promise<void>;
  sendMessage: (messageText: string, options?: MessageOptions) => Promise<void>;
  cancelActiveGeneration: () => void;
};
