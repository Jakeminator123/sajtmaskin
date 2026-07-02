import { beforeEach, describe, expect, it, vi } from "vitest";

// Mutable gate state so a single test can flip the master flag / surface.
const gate = vi.hoisted(() => ({ editAgentEnabled: true, surfaceEnabled: true }));

const getEngineChatByIdForRequest = vi.hoisted(() => vi.fn());
const getEngineVersionForChatByIdForRequest = vi.hoisted(() => vi.fn());
const getPreferredVersion = vi.hoisted(() => vi.fn());
const getLatestVersion = vi.hoisted(() => vi.fn());
const getVersionFiles = vi.hoisted(() => vi.fn());
const parseCodeFilesFromFilesJson = vi.hoisted(() => vi.fn());
const runQuickEdit = vi.hoisted(() => vi.fn());
const requestQuickEditOps = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rateLimit", () => ({
  withRateLimit: (_req: Request, _key: string, handler: () => Promise<Response>) => handler(),
}));

vi.mock("@/lib/config", () => ({
  OPENCLAW: {
    get editAgentEnabled() {
      return gate.editAgentEnabled;
    },
  },
}));

vi.mock("@/lib/openclaw/status", () => ({
  getOpenClawSurfaceStatus: () => ({
    surfaceEnabled: gate.surfaceEnabled,
    blockers: gate.surfaceEnabled ? [] : ["OPENCLAW_GATEWAY_URL is not configured"],
  }),
}));

vi.mock("@/lib/tenant", () => ({
  getEngineChatByIdForRequest,
  getEngineVersionForChatByIdForRequest,
}));

vi.mock("@/lib/db/chat-repository-pg", () => ({
  getPreferredVersion,
  getLatestVersion,
}));

vi.mock("@/lib/gen/version-manager", () => ({
  getVersionFiles,
  parseCodeFilesFromFilesJson,
}));

vi.mock("@/lib/gen/quick-edit", () => ({
  runQuickEdit,
}));

vi.mock("@/lib/openclaw/edit", () => ({
  requestQuickEditOps,
}));

import { POST } from "./route";

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/openclaw/edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

const OPS = [{ kind: "replace_text", path: "app/globals.css", find: "pink", replace: "blue" }];

