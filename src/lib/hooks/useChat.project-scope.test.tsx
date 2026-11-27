import { renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
const response = vi.hoisted(() => ({ chat: {} as Record<string, unknown> }));
vi.mock("swr", () => ({
  default: () => ({ data: response.chat, isLoading: false, mutate: vi.fn() }),
}));
import { useChat } from "./useChat";

it("derives the project from the current engine response when the entry only has chatId", () => {
  response.chat = { id: "active-chat", chatId: "active-chat", projectId: "verified-site", modelTier: "ultra" };
  const { result, rerender } = renderHook(({ chatId }) => useChat(chatId), { initialProps: { chatId: "active-chat" } });
  expect(result.current.projectId).toBe("verified-site");
  expect(result.current.modelTier).toBe("ultra");
  rerender({ chatId: "next-active-chat" });
  expect(result.current.projectId).toBeNull();
  expect(result.current.modelTier).toBeUndefined();
  response.chat = { id: "next-active-chat", projectId: "next-verified-site", modelTier: "old-unknown" };
  rerender({ chatId: "next-active-chat" });
  expect(result.current.projectId).toBe("next-verified-site");
  expect(result.current.modelTier).toBeNull();
});
