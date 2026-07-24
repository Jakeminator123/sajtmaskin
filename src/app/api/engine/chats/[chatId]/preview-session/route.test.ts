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
const getActivePreviewSessionAsync = vi.hoisted(() => vi.fn());
const recordPreviewRuntimeOutcomeForVersion = vi.hoisted(() =>
  vi.fn<(versionId: string, previewSuccess: boolean) => Promise<void>>(async () => undefined),
);

// M#pv2: the preview-session route persists preview_url with bounded
// retry-after-lease-release so a session that consistently coincides with the
// verify lease still lands the write. Tests assert the full option contract.
// 2026-07 (preview-lifecycle simplification): the persist is scheduled via
// after() — the user-visible response must never wait on the version-row
// lock (up to ~7 s under verify-lease contention). Tests therefore assert
// "not called before response, called with the option contract when after()
// runs".
const PREVIEW_URL_PERSIST_OPTIONS = {
  lockTimeoutMs: 2000,
  maxRetries: 3,
  retryDelayMs: 300,
} as const;

vi.mock("@/lib/rateLimit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

vi.mock("@/lib/db/chat-repository-pg", () => ({
  getPreferredVersion,
  getLatestVersion,
  updateVersionPreviewUrl,
}));

vi.mock("@/lib/db/services/generation-telemetry", () => ({
  recordPreviewRuntimeOutcomeForVersion,
}));

// The resume-verified ready-stamp is scheduled via after() (PR #377 runda 4)
// so the telemetry write never sits on the response path. Capture callbacks
// so tests can run them deterministically — same pattern as
// preview-status/route.test.ts and repair/route.test.ts.
const afterCallbacks = vi.hoisted(() => ({ value: [] as Array<() => unknown> }));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (cb: () => unknown) => {
      afterCallbacks.value.push(cb);
    },
  };
});

async function runAfterCallbacks(): Promise<void> {
  for (const cb of afterCallbacks.value) {
    await cb();
  }
  afterCallbacks.value = [];
}

vi.mock("@/lib/db/engine-version-lifecycle", () => ({
  canExposeEnginePreview,
}));

vi.mock("@/lib/tenant", () => ({
  getEngineChatByIdForRequest,
  getEngineVersionForChatByIdForRequest,
}));

