import { beforeEach, describe, expect, it, vi } from "vitest";

// Locks the GET /api/projects/[id]/chat JSON contract after dropping the
// duplicate `v0ChatId` response key (Codex P1 on #279): the client only reads
// `chatId` (+ `internalChatId`), so project-restore must keep working from
// those two fields alone and the response must NOT regress a `v0ChatId` key.

const getProjectByIdForOwner = vi.hoisted(() => vi.fn());
const getProjectData = vi.hoisted(() => vi.fn());
const getCurrentUser = vi.hoisted(() => vi.fn());
const getEngineChat = vi.hoisted(() => vi.fn());
const listEngineChatsByProject = vi.hoisted(() => vi.fn());
const updateEngineChatProjectId = vi.hoisted(() => vi.fn());
const dbSelect = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/services/projects", () => ({
  getProjectByIdForOwner,
  getProjectData,
}));

vi.mock("@/lib/auth/auth", () => ({ getCurrentUser }));

vi.mock("@/lib/auth/session", () => ({
  getSessionIdFromRequest: () => "sess_1",
}));

vi.mock("@/lib/db/chat-repository-pg", () => ({
  getChat: getEngineChat,
  listChatsByProject: listEngineChatsByProject,
  updateChatProjectId: updateEngineChatProjectId,
}));

vi.mock("@/lib/db/client", () => ({ db: { select: dbSelect } }));

import { GET } from "./route";

const PROJECT_ID = "proj_1";

function makeRequest(): Request {
  return new Request(`http://localhost/api/projects/${PROJECT_ID}/chat`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
}

function makeParams() {
  return { params: Promise.resolve({ id: PROJECT_ID }) };
}

/** Mimics a resolved drizzle `db.select(...).from(...).where(...).limit(1)` chain. */
function dbRows(rows: unknown[]) {
  return {
    from: () => ({ where: () => ({ limit: () => Promise.resolve(rows) }) }),
  };
}

type ChatResponse = {
  success: boolean;
  chatId: string | null;
  internalChatId: string | null;
  message?: string;
};

beforeEach(() => {
  getProjectByIdForOwner.mockReset();
  getProjectData.mockReset();
  getCurrentUser.mockReset();
  getEngineChat.mockReset();
  listEngineChatsByProject.mockReset();
  updateEngineChatProjectId.mockReset();
  dbSelect.mockReset();

  getCurrentUser.mockResolvedValue({ id: "user_1" });
  getProjectByIdForOwner.mockResolvedValue({ id: PROJECT_ID });
  getProjectData.mockResolvedValue(null);
  getEngineChat.mockResolvedValue(null);
  listEngineChatsByProject.mockResolvedValue([]);
  dbSelect.mockReturnValue(dbRows([]));
});

describe("GET /api/projects/[id]/chat — response contract (no v0ChatId)", () => {
  it("returns chatId+internalChatId null and no v0ChatId when project is not accessible", async () => {
    getProjectByIdForOwner.mockResolvedValue(null);

    const res = await GET(makeRequest() as never, makeParams());
    expect(res.status).toBe(200);
    const body = (await res.json()) as ChatResponse;
    expect(body.chatId).toBeNull();
    expect(body.internalChatId).toBeNull();
    expect(body).not.toHaveProperty("v0ChatId");
  });

  it("restores from project_data.chat_id using chatId(v0)+internalChatId, no v0ChatId key", async () => {
    getProjectData.mockResolvedValue({ chat_id: "v0_abc" });
    dbSelect.mockReturnValue(
      dbRows([{ id: "internal_1", v0ChatId: "v0_abc", createdAt: new Date() }]),
    );

    const res = await GET(makeRequest() as never, makeParams());
    expect(res.status).toBe(200);
    const body = (await res.json()) as ChatResponse;
    // Project-restore still resolves: client `chatId` = the v0 chat id, and the
    // internal DB id is exposed separately. Both are non-null.
    expect(body.chatId).toBe("v0_abc");
    expect(body.internalChatId).toBe("internal_1");
    expect(body).not.toHaveProperty("v0ChatId");
  });

  it("falls back to the latest engine chat (chatId === internalChatId), no v0ChatId key", async () => {
    listEngineChatsByProject.mockResolvedValue([{ id: "chat_x" }]);

    const res = await GET(makeRequest() as never, makeParams());
    expect(res.status).toBe(200);
    const body = (await res.json()) as ChatResponse;
    expect(body.chatId).toBe("chat_x");
    expect(body.internalChatId).toBe("chat_x");
    expect(body).not.toHaveProperty("v0ChatId");
  });

  it("returns nulls and no v0ChatId when the project has no chat", async () => {
    const res = await GET(makeRequest() as never, makeParams());
    expect(res.status).toBe(200);
    const body = (await res.json()) as ChatResponse;
    expect(body.chatId).toBeNull();
    expect(body.internalChatId).toBeNull();
    expect(body).not.toHaveProperty("v0ChatId");
  });
});
