/**
 * Chat hook types — shared by both the own engine and v0 fallback.
 */
import type { ChatMessage } from "@/lib/builder/types";
import type { BuildIntent, BuildMethod } from "@/lib/builder/build-intent";
import type { PaletteState } from "@/lib/builder/palette";
import type { PromptSourceMeta } from "@/lib/builder/prompt-builder";
import type { ScaffoldMode } from "@/lib/gen/scaffolds";
import type { OpenClawPreparedPromptSource } from "@/lib/openclaw/prepared-prompt";
import type { ModelTier } from "@/lib/validations/chat-schemas";
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
  /**
   * OpenClaw prepared-prompt fast lane: set by the builder composer when the
   * outgoing message is EXACTLY an OpenClaw `fill_text_field` payload and the
   * user has granted an extra power (OC_EDIT + the chat's button and menu, see
   * `powers.ts`). Forwarded as a top-level
   * `promptSource` field on the follow-up stream request body so the server
   * may skip the redundant delta-brief LLM pass (see `prepared-prompt.ts`).
   * Distinct from `promptSourceMeta.sourceKind` (prompt-builder envelopes).
   */
  promptSource?: OpenClawPreparedPromptSource;
  scaffoldModeOverride?: ScaffoldMode;
  scaffoldIdOverride?: string | null;
  /** Override the follow-up base version instead of using current builder selection. */
  engineBaseVersionIdOverride?: string | null;
  /**
   * F3 wiring: set on the auto-start that follows a successful
   * `/finalize-design` call. Forwarded as `meta.lifecycleStage` so the
   * server can derive the F3 BuildSpec.
   */
  lifecycleStageOverride?: "design" | "integrations";
  /**
   * F3 wiring: id of the F2 version this build is forked from. Forwarded
   * as `meta.parentVersionId` and persisted on the new engine version.
   */
  parentVersionIdOverride?: string | null;
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
  /**
   * User-initiated autofix (e.g. the "Kör autofix" button in Version
   * Diagnostics) rather than an automatic post-check dispatch. Manual triggers
   * bypass the per-chat and per-reason throttles (those exist to stop runaway
   * *automatic* loops, not explicit user clicks) but still respect the
   * in-flight gate and the stale-version / under-repair guards.
   */
  manual?: boolean;
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
  // TODO(after-wave-5): drop after deadline 2026-Q3 if no inbound payloads.
  demoUrl?: string | null;
  createdAt?: string | null;
  versionNumber?: number | null;
  previewPending?: boolean;
  releaseState?: string | null;
  verificationState?: string | null;
  verificationSummary?: string | null;
  /** `"design"` (F2) or `"integrations"` (F3) — from `engine_versions.lifecycle_stage`. */
  lifecycleStage?: string | null;
  /**
   * Provenance from `engine_versions.edit_kind` (`quick_edit`, `imported_repo`,
   * `restore`, or null for normal generated rows). Post-checks read it to
   * mirror the server's imported-repo sanity policy.
   */
  editKind?: string | null;
  hasPendingRepair?: boolean;
  repairAvailableAt?: string | null;
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
  scaffoldLabel?: string | null;
  capabilities?: Record<string, boolean> | null;
  /**
   * Swedish labels for integrations the design round deferred, shown to the
   * user as "Planerad — kopplas in i nästa steg" so a named service the round
   * did not wire in is visible instead of silently dropped.
   */
  mutedCapabilityLabels?: string[] | null;
  /**
   * Dossier capabilities with real file evidence in the version. Contract rows
   * below are a PROPOSAL; without evidence they render as planned.
   */
  fileEvidenceCapabilities?: string[] | null;
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
  /**
   * 5-2 stale-base gate: the version the client currently believes is newest
   * for this chat (`derived.latestVersionId`). useSendMessage forwards it as
   * `meta.engineLatestKnownVersionId` on regular follow-ups so the server can
   * 409 when a newer version exists. Distinct from `activeVersionId`, which may
   * point at a deliberately-selected older version.
   */
  latestKnownVersionId?: string | null;
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
  /**
   * Persist Byggval's Hemsida/App into builder state so follow-ups keep the
   * same intent (URL/default alone would flip e.g. auth-pages back to website).
   */
  setBuildIntent?: (intent: BuildIntent) => void;
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
  /**
   * Preferred preview handoff: applies `decidePreviewHandoff` (set URL OR
   * bump refresh token, never both) with a shared per-`versionId:url` dedup
   * latch owned by the builder controller, so preview-ready → done →
   * bootstrap chains reload the iframe at most once. Falls back to
   * `setCurrentPreviewUrl` alone when absent (tests).
   */
  applyPreviewHandoff?: (params: {
    url: string | null | undefined;
    versionId?: string | null;
    force?: boolean;
  }) => void;
  /**
   * Område 6-3 punkt 1: bumped when the post-generation check flow
   * completes, so `useVersionStatus` does a guaranteed final read after a
   * late `version.degraded` from `/product-postcheck`. Stable callback.
   */
  onVersionStatusRefresh?: () => void;
  /** Select and refresh a deterministic exact-file F3 fork after ReleaseGate settles. */
  onDeterministicF3Settled?: (payload: {
    versionId: string;
    selectVersion: boolean;
  }) => void;
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

