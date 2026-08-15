import { beforeEach, describe, expect, it, vi } from "vitest";

const values = vi.hoisted(() => vi.fn());
const limit = vi.hoisted(() => vi.fn());

vi.mock("../client", () => ({
  db: {
    insert: () => ({ values }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit,
        }),
      }),
    }),
  },
}));

import { createChat } from "./chats";

function drizzleChatRow(id: string) {
  return {
    id,
    projectId: "proj_1",
    title: null,
    model: "gpt-5.4",
    systemPrompt: null,
    scaffoldId: null,
    createdAt: new Date("2026-08-15T00:00:00.000Z"),
    updatedAt: new Date("2026-08-15T00:00:00.000Z"),
  };
}

describe("createChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    values.mockResolvedValue(undefined);
  });

  it("uses a caller-supplied id instead of minting one", async () => {
    const mint = vi.spyOn(crypto, "randomUUID");
    limit.mockResolvedValue([drizzleChatRow("chat_given")]);

    const chat = await createChat("proj_1", "gpt-5.4", "SYSTEM", "scaffold_1", {
      id: "chat_given",
    });

    expect(mint).not.toHaveBeenCalled();
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "chat_given",
        projectId: "proj_1",
        model: "gpt-5.4",
        systemPrompt: "SYSTEM",
        scaffoldId: "scaffold_1",
      }),
    );
    expect(chat.id).toBe("chat_given");
    mint.mockRestore();
  });

  it("mints an id when callers omit options (template/init/non-stream)", async () => {
    const minted = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const mint = vi.spyOn(crypto, "randomUUID").mockReturnValue(minted as ReturnType<
      typeof crypto.randomUUID
    >);
    limit.mockResolvedValue([drizzleChatRow(minted)]);

    const chat = await createChat("proj_import", "gpt-5.4");

    expect(mint).toHaveBeenCalledOnce();
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        id: minted,
        projectId: "proj_import",
        model: "gpt-5.4",
      }),
    );
    expect(chat.id).toBe(minted);
    mint.mockRestore();
  });
});
