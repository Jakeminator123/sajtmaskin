import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useMemo } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, simulateReadableStream, type UIMessage } from "ai";
import {
  Conversation,
  ConversationContent,
  ConversationItem,
  ConversationScrollButton,
} from "./conversation";

/**
 * Deterministic streaming test for the MessageScroller-based Conversation.
 *
 * The AI SDK `useChat` streaming lifecycle is driven end-to-end WITHOUT any
 * model, API route, network request or API key: a scripted `fetch` returns a
 * fixed AI SDK UI-message stream built with `simulateReadableStream` (zero
 * delays, so the output is byte-for-byte identical on every run). This is the
 * deterministic-chat-stream harness the plan calls for — test/demo only, it can
 * never reach a production model.
 *
 * Note: `@shadcn/helpers/ai-sdk` (the packaged helper) targets `ai@7`, while
 * this repo pins `ai@6`; adopting it would break the strict `npm ci` peer
 * resolution in CI. This harness uses the AI SDK's own `simulateReadableStream`
 * through the real `useChat` lifecycle instead — same guarantee (deterministic,
 * offline, no prod model), no incompatible dependency.
 */

const ASSISTANT_DELTAS = ["Hej", " ", "på", " ", "dig", "!"];
const EXPECTED_ASSISTANT_TEXT = ASSISTANT_DELTAS.join("");

/** A fetch that always replies with the same scripted UI-message stream. */
function scriptedFetch(): typeof fetch {
  return (async () => {
    const messageId = "assistant-scripted-1";
    const textId = "text-scripted-1";
    const chunks = [
      `data: ${JSON.stringify({ type: "start", messageId })}\n\n`,
      `data: ${JSON.stringify({ type: "text-start", id: textId })}\n\n`,
      ...ASSISTANT_DELTAS.map(
        (delta) => `data: ${JSON.stringify({ type: "text-delta", id: textId, delta })}\n\n`,
      ),
      `data: ${JSON.stringify({ type: "text-end", id: textId })}\n\n`,
      `data: ${JSON.stringify({ type: "finish" })}\n\n`,
      `data: [DONE]\n\n`,
    ];
    const body = simulateReadableStream({
      initialDelayInMs: 0,
      chunkDelayInMs: 0,
      chunks,
    }).pipeThrough(new TextEncoderStream());
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "x-vercel-ai-ui-message-stream": "v1",
      },
    });
  }) as typeof fetch;
}

function messageText(message: UIMessage): string {
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function DeterministicChat() {
  const transport = useMemo(
    () => new DefaultChatTransport<UIMessage>({ api: "/api/__test__/chat", fetch: scriptedFetch() }),
    [],
  );
  const { messages, sendMessage } = useChat({ transport });

  return (
    <div style={{ height: 400 }}>
      <button type="button" onClick={() => void sendMessage({ text: "Ping" })}>
        skicka
      </button>
      <Conversation className="h-full">
        <ConversationContent>
          {messages.map((message) => (
            <ConversationItem
              key={message.id}
              messageId={message.id}
              scrollAnchor={message.role === "user"}
            >
              <div data-role={message.role}>{messageText(message)}</div>
            </ConversationItem>
          ))}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
    </div>
  );
}

afterEach(() => {
  // Keep the flag at its default (ON) for these tests; nothing to restore.
});

describe("Conversation — deterministic AI SDK stream (MessageScroller path)", () => {
  it("streams a scripted assistant reply through useChat into the MessageScroller", async () => {
    const { container } = render(<DeterministicChat />);

    // Frame mounts via the shadcn MessageScroller primitive (default flag on).
    expect(container.querySelector('[data-slot="message-scroller"]')).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "skicka" }));

    // The user turn appears...
    await waitFor(() => {
      expect(screen.getByText("Ping")).toBeTruthy();
    });
    // ...and the scripted assistant reply streams in deterministically.
    await waitFor(() => {
      expect(screen.getByText(EXPECTED_ASSISTANT_TEXT)).toBeTruthy();
    });

    // Both turns are wrapped as MessageScroller items (user row is an anchor).
    const items = container.querySelectorAll('[data-slot="message-scroller-item"]');
    expect(items.length).toBe(2);
    expect(container.querySelector('[data-role="user"]')?.textContent).toBe("Ping");
    expect(container.querySelector('[data-role="assistant"]')?.textContent).toBe(
      EXPECTED_ASSISTANT_TEXT,
    );
  });

  it("produces identical output on a second run (determinism)", async () => {
    const { container } = render(<DeterministicChat />);
    fireEvent.click(screen.getByRole("button", { name: "skicka" }));
    await waitFor(() => {
      expect(screen.getByText(EXPECTED_ASSISTANT_TEXT)).toBeTruthy();
    });
    expect(container.querySelector('[data-role="assistant"]')?.textContent).toBe(
      EXPECTED_ASSISTANT_TEXT,
    );
  });
});
