import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { MessageList } from "./MessageList";
import { handleSseStream, type StreamContext } from "@/lib/hooks/chat/stream-handlers";
import { useVersionStatus } from "@/lib/hooks/chat/useVersionStatus";
import { selectVersionStatus } from "@/lib/logging/event-bus-projection";
import { mapVersionStatusToDisplay } from "@/lib/builder/version-status-display";
import { decidePostBuildDigest } from "@/lib/openclaw/post-build-digest";
import type { ChatMessage } from "@/lib/builder/types";

vi.mock("streamdown", () => ({ Streamdown: ({ children }: { children?: ReactNode }) => <div>{children}</div> }));
vi.mock("@streamdown/code", () => ({ code: () => null }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), warning: vi.fn(), error: vi.fn(), message: vi.fn() }) }));
vi.mock("@/lib/utils/debug", () => ({ debugLog: vi.fn(), warnLog: vi.fn() }));

const encode = (event: string, data: Record<string, unknown>) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const done = encode("done", { chatId: "chat_status", versionId: "v1", previewPending: true });
const preview = encode("progress", { step: "preview", phase: "starting" });
const canonical = selectVersionStatus([{ t: "version.verifier.done", chatId: "chat_status", versionId: "v1", runId: "run_status", outcome: "passed", blocked: false } as never]);

function storeAndContext() {
  let messages: ChatMessage[] = [{ id: "a1", role: "assistant", content: '```tsx file="app/page.tsx"\nexport default function Page(){return null;}\n```', isStreaming: true, uiParts: [] }];
  const ctx: StreamContext = {
    streamType: "send", assistantMessageId: "a1", selectedModelTier: "gpt-5.4", chatId: "chat_status",
    setMessages: (next) => { messages = typeof next === "function" ? next(messages) : next; },
    touchStreamSafetyTimer: vi.fn(), setCurrentPreviewUrl: vi.fn(), setPreviewPending: vi.fn(),
    onGenerationComplete: vi.fn(), mutateVersions: vi.fn(), promptAssistModel: null, promptAssistDeep: false,
  };
  return { ctx, messages: () => messages };
}

function Harness({ messages, refreshNonce }: { messages: ChatMessage[]; refreshNonce: number }) {
  const { status, identity } = useVersionStatus({ chatId: "chat_status", versionId: "v1", pollIntervalMs: 0, refreshNonce });
  const display = mapVersionStatusToDisplay(status, { isLatest: true });
  const digest = decidePostBuildDigest({ next: { chatId: "chat_status", activeVersionId: "v1", versionStatus: display.status,
    versionIsLatest: true, isStreaming: false }, enabled: true, agentStreaming: false, continuationActive: false,
    lastDigestVersionId: null, streamedSinceLastDigest: true, versionIdAtStreamStart: "v0" });
  return <><output data-testid="digest">{digest.kind}</output><MessageList chatId="chat_status" versionId="v1" messages={messages}
    canonicalVersionStatus={identity ? { ...identity, status: display.status, isLatest: true } : null} /></>;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("SM-132 real SSE and canonical card status", () => {
  it.each(["eof", "abort"])("keeps %s pending until a matching ready verdict arrives, then agrees with digest", async (ending) => {
    const store = storeAndContext();
    const abort = new AbortController();
    let transport: ReadableStreamDefaultController<Uint8Array> | undefined;
    const response = ending === "eof" ? new Response(done + preview)
      : new Response(new ReadableStream({ start(controller) { transport = controller; controller.enqueue(new TextEncoder().encode(done + preview)); } }));
    const completion = handleSseStream(response, store.ctx, abort.signal).catch((error) => error);
    if (ending === "abort") {
      await waitFor(() => expect(store.messages()[0].uiParts?.some((part) => part.type === "tool:engine-preview")).toBe(true));
      abort.abort();
      transport!.error(new DOMException("Request aborted", "AbortError"));
    }
    await completion;
    expect(store.messages()[0].isStreaming).toBe(false);
    let resolveStatus!: (response: Response) => void;
    const fetchMock = vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveStatus = resolve; }))
      .mockImplementation(async () => new Response(JSON.stringify({ ok: true, versionId: "v1", status: canonical })));
    vi.stubGlobal("fetch", fetchMock);
    const rendered = render(<Harness messages={store.messages()} refreshNonce={0} />);
    expect(screen.getByTestId("generation-surface").getAttribute("data-active")).toBe("true");
    expect(screen.getByText("Arbetar med din sajt")).toBeTruthy();
    await act(async () => { resolveStatus(new Response(JSON.stringify({ ok: true, versionId: "v1", status: canonical }))); });
    await waitFor(() => expect(screen.getByTestId("generation-surface").getAttribute("data-active")).toBe("false"));
    expect(screen.getByTestId("digest").textContent).toBe("digest");
    expect(screen.queryByText("Arbetar med din sajt")).toBeNull();
    expect(screen.queryByText("Live-preview klar")).toBeNull();
    rendered.rerender(<Harness messages={store.messages()} refreshNonce={1} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("generation-surface").getAttribute("data-active")).toBe("false");
  });

  it("binds preview progress received before done without treating done as ready", async () => {
    const store = storeAndContext();
    await handleSseStream(new Response(preview + done), store.ctx, new AbortController().signal);
    const part = store.messages()[0].uiParts?.find((candidate) => candidate.type === "tool:engine-preview");
    expect(part).toMatchObject({ state: "input-streaming", output: { chatId: "chat_status", versionId: "v1", assistantMessageId: "a1" } });
  });

  it.each(["verifying", "failed", "blocked", "degraded"] as const)("renders the canonical %s outcome honestly", async (status) => {
    const store = storeAndContext();
    await handleSseStream(new Response(done + preview), store.ctx, new AbortController().signal);
    render(<MessageList chatId="chat_status" versionId="v1" messages={store.messages()}
      canonicalVersionStatus={{ chatId: "chat_status", versionId: "v1", status, isLatest: true }} />);
    expect(screen.getByTestId("generation-surface").getAttribute("data-active")).toBe(status === "verifying" ? "true" : "false");
    expect(screen.getByTestId("generation-surface").getAttribute("data-attention")).toBe(status === "verifying" ? "false" : "true");
    expect(screen.queryByText("Live-preview klar")).toBeNull();
  });
});
