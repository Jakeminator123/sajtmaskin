import { beforeEach, describe, expect, it, vi } from "vitest";

const getEngineChatByIdForRequest = vi.hoisted(() => vi.fn());
const getActivePreviewSessionAsync = vi.hoisted(() => vi.fn());
const tryResumeTier2Runtime = vi.hoisted(() => vi.fn());
const isTier2PreviewConfigured = vi.hoisted(() => vi.fn(() => true));
const getVersionById = vi.hoisted(() => vi.fn());
const fetchPreviewHostReadinessVerdict = vi.hoisted(() => vi.fn(async () => null));

vi.mock("@/lib/rateLimit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

vi.mock("@/lib/tenant", () => ({
  getEngineChatByIdForRequest,
}));

vi.mock("@/lib/gen/preview/session-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/gen/preview/session-store")>(
    "@/lib/gen/preview/session-store",
  );
  return {
    ...actual,
    getActivePreviewSessionAsync,
  };
});

vi.mock("@/lib/gen/preview/tier2-config", () => ({
  isTier2PreviewConfigured,
}));

vi.mock("@/lib/gen/preview/tier2-resume", () => ({
  tryResumeTier2Runtime,
}));

vi.mock("@/lib/gen/preview/preview-host-client", () => ({
  fetchPreviewHostReadinessVerdict,
}));

vi.mock("@/lib/db/chat-repository-pg", () => ({
  getVersionById,
}));

const recordPreviewRuntimeOutcomeForVersion = vi.hoisted(() =>
  vi.fn<(versionId: string, previewSuccess: boolean) => Promise<void>>(async () => undefined),
);

vi.mock("@/lib/db/services/generation-telemetry", () => ({
  recordPreviewRuntimeOutcomeForVersion,
}));

// The M#pv1 ready-stamp is scheduled via after() (post-response, never blocks
// the hot polling path). Capture the callbacks so tests can run them
// deterministically — same pattern as repair/route.test.ts.
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

vi.mock("@/lib/gen/preview/lifecycle-telemetry", () => ({
  logPreviewLifecycleTelemetry: vi.fn(),
}));

import { GET } from "./route";

