import type {
  PreviewBuildErrorPayload,
  PreviewProdBuildPayload,
  SetMessages,
  StreamDebugStats,
  StreamQualitySignal,
} from "./types";

export type StreamContext = {
  streamType: "create" | "send";
  assistantMessageId: string;
  selectedModelTier: string;
  chatId: string | null;
  setMessages: SetMessages;
  touchStreamSafetyTimer: () => void;

  setChatId?: (id: string | null) => void;
  chatIdParam?: string | null;
  buildBuilderParams?: (entries: Record<string, string | null | undefined>) => URLSearchParams;
  router?: { replace: (href: string) => void };
  appProjectId?: string | null;
  pendingCreateKeyRef?: React.MutableRefObject<string | null>;
  onLinkedProjectId?: (projectId: string) => void;

  setCurrentPreviewUrl: (url: string | null) => void;
  setPreviewBuildError?: (payload: PreviewBuildErrorPayload | null) => void;
  setPreviewProdBuild?: (payload: PreviewProdBuildPayload | null) => void;
  setPreviewPending?: (pending: boolean) => void;
  /** See `ChatMessagingParams.applyPreviewHandoff` — dedup'd URL-or-bump handoff. */
  applyPreviewHandoff?: (params: {
    url: string | null | undefined;
    versionId?: string | null;
    force?: boolean;
  }) => void;
  /** Refresh the read-only status projection after generation. */
  onVersionStatusRefresh?: () => void;
  onGenerationComplete?: (data: {
    chatId: string;
    versionId?: string;
    previewUrl?: string;
    onlySelectVersionIfWasLatest?: boolean;
  }) => void;
  /** Own-engine preview session metadata (SSE `preview-ready`). */
  onPreviewSessionMeta?: (meta: {
    previewSessionId: string;
    versionId: string | null;
    lifecycleToken?: string | null;
  } | null) => void;
  mutateVersions: () => void;
  promptAssistModel?: string | null;
  promptAssistDeep?: boolean;
  /**
   * True when this create-stream actually attached a client brief
   * (`pendingBriefRef` / `meta.brief`). Server `meta.briefApplied` is the
   * other init-turn signal (auto-brief). Follow-ups leave this unset.
   */
  briefUsedThisTurn?: boolean;
  /**
   * Client Deep Brief payload snapshotted when the create-request was built.
   * Used as fallback when SSE meta lacks reasoning/ritning (older servers).
   */
  initBrief?: Record<string, unknown> | null;
};

export type StreamHandlerResult = {
  streamQuality: StreamQualitySignal;
  chatIdFromStream: string | null;
  /**
   * True när done-eventet bar en riktig artefakt (version, preview,
   * plan-artefakt eller awaiting-input). False vid tomma/failade
   * generationer. Byggval-reset styrs separat via `versionIdFromStream` —
   * plan/klargörande får behålla valen tills första riktiga versionen.
   */
  hasRecoveredArtifact: boolean;
  /** Version id from the done event when a real build landed; otherwise null. */
  versionIdFromStream: string | null;
};

/** Mutable per-stream run state shared across event handlers. */
export type StreamRunState = {
  chatIdFromStream: string | null;
  versionIdFromStream: string | null;
  recoveredArtifactSignal: boolean;
  linkedProjectIdFromStream: string | null;
  accumulatedThinking: string;
  accumulatedContent: string;
  didReceiveDone: boolean;
  generationProgressStarted: boolean;
  generationDoneProgressReceived: boolean;
  pendingStreamErrorMessage: string | null;
  streamStats: StreamDebugStats;
};
