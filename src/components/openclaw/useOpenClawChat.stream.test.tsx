// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OPENCLAW_EMPTY_REPLY_COPY } from "@/lib/openclaw/gateway-response";
import { resetArmedHandshakeWakesForTests } from "@/lib/openclaw/debug/armed-continuation";
import { useOpenClawStore } from "@/lib/openclaw/openclaw-store";
import { OpenClawMessage } from "./OpenClawMessage";
import { useOpenClawChat } from "./useOpenClawChat";

const PREVIEW_REPRO_PHRASE =
  "gör 3 follow-ups och buggranska. Första steget: skicka själv en builder-prompt som gör hero-rubriken tydligare.";

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

function emptySseResponse(): Response {
  return new Response(sseBody("[DONE]"), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function immediatelyClosedResponse(): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    }),
    {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    },
  );
}

function lastAssistantContent(): string {
  const assistants = useOpenClawStore.getState().messages.filter((message) => message.role === "assistant");
  return assistants.at(-1)?.content ?? "";
}

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  act(() => {
    useOpenClawStore.setState({
      editEnabled: true,
      powersOn: true,
      grantedPowers: ["armed_autonomy"],
      armedMandate: null,
      armedContinuation: null,
      messages: [],
      isStreaming: false,
      campaignScript: null,
    });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetArmedHandshakeWakesForTests();
  act(() => {
    useOpenClawStore.setState({
      editEnabled: false,
      powersOn: false,
      grantedPowers: [],
      armedMandate: null,
      armedContinuation: null,
      messages: [],
      isStreaming: false,
    });
  });
});

describe("useOpenClawChat — terminal empty stream", () => {
  it("leaves no waiting dots and clears isStreaming after an empty HTTP 200 stream", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => immediatelyClosedResponse()),
    );

    const { result } = renderHook(() => useOpenClawChat());
    await act(async () => {
      await result.current.send("hej");
    });

    expect(useOpenClawStore.getState().isStreaming).toBe(false);
    expect(lastAssistantContent()).toBe(OPENCLAW_EMPTY_REPLY_COPY);

    const { container } = render(
      <OpenClawMessage
        streaming={useOpenClawStore.getState().isStreaming}
        msg={useOpenClawStore.getState().messages.find((message) => message.role === "assistant")!}
      />,
    );

    expect(screen.getByText(OPENCLAW_EMPTY_REPLY_COPY)).toBeTruthy();
    expect(container.querySelectorAll(".h-1\\.5.w-1\\.5.animate-pulse")).toHaveLength(0);
    expect(result.current.isStreaming).toBe(false);
  });

  it("keeps the Swedish error text for a gateway error envelope", async () => {
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
      await result.current.send("hej");
    });

    const content = lastAssistantContent();
    expect(content).toContain("slut på kapacitet");
    expect(content).not.toBe(OPENCLAW_EMPTY_REPLY_COPY);

    render(
      <OpenClawMessage
        streaming={false}
        msg={useOpenClawStore.getState().messages.find((message) => message.role === "assistant")!}
      />,
    );
    expect(screen.getByText(/slut på kapacitet/)).toBeTruthy();
    expect(screen.queryByText(OPENCLAW_EMPTY_REPLY_COPY)).toBeNull();
  });

  it("does not handshake-wake from a complete hunt block followed by an error envelope", async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(
          sseBody(
            JSON.stringify({
              choices: [
                {
                  index: 0,
                  delta: {
                    content: [
                      "<openclaw-action>",
                      '{"type":"start_bug_hunt","mode":"followups","count":3,"reason":"Tre steg"}',
                      "</openclaw-action>",
                    ].join("\n"),
                  },
                },
              ],
            }),
            JSON.stringify({
              error: {
                message: "You've reached your Codex subscription usage limit.",
                type: "rate_limit_error",
              },
            }),
          ),
          {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          },
        ),
    );
    vi.stubGlobal("fetch", fetchFn);

    const { result } = renderHook(() => useOpenClawChat());
    await act(async () => {
      await result.current.send(PREVIEW_REPRO_PHRASE);
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(useOpenClawStore.getState().armedMandate?.remaining).toBe(3);
    expect(
      useOpenClawStore.getState().messages.some((message) =>
        message.content.includes("[Automatisk väckning]"),
      ),
    ).toBe(false);
  });

  it("does not handshake-wake from a truncated action stream under an active mandate", async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(
          sseBody(
            JSON.stringify({
              choices: [
                {
                  index: 0,
                  delta: {
                    content: `<openclaw-action>\n{"type":"start_bug_hunt","mode":"followups","count":3}`,
                  },
                },
              ],
            }),
            "[DONE]",
          ),
          {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          },
        ),
    );
    vi.stubGlobal("fetch", fetchFn);

    const { result } = renderHook(() => useOpenClawChat());
    await act(async () => {
      await result.current.send(PREVIEW_REPRO_PHRASE);
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(useOpenClawStore.getState().armedMandate?.remaining).toBe(3);
    expect(useOpenClawStore.getState().isStreaming).toBe(false);
  });

  it("does not handshake-wake from an empty stream under an active mandate", async () => {
    const fetchFn = vi.fn(async () => emptySseResponse());
    vi.stubGlobal("fetch", fetchFn);

    const { result } = renderHook(() => useOpenClawChat());
    await act(async () => {
      await result.current.send(PREVIEW_REPRO_PHRASE);
    });

    expect(useOpenClawStore.getState().armedMandate?.mode).toBe("followups");
    expect(useOpenClawStore.getState().armedMandate?.remaining).toBe(3);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(lastAssistantContent()).toBe(OPENCLAW_EMPTY_REPLY_COPY);
    expect(useOpenClawStore.getState().isStreaming).toBe(false);
  });
});