vi.mock("@/lib/gen/preview/preview-url-classifier", () => ({
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

vi.mock("@/lib/gen/preview/session-store", () => ({
  getActivePreviewSessionAsync,
}));

import { POST } from "./route";

describe("POST preview-session (engine)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    afterCallbacks.value = [];
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
    getActivePreviewSessionAsync.mockResolvedValue(null);
    startPreviewSession.mockResolvedValue({
      ok: true,
      result: {
        previewUrl: "https://preview.example/chat_1",
        previewSessionId: "ps_1",
        previewMode: "dev_only",
        fidelityTier: 2,
        startOutcome: "recreated",
        // Fresh boot: queued but not confirmed serving (M#pv1).
        runtimeReady: false,
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
    getActivePreviewSessionAsync.mockResolvedValue({
      previewSessionId: "ps_1",
      previewUrl: "https://preview.example/chat_1",
      versionId: "ver_1",
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      tier2Provider: "preview_host",
    });

    const res = await POST(
      new Request("http://localhost/api/engine/chats/chat_1/preview-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "ver_1" }),
      }),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      startOutcome?: string;
      previewUrl?: string;
      previewSessionId?: string;
    };
    expect(body.ok).toBe(true);
    expect(body.startOutcome).toBe("reused_url");
    expect(body.previewUrl).toBe("https://preview.example/chat_1");
    expect(body.previewSessionId).toBe("ps_1");
    expect(startPreviewSession).not.toHaveBeenCalled();
    expect(updateVersionPreviewUrl).not.toHaveBeenCalled();
  });

  it("does not reuse a stored preview_url when there is no matching active preview session", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      version: {
        id: "ver_1",
        preview_url: "https://preview.example/chat_1",
        files_json: "{}",
      },
    });
    isTier2LivePreviewUrl.mockReturnValue(true);
    getActivePreviewSessionAsync.mockResolvedValue(null);

    const res = await POST(
      new Request("http://localhost/api/engine/chats/chat_1/preview-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "ver_1" }),
      }),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(res.status).toBe(200);
    expect(startPreviewSession).toHaveBeenCalled();
    // Persist is after()-scheduled — never on the response path.
    expect(updateVersionPreviewUrl).not.toHaveBeenCalled();
    await runAfterCallbacks();
    expect(updateVersionPreviewUrl).toHaveBeenCalledWith(
      "ver_1",
      "https://preview.example/chat_1",
      PREVIEW_URL_PERSIST_OPTIONS,
    );
    const body = (await res.json()) as { startOutcome?: string; previewSessionId?: string };
    expect(body.startOutcome).toBe("recreated");
    expect(body.previewSessionId).toBe("ps_1");
  });

  it("returns ok even when the previewUrl persist is skipped by row contention (best-effort, prod 57014)", async () => {
    // updateVersionPreviewUrl's lockTimeoutMs mode never throws — contention
    // returns false. The session is already running, so the route must still
    // answer 200 with the started session instead of 500:ing (prod 2026-07-03).
    updateVersionPreviewUrl.mockResolvedValue(false);

    const res = await POST(
      new Request("http://localhost/api/engine/chats/chat_1/preview-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "ver_1" }),
      }),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; previewUrl?: string };
    expect(body.ok).toBe(true);
    expect(body.previewUrl).toBe("https://preview.example/chat_1");
    // The contended persist runs in after() and its false return only warns —
    // the response above already resolved successfully.
    await runAfterCallbacks();
    expect(updateVersionPreviewUrl).toHaveBeenCalledWith(
      "ver_1",
      "https://preview.example/chat_1",
      PREVIEW_URL_PERSIST_OPTIONS,
    );
  });

  it("does not return reused_url when the active preview session points at a different previewUrl", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      version: {
        id: "ver_1",
        preview_url: "https://preview.example/chat_1",
        files_json: "{}",
      },
    });
    isTier2LivePreviewUrl.mockReturnValue(true);
    getActivePreviewSessionAsync.mockResolvedValue({
      previewSessionId: "ps_1",
      previewUrl: "https://preview.example/other-chat",
      versionId: "ver_1",
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      tier2Provider: "preview_host",
    });

    const res = await POST(
      new Request("http://localhost/api/engine/chats/chat_1/preview-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "ver_1" }),
      }),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { startOutcome?: string };
    expect(body.startOutcome).toBe("recreated");
    expect(startPreviewSession).toHaveBeenCalled();
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
    // Regression (punkt 4): the response must resolve WITHOUT waiting on the
    // version-row lock — persist only runs when after() fires.
    expect(updateVersionPreviewUrl).not.toHaveBeenCalled();
    await runAfterCallbacks();
    expect(updateVersionPreviewUrl).toHaveBeenCalledWith(
      "ver_1",
      "https://preview.example/chat_1",
      PREVIEW_URL_PERSIST_OPTIONS,
    );
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
      previewSessionId: "ps_1",
      startOutcome: "recreated",
    });
  });

  it("stamps preview_success=true when the session resolved via the resume-verified path (M#pv1)", async () => {
    startPreviewSession.mockResolvedValue({
      ok: true,
      result: {
        previewUrl: "https://preview.example/chat_1",
        previewSessionId: "ps_1",
        previewMode: "dev_only",
        fidelityTier: 2,
        startOutcome: "resumed",
        // Resume-verified: host /status reported running:true for this version.
        runtimeReady: true,
        tier2Meta: { tier2Provider: "preview_host" },
      },
    });

    const res = await POST(
      new Request("http://localhost/api/engine/chats/chat_1/preview-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "ver_1" }),
      }),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(res.status).toBe(200);
    // Scheduled via after() — must NOT run before the response resolved…
    expect(recordPreviewRuntimeOutcomeForVersion).not.toHaveBeenCalled();
    // Two after() callbacks: previewUrl persist + the runtime-ready stamp.
    expect(afterCallbacks.value.length).toBe(2);
    // …and stamps with the exact version binding when after() runs.
    await runAfterCallbacks();
    expect(recordPreviewRuntimeOutcomeForVersion).toHaveBeenCalledWith("ver_1", true);
  });

  it("does NOT stamp preview_success for a freshly-queued (unconfirmed) boot", async () => {
    // Default startPreviewSession mock: runtimeReady false (fresh boot).
    const res = await POST(
      new Request("http://localhost/api/engine/chats/chat_1/preview-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "ver_1" }),
      }),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(res.status).toBe(200);
    // Only the previewUrl persist is scheduled — no runtime-ready stamp.
    expect(afterCallbacks.value.length).toBe(1);
    await runAfterCallbacks();
    expect(recordPreviewRuntimeOutcomeForVersion).not.toHaveBeenCalled();
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

