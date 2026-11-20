/**
 * SM-133: regeln vid första chatten och cachenollningen, utan databas. Att
 * Postgres svarar rätt (transaktion, lås, räkning) provas i
 * `scripts/db/project-cap.postgres.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const events = vi.hoisted(() => [] as string[]);
const chatRows = vi.hoisted(() => ({ value: [] as Array<{ id: string }> }));
const canCreateProject = vi.hoisted(() =>
  vi.fn(async (..._args: unknown[]) => ({ allowed: true, limit: 8, current: 3 }) as {
    allowed: boolean;
    reason?: string;
    limit: number;
    current: number;
  }),
);
const invalidateProjectListCache = vi.hoisted(() =>
  vi.fn(async (..._args: unknown[]) => {
    events.push("invalidate");
  }),
);

const tx = vi.hoisted(() => ({
  execute: vi.fn(async () => ({ rows: [] })),
  select: () => ({
    from: () => ({ where: () => ({ limit: async () => chatRows.value }) }),
  }),
}));

vi.mock("@/lib/db/client", () => ({
  db: {
    transaction: async (run: (database: unknown) => Promise<unknown>) => {
      const result = await run(tx);
      events.push("commit");
      return result;
    },
    select: tx.select,
  },
}));
vi.mock("./project-cleanup", () => ({ canCreateProject }));
vi.mock("./project-list-cache", () => ({ invalidateProjectListCache }));

const { checkProjectCapForFirstChat, createFirstChatWithinProjectCap } = await import(
  "./project-cap"
);

const OWNER = { userId: "user_1", sessionId: "sess_1", isPaidUser: false };
const DENIED = {
  allowed: false,
  reason: "Du har nått maxgränsen för gratiskonton (8 projekt). Ta bort ett projekt eller uppgradera för att bygga fler.",
  limit: 8,
  current: 8,
};

beforeEach(() => {
  events.length = 0;
  chatRows.value = [];
  canCreateProject.mockClear();
  canCreateProject.mockResolvedValue({ allowed: true, limit: 8, current: 3 });
  invalidateProjectListCache.mockClear();
});

describe("checkProjectCapForFirstChat", () => {
  it("släpper igenom ett projekt som redan har en chatt utan att räkna", async () => {
    chatRows.value = [{ id: "chat_1" }];
    await expect(checkProjectCapForFirstChat("proj_1", OWNER)).resolves.toEqual({ allowed: true });
    expect(canCreateProject).not.toHaveBeenCalled();
  });

  it("prövar ett projekt utan chatt mot ägarens byggda projekt utom det här", async () => {
    await checkProjectCapForFirstChat("proj_1", OWNER);
    expect(canCreateProject).toHaveBeenCalledWith("user_1", "sess_1", false, expect.anything(), {
      counted: "built",
      excludeProjectId: "proj_1",
    });
  });

  it("nekar med samma besked som vid skapande", async () => {
    canCreateProject.mockResolvedValue(DENIED);
    await expect(checkProjectCapForFirstChat(null, OWNER)).resolves.toEqual(DENIED);
  });
});

describe("createFirstChatWithinProjectCap", () => {
  it("skriver chatten i transaktionen och nollar listcachen först efter commit", async () => {
    const result = await createFirstChatWithinProjectCap({
      projectId: "proj_1",
      owner: OWNER,
      createChat: async (database) => {
        expect(database).toBe(tx);
        events.push("insert");
        return { id: "chat_new" };
      },
    });

    expect(result).toEqual({ status: "created", chat: { id: "chat_new" } });
    expect(tx.execute).toHaveBeenCalled();
    expect(events).toEqual(["insert", "commit", "invalidate"]);
    expect(invalidateProjectListCache).toHaveBeenCalledWith("user_1", "sess_1");
  });

  it("skriver ingen chatt och rör inte cachen när taket är nått", async () => {
    canCreateProject.mockResolvedValue(DENIED);
    const createChat = vi.fn();

    const result = await createFirstChatWithinProjectCap({
      projectId: "proj_1",
      owner: OWNER,
      createChat,
    });

    expect(result).toEqual({ status: "project_limit", denial: DENIED });
    expect(createChat).not.toHaveBeenCalled();
    expect(invalidateProjectListCache).not.toHaveBeenCalled();
  });
});
