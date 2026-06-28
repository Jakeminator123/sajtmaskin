import { beforeEach, describe, expect, it, vi } from "vitest";

// Cross-tenant guard (P11): POST /api/projects/[id]/save must not persist a
// `chat_id` that references another tenant's engine chat. A chat that exists but
// is owned by someone else → 403; an owned or unresolved ("not_found") id is
// allowed through.

const getProjectByIdForOwner = vi.hoisted(() => vi.fn());
const getProjectData = vi.hoisted(() => vi.fn());
const saveProjectData = vi.hoisted(() => vi.fn());
const deleteCache = vi.hoisted(() => vi.fn());
const getCurrentUser = vi.hoisted(() => vi.fn());
const resolveEngineChatOwnershipForRequest = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/services/projects", () => ({
  getProjectByIdForOwner,
  getProjectData,
  saveProjectData,
}));

vi.mock("@/lib/data/redis", () => ({ deleteCache }));

vi.mock("@/lib/auth/auth", () => ({ getCurrentUser }));

vi.mock("@/lib/auth/session", () => ({
  getSessionIdFromRequest: () => "sess_1",
}));

vi.mock("@/lib/tenant", () => ({ resolveEngineChatOwnershipForRequest }));

import { POST } from "./route";

const PROJECT_ID = "proj_1";

function makeRequest(body: Record<string, unknown>): Request {
  return new Request(`http://localhost/api/projects/${PROJECT_ID}/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams() {
  return { params: Promise.resolve({ id: PROJECT_ID }) };
}

type SaveResponse = { success: boolean; error?: string };

beforeEach(() => {
  getProjectByIdForOwner.mockReset();
  getProjectData.mockReset();
  saveProjectData.mockReset();
  deleteCache.mockReset();
  getCurrentUser.mockReset();
  resolveEngineChatOwnershipForRequest.mockReset();

  getCurrentUser.mockResolvedValue({ id: "user_1" });
  getProjectByIdForOwner.mockResolvedValue({ id: PROJECT_ID });
  getProjectData.mockResolvedValue(null);
  saveProjectData.mockResolvedValue(undefined);
  deleteCache.mockResolvedValue(undefined);
  resolveEngineChatOwnershipForRequest.mockResolvedValue("owned");
});

describe("POST /api/projects/[id]/save — chat ownership guard", () => {
  it("rejects a foreign chatId with 403 and does not persist anything", async () => {
    resolveEngineChatOwnershipForRequest.mockResolvedValue("forbidden");

    const res = await POST(makeRequest({ chatId: "victim_chat" }) as never, makeParams());

    expect(res.status).toBe(403);
    const body = (await res.json()) as SaveResponse;
    expect(body.success).toBe(false);
    expect(body.error).toBe("forbidden");
    expect(saveProjectData).not.toHaveBeenCalled();
  });

  it("persists chat_id when the chat is owned by the caller", async () => {
    resolveEngineChatOwnershipForRequest.mockResolvedValue("owned");

    const res = await POST(makeRequest({ chatId: "my_chat" }) as never, makeParams());

    expect(res.status).toBe(200);
    expect(saveProjectData).toHaveBeenCalledTimes(1);
    expect(saveProjectData.mock.calls[0][0]).toMatchObject({
      project_id: PROJECT_ID,
      chat_id: "my_chat",
    });
  });

  it("allows an unresolved (not_found) chatId through — it cannot leak", async () => {
    resolveEngineChatOwnershipForRequest.mockResolvedValue("not_found");

    const res = await POST(makeRequest({ chatId: "ghost_chat" }) as never, makeParams());

    expect(res.status).toBe(200);
    expect(saveProjectData).toHaveBeenCalledTimes(1);
    expect(saveProjectData.mock.calls[0][0]).toMatchObject({
      project_id: PROJECT_ID,
      chat_id: "ghost_chat",
    });
  });

  it("does not run the ownership check when no chatId is in the body", async () => {
    const res = await POST(makeRequest({ files: [] }) as never, makeParams());

    expect(res.status).toBe(200);
    expect(resolveEngineChatOwnershipForRequest).not.toHaveBeenCalled();
    expect(saveProjectData).toHaveBeenCalledTimes(1);
    expect(saveProjectData.mock.calls[0][0]).not.toHaveProperty("chat_id");
  });

  it("returns 404 (and never checks chat ownership) when the project is not owned", async () => {
    getProjectByIdForOwner.mockResolvedValue(null);

    const res = await POST(makeRequest({ chatId: "my_chat" }) as never, makeParams());

    expect(res.status).toBe(404);
    expect(resolveEngineChatOwnershipForRequest).not.toHaveBeenCalled();
    expect(saveProjectData).not.toHaveBeenCalled();
  });
});
