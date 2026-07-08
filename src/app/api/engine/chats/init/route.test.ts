import JSZip from "jszip";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createProject = vi.hoisted(() => vi.fn());
const saveProjectData = vi.hoisted(() => vi.fn());
const createChat = vi.hoisted(() => vi.fn());
const addMessage = vi.hoisted(() => vi.fn());
const createDraftVersion = vi.hoisted(() => vi.fn());
const updateVersionPreviewUrl = vi.hoisted(() => vi.fn());
const getChat = vi.hoisted(() => vi.fn());
const getCurrentUser = vi.hoisted(() => vi.fn());
const prepareCredits = vi.hoisted(() => vi.fn());
const commitCredits = vi.hoisted(() => vi.fn());
const resolveAppProjectIdForRequest = vi.hoisted(() => vi.fn());
const startPreviewSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/services/projects", () => ({
  createProject,
  saveProjectData,
}));

vi.mock("@/lib/db/chat-repository-pg", () => ({
  createChat,
  addMessage,
  createDraftVersion,
  updateVersionPreviewUrl,
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

vi.mock("@/lib/gen/preview/preview-session", () => ({
  startPreviewSession,
}));

vi.mock("@/lib/models/selection", () => ({
  resolveEngineModelId: () => "gpt-5.4",
}));

vi.mock("@/lib/rateLimit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

import { POST } from "./route";

describe("POST /api/engine/chats/init", () => {
  beforeEach(() => {
    createProject.mockReset();
    saveProjectData.mockReset();
    createChat.mockReset();
    addMessage.mockReset();
    createDraftVersion.mockReset();
    updateVersionPreviewUrl.mockReset();
    getChat.mockReset();
    getCurrentUser.mockReset();
    prepareCredits.mockReset();
    commitCredits.mockReset();
    resolveAppProjectIdForRequest.mockReset();
    startPreviewSession.mockReset();

    getCurrentUser.mockResolvedValue(null);
    prepareCredits.mockResolvedValue({ ok: true, commit: commitCredits });
    resolveAppProjectIdForRequest.mockResolvedValue(null);
    startPreviewSession.mockResolvedValue({
      ok: true,
      result: {
        previewUrl: "https://example-preview.test/?chatId=chat_import",
        previewSessionId: "preview_import",
        previewMode: "dev_only",
        fidelityTier: 2,
        startOutcome: "recreated",
        tier2Meta: { tier2Provider: "preview_host" },
      },
    });
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
    zip.file("repo-root/pnpm-lock.yaml", "lockfileVersion: '9.0'");
    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    const response = await POST(
      new Request("https://example.com/api/engine/chats/init", {
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
      expect.stringContaining('"path":"pnpm-lock.yaml"'),
      undefined,
      { editKind: "imported_repo" },
    );
    expect(saveProjectData).toHaveBeenCalled();
    expect(commitCredits).toHaveBeenCalled();
  });

  // A#7 (P1): yarn.lock has no recognised extension in TEXT_EXTENSIONS, so it
  // was silently dropped before the TEXT_BASENAMES fix. Without it the preview
  // host falls back to `npm install` instead of `yarn install --frozen-lockfile`.
  it("preserves yarn.lock from ZIP so the preview host selects yarn install", async () => {
    const zip = new JSZip();
    zip.file("repo-root/src/app/page.tsx", 'export default function Page() { return <div>Hi</div>; }');
    zip.file("repo-root/package.json", '{ "name": "yarn-repo" }');
    zip.file("repo-root/yarn.lock", "# yarn lockfile v1\n");
    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    const response = await POST(
      new Request("https://example.com/api/engine/chats/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: { type: "zip", content: buffer.toString("base64") },
          message: "Make this a portfolio",
          lockConfigFiles: true,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(createDraftVersion).toHaveBeenCalledWith(
      "chat_import",
      "msg_assistant",
      expect.stringContaining('"path":"yarn.lock"'),
      undefined,
      { editKind: "imported_repo" },
    );
  });
});
