import { useEffect, useState } from "react";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/lib/builder/types";
import { loadPersistedMessages, persistMessages } from "@/lib/builder/messages-storage";
import { usePersistedChatMessages } from "./usePersistedChatMessages";

const message = (content: string): ChatMessage => ({ id: content, role: "user", content });
const noop = () => {};

function useNavigationHarness(props: {
  urlChatId: string;
  serverMessages?: ChatMessage[];
  serverMessagesChatId?: string;
  cancelGeneration?: () => void;
}) {
  const [chatId, setChatId] = useState<string | null>("A");
  const [messages, setMessages] = useState<ChatMessage[]>([message("A TEXT")]);
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  usePersistedChatMessages({
    chatId, chatIdParam: props.urlChatId,
    cancelActiveGeneration: props.cancelGeneration ?? noop,
    messages, setMessages, isCreatingChat, isAnyStreaming: messages.some((m) => m.isStreaming),
    serverMessages: props.serverMessages, serverMessagesChatId: props.serverMessagesChatId,
  });
  // Same order as the controller: persistence runs before URL -> chat state sync.
  useEffect(() => {
    // Production URL sync deliberately runs after persistence; preserve that race in this harness.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChatId(props.urlChatId);
  }, [props.urlChatId]);
  return { messages, setMessages, setChatId, setIsCreatingChat };
}

describe("chat message cache ownership", () => {
  beforeEach(() => localStorage.clear());

  it("restores B on an explicit SPA URL switch without writing A into B", () => {
    persistMessages("B", [message("B TEXT")]);
    const { result, rerender } = renderHook(useNavigationHarness, { initialProps: { urlChatId: "A" } });
    rerender({ urlChatId: "B" });
    expect(result.current.messages.map((m) => m.content)).toEqual(["B TEXT"]);
    expect(loadPersistedMessages("B").map((m) => m.content)).toEqual(["B TEXT"]);
    expect(loadPersistedMessages("A").map((m) => m.content)).toEqual(["A TEXT"]);
  });

  it("clears A when the next chat has neither a cache nor matching server messages", () => {
    const { result, rerender } = renderHook(useNavigationHarness, {
      initialProps: { urlChatId: "A", serverMessages: [message("A TEXT")], serverMessagesChatId: "A" },
    });
    rerender({ urlChatId: "B", serverMessages: [message("A TEXT")], serverMessagesChatId: "A" });
    expect(result.current.messages).toEqual([]);
    expect(loadPersistedMessages("B")).toEqual([]);
  });

  it("restores matching server messages even when no longer than the previous chat", () => {
    const { result, rerender } = renderHook(useNavigationHarness, {
      initialProps: { urlChatId: "A", serverMessages: [message("A TEXT")], serverMessagesChatId: "A" },
    });
    rerender({ urlChatId: "B", serverMessages: [message("SERVER B")], serverMessagesChatId: "B" });
    expect(result.current.messages.map((m) => m.content)).toEqual(["SERVER B"]);
    expect(loadPersistedMessages("B").map((m) => m.content)).toEqual(["SERVER B"]);
  });

  it("keeps newly generated messages when creation assigns a new chat id", () => {
    const { result } = renderHook(useNavigationHarness, { initialProps: { urlChatId: "A" } });
    act(() => {
      result.current.setIsCreatingChat(true);
      result.current.setMessages([message("NEW PROMPT")]);
      result.current.setChatId("CREATED");
    });
    act(() => result.current.setIsCreatingChat(false));
    expect(result.current.messages.map((m) => m.content)).toEqual(["NEW PROMPT"]);
    expect(loadPersistedMessages("CREATED").map((m) => m.content)).toEqual(["NEW PROMPT"]);
  });

  it("cancels an old creation on explicit URL navigation and preserves B's original cache", () => {
    const cancelGeneration = vi.fn();
    persistMessages("B", [message("B ORIGINAL")]);
    const { result, rerender } = renderHook(useNavigationHarness, {
      initialProps: { urlChatId: "A", cancelGeneration },
    });
    act(() => {
      result.current.setIsCreatingChat(true);
      result.current.setMessages([{ ...message("A STREAMING"), isStreaming: true }]);
    });
    rerender({ urlChatId: "B", cancelGeneration });
    expect(cancelGeneration).toHaveBeenCalledOnce();
    expect(result.current.messages.map((m) => m.content)).toEqual(["B ORIGINAL"]);
    expect(loadPersistedMessages("B").map((m) => m.content)).toEqual(["B ORIGINAL"]);
    // A canceled stream's finally may still map its assistant id; it cannot append old content.
    act(() => result.current.setMessages((previous) => previous.map((m) =>
      m.id === "A STREAMING" ? { ...m, content: "A LATE" } : m)));
    expect(loadPersistedMessages("B").map((m) => m.content)).toEqual(["B ORIGINAL"]);
  });

  it("does not cancel creation when the URL catches up with its own assigned id", () => {
    const cancelGeneration = vi.fn();
    const { result, rerender } = renderHook(useNavigationHarness, {
      initialProps: { urlChatId: "A", cancelGeneration },
    });
    act(() => {
      result.current.setIsCreatingChat(true);
      result.current.setMessages([message("NEW PROMPT")]);
      result.current.setChatId("CREATED");
    });
    rerender({ urlChatId: "CREATED", cancelGeneration });
    expect(cancelGeneration).not.toHaveBeenCalled();
    expect(loadPersistedMessages("CREATED").map((m) => m.content)).toEqual(["NEW PROMPT"]);
  });
});
