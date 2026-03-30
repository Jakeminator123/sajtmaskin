import JSZip from "jszip";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createProject = vi.hoisted(() => vi.fn());
const saveProjectData = vi.hoisted(() => vi.fn());
const createChat = vi.hoisted(() => vi.fn());
const addMessage = vi.hoisted(() => vi.fn());
const createDraftVersion = vi.hoisted(() => vi.fn());
const getChat = vi.hoisted(() => vi.fn());
const getCurrentUser = vi.hoisted(() => vi.fn());
const prepareCredits = vi.hoisted(() => vi.fn());
const commitCredits = vi.hoisted(() => vi.fn());
const resolveAppProjectIdForRequest = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/services", () => ({
  createProject,
  saveProjectData,
}));

vi.mock("@/lib/db/chat-repository-pg", () => ({
  createChat,
  addMessage,
  createDraftVersion,
  getChat,
}));

vi.mock("@/lib/auth/auth", () => ({
  getCurrentUser,
}));

vi.mock("@/lib/auth/session", () => ({
  ensureSessionIdFromRequest: () => ({ sessionId: "sess_1", setCookie: null }),
}));

vi.mock("@/lib/credits/server", () => ({
  prepareCredits,
}));

vi.mock("@/lib/tenant", () => ({
  resolveAppProjectIdForRequest,
}));

vi.mock("@/lib/models/selection", () => ({
  resolveEngineModelId: () => "gpt-5.4",
}));

vi.mock("@/lib/rateLimit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

import { POST } from "./route";

describe("POST /api/v0/chats/init", () => {
  beforeEach(() => {
    createProject.mockReset();
    saveProjectData.mockReset();
    createChat.mockReset();
    addMessage.mockReset();
    createDraftVersion.mockReset();
    getChat.mockReset();
    getCurrentUser.mockReset();
    prepareCredits.mockReset();
    commitCredits.mockReset();
    resolveAppProjectIdForRequest.mockReset();

    getCurrentUser.mockResolvedValue(null);
    prepareCredits.mockResolvedValue({ ok: true, commit: commitCredits });
    resolveAppProjectIdForRequest.mockResolvedValue(null);
    createProject.mockResolvedValue({ id: "proj_import" });
    createChat.mockResolvedValue({ id: "chat_import" });
    addMessage
      .mockResolvedValueOnce({ id: "msg_user" })
      .mockResolvedValueOnce({ id: "msg_assistant" });
    createDraftVersion.mockResolvedValue({ id: "ver_import" });
    getChat.mockResolvedValue({ messages: [{ id: "msg_assistant", role: "assistant" }] });
  });

  it("imports ZIP content into an own-engine chat and first version", async () => {
    const zip = new JSZip();
    zip.file("repo-root/src/app/page.tsx", 'export default function Page() { return <div>Hej</div>; }');
    zip.file("repo-root/package.json", '{ "name": "demo" }');
    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    const response = await POST(
      new Request("https://example.com/api/v0/chats/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: {
            type: "zip",
            content: buffer.toString("base64"),
          },
          message: "Gor detta till en portfolio",
          lockConfigFiles: true,
        }),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      success: true,
      id: "chat_import",
      chatId: "chat_import",
      versionId: "ver_import",
      projectId: "proj_import",
      source: "zip",
    });
    expect(json.previewUrl).toContain("chatId=chat_import");
    expect(Array.isArray(json.lockedFiles)).toBe(true);
    expect(createChat).toHaveBeenCalledWith("proj_import", "gpt-5.4");
    expect(createDraftVersion).toHaveBeenCalledWith(
      "chat_import",
      "msg_assistant",
      expect.stringContaining('"path":"src/app/page.tsx"'),
    );
    expect(saveProjectData).toHaveBeenCalled();
    expect(commitCredits).toHaveBeenCalled();
  });
});
