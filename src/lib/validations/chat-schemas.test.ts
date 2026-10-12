import { describe, expect, it } from "vitest";

import { MAX_CHAT_MESSAGE_CHARS } from "@/lib/builder/prompt-limits";
import { createChatSchema, sendMessageSchema } from "./chat-schemas";

describe("chatSchemas prompt metadata guards", () => {
  for (const [name, schema] of [["create", createChatSchema], ["followup", sendMessageSchema]] as const) {
    it.each([true, false, undefined])(`${name}: validates materializeImages with missing=off, independently of imageGenerations (%s)`, (choice) => {
      const result = schema.parse({ message: "Build a site", materializeImages: choice, imageGenerations: choice !== true });
      expect(result.materializeImages).toBe(choice === true);
      expect(result.imageGenerations).toBe(choice !== true);
      expect(schema.parse({ message: "Build a site", meta: { materializeImages: true } }).materializeImages).toBe(false);
    });
    it.each(["true", 1, null, {}, []])(`${name}: rejects invalid materializeImages %j`, (choice) => {
      expect(schema.safeParse({ message: "Build a site", materializeImages: choice }).success).toBe(false);
    });
  }
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
