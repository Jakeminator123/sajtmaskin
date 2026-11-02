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
  it("a new scoped order revokes older grants without denying its own explicit build consent", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply("Nytt förslag")));
    useOpenClawStore.setState({ armedMandate: { mode: "followups", remaining: 2, createdAt: 1, reason: "Old order" },
      messages: [{ id: "old-order", role: "user", content: "Byt alla färger", timestamp: 1, allowBuild: true }] });
    const { result } = renderHook(() => useOpenClawChat());
    await act(async () => { await result.current.send("Byt rubriken till Välkommen, ändra inget annat", { allowBuild: true }); });
    const users = useOpenClawStore.getState().messages.filter(message => message.role === "user");
    expect(users[0].allowBuild).toBe(false);
    expect(users[1].allowBuild).toBe(true);
    expect(useOpenClawStore.getState().armedMandate).toBeNull();
    expect(useOpenClawStore.getState().armedContinuation).toBeNull();
  });

  it.each([
    ["Byt rubriken till Välkommen", true, true],
    ["Byt rubriken till Välkommen", undefined, false],
    ["Vad tycker du om sidan?", true, false],
    ["Ändra ingenting. Ge bara råd.", true, false],
  ] as const)("records defensive per-turn build consent for %s", async (text, allowBuild, expected) => {
    vi.stubGlobal("fetch", vi.fn(async () => reply("Ett råd")));
    const { result } = renderHook(() => useOpenClawChat());
    await act(async () => { await result.current.send(text, { allowBuild }); });
    expect(useOpenClawStore.getState().messages.find(message => message.role === "user")?.allowBuild).toBe(expected);
  });

  it("keeps selected proposal context with the user request without changing its displayed text", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => reply("Ett komplett förslag"));
    vi.stubGlobal("fetch", fetchMock);
    const priorAdvice = "1. Behåll färgerna\n2. Byt CTA till Boka rum\n3. Behåll sidfoten";
    useOpenClawStore.setState({ messages: [{ id: "advice", role: "assistant", content: priorAdvice, timestamp: 1 }] });
    const { result } = renderHook(() => useOpenClawChat());
    await act(async () => { await result.current.send("Gör punkt två", { allowBuild: false, proposalReference: {
      agentMessageId: "advice", selectedPart: "2", instruction: "Byt CTA till Boka rum",
      builderTarget: { chatId: "chat_a", versionId: "v1" },
    } }); });
    const payload = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(payload.messages[0].content).toBe(priorAdvice);
    expect(payload.messages.at(-1).content).toContain('"agentMessageId":"advice"');
    expect(payload.messages.at(-1).content).toContain('"instruction":"Byt CTA till Boka rum"');
    expect(payload.messages.at(-1)).not.toHaveProperty("allowBuild");
    expect(useOpenClawStore.getState().messages.find(message => message.role === "user")?.content).toBe("Gör punkt två");
    expect(useOpenClawStore.getState().messages.find(message => message.role === "user")?.allowBuild).toBe(false);
  });

  it.each([200, 503])("reports accepted dispatch only for a successful response: HTTP %i", async status => {
    vi.stubGlobal("fetch", vi.fn(async () => status === 200 ? reply("Svar") : new Response("unavailable", { status })));
    const accepted = vi.fn();
    const { result } = renderHook(() => useOpenClawChat());
    await act(async () => { await result.current.send("Vad tycker du?", { onDispatchAccepted: accepted }); });
    expect(accepted).toHaveBeenCalledTimes(status === 200 ? 1 : 0);
  });

  it("an explicit Fråga turn revokes old consent and cannot re-arm itself", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply("Råd")));
    useOpenClawStore.setState({ editEnabled: true, powersOn: true, grantedPowers: ["armed_autonomy"],
      armedMandate: { mode: "followups", remaining: 2, createdAt: 1, reason: "Old order" },
      messages: [{ id: "old-order", role: "user", content: "Byt rubriken", timestamp: 1, allowBuild: true }] });
    const { result } = renderHook(() => useOpenClawChat());
    await act(async () => { await result.current.send("gör 3 follow-ups och buggranska", { allowBuild: false, restrictBuild: true }); });
    expect(useOpenClawStore.getState().armedMandate).toBeNull();
    expect(useOpenClawStore.getState().armedContinuation).toBeNull();
    expect(useOpenClawStore.getState().messages[0].allowBuild).toBe(false);
  });

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
