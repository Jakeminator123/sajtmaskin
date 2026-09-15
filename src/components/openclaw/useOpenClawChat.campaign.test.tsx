import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearCampaignScriptStorageForTests,
  emptyCampaignScript,
  KOSTNADSFRI_ADVICE_EXHAUSTED_COPY,
  KOSTNADSFRI_ADVICE_ROUND_LIMIT,
} from "@/lib/kostnadsfri/agent-campaign-script";
import { useOpenClawChat } from "./useOpenClawChat";
import { useOpenClawStore } from "@/lib/openclaw/openclaw-store";

function sseBody(...payloads: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const payload of payloads) {
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
      }
      controller.close();
    },
  });
}

function deltaPayload(content: string): string {
  return JSON.stringify({
    choices: [{ index: 0, delta: { content } }],
  });
}

function mockSuccessfulAdviceStream(text = "Här är ett råd.") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(sseBody(deltaPayload(text), "[DONE]"), {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    ),
  );
}

function mockHttpError(status: number) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response("", {
        status,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
}

function remaining(): number | undefined {
  return useOpenClawStore.getState().campaignScript?.remaining;
}

function fetchMock() {
  return globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
}

beforeEach(() => {
  mockSuccessfulAdviceStream();
  clearCampaignScriptStorageForTests();
  window.__SITEMASKIN_CONTEXT = { page: "kostnadsfri" };
  act(() => {
    useOpenClawStore.setState({
      messages: [],
      isStreaming: false,
      campaignScript: emptyCampaignScript("zax-2-0-ab"),
    });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete window.__SITEMASKIN_CONTEXT;
  clearCampaignScriptStorageForTests();
  act(() => {
    useOpenClawStore.setState({
      messages: [],
      isStreaming: false,
      campaignScript: null,
    });
  });
});

describe("useOpenClawChat — kampanjrådgivning", () => {
  it("räknar ned kvoten efter lyckat SSE-svar och stannar på noll utan ny modellturné", async () => {
    const { result } = renderHook(() => useOpenClawChat());

    for (let i = 0; i < KOSTNADSFRI_ADVICE_ROUND_LIMIT; i += 1) {
      await act(async () => {
        await result.current.send(`runda ${i + 1}`);
      });
    }

    expect(remaining()).toBe(0);
    expect(fetchMock()).toHaveBeenCalledTimes(KOSTNADSFRI_ADVICE_ROUND_LIMIT);

    await act(async () => {
      await result.current.send("en gång till");
    });

    expect(remaining()).toBe(0);
    expect(fetchMock()).toHaveBeenCalledTimes(KOSTNADSFRI_ADVICE_ROUND_LIMIT);
    expect(
      useOpenClawStore.getState().messages.some((message) => message.content === KOSTNADSFRI_ADVICE_EXHAUSTED_COPY),
    ).toBe(true);
    expect(KOSTNADSFRI_ADVICE_EXHAUSTED_COPY.toLowerCase()).not.toMatch(/generering|ombyggnad/);
  });

  it("bränner inte kvoten vid 503", async () => {
    mockHttpError(503);
    const { result } = renderHook(() => useOpenClawChat());

    await act(async () => {
      await result.current.send("runda 1");
    });

    expect(remaining()).toBe(KOSTNADSFRI_ADVICE_ROUND_LIMIT);
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it("bränner inte kvoten vid nätverksfel", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const { result } = renderHook(() => useOpenClawChat());

    await act(async () => {
      await result.current.send("runda 1");
    });

    expect(remaining()).toBe(KOSTNADSFRI_ADVICE_ROUND_LIMIT);
  });

  it("bränner inte kvoten vid AbortError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("The operation was aborted.", "AbortError");
      }),
    );
    const { result } = renderHook(() => useOpenClawChat());

    await act(async () => {
      await result.current.send("runda 1");
    });

    expect(remaining()).toBe(KOSTNADSFRI_ADVICE_ROUND_LIMIT);
  });

  it("bränner inte kvoten vid gateway-fel utan assistant-text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            sseBody(
              JSON.stringify({
                error: {
                  message: "You've reached your Codex subscription usage limit.",
                  type: "rate_limit_error",
                },
              }),
              "[DONE]",
            ),
            {
              status: 200,
              headers: { "content-type": "text/event-stream" },
            },
          ),
      ),
    );
    const { result } = renderHook(() => useOpenClawChat());

    await act(async () => {
      await result.current.send("runda 1");
    });

    expect(remaining()).toBe(KOSTNADSFRI_ADVICE_ROUND_LIMIT);
  });

  it("bränner inte kvoten för armed continuation även vid lyckat svar", async () => {
    const { result } = renderHook(() => useOpenClawChat());

    await act(async () => {
      await result.current.send("[Automatisk fortsättning] Builderturen är klar.", {
        allowArming: false,
        countTowardCampaignQuota: false,
      });
    });

    expect(remaining()).toBe(KOSTNADSFRI_ADVICE_ROUND_LIMIT);
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });
});
