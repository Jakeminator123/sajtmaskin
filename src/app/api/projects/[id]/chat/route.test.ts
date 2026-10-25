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
const getAppProjectByIdForRequest = vi.hoisted(() => vi.fn());
const getChatByIdForRequest = vi.hoisted(() => vi.fn());
const getChatByV0ChatIdForRequest = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/services/projects", () => ({
  getProjectByIdForOwner,
  getProjectData,
}));

vi.mock("@/lib/tenant", () => ({
  getAppProjectByIdForRequest,
  getChatByIdForRequest,
  getChatByV0ChatIdForRequest,
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

import { GET } from "./route";

const PROJECT_ID = "proj_1";

function makeRequest(): Request {
  return new Request(`http://localhost/api/projects/${PROJECT_ID}/chat`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
}

function makeParams(id = PROJECT_ID) {
  return { params: Promise.resolve({ id }) };
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
  getAppProjectByIdForRequest.mockReset();
  getChatByIdForRequest.mockReset();
  getChatByV0ChatIdForRequest.mockReset();

  getCurrentUser.mockResolvedValue({ id: "user_1" });
  getProjectByIdForOwner.mockResolvedValue({ id: PROJECT_ID });
  getProjectData.mockResolvedValue(null);
  getEngineChat.mockResolvedValue(null);
  listEngineChatsByProject.mockResolvedValue([]);
  getAppProjectByIdForRequest.mockResolvedValue(null);
  getChatByIdForRequest.mockResolvedValue(null);
  getChatByV0ChatIdForRequest.mockResolvedValue(null);
});

describe("GET /api/projects/[id]/chat — response contract (no v0ChatId)", () => {
  it("rejects an oversized project id before ownership lookup", async () => {
    const res = await GET(makeRequest() as never, makeParams("x".repeat(201)));

    expect(res.status).toBe(400);
    expect(getCurrentUser).not.toHaveBeenCalled();
    expect(getProjectByIdForOwner).not.toHaveBeenCalled();
  });

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
    getChatByV0ChatIdForRequest.mockResolvedValue({
      id: "internal_1",
      v0ChatId: "v0_abc",
      createdAt: new Date(),
    });

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

describe("GET /api/projects/[id]/chat — cross-tenant remap guard (P11)", () => {
  it("does not restore a foreign legacy chat referenced by project_data", async () => {
    getProjectData.mockResolvedValue({ chat_id: "victim_v0_chat" });

    const res = await GET(makeRequest() as never, makeParams());
    const body = (await res.json()) as ChatResponse;

    expect(res.status).toBe(200);
    expect(body.chatId).toBeNull();
    expect(body.internalChatId).toBeNull();
    expect(getChatByV0ChatIdForRequest).toHaveBeenCalledWith(
      expect.anything(),
      "victim_v0_chat",
      { sessionId: "sess_1" },
    );
  });

  it("refuses to remap an engine chat the caller does not own (no steal, returns null)", async () => {
    // project_data.chat_id points at an engine chat whose project belongs to
    // ANOTHER tenant (attacker-supplied reference via /save).
    getProjectData.mockResolvedValue({ chat_id: "engine_x" });
    getEngineChat.mockResolvedValue({
      id: "engine_x",
      project_id: "victim_proj",
      created_at: new Date().toISOString(),
    });
    // Caller does NOT own the chat's current project.
    getAppProjectByIdForRequest.mockResolvedValue(null);

    const res = await GET(makeRequest() as never, makeParams());
    expect(res.status).toBe(200);
    const body = (await res.json()) as ChatResponse;
    expect(body.chatId).toBeNull();
    expect(body.internalChatId).toBeNull();
    expect(updateEngineChatProjectId).not.toHaveBeenCalled();
  });

  it("self-heals drift WITHIN the same owner (remaps and restores the chat)", async () => {
    getProjectData.mockResolvedValue({ chat_id: "engine_x" });
    getEngineChat.mockResolvedValue({
      id: "engine_x",
      project_id: "other_owned_proj",
      created_at: new Date().toISOString(),
    });
    // Caller owns the chat's current project → drift is safe to heal.
    getAppProjectByIdForRequest.mockResolvedValue({ id: "other_owned_proj" });

    const res = await GET(makeRequest() as never, makeParams());
    expect(res.status).toBe(200);
    const body = (await res.json()) as ChatResponse;
    expect(body.chatId).toBe("engine_x");
    expect(body.internalChatId).toBe("engine_x");
    expect(updateEngineChatProjectId).toHaveBeenCalledWith("engine_x", PROJECT_ID);
  });

  it("does not expose lookup failures", async () => {
    getProjectData.mockResolvedValue({ chat_id: "v0_abc" });
    getChatByV0ChatIdForRequest.mockRejectedValue(new Error("database host secret"));

    const res = await GET(makeRequest() as never, makeParams());

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: "Failed to get project chat" });
  });
});
