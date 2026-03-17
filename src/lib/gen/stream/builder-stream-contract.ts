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
export type BuilderIntegrationPayload = Array<Record<string, unknown>>;
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