describe("POST /api/openclaw/edit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gate.editAgentEnabled = true;
    gate.surfaceEnabled = true;
    getEngineChatByIdForRequest.mockResolvedValue({ id: "chat-1", project_id: "proj-1" });
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      version: { id: "ver-1", lifecycle_stage: "design" },
    });
    getPreferredVersion.mockResolvedValue({ id: "ver-1" });
    getLatestVersion.mockResolvedValue({ id: "ver-1" });
    getVersionFiles.mockResolvedValue([{ path: "app/globals.css", content: ":root{--brand:pink}" }]);
    requestQuickEditOps.mockResolvedValue({
      ok: true,
      ops: OPS,
      summary: "Byter rosa mot blå",
      // The op's path MUST be among includedPaths or the op_path_not_shown guard
      // would reject it (see the dedicated test below).
      includedPaths: ["app/globals.css"],
      truncated: false,
    });
    runQuickEdit.mockResolvedValue({
      ok: true,
      versionId: "ver-2",
      messageId: "msg-1",
      changedPaths: ["app/globals.css"],
      structuralChange: false,
      previewUrl: "https://preview.example/app",
      previewSessionId: "sess-1",
      previewMode: "patched",
      previewError: null,
    });
  });

  it("404s when the OPENCLAW_EDIT_AGENT flag is off (feature is a no-op)", async () => {
    gate.editAgentEnabled = false;
    const res = await post({ chatId: "chat-1", instruction: "gör färgen blå" });
    expect(res.status).toBe(404);
    // Hard gate: nothing downstream runs.
    expect(getEngineChatByIdForRequest).not.toHaveBeenCalled();
    expect(requestQuickEditOps).not.toHaveBeenCalled();
    expect(runQuickEdit).not.toHaveBeenCalled();
  });

  it("503s when the OpenClaw surface (gateway) is disabled", async () => {
    gate.surfaceEnabled = false;
    const res = await post({ chatId: "chat-1", instruction: "gör färgen blå" });
    expect(res.status).toBe(503);
    expect(requestQuickEditOps).not.toHaveBeenCalled();
  });

  it("400s on an invalid body (missing instruction)", async () => {
    const res = await post({ chatId: "chat-1" });
    expect(res.status).toBe(400);
    expect(getEngineChatByIdForRequest).not.toHaveBeenCalled();
  });

  it("404s when the requester does not own the chat (cross-tenant guard)", async () => {
    getEngineChatByIdForRequest.mockResolvedValue(null);
    const res = await post({ chatId: "chat-x", instruction: "gör färgen blå" });
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.error).toBe("Chat not found");
    // Never read files / call the gateway for a chat you don't own.
    expect(getVersionFiles).not.toHaveBeenCalled();
    expect(requestQuickEditOps).not.toHaveBeenCalled();
  });

  it("404s when the requested base version is not owned by the chat", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue(null);
    const res = await post({
      chatId: "chat-1",
      instruction: "gör färgen blå",
      activeVersionId: "ver-forged",
    });
    expect(res.status).toBe(404);
    expect(requestQuickEditOps).not.toHaveBeenCalled();
  });

  it("409s stale_base_version when the client's known-latest lags the server preferred", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      version: { id: "ver-old", lifecycle_stage: "design" },
    });
    getPreferredVersion.mockResolvedValue({ id: "ver-new" });
    const res = await post({
      chatId: "chat-1",
      instruction: "gör färgen blå",
      activeVersionId: "ver-old",
      engineLatestKnownVersionId: "ver-old",
    });
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.error).toBe("stale_base_version");
    expect(body.serverPreferredVersionId).toBe("ver-new");
    // No forking: never generate ops or apply against a stale base.
    expect(requestQuickEditOps).not.toHaveBeenCalled();
    expect(runQuickEdit).not.toHaveBeenCalled();
  });

  it("422s integrations_base on an F3 version without calling the gateway", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      version: { id: "ver-1", lifecycle_stage: "integrations" },
    });
    const res = await post({
      chatId: "chat-1",
      instruction: "gör färgen blå",
      activeVersionId: "ver-1",
    });
    const body = await res.json();
    expect(res.status).toBe(422);
    expect(body.reason).toBe("integrations_base");
    expect(requestQuickEditOps).not.toHaveBeenCalled();
    expect(runQuickEdit).not.toHaveBeenCalled();
  });

  it("422s when ops generation fails (never a silent no-op)", async () => {
    requestQuickEditOps.mockResolvedValue({ ok: false, error: "Text not found in app/globals.css." });
    const res = await post({
      chatId: "chat-1",
      instruction: "gör färgen blå",
      activeVersionId: "ver-1",
    });
    const body = await res.json();
    expect(res.status).toBe(422);
    expect(body.reason).toBe("ops_generation_failed");
    expect(body.error).toContain("Text not found");
    expect(runQuickEdit).not.toHaveBeenCalled();
  });

  it("422s op_path_not_shown when an op targets a base file that was never shown to the gateway", async () => {
    // Two base files, but the gateway only saw one (the other was dropped by
    // truncation) yet returned an op for the unseen file — a hallucinated
    // overwrite that must be rejected before it reaches runQuickEdit.
    getVersionFiles.mockResolvedValue([
      { path: "app/globals.css", content: ":root{--brand:pink}" },
      { path: "app/page.tsx", content: "export default function Page(){return null}" },
    ]);
    requestQuickEditOps.mockResolvedValue({
      ok: true,
      ops: [{ kind: "replace_text", path: "app/page.tsx", find: "null", replace: "<div/>" }],
      summary: "ändrar sidan",
      includedPaths: ["app/globals.css"],
      truncated: true,
    });
    const res = await post({
      chatId: "chat-1",
      instruction: "ändra startsidan",
      activeVersionId: "ver-1",
    });
    const body = await res.json();
    expect(res.status).toBe(422);
    expect(body.reason).toBe("op_path_not_shown");
    // Never apply an edit to a file the model never actually saw.
    expect(runQuickEdit).not.toHaveBeenCalled();
  });

  it("allows an op creating a NEW file (path absent from base) even if not in includedPaths", async () => {
    requestQuickEditOps.mockResolvedValue({
      ok: true,
      ops: [
        { kind: "replace_content", path: "app/about/page.tsx", content: "export default () => null;" },
      ],
      summary: "ny sida",
      includedPaths: ["app/globals.css"],
      truncated: false,
    });
    const res = await post({
      chatId: "chat-1",
      instruction: "lägg till en om-sida",
      activeVersionId: "ver-1",
    });
    expect(res.status).toBe(200);
    // New-file creation is legitimate — it must reach the quick-edit lane.
    expect(runQuickEdit).toHaveBeenCalled();
  });

  it("applies gateway ops via runQuickEdit and returns the new version + preview", async () => {
    const res = await post({
      chatId: "chat-1",
      instruction: "gör färgen blå istället för rosa",
      activeVersionId: "ver-1",
      engineLatestKnownVersionId: "ver-1",
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.versionId).toBe("ver-2");
    expect(body.changedFiles).toEqual(["app/globals.css"]);
    expect(body.previewUrl).toBe("https://preview.example/app");
    expect(body.previewMode).toBe("patched");
    expect(body.summary).toBe("Byter rosa mot blå");
    // The gateway-produced ops are handed straight to the quick-edit lane.
    expect(runQuickEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "chat-1",
        appProjectId: "proj-1",
        ops: OPS,
        summary: "Byter rosa mot blå",
      }),
    );
  });
});
