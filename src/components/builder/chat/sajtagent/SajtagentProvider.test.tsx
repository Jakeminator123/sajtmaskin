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

function renderProvider(chatId: string | null = "chat_1") {
  const seen: boolean[] = [];
  const utils = render(
    <SajtagentProvider
      chatId={chatId}
      activeVersionId="v1"
      activeVersionStatus={null}
      activeVersionIsLatest
      isAnyStreaming={false}
      digestEnabled={false}
    >
      <Probe onValue={(available) => seen.push(available)} />
    </SajtagentProvider>,
  );
  return { ...utils, seen };
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
