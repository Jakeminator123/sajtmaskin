import { beforeEach, describe, expect, it, vi } from "vitest";

const finalizeAndSaveVersion = vi.hoisted(() => vi.fn());
const detectIntegrations = vi.hoisted(() => vi.fn());
const MockEmptyGenerationError = vi.hoisted(
  () =>
    class EmptyGenerationError extends Error {
      readonly chatId: string;
      readonly scaffoldId: string | null;

      constructor(chatId: string, scaffoldId: string | null) {
        super("Generation produced no code output");
        this.name = "EmptyGenerationError";
        this.chatId = chatId;
        this.scaffoldId = scaffoldId;
      }
    },
);

vi.mock("@/lib/gen/detect-integrations", () => ({
  detectIntegrations,
}));

vi.mock("./finalize-version", () => ({
  finalizeAndSaveVersion,
  EmptyGenerationError: MockEmptyGenerationError,
}));

import {
  appendPreview,
  extractToolNames,
  finalizeOrHandleEmptyGeneration,
  getUnsignaledDetectedIntegrations,
  looksLikeIncompleteJson,
} from "./shared-own-engine-helpers";
import { EmptyGenerationError } from "./finalize-version";

describe("shared-own-engine-helpers", () => {
  beforeEach(() => {
    finalizeAndSaveVersion.mockReset();
    detectIntegrations.mockReset();
  });

  it("appends and trims preview text to the requested max length", () => {
    expect(appendPreview("abc", "def", 5)).toBe("bcdef");
  });

  it("recognizes incomplete json-like strings", () => {
    expect(looksLikeIncompleteJson('{"a":')).toBe(true);
    expect(looksLikeIncompleteJson("plain text")).toBe(false);
  });

  it("extracts and de-duplicates tool names from ui parts", () => {
    const toolNames = extractToolNames([
      { type: "tool-call", toolName: "search" },
      { type: "tool-result", name: "search" },
      { type: "tool-call", toolName: "save" },
      { type: "text" },
    ]);

    expect(toolNames).toEqual(["search", "save"]);
  });

  it("filters out integrations already signaled by tools", () => {
    detectIntegrations.mockReturnValue([
      { key: "supabase", envVars: ["SUPABASE_URL"] },
      { key: "stripe", envVars: ["STRIPE_SECRET_KEY"] },
    ]);

    const result = getUnsignaledDetectedIntegrations(
      "code",
      new Set(["supabase"]),
    );

    expect(result).toEqual([{ key: "stripe", envVars: ["STRIPE_SECRET_KEY"] }]);
  });

  it("returns the finalized result on success", async () => {
    finalizeAndSaveVersion.mockResolvedValue({ version: { id: "ver_1" } });

    const result = await finalizeOrHandleEmptyGeneration({
      finalizeParams: {
        accumulatedContent: "content",
        chatId: "chat_1",
        model: "gpt-5.4",
        resolvedScaffold: null,
        urlMap: {},
        startedAt: 0,
      },
      emptyGenerationReason: "empty",
      handleEmptyGeneration: vi.fn(),
    });

    expect(result).toEqual({ version: { id: "ver_1" } });
  });

  it("handles EmptyGenerationError via callback and returns null", async () => {
    const handleEmptyGeneration = vi.fn().mockResolvedValue(undefined);
    finalizeAndSaveVersion.mockRejectedValue(
      new EmptyGenerationError("chat_1", null),
    );

    const result = await finalizeOrHandleEmptyGeneration({
      finalizeParams: {
        accumulatedContent: "content",
        chatId: "chat_1",
        model: "gpt-5.4",
        resolvedScaffold: null,
        urlMap: {},
        startedAt: 0,
      },
      emptyGenerationReason: "done_empty_output",
      handleEmptyGeneration,
    });

    expect(result).toBeNull();
    expect(handleEmptyGeneration).toHaveBeenCalledWith(
      "done_empty_output",
      expect.any(EmptyGenerationError),
    );
  });
});
