import { beforeEach, describe, expect, it, vi } from "vitest";

const getEngineChatByIdForRequest = vi.hoisted(() => vi.fn());
const getActivePreviewSessionAsync = vi.hoisted(() => vi.fn());
const touchPreviewSessionAsync = vi.hoisted(() => vi.fn());
const isTier2PreviewConfigured = vi.hoisted(() => vi.fn(() => true));

vi.mock("@/lib/rate-limit", () => ({
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
    touchPreviewSessionAsync,
  };
});

vi.mock("@/lib/gen/preview/tier2-config", () => ({
  isTier2PreviewConfigured,
}));

vi.mock("@/lib/gen/preview/lifecycle-telemetry", () => ({
  logPreviewLifecycleTelemetry: vi.fn(),
}));

// M#pv1 (PR #377 runda 3): the heartbeat is the normal-path runtime-ready
// receipt point — it verifies `running:true` with one host status call and
// stamps preview_success=true via the monotonic writer, scheduled via after().
const tryResumeTier2Runtime = vi.hoisted(() => vi.fn());
const fetchPreviewHostReadinessVerdict = vi.hoisted(() =>
  vi.fn<
    (
      previewSessionId: string,
      opts?: { expectedVersionId?: string | null },
    ) => Promise<{
      running: boolean;
      versionId: string | null;
      readinessState: "starting" | "ready" | "failed" | null;
      readinessError: string | null;
      httpReady: boolean;
      regeneratedLockfile: { path: string; content: string } | null;
    } | null>
  >(async () => null),
);
const recordPreviewRuntimeOutcomeForVersion = vi.hoisted(() =>
  vi.fn<(versionId: string, previewSuccess: boolean) => Promise<void>>(async () => undefined),
);
// Innehållsrevision steg 3: the confirmed-check is revision-scoped (and therefore
// async), so the route asks the writer inside `after()` instead of gating the
// scheduling itself. Same effect — no host call, no DB write once confirmed.
const shouldVerifyPreviewRuntimeReceipt = vi.hoisted(() =>
  vi.fn<(versionId: string) => Promise<boolean>>(async () => true),
);

vi.mock("@/lib/gen/preview/tier2-resume", () => ({
  tryResumeTier2Runtime,
}));

vi.mock("@/lib/gen/preview/preview-host-client", () => ({
  fetchPreviewHostReadinessVerdict,
}));

vi.mock("@/lib/db/services/generation-telemetry", () => ({
  shouldVerifyPreviewRuntimeReceipt,
  recordPreviewRuntimeOutcomeForVersion,
}));

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

import { POST } from "./route";

describe("POST preview-heartbeat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    afterCallbacks.value = [];
    isTier2PreviewConfigured.mockReturnValue(true);
    getEngineChatByIdForRequest.mockResolvedValue({ id: "c1" });
    shouldVerifyPreviewRuntimeReceipt.mockResolvedValue(true);
    tryResumeTier2Runtime.mockResolvedValue(null);
  });

  it("rejects when session missing", async () => {
    getActivePreviewSessionAsync.mockResolvedValue(null);
    const res = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "v1", previewSessionId: "sb1", viewerId: "tab1" }),
      }),
      { params: Promise.resolve({ chatId: "c1" }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; reason?: string };
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("no_session");
    expect(touchPreviewSessionAsync).not.toHaveBeenCalled();
  });

  it("touches session when ids match", async () => {
    getActivePreviewSessionAsync.mockResolvedValue({
      previewSessionId: "ps1",
      previewUrl: "https://x.example",
      versionId: "v1",
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    });
    const res = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "v1", previewSessionId: "ps1", viewerId: "tab1" }),
      }),
      { params: Promise.resolve({ chatId: "c1" }) },
    );
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(touchPreviewSessionAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "c1",
        previewSessionId: "ps1",
        versionId: "v1",
      }),
    );
  });

  it("rejects on previewSessionId mismatch", async () => {
    getActivePreviewSessionAsync.mockResolvedValue({
      previewSessionId: "ps1",
      previewUrl: "https://x.example",
      versionId: "v1",
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    });
    const res = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "v1", previewSessionId: "other", viewerId: "tab1" }),
      }),
      { params: Promise.resolve({ chatId: "c1" }) },
    );
    const body = (await res.json()) as { ok: boolean; reason?: string };
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("session_mismatch");
    // No receipt verification is even scheduled on mismatch.
    expect(afterCallbacks.value.length).toBe(0);
    expect(recordPreviewRuntimeOutcomeForVersion).not.toHaveBeenCalled();
  });

  it("stamps preview_success=true (M#pv1) when the host confirms running for the heartbeated version", async () => {
    getActivePreviewSessionAsync.mockResolvedValue({
      previewSessionId: "ps1",
      previewUrl: "https://x.example",
      versionId: "v1",
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    });
    tryResumeTier2Runtime.mockResolvedValue({
      previewSessionId: "ps1",
      primaryUrl: "https://live.example",
      readinessState: "ready",
      httpReady: true,
      readinessError: null,
      regeneratedLockfile: null,
    });

    const res = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "v1", previewSessionId: "ps1", viewerId: "tab1" }),
      }),
      { params: Promise.resolve({ chatId: "c1" }) },
    );

    expect(((await res.json()) as { ok: boolean }).ok).toBe(true);
    // Scheduled via after() — must NOT run before the response…
    expect(recordPreviewRuntimeOutcomeForVersion).not.toHaveBeenCalled();
    expect(afterCallbacks.value.length).toBe(1);
    // …and stamps with the exact session-verified versionId when it runs.
    await runAfterCallbacks();
    expect(tryResumeTier2Runtime).toHaveBeenCalledTimes(1);
    expect(recordPreviewRuntimeOutcomeForVersion).toHaveBeenCalledWith("v1", true);
  });

  it("does NOT stamp when the host does not confirm running (no receipt)", async () => {
    getActivePreviewSessionAsync.mockResolvedValue({
      previewSessionId: "ps1",
      previewUrl: "https://x.example",
      versionId: "v1",
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    });
    tryResumeTier2Runtime.mockResolvedValue(null);

    const res = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "v1", previewSessionId: "ps1", viewerId: "tab1" }),
      }),
      { params: Promise.resolve({ chatId: "c1" }) },
    );

    expect(((await res.json()) as { ok: boolean }).ok).toBe(true);
    await runAfterCallbacks();
    expect(recordPreviewRuntimeOutcomeForVersion).not.toHaveBeenCalled();
  });

  it("skips host verification entirely once the version is confirmed on this instance (no recurring traffic)", async () => {
    shouldVerifyPreviewRuntimeReceipt.mockResolvedValue(false);
    getActivePreviewSessionAsync.mockResolvedValue({
      previewSessionId: "ps1",
      previewUrl: "https://x.example",
      versionId: "v1",
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    });

    const res = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "v1", previewSessionId: "ps1", viewerId: "tab1" }),
      }),
      { params: Promise.resolve({ chatId: "c1" }) },
    );

    expect(((await res.json()) as { ok: boolean }).ok).toBe(true);
    // The receipt work is scheduled, but the confirmed-check inside it stops
    // before the host call and the DB write — the traffic that actually costs.
    await runAfterCallbacks();
    expect(shouldVerifyPreviewRuntimeReceipt).toHaveBeenCalledWith("v1");
    expect(tryResumeTier2Runtime).not.toHaveBeenCalled();
    expect(recordPreviewRuntimeOutcomeForVersion).not.toHaveBeenCalled();
  });
});

