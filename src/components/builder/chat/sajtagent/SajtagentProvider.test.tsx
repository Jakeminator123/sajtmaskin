import { render, waitFor } from "@testing-library/react";
import { act, StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOpenClawStore } from "@/lib/openclaw/openclaw-store";
import { OPENCLAW_SURFACE_BODY_ATTR } from "@/lib/openclaw/surface-flag";
import { resetAgentHistoryForTests } from "@/lib/openclaw/agent-history";
import { SajtagentProvider, useSajtagent } from "./SajtagentProvider";

const fetchMock = vi.fn();

function Probe({ onValue }: { onValue: (available: boolean) => void }) {
  const value = useSajtagent();
  onValue(Boolean(value?.available));
  return null;
}

type ProviderProps = {
  chatId: string | null;
  activeVersionId: string | null;
  activeVersionStatus: string | null;
  isAnyStreaming: boolean;
  digestEnabled: boolean;
};

function renderProvider(
  chatId: string | null = "chat_1",
  overrides: Partial<ProviderProps> = {},
) {
  const seen: boolean[] = [];
  const build = (props: ProviderProps) => (
    <SajtagentProvider
      chatId={props.chatId}
      activeVersionId={props.activeVersionId}
      activeVersionStatus={props.activeVersionStatus}
      activeVersionIsLatest
      isAnyStreaming={props.isAnyStreaming}
      digestEnabled={props.digestEnabled}
    >
      <Probe onValue={(available) => seen.push(available)} />
    </SajtagentProvider>
  );
  const initial: ProviderProps = {
    chatId,
    activeVersionId: "v1",
    activeVersionStatus: null,
    isAnyStreaming: false,
    digestEnabled: false,
    ...overrides,
  };
  const utils = render(build(initial));
  return {
    ...utils,
    seen,
    rerenderWith: (next: Partial<ProviderProps>) =>
      utils.rerender(build({ ...initial, ...next })),
  };
}

