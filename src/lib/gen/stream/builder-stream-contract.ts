/**
 * Builder Stream Contract
 *
 * This module defines the typed SSE event contract consumed by the builder UI.
 * Both own-engine and v0-fallback providers must translate their output into
 * these event shapes before the response reaches the client.
 *
 * Lifecycle of a normal generation stream:
 *   chatId -> meta -> (thinking | content | tool-call | progress | ping)* -> done
 *
 * Error path:
 *   chatId? -> meta? -> error
 *
 * Awaiting-input path (clarification / plan blockers):
 *   chatId -> meta? -> tool-call(askClarifyingQuestion) -> content -> done(awaitingInput: true, awaitingInputPrompt?: string)
 *
 * Provider adapters live under `src/lib/providers/` and are responsible for
 * mapping provider-specific output into `BuilderStreamEvent` before the route
 * handler enqueues it. Route handlers should ideally be thin dispatchers that
 * select a provider and pipe its output through this contract.
 */

export type BuilderMetaPayload = Record<string, unknown>;
export type BuilderDonePayload = Record<string, unknown>;
export type BuilderErrorPayload = { message: string } & Record<string, unknown>;
export type BuilderToolCallPayload = {
  toolName: string;
  toolCallId?: string;
  args?: Record<string, unknown>;
} & Record<string, unknown>;
export type BuilderProgressPayload = Record<string, unknown>;
export type BuilderPingPayload = { ts: number } & Record<string, unknown>;
export type BuilderUiPartsPayload = Array<Record<string, unknown>>;

/** One row inside `integration` SSE `items` (tool suggestions + post-finalize detection). */
export type BuilderIntegrationItemPayload = {
  key?: string;
  name?: string;
  provider?: string;
  intent?: "install" | "connect" | "configure" | "env_vars";
  envVars?: string[];
  status?: string;
  reason?: string;
  setupHint?: string;
  setupGuide?: string;
  marketplaceUrl?: string;
  sourceEvent?: string;
};

/**
 * Own-engine `integration` SSE data. Server emits `{ items: [...] }`; a bare array
 * is still accepted when coercing legacy or proxied payloads.
 */
export type BuilderIntegrationEnvelope = { items: BuilderIntegrationItemPayload[] };
export type BuilderIntegrationPayload =
  | BuilderIntegrationEnvelope
  | BuilderIntegrationItemPayload[];
export type BuilderChatIdPayload = { id?: string; chatId?: string } | string;
export type BuilderProjectIdPayload =
  | { v0ProjectId?: string; v0_project_id?: string }
  | string;
export type BuilderTextPayload =
  | string
  | {
      text?: string;
      content?: string;
      delta?: string;
      thinking?: string;
      reasoning?: string;
    };

export type BuilderPreviewMode = "dev_only" | "build_only" | "dev_then_build";

export type BuilderPreviewReadyPayload = {
  /** Empty when `previewMode` is `build_only` without a dev URL. */
  previewUrl: string;
  previewSessionId: string;
  previewMode?: BuilderPreviewMode;
  /** 2 = dev preview path without prod build step; 3 = build step ran during preview start. */
  previewTier?: 2 | 3;
  /** Present when preview start ran `npm run build` (after dev or `build_only`). */
  prodBuildVerified?: boolean;
  prodBuildLogSnippet?: string;
};

export type BuilderBuildErrorPayload = {
  stage: "repair" | "preview-start" | "install" | "build";
  message: string;
  raw?: string;
};

export interface BuilderStreamEventMap {
  meta: BuilderMetaPayload;
  thinking: BuilderTextPayload;
  content: BuilderTextPayload;
  parts: BuilderUiPartsPayload;
  integration: BuilderIntegrationPayload;
  "tool-call": BuilderToolCallPayload;
  progress: BuilderProgressPayload;
  ping: BuilderPingPayload;
  chatId: BuilderChatIdPayload;
  projectId: BuilderProjectIdPayload;
  "preview-ready": BuilderPreviewReadyPayload;
  "build-error": BuilderBuildErrorPayload;
  done: BuilderDonePayload;
  error: BuilderErrorPayload;
}

export type BuilderStreamEventName = keyof BuilderStreamEventMap;

export type BuilderStreamEvent<TEvent extends BuilderStreamEventName = BuilderStreamEventName> = {
  event: TEvent;
  data: BuilderStreamEventMap[TEvent];
};

const BUILDER_STREAM_EVENT_NAMES = new Set<BuilderStreamEventName>([
  "meta",
  "thinking",
  "content",
  "parts",
  "integration",
  "tool-call",
  "progress",
  "ping",
  "chatId",
  "projectId",
  "preview-ready",
  "build-error",
  "done",
  "error",
]);

export function isBuilderStreamEventName(value: string): value is BuilderStreamEventName {
  return BUILDER_STREAM_EVENT_NAMES.has(value as BuilderStreamEventName);
}

export function createBuilderStreamEvent<TEvent extends BuilderStreamEventName>(
  event: TEvent,
  data: BuilderStreamEventMap[TEvent],
): BuilderStreamEvent<TEvent> {
  return { event, data };
}
