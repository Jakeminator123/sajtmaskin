import { render, waitFor } from "@testing-library/react";
import { act } from "react";
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
        JSON.stringify({ surfaceEnabled: true, editEnabled: false, debugEnabled: false }),
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
    });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SajtagentProvider — anrop bara när ytan finns", () => {
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
          JSON.stringify({ surfaceEnabled: true, editEnabled: true, debugEnabled: false }),
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
          JSON.stringify({ surfaceEnabled: true, editEnabled: false, debugEnabled: false }),
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

  it("hämtar ingen historik utan chatt", async () => {
    document.body.setAttribute(OPENCLAW_SURFACE_BODY_ATTR, "1");
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ surfaceEnabled: true, editEnabled: false }), { status: 200 }),
    );
    renderProvider(null);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/openclaw/health");
  });
});
