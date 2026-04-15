import { beforeEach, describe, expect, it, vi } from "vitest";

const getPreferredVersion = vi.hoisted(() => vi.fn());
const getLatestVersion = vi.hoisted(() => vi.fn());
const updateVersionPreviewUrl = vi.hoisted(() => vi.fn());
const canExposeEnginePreview = vi.hoisted(() => vi.fn(() => true));
const getEngineChatByIdForRequest = vi.hoisted(() => vi.fn());
const getEngineVersionForChatByIdForRequest = vi.hoisted(() => vi.fn());
const isTier2LivePreviewUrl = vi.hoisted(() => vi.fn(() => false));
const logPreviewLifecycleTelemetry = vi.hoisted(() => vi.fn());
const httpStatusForPreviewSessionFailure = vi.hoisted(() => vi.fn(() => 500));
const startPreviewSession = vi.hoisted(() => vi.fn());
const isTier2PreviewConfigured = vi.hoisted(() => vi.fn(() => true));
const getVersionFiles = vi.hoisted(() => vi.fn());
const parseCodeFilesFromFilesJson = vi.hoisted(() => vi.fn(() => []));

vi.mock("@/lib/rateLimit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

vi.mock("@/lib/db/chat-repository-pg", () => ({
  getPreferredVersion,
  getLatestVersion,
  updateVersionPreviewUrl,
}));

vi.mock("@/lib/db/engine-version-lifecycle", () => ({
  canExposeEnginePreview,
}));

vi.mock("@/lib/tenant", () => ({
  getEngineChatByIdForRequest,
  getEngineVersionForChatByIdForRequest,
}));

vi.mock("@/lib/gen/preview/legacy/compatibility-shim", () => ({
  isTier2LivePreviewUrl,
}));

vi.mock("@/lib/gen/preview/lifecycle-telemetry", () => ({
  logPreviewLifecycleTelemetry,
}));

vi.mock("@/lib/gen/preview/preview-errors", () => ({
  httpStatusForPreviewSessionFailure,
}));

vi.mock("@/lib/gen/preview/preview-session", () => ({
  startPreviewSession,
}));

vi.mock("@/lib/gen/preview/tier2-config", () => ({
  isTier2PreviewConfigured,
  TIER2_PREVIEW_SETUP_HINT: "set envs",
}));

vi.mock("@/lib/gen/version-manager", () => ({
  getVersionFiles,
  parseCodeFilesFromFilesJson,
}));

import { POST } from "./route";

describe("POST preview-session (engine)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isTier2PreviewConfigured.mockReturnValue(true);
    canExposeEnginePreview.mockReturnValue(true);
    isTier2LivePreviewUrl.mockReturnValue(false);
    getEngineChatByIdForRequest.mockResolvedValue({
      id: "chat_1",
      project_id: "proj_1",
      orchestration_snapshot: {
        buildSpec: {
          previewPolicy: "fidelity2",
          verificationPolicy: "standard",
        },
      },
    });
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      version: {
        id: "ver_1",
        preview_url: null,
        files_json: "{\"app/page.tsx\":\"export default function Page(){return null;}\"}",
      },
    });
    getVersionFiles.mockResolvedValue([
      { path: "app/page.tsx", content: "export default function Page(){return null;}" },
    ]);
    startPreviewSession.mockResolvedValue({
      ok: true,
      result: {
        sandboxUrl: "https://preview.example/chat_1",
        sandboxId: "sb_1",
        sandboxPreviewMode: "dev_only",
        fidelityTier: 2,
        startOutcome: "recreated",
        tier2Meta: { tier2Provider: "preview_host" },
      },
    });
    updateVersionPreviewUrl.mockResolvedValue(true);
  });

  it("returns 503 with setup hint when tier-2 preview is not configured", async () => {
    isTier2PreviewConfigured.mockReturnValue(false);

    const res = await POST(
      new Request("http://localhost/api/engine/chats/chat_1/preview-session", { method: "POST" }),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(res.status).toBe(503);
    const body = (await res.json()) as { ok: boolean; code: string; hint?: string };
    expect(body.ok).toBe(false);
    expect(body.code).toBe("preview_session_disabled");
    expect(body.hint).toBe("set envs");
  });

  it("returns reused_url when version already has tier-2 preview_url", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      version: {
        id: "ver_1",
        preview_url: "https://preview.example/chat_1",
        files_json: "{}",
      },
    });
    isTier2LivePreviewUrl.mockReturnValue(true);

    const res = await POST(
      new Request("http://localhost/api/engine/chats/chat_1/preview-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "ver_1" }),
      }),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; startOutcome?: string; previewUrl?: string };
    expect(body.ok).toBe(true);
    expect(body.startOutcome).toBe("reused_url");
    expect(body.previewUrl).toBe("https://preview.example/chat_1");
    expect(startPreviewSession).not.toHaveBeenCalled();
    expect(updateVersionPreviewUrl).not.toHaveBeenCalled();
  });

  it("starts preview session and persists previewUrl for version-bound session", async () => {
    const res = await POST(
      new Request("http://localhost/api/engine/chats/chat_1/preview-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "ver_1" }),
      }),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(res.status).toBe(200);
    expect(startPreviewSession).toHaveBeenCalledWith(
      [{ path: "app/page.tsx", content: "export default function Page(){return null;}" }],
      expect.objectContaining({
        chatId: "chat_1",
        appProjectId: "proj_1",
        previewPolicy: "fidelity2",
        verificationPolicy: "standard",
        versionIdForSession: "ver_1",
        skipRepair: true,
        skipProjectScaffold: true,
      }),
    );
    expect(updateVersionPreviewUrl).toHaveBeenCalledWith("ver_1", "https://preview.example/chat_1");
    expect(logPreviewLifecycleTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "preview_start_outcome",
        chatId: "chat_1",
        versionId: "ver_1",
        outcome: "recreated",
      }),
    );
    const body = (await res.json()) as {
      ok: boolean;
      previewUrl?: string;
      previewSessionId?: string;
      startOutcome?: string;
    };
    expect(body).toMatchObject({
      ok: true,
      previewUrl: "https://preview.example/chat_1",
      previewSessionId: "sb_1",
      startOutcome: "recreated",
    });
  });

  it("maps startPreviewSession failures to retryable 503 with Retry-After", async () => {
    startPreviewSession.mockResolvedValue({
      ok: false,
      error: {
        stage: "preview-start",
        message: "provider unavailable",
      },
    });
    httpStatusForPreviewSessionFailure.mockReturnValue(503);

    const res = await POST(
      new Request("http://localhost/api/engine/chats/chat_1/preview-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "ver_1" }),
      }),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("5");
    const body = (await res.json()) as {
      ok: boolean;
      stage?: string;
      message?: string;
      retryable?: boolean;
    };
    expect(body.ok).toBe(false);
    expect(body.stage).toBe("preview-start");
    expect(body.message).toBe("provider unavailable");
    expect(body.retryable).toBe(true);
    expect(updateVersionPreviewUrl).not.toHaveBeenCalled();
  });
});

