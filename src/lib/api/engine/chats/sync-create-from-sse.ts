import { previewUrlField, readPreviewUrl, resolveInboundPreviewUrl } from "@/lib/api/preview-url-contract";

export type SseEvent = {
  event: string;
  data: unknown;
};

export type SyncLatestVersionPayload = {
  id: string | null;
  versionId: string | null;
  messageId: string | null;
  previewUrl: string | null;
  sandboxUrl: string | null;
  sandboxPending: boolean;
  releaseState: string | null;
  verificationState: string | null;
  verificationSummary: string | null;
  promotedAt: string | null;
};

export function parseSseEvents(payload: string): SseEvent[] {
  return payload
    .split("\n\n")
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split(/\r?\n/);
      const eventLine = lines.find((line) => line.startsWith("event:"));
      const dataLines = lines
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice("data:".length).trim());
      const rawData = dataLines.join("\n");

      let data: unknown = rawData;
      if (rawData) {
        try {
          data = JSON.parse(rawData);
        } catch {
          data = rawData;
        }
      }

      return {
        event: eventLine?.slice("event:".length).trim() ?? "",
        data,
      };
    });
}

function findLastEvent(events: SseEvent[], name: string): SseEvent | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index]?.event === name) return events[index];
  }
  return undefined;
}

export function readSandboxReadyUrl(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const raw = typeof (data as { sandboxUrl?: unknown }).sandboxUrl === "string"
    ? (data as { sandboxUrl: string }).sandboxUrl.trim()
    : "";
  return raw || null;
}

export function buildSyncLatestVersion(params: {
  versionId: string | null;
  messageId: string | null;
  previewResolved: string | null;
  sandboxUrl: string | null;
  sandboxPending: boolean;
  releaseState?: string | null;
  verificationState?: string | null;
  verificationSummary?: string | null;
  promotedAt?: string | null;
}): SyncLatestVersionPayload | null {
  const {
    versionId,
    messageId,
    previewResolved,
    sandboxUrl,
    sandboxPending,
    releaseState = null,
    verificationState = null,
    verificationSummary = null,
    promotedAt = null,
  } = params;
  if (!versionId && !previewResolved && !messageId && !sandboxUrl) return null;
  return {
    id: versionId,
    versionId,
    messageId,
    ...previewUrlField(previewResolved),
    sandboxUrl,
    sandboxPending,
    releaseState,
    verificationState,
    verificationSummary,
    promotedAt,
  };
}

/**
 * Convert create-chat SSE transcript to the JSON shape expected by `useCreateChat` sync fallback.
 */
export function buildSyncCreateChatPayload(events: SseEvent[]): {
  ok: boolean;
  status: number;
  body: Record<string, unknown>;
} {
  const errorEvent = findLastEvent(events, "error");
  const doneEvent = findLastEvent(events, "done");
  const metaEvent = findLastEvent(events, "meta");
  const sandboxReadyEvent = findLastEvent(events, "sandbox-ready");

  if (!doneEvent) {
    const errorData =
      errorEvent?.data && typeof errorEvent.data === "object"
        ? (errorEvent.data as Record<string, unknown>)
        : null;
    const message =
      (typeof errorData?.message === "string" && errorData.message) ||
      "Stream could not resolve a final create payload.";
    return {
      ok: false,
      status: 502,
      body: { error: message, code: typeof errorData?.code === "string" ? errorData.code : null },
    };
  }

  const done = doneEvent.data && typeof doneEvent.data === "object" ? (doneEvent.data as Record<string, unknown>) : {};
  const meta =
    metaEvent?.data && typeof metaEvent.data === "object"
      ? (metaEvent.data as Record<string, unknown>)
      : {};

  const chatId = typeof done.chatId === "string" ? done.chatId : null;
  if (!chatId) {
    return {
      ok: false,
      status: 502,
      body: { error: "Create stream missing chatId in done event." },
    };
  }

  const versionId = typeof done.versionId === "string" ? done.versionId : null;
  const messageId = typeof done.messageId === "string" ? done.messageId : null;
  const sandboxPending = done.sandboxPending === true;

  const sandboxData =
    sandboxReadyEvent?.data && typeof sandboxReadyEvent.data === "object"
      ? (sandboxReadyEvent.data as Record<string, unknown>)
      : null;
  const sandboxUrl = readSandboxReadyUrl(sandboxData);

  const previewResolved =
    readPreviewUrl(done as { previewUrl?: unknown; demoUrl?: unknown }) ??
    resolveInboundPreviewUrl(done as { previewUrl?: unknown; demoUrl?: unknown; sandboxUrl?: unknown }) ??
    sandboxUrl;

  const verificationState = done.verificationBlocked === true ? "failed" : "pending";
  const verificationSummary =
    typeof done.previewBlockingReason === "string" && done.previewBlockingReason.trim()
      ? done.previewBlockingReason.trim()
      : null;

  const promptTokens =
    typeof done.promptTokens === "number"
      ? done.promptTokens
      : typeof done.prompt_tokens === "number"
        ? done.prompt_tokens
        : 0;
  const completionTokens =
    typeof done.completionTokens === "number"
      ? done.completionTokens
      : typeof done.completion_tokens === "number"
        ? done.completion_tokens
        : 0;

  const body: Record<string, unknown> = {
    id: chatId,
    internalChatId: chatId,
    model: typeof meta.modelId === "string" ? meta.modelId : null,
    meta,
    ...previewUrlField(previewResolved),
    sandboxPending,
    preflight: done.preflight,
    previewBlocked: done.previewBlocked,
    verificationBlocked: done.verificationBlocked,
    previewBlockingReason: done.previewBlockingReason,
    awaitingInput: done.awaitingInput === true,
    planArtifact: done.planArtifact,
    planMode: done.planMode,
    reason: typeof done.reason === "string" ? done.reason : null,
    toolCalls: Array.isArray(done.toolCalls) ? done.toolCalls : [],
    latestVersion: buildSyncLatestVersion({
      versionId,
      messageId,
      previewResolved,
      sandboxUrl,
      sandboxPending,
      releaseState: null,
      verificationState,
      verificationSummary,
      promotedAt: null,
    }),
    usage: {
      promptTokens,
      completionTokens,
    },
  };

  return { ok: true, status: 200, body };
}
