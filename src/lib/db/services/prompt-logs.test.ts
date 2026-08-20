import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Init skriver `create_chat` innan chatten finns. Claimen måste sätta
 * `chat_id` på den redan skrivna raden — annars är den osynlig i chat-scope.
 */

const rows = vi.hoisted(() => ({
  byId: new Map<string, Record<string, unknown>>(),
}));
const executeSpy = vi.hoisted(() => vi.fn());

vi.mock("./shared", () => ({ assertDbConfigured: vi.fn() }));

vi.mock("nanoid", () => ({ nanoid: () => "plog_create_1" }));

vi.mock("@/lib/db/schema", () => ({
  promptLogs: {
    id: "prompt_logs.id",
    chat_id: "prompt_logs.chat_id",
    user_id: "prompt_logs.user_id",
    created_at: "prompt_logs.created_at",
  },
}));

vi.mock("@/lib/db/client", () => ({
  db: {
    insert: () => ({
      values: (payload: Record<string, unknown>) => {
        rows.byId.set(String(payload.id), { ...payload });
        return Promise.resolve();
      },
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: () => {
          const current = rows.byId.get("plog_create_1");
          if (current && current.chat_id == null) {
            Object.assign(current, values);
          }
          return Promise.resolve();
        },
      }),
    }),
    execute: executeSpy,
  },
  dbConfigured: true,
}));

const { attachPromptLogChatId, createPromptLog } = await import("./prompt-logs");

describe("create_chat prompt log chat_id claim", () => {
  beforeEach(() => {
    rows.byId.clear();
    executeSpy.mockReset();
    executeSpy.mockResolvedValue(undefined);
  });

  it("lämnar create_chat-raden med chat_id null vid skrivning", async () => {
    const id = await createPromptLog({
      event: "create_chat",
      userId: "user_1",
      sessionId: "sess_1",
      chatId: null,
      promptOriginal: "Bygg en kaffebar",
    });

    expect(id).toBe("plog_create_1");
    expect(rows.byId.get("plog_create_1")).toMatchObject({
      event: "create_chat",
      chat_id: null,
      prompt_original: "Bygg en kaffebar",
    });
  });

  it("stämplar chattens id på create_chat-raden när chatten skapats", async () => {
    await createPromptLog({
      event: "create_chat",
      userId: "user_1",
      chatId: null,
      promptOriginal: "Bygg en kaffebar",
    });

    await attachPromptLogChatId("plog_create_1", "engine_chat_1");

    expect(rows.byId.get("plog_create_1")).toMatchObject({
      event: "create_chat",
      chat_id: "engine_chat_1",
    });
  });

  it("skriver inte över en redan claimad rad", async () => {
    await createPromptLog({
      event: "create_chat",
      chatId: "already_set",
    });

    await attachPromptLogChatId("plog_create_1", "other_chat");

    expect(rows.byId.get("plog_create_1")?.chat_id).toBe("already_set");
  });

  it("returnerar id även när retention faller, så create_chat-raden kan claimas", async () => {
    executeSpy.mockRejectedValue(new Error("retention down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const id = await createPromptLog({
      event: "create_chat",
      userId: "user_1",
      chatId: null,
      promptOriginal: "Bygg en kaffebar",
    });

    expect(id).toBe("plog_create_1");
    await attachPromptLogChatId(id, "engine_chat_1");
    expect(rows.byId.get("plog_create_1")).toMatchObject({
      event: "create_chat",
      chat_id: "engine_chat_1",
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("rör inte retention och no-opar på tomma id", async () => {
    await createPromptLog({
      event: "create_chat",
      userId: "user_1",
      chatId: null,
    });
    const executeCountAfterInsert = executeSpy.mock.calls.length;
    expect(executeCountAfterInsert).toBeGreaterThan(0);

    await attachPromptLogChatId("   ", "engine_chat_1");
    await attachPromptLogChatId("plog_create_1", "   ");

    expect(executeSpy).toHaveBeenCalledTimes(executeCountAfterInsert);
    expect(rows.byId.get("plog_create_1")?.chat_id).toBeNull();
  });
});
