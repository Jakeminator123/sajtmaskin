import { act, render, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOpenClawStore } from "@/lib/openclaw/openclaw-store";
import { resetAgentHistoryForTests } from "@/lib/openclaw/agent-history";
import { OPENCLAW_SURFACE_BODY_ATTR } from "@/lib/openclaw/surface-flag";
import {
  SajtagentProvider,
  useSajtagent,
  type SajtagentContextValue,
} from "./SajtagentProvider";

let agent: SajtagentContextValue;
function Probe() {
  const value = useSajtagent()!;
  useEffect(() => { agent = value; }, [value]);
  return null;
}

function view(chatId = "chat_a") {
  return (
    <SajtagentProvider
      chatId={chatId}
      activeVersionId="v1"
      activeVersionStatus="ready"
      activeVersionIsLatest
      isAnyStreaming={false}
      digestEnabled={false}
    >
      <Probe />
    </SajtagentProvider>
  );
}

function streamingReply() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
    },
  });
  return {
    response: new Response(stream, {
      headers: { "Content-Type": "text/event-stream" },
    }),
    text(text: string) {
      controller.enqueue(
        new TextEncoder().encode(
          `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
        ),
      );
    },
    end() {
      controller.close();
    },
  };
}

function setupFetch(replies: Response[]) {
  const writes: Array<{
    url: string;
    messages: Array<{ id: string; content: string }>;
  }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/openclaw/health")
        return Response.json({ surfaceEnabled: true });
      if (url === "/api/openclaw/chat") return replies.shift()!;
      if (init?.method === "POST" && url.endsWith("/agent-messages")) {
        writes.push({ url, ...JSON.parse(String(init.body)) });
        return Response.json({ persisted: true });
      }
      return Response.json({ messages: [] });
    }),
  );
  return writes;
}

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  resetAgentHistoryForTests();
  document.body.setAttribute(OPENCLAW_SURFACE_BODY_ATTR, "1");
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
  document.body.removeAttribute(OPENCLAW_SURFACE_BODY_ATTR);
});

describe("SajtagentProvider — settled history snapshots", () => {
  it("a cancelled send cannot persist a later answer while that answer is still streaming", async () => {
    const first = streamingReply();
    const second = streamingReply();
    const writes = setupFetch([first.response, second.response]);
    render(view());
    await waitFor(() => expect(agent.available).toBe(true));
    let firstSend!: Promise<void>;
    let secondSend!: Promise<void>;
    act(() => {
      firstSend = agent.send("Första frågan");
    });
    first.text("Avbruten text");
    await waitFor(() =>
      expect(agent.messages.at(-1)?.content).toBe("Avbruten text"),
    );
    act(() => {
      agent.stop();
      secondSend = agent.send("Andra frågan");
    });
    second.text("Halvt ");
    await waitFor(() => expect(agent.messages.at(-1)?.content).toBe("Halvt "));
    await act(async () => {
      await firstSend;
    });
    expect(
      writes
        .flatMap((write) => write.messages)
        .some((m) => m.content === "Halvt "),
    ).toBe(false);
    second.text("och klart");
    second.end();
    await act(async () => {
      await secondSend;
    });
    expect(
      writes.flatMap((write) => write.messages).map((m) => m.content),
    ).toEqual([
      "Första frågan",
      "Avbruten text",
      "Andra frågan",
      "Halvt och klart",
    ]);
  });

  it("saves the old conversation on navigation without borrowing the new chat's rows", async () => {
    const reply = streamingReply();
    const writes = setupFetch([reply.response]);
    const { rerender } = render(view());
    await waitFor(() => expect(agent.available).toBe(true));
    let send!: Promise<void>;
    act(() => {
      send = agent.send("Fråga i A");
    });
    reply.text("Svar i A");
    await waitFor(() =>
      expect(agent.messages.at(-1)?.content).toBe("Svar i A"),
    );
    act(() => {
      useOpenClawStore.getState().setScope("/builder::builder::chat_b");
      rerender(view("chat_b"));
    });
    await act(async () => {
      await send;
    });
    expect(writes).toHaveLength(1);
    expect(writes[0].url).toContain("/chat_a/agent-messages");
    expect(writes[0].messages.map((m) => m.content)).toEqual([
      "Fråga i A",
      "Svar i A",
    ]);
    expect(useOpenClawStore.getState().messages).toEqual([]);
  });
});
