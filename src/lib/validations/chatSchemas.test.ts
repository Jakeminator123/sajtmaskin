import { describe, expect, it } from "vitest";

import { MAX_CHAT_MESSAGE_CHARS } from "@/lib/builder/promptLimits";
import { createChatSchema, sendMessageSchema } from "./chatSchemas";

describe("chatSchemas prompt metadata guards", () => {
  it("rejects oversized create-chat prompt metadata payloads", () => {
    const result = createChatSchema.safeParse({
      message: "Build a company site",
      meta: {
        promptOriginal: "x".repeat(MAX_CHAT_MESSAGE_CHARS + 1),
      },
    });

    expect(result.success).toBe(false);
  });

  it("rejects oversized send-message formatted prompt payloads", () => {
    const result = sendMessageSchema.safeParse({
      message: "Update the hero copy",
      meta: {
        promptFormatted: "y".repeat(MAX_CHAT_MESSAGE_CHARS + 1),
      },
    });

    expect(result.success).toBe(false);
  });

  it("still accepts bounded prompt metadata payloads", () => {
    const result = createChatSchema.safeParse({
      message: "Build a company site",
      meta: {
        promptOriginal: "x".repeat(128),
        promptFormatted: "y".repeat(128),
        promptAssistModel: "gpt-5.4",
        buildMethod: "freeform",
      },
    });

    expect(result.success).toBe(true);
  });
});