/**
 * Why the server refused the turn WITHOUT consuming the prompt. Every one of
 * these is already surfaced to the user by `useSendMessage` itself (toast +
 * assistant message); the reason exists so a PROGRAMMATIC sender can be precise
 * about its own surface too (a card that says "Skickat" for a rejected send is a
 * lie), and so the composer knows the draft is still worth keeping.
 *
 * - `empty_message` — nothing to send.
 * - `create_chat_failed` — no chat existed and creating one failed.
 * - `stale_base_version` — server head moved past the base this request was
 *   built on, and the single auto-rebase retry did not resolve it (409).
 * - `tier3_env_not_ready` — F3 needs real build keys first. Reported both by a
 *   direct 412 and by the nested finalize round's `missing_env` verdict.
 * - `f3_build_required` — the nested finalize round found that the F3 spec needs
 *   a normal integration build, which the user starts from the preview panel.
 */
export type SendMessageRejectionReason =
  | "empty_message"
  | "create_chat_failed"
  | "stale_base_version"
  | "tier3_env_not_ready"
  | "f3_build_required";

/**
 * Outcome contract for `sendMessage` (BB#shadcn-lane1). The hook handles every
 * failure path itself and resolves rather than rejecting, so before this
 * contract a caller could not tell "generation started" from "rejected but
 * handled" — programmatic senders (insert cards, dossier catalog, composer
 * fallback) were forced into neutral copy.
 *
 * Two axes matter to callers and they do not coincide:
 *  - did a GENERATION run (`started`)? An insert card may only say "Skickat"
 *    for that.
 *  - was the PROMPT consumed? Only `rejected` means no — and `turnRecorded`
 *    then says whether the server nevertheless wrote the turn down, which is
 *    what decides where the prompt lives.
 *
 * `settled` is the case where those differ: the server turned the turn into a
 * deterministic F3 ReleaseGate round on the parent version, so the prompt was
 * consumed (and may well have succeeded — `useSendMessage` reports the verdict)
 * but no new generation ran. Only that verdict is `settled`; the same nested
 * round can also come back needing build keys or a normal integration build,
 * and those are rejections because nothing was built.
 *
 * `started` means the request was accepted and the turn ran; per-turn success is
 * reported by the chat/version status UI, not here.
 */
export type SendMessageOutcome =
  | { status: "started"; via: "stream" | "messages_fallback" | "new_chat" }
  | { status: "settled"; as: "f3_deterministic_release" }
  | {
      status: "rejected";
      reason: SendMessageRejectionReason;
      /**
       * Whether the server wrote this turn down before refusing it. It decides
       * where the prompt lives, so that it lives in exactly ONE place:
       *
       * - `false` — nothing was persisted (the stale-base and tier-3 gates both
       *   return ahead of `addMessage`), so `useSendMessage` removes the
       *   optimistic user row and the caller KEEPS its draft. The user retries
       *   from the composer with attachments intact.
       * - `true` — the turn is in the thread (the F3 approve-continuation
       *   backstop persists the user row before returning its 409), so the
       *   bubble stays and the caller CLEARS its draft. Hiding a persisted row
       *   would reappear on reload; keeping both copies invites a duplicate
       *   turn. Both failure modes were reported on #610.
       */
      turnRecorded: boolean;
    }
  | { status: "aborted"; by: "client" | "server" }
  | { status: "failed"; message: string };

export type ChatMessagingReturn = {
  isCreatingChat: boolean;
  createNewChat: (
    initialMessage: string,
    options?: MessageOptions,
    systemPromptOverride?: string,
  ) => Promise<boolean>;
  sendMessage: (
    messageText: string,
    options?: MessageOptions,
  ) => Promise<SendMessageOutcome>;
  cancelActiveGeneration: () => void;
};
