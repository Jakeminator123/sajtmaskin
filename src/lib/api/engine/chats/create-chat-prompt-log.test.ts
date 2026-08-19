import { beforeEach, describe, expect, it, vi } from "vitest";

const createPromptLog = vi.hoisted(() => vi.fn());
const attachPromptLogChatId = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/services/prompt-logs", () => ({
  createPromptLog,
  attachPromptLogChatId,
}));

const { attachCreateChatPromptLogChatId, recordCreateChatPromptLog } = await import(
  "./create-chat-prompt-log"
);

describe("recordCreateChatPromptLog + attach", () => {
  beforeEach(() => {
    createPromptLog.mockReset();
    attachPromptLogChatId.mockReset();
    createPromptLog.mockResolvedValue("plog_1");
    attachPromptLogChatId.mockResolvedValue(undefined);
  });

  it("skriver create_chat utan chat_id och stämplar chattens id efteråt", async () => {
    const logId = await recordCreateChatPromptLog({
      userId: "user_1",
      sessionId: "sess_1",
      chatId: null,
      promptOriginal: "Bygg en kaffebar",
      promptFormatted: "Bygg en kaffebar",
    });

    expect(logId).toBe("plog_1");
    expect(createPromptLog).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "create_chat",
        chatId: null,
        promptOriginal: "Bygg en kaffebar",
      }),
    );

    await attachCreateChatPromptLogChatId(logId, "engine_chat_1");

    expect(attachPromptLogChatId).toHaveBeenCalledWith("plog_1", "engine_chat_1");
  });

  it("behåller den skrivna raden när chat-skapandet aldrig kommer", async () => {
    const logId = await recordCreateChatPromptLog({
      chatId: null,
      promptOriginal: "Bygg en kaffebar",
    });

    expect(logId).toBe("plog_1");
    expect(attachPromptLogChatId).not.toHaveBeenCalled();
  });

  it("loggar prompten även när INSERT faller, och attach är då en no-op", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    createPromptLog.mockRejectedValue(new Error("db down"));

    const logId = await recordCreateChatPromptLog({
      chatId: null,
      promptOriginal: "Bygg en kaffebar",
    });

    expect(logId).toBeNull();
    await attachCreateChatPromptLogChatId(logId, "engine_chat_1");
    expect(attachPromptLogChatId).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("låter chat-skapandet leva vidare om claimen faller", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    attachPromptLogChatId.mockRejectedValue(new Error("update failed"));

    await expect(
      attachCreateChatPromptLogChatId("plog_1", "engine_chat_1"),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
