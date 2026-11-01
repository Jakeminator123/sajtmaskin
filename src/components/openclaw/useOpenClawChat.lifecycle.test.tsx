import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOpenClawStore } from "@/lib/openclaw/openclaw-store";
import { useOpenClawChat } from "./useOpenClawChat";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function reply(text: string) {
  return new Response(
    `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`,
    {
      headers: { "Content-Type": "text/event-stream" },
    },
  );
}

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  useOpenClawStore.setState({
    scopeKey: "/builder::builder::chat_a",
    messages: [],
    isStreaming: false,
    armedMandate: null,
    armedContinuation: null,
    campaignScript: null,
    editEnabled: false,
    powersOn: false,
    grantedPowers: [],
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete window.__SITEMASKIN_CONTEXT;
});

describe("useOpenClawChat — turn ownership", () => {
  it("a late response from the previous chat cannot unlock or cancel the new turn", async () => {
    const oldResponse = deferred<Response>();
    const newResponse = deferred<Response>();
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(oldResponse.promise)
      .mockReturnValueOnce(newResponse.promise);
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useOpenClawChat());
    let oldSend!: Promise<void>;
    let newSend!: Promise<void>;
    act(() => {
      oldSend = result.current.send("Fråga i A");
    });
    const oldSignal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    act(() => {
      useOpenClawStore.getState().setScope("/builder::builder::chat_b");
    });
    expect(oldSignal.aborted).toBe(true);
    act(() => {
      newSend = result.current.send("Fråga i B");
    });
    const newSignal = fetchMock.mock.calls[1][1].signal as AbortSignal;

    await act(async () => {
      oldResponse.resolve(reply("Sent svar från A"));
      await oldSend;
    });
    expect(useOpenClawStore.getState().isStreaming).toBe(true);
    expect(useOpenClawStore.getState().messages.map((m) => m.content)).toEqual([
      "Fråga i B",
      "",
    ]);
    act(() => {
      result.current.stop();
    });
    expect(newSignal.aborted).toBe(true);
    await act(async () => {
      newResponse.resolve(reply("Avbrutet svar från B"));
      await newSend;
    });
  });

  it("stop releases the composer immediately and a late response cannot write into the cancelled turn", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => pending.promise),
    );
    const { result } = renderHook(() => useOpenClawChat());
    let send!: Promise<void>;
    act(() => {
      send = result.current.send("En fråga");
    });
    act(() => {
      result.current.stop();
    });
    expect(useOpenClawStore.getState().isStreaming).toBe(false);
    await act(async () => {
      pending.resolve(reply("För sent"));
      await send;
    });
    expect(useOpenClawStore.getState().messages.at(-1)?.content).not.toBe(
      "För sent",
    );
  });

  it("unmount aborts the owned request and leaves the next surface usable", async () => {
    const pending = deferred<Response>();
    const fetchMock = vi.fn(() => pending.promise);
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useOpenClawChat());
    let send!: Promise<void>;
    act(() => {
      send = result.current.send("En fråga");
    });
    const signal = (
      fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    )[1].signal!;
    unmount();
    expect(signal.aborted).toBe(true);
    expect(useOpenClawStore.getState().isStreaming).toBe(false);
    await act(async () => {
      pending.resolve(reply("För sent"));
      await send;
    });
  });

  it("clearing and sending again in the same scope keeps the new request owned", async () => {
    const oldResponse = deferred<Response>();
    const newResponse = deferred<Response>();
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(oldResponse.promise)
      .mockReturnValueOnce(newResponse.promise);
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useOpenClawChat());
    let oldSend!: Promise<void>;
    let newSend!: Promise<void>;
    act(() => {
      oldSend = result.current.send("Gammal fråga");
    });
    act(() => {
      result.current.clearConversation();
    });
    act(() => {
      newSend = result.current.send("Ny fråga");
    });
    await act(async () => {
      oldResponse.resolve(new Response("unavailable", { status: 503 }));
      await oldSend;
    });
    expect(useOpenClawStore.getState().isStreaming).toBe(true);
    act(() => {
      result.current.stop();
    });
    expect(fetchMock.mock.calls[1][1].signal.aborted).toBe(true);
    await act(async () => {
      newResponse.resolve(reply("Svar"));
      await newSend;
    });
  });
});
