import { beforeEach, describe, expect, it } from "vitest";
import { useOpenClawStore } from "./openclaw-store";

describe("OpenClaw store assistant targeting", () => {
  beforeEach(() => {
    useOpenClawStore.setState({
      isOpen: false,
      messages: [],
      isStreaming: false,
      scopeKey: "global",
    });
  });

  it("updates the targeted assistant message instead of the last one", () => {
    const firstAssistantId = "assistant-1";
    const secondAssistantId = "assistant-2";

    useOpenClawStore.getState().addMessage({
      id: "user-1",
      role: "user",
      content: "hello",
      timestamp: 1,
    });
    useOpenClawStore.getState().addMessage({
      id: firstAssistantId,
      role: "assistant",
      content: "",
      timestamp: 2,
    });
    useOpenClawStore.getState().addMessage({
      id: secondAssistantId,
      role: "assistant",
      content: "existing",
      timestamp: 3,
    });

    useOpenClawStore.getState().updateAssistantMessage(firstAssistantId, "streamed");

    expect(useOpenClawStore.getState().messages).toEqual([
      expect.objectContaining({ id: "user-1", content: "hello" }),
      expect.objectContaining({ id: firstAssistantId, content: "streamed" }),
      expect.objectContaining({ id: secondAssistantId, content: "existing" }),
    ]);
  });

  it("leaves messages unchanged when the targeted assistant id is missing", () => {
    useOpenClawStore.getState().addMessage({
      id: "assistant-1",
      role: "assistant",
      content: "existing",
      timestamp: 1,
    });

    useOpenClawStore.getState().updateAssistantMessage("missing", "new content");

    expect(useOpenClawStore.getState().messages).toEqual([
      expect.objectContaining({ id: "assistant-1", content: "existing" }),
    ]);
  });

  it("drops a pending continuation whenever the mandate changes", () => {
    const watch = {
      chatId: "chat-1",
      versionIdAtSend: "ver-1",
      startedAt: 1,
      messageCountAtSend: 4,
      observedAt: Date.now() - 5000,
      observedStrong: true,
      resumedAt: null,
    };
    useOpenClawStore.setState({ armedContinuation: watch });

    // Re-arming must not inherit the previous run's watch (Bugbot) …
    useOpenClawStore.getState().setArmedMandate({
      mode: "followups",
      remaining: 3,
      reason: "gör 3 follow-ups",
      createdAt: 2,
    });
    expect(useOpenClawStore.getState().armedContinuation).toBeNull();

    // … and disarming must not leave one behind either.
    useOpenClawStore.setState({ armedContinuation: watch });
    useOpenClawStore.getState().setArmedMandate(null);
    expect(useOpenClawStore.getState().armedContinuation).toBeNull();
  });

  it("resets messages and closes the panel when the scope changes", () => {
    useOpenClawStore.setState({
      isOpen: true,
      isStreaming: true,
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          content: "existing",
          timestamp: 1,
        },
      ],
      scopeKey: "/builder::builder::chat_1",
    });

    useOpenClawStore.getState().setScope("/kostnadsfri/acme::kostnadsfri");

    expect(useOpenClawStore.getState()).toMatchObject({
      isOpen: false,
      isStreaming: false,
      messages: [],
      scopeKey: "/kostnadsfri/acme::kostnadsfri",
    });
  });
});
