import { afterEach, describe, expect, it } from "vitest";

import { readChatGenerationSettings } from "./chat-generation-settings";

const KEY = "sajtmaskin:chatGenerationSettings:chat-1";

afterEach(() => {
  localStorage.clear();
});

describe("readChatGenerationSettings", () => {
  it("keeps a tier that is still in the slider", () => {
    localStorage.setItem(KEY, JSON.stringify({ modelTier: "ultra", imageGenerations: false }));
    expect(readChatGenerationSettings("chat-1")).toEqual({
      modelTier: "ultra",
      imageGenerations: false,
    });
  });

  it("opens a chat saved on a hidden tier on the default tier, not the previous slider value", () => {
    localStorage.setItem(KEY, JSON.stringify({ modelTier: "anthropic", imageGenerations: true }));
    expect(readChatGenerationSettings("chat-1")).toEqual({
      modelTier: "max",
      imageGenerations: true,
    });
    localStorage.setItem(KEY, JSON.stringify({ modelTier: "codex" }));
    expect(readChatGenerationSettings("chat-1")?.modelTier).toBe("max");
  });

  it("returns null for missing or unknown tiers", () => {
    expect(readChatGenerationSettings("chat-1")).toBeNull();
    localStorage.setItem(KEY, JSON.stringify({ modelTier: "not-a-tier" }));
    expect(readChatGenerationSettings("chat-1")).toBeNull();
  });
});