describe("GET preview-status (engine)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    afterCallbacks.value = [];
    isTier2PreviewConfigured.mockReturnValue(true);
    getEngineChatByIdForRequest.mockResolvedValue({ id: "chat_1" });
    getVersionById.mockResolvedValue(null);
    fetchPreviewHostReadinessVerdict.mockResolvedValue(null);
  });

  it("returns 400 without versionId", async () => {
    const res = await GET(
      new Request("http://localhost/api/engine/chats/chat_1/preview-status"),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns missing + preview_session_not_configured when tier-2 is disabled", async () => {
    isTier2PreviewConfigured.mockReturnValue(false);

    const res = await GET(
      new Request("http://localhost/api/engine/chats/chat_1/preview-status?versionId=v1"),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; reason?: string };
    expect(body.status).toBe("missing");
    expect(body.reason).toBe("preview_session_not_configured");
  });

  it("returns stopped + preview_session_id_mismatch for mismatched client session id", async () => {
    getActivePreviewSessionAsync.mockResolvedValue({
      previewSessionId: "ps_server",
      previewUrl: "https://preview.example",
      versionId: "v1",
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    });

    const res = await GET(
      new Request(
        "http://localhost/api/engine/chats/chat_1/preview-status?versionId=v1&previewSessionId=ps_client",
      ),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; reason?: string };
    expect(body.status).toBe("stopped");
    expect(body.reason).toBe("preview_session_id_mismatch");
  });

  it("returns missing + no_session when no preview session exists", async () => {
    getActivePreviewSessionAsync.mockResolvedValue(null);

    const res = await GET(
      new Request("http://localhost/api/engine/chats/chat_1/preview-status?versionId=v1"),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; reason?: string };
    expect(body.status).toBe("missing");
    expect(body.reason).toBe("no_session");
  });

  it("returns version_mismatch when session points to another version", async () => {
    getActivePreviewSessionAsync.mockResolvedValue({
      previewSessionId: "ps_server",
      previewUrl: "https://preview.example",
      versionId: "v2",
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    });

    const res = await GET(
      new Request("http://localhost/api/engine/chats/chat_1/preview-status?versionId=v1"),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      reason?: string;
      versionId?: string | null;
      mismatchDirection?: string;
    };
    expect(body.status).toBe("version_mismatch");
    expect(body.reason).toBe("session_bound_to_other_version");
    expect(body.versionId).toBe("v2");
    expect(body.mismatchDirection).toBe("unknown");
  });

  it("marks version_mismatch when the active VM session is newer than the selected version", async () => {
    getActivePreviewSessionAsync.mockResolvedValue({
      previewSessionId: "ps_server",
      previewUrl: "https://preview.example",
      versionId: "v4",
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    });
    getVersionById.mockImplementation(async (versionId: string) => {
      if (versionId === "v3") return { id: "v3", chat_id: "chat_1", version_number: 3 };
      if (versionId === "v4") return { id: "v4", chat_id: "chat_1", version_number: 4 };
      return null;
    });

    const res = await GET(
      new Request("http://localhost/api/engine/chats/chat_1/preview-status?versionId=v3"),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      versionId?: string | null;
      mismatchDirection?: string;
    };
    expect(body.status).toBe("version_mismatch");
    expect(body.versionId).toBe("v4");
    expect(body.mismatchDirection).toBe("session_newer");
  });

  it("returns stopped + provider_not_running_or_unreachable when resume fails", async () => {
    const oldEnough = Date.now() - 120_000;
    getActivePreviewSessionAsync.mockResolvedValue({
      previewSessionId: "ps_1",
      previewUrl: "https://preview.example",
      versionId: "v1",
      createdAt: oldEnough,
      lastUsedAt: oldEnough,
    });
    tryResumeTier2Runtime.mockResolvedValue(null);

    const res = await GET(
      new Request("http://localhost/api/engine/chats/chat_1/preview-status?versionId=v1"),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; reason?: string };
    expect(body.status).toBe("stopped");
    expect(body.reason).toBe("provider_not_running_or_unreachable");
  });

  it("returns running when resume succeeds", async () => {
    getActivePreviewSessionAsync.mockResolvedValue({
      previewSessionId: "ps_1",
      previewUrl: "https://stored.example",
      versionId: "v1",
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    });
    tryResumeTier2Runtime.mockResolvedValue({
      previewSessionId: "ps_1",
      primaryUrl: "https://live.example",
      readinessState: "ready",
      httpReady: true,
      readinessError: null,
      regeneratedLockfile: null,
    });

    const res = await GET(
      new Request("http://localhost/api/engine/chats/chat_1/preview-status?versionId=v1"),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; previewUrl?: string };
    expect(body.status).toBe("running");
    expect(body.previewUrl).toBe("https://live.example");
    // M#pv1: running is the canonical runtime-ready receipt on the normal
    // path — the honest preview_success=true is stamped here (session is
    // version-checked before this branch, so the versionId binding is exact).
    // The stamp is scheduled via after() so it never blocks the response:
    // it must NOT have run before the response resolved…
    expect(recordPreviewRuntimeOutcomeForVersion).not.toHaveBeenCalled();
    expect(afterCallbacks.value.length).toBe(1);
    // …and it fires with the exact version binding when after() runs.
    await runAfterCallbacks();
    expect(recordPreviewRuntimeOutcomeForVersion).toHaveBeenCalledWith("v1", true);
  });

  it("does NOT stamp preview_success when the runtime is not confirmed running", async () => {
    const oldEnough = Date.now() - 120_000;
    getActivePreviewSessionAsync.mockResolvedValue({
      previewSessionId: "ps_1",
      previewUrl: "https://preview.example",
      versionId: "v1",
      createdAt: oldEnough,
      lastUsedAt: oldEnough,
    });
    tryResumeTier2Runtime.mockResolvedValue(null);

    const res = await GET(
      new Request("http://localhost/api/engine/chats/chat_1/preview-status?versionId=v1"),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(res.status).toBe(200);
    expect(afterCallbacks.value.length).toBe(0);
    expect(recordPreviewRuntimeOutcomeForVersion).not.toHaveBeenCalled();
  });

  it("returns build_error + stamps preview_success=false when host readiness failed (req A4/A5)", async () => {
    getActivePreviewSessionAsync.mockResolvedValue({
      previewSessionId: "ps_1",
      previewUrl: "https://preview.example",
      versionId: "v1",
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    });
    tryResumeTier2Runtime.mockResolvedValue({
      previewSessionId: "ps_1",
      primaryUrl: "https://live.example",
      readinessState: "failed",
      httpReady: false,
      readinessError: "Module not found: Can't resolve 'radix-ui'",
      regeneratedLockfile: null,
    });

    const res = await GET(
      new Request("http://localhost/api/engine/chats/chat_1/preview-status?versionId=v1"),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; reason?: string; readinessError?: string };
    expect(body.status).toBe("build_error");
    expect(body.reason).toBe("build_error_overlay");
    expect(body.readinessError).toContain("radix-ui");
    // The false-stamp is scheduled via after() (never blocks the response).
    expect(recordPreviewRuntimeOutcomeForVersion).not.toHaveBeenCalled();
    expect(afterCallbacks.value.length).toBe(1);
    await runAfterCallbacks();
    expect(recordPreviewRuntimeOutcomeForVersion).toHaveBeenCalledWith("v1", false);
  });

  it("returns starting (no stamp) while host readiness is still starting", async () => {
    getActivePreviewSessionAsync.mockResolvedValue({
      previewSessionId: "ps_1",
      previewUrl: "https://preview.example",
      versionId: "v1",
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    });
    tryResumeTier2Runtime.mockResolvedValue({
      previewSessionId: "ps_1",
      primaryUrl: "https://live.example",
      readinessState: "starting",
      httpReady: false,
      readinessError: null,
      regeneratedLockfile: null,
    });

    const res = await GET(
      new Request("http://localhost/api/engine/chats/chat_1/preview-status?versionId=v1"),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("starting");
    await runAfterCallbacks();
    expect(recordPreviewRuntimeOutcomeForVersion).not.toHaveBeenCalled();
  });

  it("does NOT stamp preview_success when host readiness is unknown/null (Bugbot finding 1)", async () => {
    getActivePreviewSessionAsync.mockResolvedValue({
      previewSessionId: "ps_1",
      previewUrl: "https://preview.example",
      versionId: "v1",
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    });
    tryResumeTier2Runtime.mockResolvedValue({
      previewSessionId: "ps_1",
      primaryUrl: "https://live.example",
      readinessState: null,
      httpReady: false,
      readinessError: null,
      regeneratedLockfile: null,
    });

    const res = await GET(
      new Request("http://localhost/api/engine/chats/chat_1/preview-status?versionId=v1"),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("starting");
    await runAfterCallbacks();
    expect(recordPreviewRuntimeOutcomeForVersion).not.toHaveBeenCalled();
  });

  it("does NOT stamp preview_success on version_mismatch (session bound to another version)", async () => {
    getActivePreviewSessionAsync.mockResolvedValue({
      previewSessionId: "ps_server",
      previewUrl: "https://preview.example",
      versionId: "v2",
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    });

    const res = await GET(
      new Request("http://localhost/api/engine/chats/chat_1/preview-status?versionId=v1"),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(res.status).toBe(200);
    expect(afterCallbacks.value.length).toBe(0);
    expect(recordPreviewRuntimeOutcomeForVersion).not.toHaveBeenCalled();
  });
});


// En boot som dör innan dev-processen finns lämnar host-sessionen med
// `running:false` men `readinessState:"failed"`. Resume-vägen svarar `null`
// där, vilket är oskiljbart från "sessionen är bara nere" — och då stämplas
// aldrig preview_success=false, ingen fellogg skrivs och RepairGate får aldrig
// veta att previewn bevisligen inte kan komma upp.
describe("GET preview-status — readiness-failure utan levande process", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    afterCallbacks.value = [];
    isTier2PreviewConfigured.mockReturnValue(true);
    getEngineChatByIdForRequest.mockResolvedValue({ id: "chat_1" });
    getVersionById.mockResolvedValue(null);
    fetchPreviewHostReadinessVerdict.mockResolvedValue(null);
    getActivePreviewSessionAsync.mockResolvedValue({
      previewSessionId: "ps_1",
      previewUrl: "https://preview.example",
      versionId: "v1",
      createdAt: Date.now() - 10 * 60_000,
      lastUsedAt: Date.now(),
    });
    tryResumeTier2Runtime.mockResolvedValue(null);
  });

  it("rapporterar build_error och stämplar preview_success=false", async () => {
    fetchPreviewHostReadinessVerdict.mockResolvedValue({
      running: false,
      versionId: "v1",
      readinessState: "failed",
      readinessError: "npm error code ENOSPC",
      httpReady: false,
      regeneratedLockfile: null,
    } as never);

    const res = await GET(
      new Request("http://localhost/api/engine/chats/chat_1/preview-status?versionId=v1"),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    const body = (await res.json()) as { status: string; reason?: string; readinessError?: string };
    expect(body.status).toBe("build_error");
    expect(body.reason).toBe("build_error_overlay");
    expect(body.readinessError).toContain("ENOSPC");

    await runAfterCallbacks();
    expect(recordPreviewRuntimeOutcomeForVersion).toHaveBeenCalledWith("v1", false);
  });

  it("frågar hosten med sessionens version så ett annat versions verdikt aldrig tillskrivs denna", async () => {
    await GET(
      new Request("http://localhost/api/engine/chats/chat_1/preview-status?versionId=v1"),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );
    expect(fetchPreviewHostReadinessVerdict).toHaveBeenCalledWith("ps_1", {
      expectedVersionId: "v1",
    });
  });

  it("faller tillbaka till stopped när hosten inte har något failed-verdikt", async () => {
    fetchPreviewHostReadinessVerdict.mockResolvedValue({
      running: false,
      versionId: "v1",
      readinessState: "starting",
      readinessError: null,
      httpReady: false,
      regeneratedLockfile: null,
    } as never);

    const res = await GET(
      new Request("http://localhost/api/engine/chats/chat_1/preview-status?versionId=v1"),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    const body = (await res.json()) as { status: string; reason?: string };
    expect(body.status).toBe("stopped");
    expect(body.reason).toBe("provider_not_running_or_unreachable");

    await runAfterCallbacks();
    expect(recordPreviewRuntimeOutcomeForVersion).not.toHaveBeenCalled();
  });
});
