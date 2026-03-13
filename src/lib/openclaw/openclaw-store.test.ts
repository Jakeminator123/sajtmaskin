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