// Heartbeaten är den kvittopunkt som bevisligen fyrar på varje normal boot.
// När processen aldrig kom upp svarar resume-vägen `null` — och då var
// /preview-status den enda ytan som någonsin stämplade felet. Heartbeaten läser
// nu samma readiness-verdikt, så de två ytorna är överens.
describe("POST preview-heartbeat — readiness-failure utan levande process", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    afterCallbacks.value = [];
    isTier2PreviewConfigured.mockReturnValue(true);
    getEngineChatByIdForRequest.mockResolvedValue({ id: "c1" });
    shouldVerifyPreviewRuntimeReceipt.mockResolvedValue(true);
    tryResumeTier2Runtime.mockResolvedValue(null);
    fetchPreviewHostReadinessVerdict.mockResolvedValue(null);
    getActivePreviewSessionAsync.mockResolvedValue({
      previewSessionId: "ps1",
      previewUrl: "https://x.example",
      versionId: "v1",
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    });
  });

  async function heartbeat() {
    return POST(
      new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "v1", previewSessionId: "ps1", viewerId: "tab1" }),
      }),
      { params: Promise.resolve({ chatId: "c1" }) },
    );
  }

  it("stämplar preview_success=false när hosten har ett failed-verdikt", async () => {
    fetchPreviewHostReadinessVerdict.mockResolvedValue({
      running: false,
      versionId: "v1",
      readinessState: "failed",
      readinessError: "postcondition failed",
      httpReady: false,
      regeneratedLockfile: null,
    });

    await heartbeat();
    await runAfterCallbacks();

    expect(fetchPreviewHostReadinessVerdict).toHaveBeenCalledWith("ps1", {
      expectedVersionId: "v1",
      expectedLifecycleToken: null,
    });
    expect(recordPreviewRuntimeOutcomeForVersion).toHaveBeenCalledWith("v1", false);
  });

  it("stämplar ingenting när hosten bara säger starting", async () => {
    fetchPreviewHostReadinessVerdict.mockResolvedValue({
      running: false,
      versionId: "v1",
      readinessState: "starting",
      readinessError: null,
      httpReady: false,
      regeneratedLockfile: null,
    });

    await heartbeat();
    await runAfterCallbacks();

    expect(recordPreviewRuntimeOutcomeForVersion).not.toHaveBeenCalled();
  });

  it("frågar inte efter något verdikt när resume redan gav ett", async () => {
    tryResumeTier2Runtime.mockResolvedValue({
      previewSessionId: "ps1",
      primaryUrl: "https://x.example",
      readinessState: "ready",
      httpReady: true,
      readinessError: null,
      regeneratedLockfile: null,
    });

    await heartbeat();
    await runAfterCallbacks();

    expect(fetchPreviewHostReadinessVerdict).not.toHaveBeenCalled();
    expect(recordPreviewRuntimeOutcomeForVersion).toHaveBeenCalledWith("v1", true);
  });
});