function healthOkFetch(chatCalls: string[]) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/openclaw/health")) {
      return new Response(
        JSON.stringify({ status: "ok", readiness: "ready", surfaceEnabled: true, editEnabled: false, debugEnabled: false }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.includes("/agent-messages")) {
      return new Response(JSON.stringify({ messages: [] }), { status: 200 });
    }
    if (url === "/api/openclaw/chat") {
      chatCalls.push(String(init?.body ?? ""));
      return new Response("", { status: 503 });
    }
    return new Response("{}", { status: 200 });
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  document.body.removeAttribute(OPENCLAW_SURFACE_BODY_ATTR);
  resetAgentHistoryForTests();
  act(() => {
    useOpenClawStore.setState({
      messages: [],
      isStreaming: false,
      editEnabled: false,
      debugEnabled: false,
      powersOn: false,
      grantedPowers: [],
      armedMandate: null,
      armedContinuation: null,
      // Root-layoutens OpenClawChat har redan satt scopen till chatten.
      scopeKey: "/builder::builder::chat_1",
    });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SajtagentProvider — anrop bara när ytan finns", () => {
  it("cancels StrictMode's discarded check and aborts the live request plus timers on unmount", async () => {
    vi.useFakeTimers();
    try {
      document.body.setAttribute(OPENCLAW_SURFACE_BODY_ATTR, "1");
      fetchMock.mockImplementation(() => new Promise(() => {}));
      const view = render(<StrictMode>
        <SajtagentProvider chatId="chat_1" activeVersionId="v1" activeVersionStatus={null}
          activeVersionIsLatest isAnyStreaming={false} digestEnabled={false}>
          <Probe onValue={() => {}} />
        </SajtagentProvider>
      </StrictMode>);
      await act(async () => { await Promise.resolve(); });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
      expect(signal.aborted).toBe(false);
      view.unmount();
      expect(signal.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
      await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    [502, "unhealthy", "auth_failed"],
    [200, "unhealthy", "ready"],
    [200, "ok", "auth_failed"],
  ])("does not grant availability or edit powers for HTTP %i %s/%s", async (status, state, readiness) => {
    document.body.setAttribute(OPENCLAW_SURFACE_BODY_ATTR, "1");
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      surfaceEnabled: true, status: state, readiness, editEnabled: true, debugEnabled: true,
    }), { status }));
    const view = renderProvider();
    await act(async () => { await Promise.resolve(); });
    expect(view.seen.at(-1)).toBe(false);
    expect(useOpenClawStore.getState().editEnabled).toBe(false);
    expect(useOpenClawStore.getState().debugEnabled).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/agent-messages"))).toBe(false);
    view.unmount();
  });

  it("retries an unavailable gateway only twice and cancels further work on unmount", async () => {
    vi.useFakeTimers();
    try {
      document.body.setAttribute(OPENCLAW_SURFACE_BODY_ATTR, "1");
      fetchMock.mockRejectedValue(new TypeError("network unavailable"));
      const view = renderProvider();
      await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(view.seen.at(-1)).toBe(false);
      view.unmount();
      await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("recovers after one failed readiness check without requiring a remount", async () => {
    vi.useFakeTimers();
    try {
      document.body.setAttribute(OPENCLAW_SURFACE_BODY_ATTR, "1");
      fetchMock
        .mockRejectedValueOnce(new TypeError("temporary network failure"))
        .mockImplementation(healthOkFetch([]));
      const view = renderProvider();
      await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
      expect(view.seen.at(-1)).toBe(true);
      expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/api/openclaw/health"))).toHaveLength(2);
      view.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("gör inga anrop alls på en deploy utan OpenClaw-yta", async () => {
    const { seen } = renderProvider();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(seen.at(-1)).toBe(false);
  });

  it("frågar health först och hämtar historik och befogenheter när ytan bekräftats", async () => {
    document.body.setAttribute(OPENCLAW_SURFACE_BODY_ATTR, "1");
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/openclaw/health")) {
        return new Response(
          JSON.stringify({ status: "ok", readiness: "ready", surfaceEnabled: true, editEnabled: true, debugEnabled: false }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("/agent-messages")) {
        return new Response(JSON.stringify({ messages: [] }), { status: 200 });
      }
      if (url.startsWith("/api/openclaw/powers")) {
        return new Response(
          JSON.stringify({ powersOn: true, granted: ["armed_autonomy"], persisted: true }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 200 });
    });

    const { seen } = renderProvider();
    await waitFor(() => expect(seen.at(-1)).toBe(true));
    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((call) => String(call[0]));
      expect(urls.some((url) => url.includes("/agent-messages"))).toBe(true);
      expect(urls.some((url) => url.startsWith("/api/openclaw/powers"))).toBe(true);
    });
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    // Health är alltid först; historik och befogenheter kommer efter svaret.
    expect(urls[0]).toBe("/api/openclaw/health");
    expect(useOpenClawStore.getState().editEnabled).toBe(true);
  });

  it("löser read_files: hämtar filerna och skickar en [Filinnehåll]-tur, högst en gång per svar", async () => {
    document.body.setAttribute(OPENCLAW_SURFACE_BODY_ATTR, "1");
    const chatCalls: string[] = [];
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/openclaw/health")) {
        return new Response(
          JSON.stringify({ status: "ok", readiness: "ready", surfaceEnabled: true, editEnabled: false, debugEnabled: false }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("/agent-messages")) {
        return new Response(JSON.stringify({ messages: [] }), { status: 200 });
      }
      if (url.includes("/files")) {
        expect(url).toContain("versionId=v1");
        return new Response(
          JSON.stringify({
            versionId: "v1",
            files: [
              { name: "app/page.tsx", content: "export default function Page() {}" },
              { name: "app/layout.tsx", content: "layout" },
            ],
          }),
          { status: 200 },
        );
      }
      if (url === "/api/openclaw/chat") {
        chatCalls.push(String(init?.body ?? ""));
        return new Response("", { status: 503 });
      }
      return new Response("{}", { status: 200 });
    });

    const { seen } = renderProvider();
    await waitFor(() => expect(seen.at(-1)).toBe(true));

    act(() => {
      useOpenClawStore.getState().addMessage({
        id: "u1",
        role: "user",
        content: "Vad gör startsidan?",
        timestamp: Date.now(),
        kind: "chat",
      });
      useOpenClawStore.getState().addMessage({
        id: "a1",
        role: "assistant",
        timestamp: Date.now(),
        kind: "chat",
        content: [
          "Jag tittar i app/page.tsx.",
          "<openclaw-action>",
          JSON.stringify({ type: "read_files", paths: ["app/page.tsx", "nope.tsx"] }),
          "</openclaw-action>",
        ].join("\n"),
      });
    });

    await waitFor(() => {
      const turn = useOpenClawStore
        .getState()
        .messages.find((message) => message.content.startsWith("[Filinnehåll]"));
      expect(turn?.kind).toBe("internal");
      expect(turn?.content).toContain("--- app/page.tsx ---\nexport default function Page() {}");
      expect(turn?.content).toContain("Filer som inte finns i versionen: nope.tsx.");
    });
    await waitFor(() => expect(chatCalls.length).toBe(1));

    // Samma svar igen (omrendering) → ingen ny hämtning, ingen ny tur.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    const fileFetches = fetchMock.mock.calls.filter((call) => String(call[0]).includes("/files"));
    expect(fileFetches).toHaveLength(1);
    expect(chatCalls).toHaveLength(1);
  });

  it("väcker en digest bara när en sedd ström gav en ny version", async () => {
    document.body.setAttribute(OPENCLAW_SURFACE_BODY_ATTR, "1");
    const chatCalls: string[] = [];
    fetchMock.mockImplementation(healthOkFetch(chatCalls));

    const { seen, rerenderWith } = renderProvider("chat_1", {
      digestEnabled: true,
      activeVersionStatus: "ready",
    });
    await waitFor(() => expect(seen.at(-1)).toBe(true));

    // Sidladdning / navigering: terminal version utan ström → ingen digest.
    rerenderWith({ activeVersionId: "v2", activeVersionStatus: "ready", digestEnabled: true });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(chatCalls).toHaveLength(0);

    // En ström som lämnar versionen orörd (plan, motfråga, avslag) → ingen digest.
    rerenderWith({ activeVersionId: "v2", activeVersionStatus: "verifying", isAnyStreaming: true, digestEnabled: true });
    rerenderWith({ activeVersionId: "v2", activeVersionStatus: "ready", isAnyStreaming: false, digestEnabled: true });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(chatCalls).toHaveLength(0);

    // En ström som gav en ny version → exakt en digest, som intern tur.
    rerenderWith({ activeVersionId: "v2", activeVersionStatus: "generating", isAnyStreaming: true, digestEnabled: true });
    rerenderWith({ activeVersionId: "v3", activeVersionStatus: "ready", isAnyStreaming: false, digestEnabled: true });
    await waitFor(() => expect(chatCalls).toHaveLength(1));
    const digest = useOpenClawStore
      .getState()
      .messages.find((message) => message.content.startsWith("[Byggresultat]"));
    expect(digest?.kind).toBe("internal");
    expect(digest?.content).toContain("status: ready");

    // Samma version igen (omrendering, navigering fram och tillbaka) → ingen ny.
    rerenderWith({ activeVersionId: "v3", activeVersionStatus: "ready", isAnyStreaming: false, digestEnabled: true });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(chatCalls).toHaveLength(1);
  });

  it("väntar med historik och befogenheter tills scopen pekar på chatten, och hydrerar om efter ett scope-byte", async () => {
    document.body.setAttribute(OPENCLAW_SURFACE_BODY_ATTR, "1");
    // Befogenhetshydreringen skriver bara när builderkontexten pekar på chatten.
    window.__SITEMASKIN_CONTEXT = { chatId: "chat_1" } as typeof window.__SITEMASKIN_CONTEXT;
    act(() => {
      // OpenClawChat (lazy, ssr:false) har inte hunnit sätta scopen än.
      useOpenClawStore.setState({ scopeKey: "global" });
    });
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/openclaw/health")) {
        return new Response(
          JSON.stringify({ status: "ok", readiness: "ready", surfaceEnabled: true, editEnabled: true, debugEnabled: false }),
          { status: 200 },
        );
      }
      if (url.includes("/agent-messages")) {
        return new Response(
          JSON.stringify({
            messages: [
              {
                id: "old-1",
                role: "assistant",
                kind: "chat",
                content: "Hej från igår",
                createdAt: "2026-10-21T10:00:00.000Z",
                meta: null,
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.startsWith("/api/openclaw/powers")) {
        return new Response(
          JSON.stringify({ powersOn: true, granted: ["quick_edit"], persisted: true }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 200 });
    });

    const { seen } = renderProvider();
    await waitFor(() => expect(seen.at(-1)).toBe(true));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    const urlsBefore = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urlsBefore.some((url) => url.includes("/agent-messages"))).toBe(false);
    expect(urlsBefore.some((url) => url.startsWith("/api/openclaw/powers"))).toBe(false);

    // Scope-bytet landar (och nollar minnet, som i OpenClawChat) → nu hydreras.
    act(() => {
      useOpenClawStore.getState().setScope("/builder::builder::chat_1");
    });
    try {
      await waitFor(() => {
        expect(useOpenClawStore.getState().messages.map((message) => message.id)).toEqual([
          "old-1",
        ]);
        expect(useOpenClawStore.getState().grantedPowers).toEqual(["quick_edit"]);
      });
    } finally {
      delete window.__SITEMASKIN_CONTEXT;
    }
  });

  it("hämtar ingen historik utan chatt", async () => {
    document.body.setAttribute(OPENCLAW_SURFACE_BODY_ATTR, "1");
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ status: "ok", readiness: "ready", surfaceEnabled: true, editEnabled: false }), { status: 200 }),
    );
    renderProvider(null);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/openclaw/health");
  });

  it("skickar byggsammanfattningen när ett samtidigt agentsvar blir klart", async () => {
    document.body.setAttribute(OPENCLAW_SURFACE_BODY_ATTR, "1");
    const chatCalls: string[] = [];
    fetchMock.mockImplementation(healthOkFetch(chatCalls));
    const { seen, rerenderWith } = renderProvider("chat_1", { digestEnabled: true });
    await waitFor(() => expect(seen.at(-1)).toBe(true));
    act(() => { useOpenClawStore.getState().setStreaming(true); });
    rerenderWith({ activeVersionId: "v1", isAnyStreaming: true, digestEnabled: true });
    rerenderWith({ activeVersionId: "v2", activeVersionStatus: "ready", isAnyStreaming: false, digestEnabled: true });
    expect(chatCalls).toHaveLength(0);
    act(() => { useOpenClawStore.getState().setStreaming(false); });
    await waitFor(() => expect(chatCalls).toHaveLength(1));
    expect(chatCalls[0]).toContain("[Byggresultat]");
  });

  it("skickar om rader som inte kvitterats när nästa tur skrivs ner", async () => {
    document.body.setAttribute(OPENCLAW_SURFACE_BODY_ATTR, "1");
    const persistBodies: Array<{ messages: Array<{ id: string }> }> = [];
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/openclaw/health")) {
        return new Response(
          JSON.stringify({ status: "ok", readiness: "ready", surfaceEnabled: true, editEnabled: false, debugEnabled: false }),
          { status: 200 },
        );
      }
      if (url.includes("/agent-messages")) {
        if (init?.method === "POST") {
          persistBodies.push(JSON.parse(String(init.body)) as { messages: Array<{ id: string }> });
          // Första skrivningen misslyckas fail-soft (200 + persisted:false).
          return new Response(
            JSON.stringify({ persisted: persistBodies.length > 1, count: 0 }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ messages: [] }), { status: 200 });
      }
      if (url.includes("/files")) {
        return new Response(
          JSON.stringify({ versionId: "v1", files: [{ name: "app/page.tsx", content: "sida" }] }),
          { status: 200 },
        );
      }
      if (url === "/api/openclaw/chat") return new Response("", { status: 503 });
      return new Response("{}", { status: 200 });
    });

    const { seen } = renderProvider();
    await waitFor(() => expect(seen.at(-1)).toBe(true));

    const readAction = (id: string) => ({
      id,
      role: "assistant" as const,
      timestamp: Date.now(),
      kind: "chat" as const,
      content: [
        "Läser.",
        "<openclaw-action>",
        JSON.stringify({ type: "read_files", paths: ["app/page.tsx"] }),
        "</openclaw-action>",
      ].join("\n"),
    });
    act(() => {
      useOpenClawStore.getState().addMessage({
        id: "u1",
        role: "user",
        content: "Vad gör startsidan?",
        timestamp: Date.now(),
        kind: "chat",
      });
      useOpenClawStore.getState().addMessage(readAction("a1"));
    });
    // Filturen skickas via providerns `send`, som skriver ner storen efteråt.
    await waitFor(() => expect(persistBodies).toHaveLength(1));
    const firstIds = persistBodies[0].messages.map((row) => row.id);
    expect(firstIds).toContain("u1");
    expect(firstIds).toContain("a1");

    // Nästa tur: de okvitterade raderna följer med igen tillsammans med de nya.
    act(() => {
      useOpenClawStore.getState().addMessage(readAction("a2"));
    });
    await waitFor(() => expect(persistBodies).toHaveLength(2));
    const secondIds = persistBodies[1].messages.map((row) => row.id);
    for (const id of firstIds) expect(secondIds).toContain(id);
    expect(secondIds).toContain("a2");
  });

});
