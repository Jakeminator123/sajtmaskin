import { render, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OpenClawMessage } from "./OpenClawMessage";
import { useOpenClawArmedContinuation } from "./useOpenClawArmedContinuation";
import { useOpenClawStore, type OpenClawMessage as Msg } from "@/lib/openclaw/openclaw-store";
import {
  applyOpenClawTextFieldAction,
  triggerOpenClawSend,
  isOpenClawSendReady,
} from "@/lib/openclaw/text-field-actions";

vi.mock("@/lib/openclaw/text-field-actions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/openclaw/text-field-actions")>();
  return {
    ...actual,
    applyOpenClawTextFieldAction: vi.fn(),
    triggerOpenClawSend: vi.fn(),
    isOpenClawSendReady: vi.fn(),
  };
});

const applyMock = vi.mocked(applyOpenClawTextFieldAction);
const triggerMock = vi.mocked(triggerOpenClawSend);
const readyMock = vi.mocked(isOpenClawSendReady);

const ARMED_AT = Date.now() - 1_000;

function submitFillMessage(id: string, offsetMs: number): Msg {
  return {
    id,
    role: "assistant",
    timestamp: ARMED_AT + offsetMs,
    content: [
      "Nästa förbättring.",
      "<openclaw-action>",
      JSON.stringify({
        type: "fill_text_field",
        target: "builder.chat.primary",
        value: "Gör hjältesektionen luftigare",
        submit: true,
        label: "Builder-chatten",
      }),
      "</openclaw-action>",
    ].join("\n"),
  };
}

function setBuilderContext(overrides: Record<string, unknown> = {}) {
  window.__SITEMASKIN_CONTEXT = {
    page: "builder",
    chatId: "chat-1",
    activeVersionId: "ver-1",
    isStreaming: false,
    activeVersionStatus: "ready",
    activeVersionIsLatest: true,
    chatMessageCount: 4,
    ...overrides,
  };
}

function Harness({ messages, onSend }: { messages: Msg[]; onSend: (text: string, options?: { allowArming?: boolean }) => void }) {
  useOpenClawArmedContinuation(onSend);
  return (
    <>
      {messages.map((msg) => (
        <OpenClawMessage key={msg.id} msg={msg} />
      ))}
    </>
  );
}

beforeEach(() => {
  applyMock.mockReturnValue({
    ok: true,
    field: {
      target: "builder.chat.primary",
      label: "Builder-chatten",
      kind: "textarea",
      placeholder: "",
      value: "",
      canWrite: true,
      multiline: true,
    },
  });
  triggerMock.mockReturnValue({ ok: true });
  readyMock.mockReturnValue(true);
  setBuilderContext();
});

afterEach(() => {
  act(() => {
    useOpenClawStore.setState({
      editEnabled: false,
      armedMandate: null,
      armedContinuation: null,
      messages: [],
    });
  });
  delete window.__SITEMASKIN_CONTEXT;
  vi.clearAllMocks();
});

