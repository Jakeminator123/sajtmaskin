import { NextResponse } from "next/server";
import { handleMessageStreamRequest } from "../stream/route";

type SseEvent = {
  event: string;
  data: unknown;
};

type DonePayload = {
  chatId?: string | null;
  messageId?: string | null;
  versionId?: string | null;
  demoUrl?: string | null;
  awaitingInput?: boolean;
  reason?: string | null;
  toolCalls?: unknown;
  planArtifact?: unknown;
};

type AwaitingInputPrompt = {
  question: string;
  options?: string[];
  kind?: string | null;
};

function parseSseEvents(payload: string): SseEvent[] {
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

function extractContentChunk(data: unknown): string {
  if (typeof data === "string") return data;
  if (data && typeof data === "object" && typeof (data as { text?: unknown }).text === "string") {
    return (data as { text: string }).text;
  }
  return "";
}

function findLastEvent(events: SseEvent[], name: string): SseEvent | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index]?.event === name) return events[index];
  }
  return undefined;
}

function coerceStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function extractAwaitingInputPrompt(events: SseEvent[], done: DonePayload): AwaitingInputPrompt | null {
  const planArtifact =
    done.planArtifact && typeof done.planArtifact === "object"
      ? (done.planArtifact as Record<string, unknown>)
      : null;
  const blockers = Array.isArray(planArtifact?.blockers)
    ? (planArtifact?.blockers as Array<Record<string, unknown>>)
    : [];
  if (blockers.length > 0) {
    const questions = blockers
      .map((blocker) =>
        typeof blocker.question === "string" ? blocker.question.trim() : "",
      )
      .filter(Boolean);
    const options = blockers.flatMap((blocker) => coerceStringArray(blocker.options));
    return {
      question:
        questions.join("\n") || "Planen kräver dina svar för att kunna fortsätta.",
      options: options.length > 0 ? options : undefined,
      kind: "plan",
    };
  }

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.event !== "tool-call" || !event.data || typeof event.data !== "object") continue;
    const data = event.data as Record<string, unknown>;
    if (data.toolName !== "askClarifyingQuestion") continue;
    const args =
      data.args && typeof data.args === "object"
        ? (data.args as Record<string, unknown>)
        : null;
    const question = typeof args?.question === "string" ? args.question.trim() : "";
    if (!question) continue;
    const options = coerceStringArray(args?.options);
    return {
      question,
      options: options.length > 0 ? options : undefined,
      kind: typeof args?.kind === "string" ? args.kind : null,
    };
  }

  return null;
}

function buildSyncPayload(chatId: string, events: SseEvent[]) {
  const content = events
    .filter((event) => event.event === "content")
    .map((event) => extractContentChunk(event.data))
    .join("");

  const doneEvent = findLastEvent(events, "done");
  const errorEvent = findLastEvent(events, "error");

  if (!doneEvent) {
    const errorData =
      errorEvent?.data && typeof errorEvent.data === "object"
        ? (errorEvent.data as Record<string, unknown>)
        : null;
    const message =
      (typeof errorData?.message === "string" && errorData.message) ||
      "Stream fallback could not resolve a final message payload.";
    return {
      ok: false as const,
      status: 502,
      body: { error: message, code: typeof errorData?.code === "string" ? errorData.code : null },
    };
  }

  const done =
    doneEvent.data && typeof doneEvent.data === "object"
      ? (doneEvent.data as DonePayload)
      : {};
  const versionId = typeof done.versionId === "string" ? done.versionId : null;
  const demoUrl = typeof done.demoUrl === "string" ? done.demoUrl : null;
  const messageId = typeof done.messageId === "string" ? done.messageId : null;
  const assistantText = content || null;
  const awaitingInputPrompt =
    done.awaitingInput === true ? extractAwaitingInputPrompt(events, done) : null;

  return {
    ok: true as const,
    status: 200,
    body: {
      chatId: typeof done.chatId === "string" ? done.chatId : chatId,
      messageId,
      versionId,
      demoUrl,
      text: assistantText,
      message: assistantText,
      awaitingInput: done.awaitingInput === true,
      awaitingInputPrompt,
      reason: typeof done.reason === "string" ? done.reason : null,
      toolCalls: Array.isArray(done.toolCalls) ? done.toolCalls : [],
      latestVersion:
        versionId || demoUrl || messageId
          ? {
              id: versionId,
              versionId,
              demoUrl,
              messageId,
            }
          : null,
    },
  };
}

export async function POST(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  const streamResponse = await handleMessageStreamRequest(req, ctx, { skipRateLimit: true });
  const contentType = streamResponse.headers.get("content-type") || "";

  if (!contentType.includes("text/event-stream")) {
    return streamResponse;
  }

  const { chatId } = await ctx.params;
  const transcript = await streamResponse.text();
  const result = buildSyncPayload(chatId, parseSseEvents(transcript));
  const response = NextResponse.json(result.body, { status: result.status });
  const setCookie = streamResponse.headers.get("Set-Cookie");
  if (setCookie) {
    response.headers.set("Set-Cookie", setCookie);
  }
  return response;
}