describe("armed autonomy — continuation handshake", () => {
  it("runs two follow-ups from one mandate and then stops", async () => {
    act(() => {
      useOpenClawStore.setState({
        editEnabled: true,
        armedMandate: {
          mode: "followups",
          remaining: 2,
          reason: "gör 2 follow-ups och förbättra sajten",
          createdAt: ARMED_AT,
        },
      });
    });

    const onSend = vi.fn();
    const first = submitFillMessage("msg-1", 100);
    const { rerender } = render(<Harness messages={[first]} onSend={onSend} />);

    // Step 1: the auto-send card drives the builder and books one step.
    await waitFor(() => expect(triggerMock).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(useOpenClawStore.getState().armedMandate?.remaining).toBe(1);
      expect(useOpenClawStore.getState().armedContinuation).not.toBeNull();
    });
    expect(onSend).not.toHaveBeenCalled();

    // The builder turn starts — no resume while it runs.
    act(() => setBuilderContext({ isStreaming: true, activeVersionStatus: "generating" }));
    await waitFor(
      () => expect(useOpenClawStore.getState().armedContinuation?.buildObserved).toBe(true),
      { timeout: 4000 },
    );
    expect(onSend).not.toHaveBeenCalled();

    // Terminal, healthy turn → OpenClaw is woken exactly once.
    act(() => setBuilderContext({ activeVersionId: "ver-2", activeVersionStatus: "ready" }));
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1), { timeout: 4000 });

    const [prompt, options] = onSend.mock.calls[0];
    expect(prompt).toContain("[Automatisk fortsättning]");
    expect(prompt).toContain("sista steget");
    expect(options).toEqual({ allowArming: false });
    expect(useOpenClawStore.getState().armedContinuation).toBeNull();

    // Step 2: OpenClaw answers with another submit action — the last step runs
    // and the mandate is spent, so no third watch is registered.
    const second = submitFillMessage("msg-2", 200);
    rerender(<Harness messages={[first, second]} onSend={onSend} />);

    await waitFor(() => expect(triggerMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(useOpenClawStore.getState().armedMandate).toBeNull());
    expect(useOpenClawStore.getState().armedContinuation).toBeNull();

    // Nothing more may happen after the budget is gone.
    act(() => setBuilderContext({ activeVersionId: "ver-3", activeVersionStatus: "ready" }));
    await new Promise((resolve) => setTimeout(resolve, 1600));
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(triggerMock).toHaveBeenCalledTimes(2);
  }, 20_000);

  it("never resumes a review_next mandate", async () => {
    const onSend = vi.fn();
    act(() => {
      useOpenClawStore.setState({
        editEnabled: true,
        armedMandate: {
          mode: "review_next",
          remaining: 1,
          reason: "granska nästa meddelande jag skickar",
          createdAt: ARMED_AT,
        },
        // Even a watch planted by hand must not drive a review_next mandate.
        armedContinuation: {
          chatId: "chat-1",
          versionIdAtSend: "ver-1",
          messageCountAtSend: 4,
          startedAt: Date.now(),
          buildObserved: true,
        },
      });
    });

    render(<Harness messages={[]} onSend={onSend} />);

    await waitFor(() => expect(useOpenClawStore.getState().armedContinuation).toBeNull(), {
      timeout: 4000,
    });
    expect(onSend).not.toHaveBeenCalled();
    // A quiet stop: no alarming note in the chat.
    expect(useOpenClawStore.getState().messages).toHaveLength(0);
  }, 10_000);

  it("stops the mandate and says so when the build fails", async () => {
    const onSend = vi.fn();
    act(() => {
      useOpenClawStore.setState({
        editEnabled: true,
        armedMandate: {
          mode: "followups",
          remaining: 3,
          reason: "gör 3 follow-ups",
          createdAt: ARMED_AT,
        },
        armedContinuation: {
          chatId: "chat-1",
          versionIdAtSend: "ver-1",
          messageCountAtSend: 4,
          startedAt: Date.now(),
          buildObserved: true,
        },
      });
    });
    setBuilderContext({ activeVersionId: "ver-2", activeVersionStatus: "failed" });

    render(<Harness messages={[]} onSend={onSend} />);

    await waitFor(() => expect(useOpenClawStore.getState().messages).toHaveLength(1), {
      timeout: 4000,
    });
    expect(useOpenClawStore.getState().messages[0].content).toContain("Autonomin stoppades");
    expect(onSend).not.toHaveBeenCalled();
    expect(useOpenClawStore.getState().armedContinuation).toBeNull();
    // Saying autonomy stopped while leaving the mandate armed would let the
    // next assistant action auto-send anyway (Bugbot).
    expect(useOpenClawStore.getState().armedMandate).toBeNull();
  }, 10_000);

  it("does not resume while OpenClaw is already answering", async () => {
    const onSend = vi.fn();
    act(() => {
      useOpenClawStore.setState({
        editEnabled: true,
        isStreaming: true,
        armedMandate: {
          mode: "followups",
          remaining: 2,
          reason: "gör 2 follow-ups",
          createdAt: ARMED_AT,
        },
        armedContinuation: {
          chatId: "chat-1",
          versionIdAtSend: "ver-1",
          messageCountAtSend: 4,
          startedAt: Date.now(),
          buildObserved: true,
        },
      });
    });

    render(<Harness messages={[]} onSend={onSend} />);
    await new Promise((resolve) => setTimeout(resolve, 1600));

    expect(onSend).not.toHaveBeenCalled();
    expect(useOpenClawStore.getState().armedContinuation).not.toBeNull();

    act(() => useOpenClawStore.setState({ isStreaming: false }));
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1), { timeout: 4000 });
  }, 15_000);
});
