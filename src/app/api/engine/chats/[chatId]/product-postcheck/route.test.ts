import { beforeEach, describe, expect, it, vi } from "vitest";
import { FEATURES } from "@/lib/config";
import { POST } from "./route";

const getVersion = vi.hoisted(() => vi.fn());
const getRequestUserId = vi.hoisted(() => vi.fn(async () => "user_1"));
const runProductPostcheck = vi.hoisted(() => vi.fn());
const emitBusEvent = vi.hoisted(() => vi.fn());
const beginLiveReviewSession = vi.hoisted(() => vi.fn());
const finishLiveReviewSession = vi.hoisted(() => vi.fn());
const setLlmUsageContext = vi.hoisted(() => vi.fn());
const getActivePreviewSessionAsync = vi.hoisted(() => vi.fn());
const abandonLiveReviewRun = vi.hoisted(() => vi.fn());
const deleteLiveReviewScreenshotUrls = vi.hoisted(() => vi.fn());
const getPreviewHostBaseUrl = vi.hoisted(() => vi.fn((): string | null => null));
const waitForProductPostcheckPreviewRunning = vi.hoisted(() => vi.fn());
const readProductPostcheckPreviewProbe = vi.hoisted(() => vi.fn());
const claimProductPostcheckRun = vi.hoisted(() => vi.fn());
const completeProductPostcheckRun = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) =>
    handler(),
}));

vi.mock("@/lib/tenant", () => ({
  getEngineVersionForChatByIdForRequest: getVersion,
  getRequestUserId,
}));

vi.mock("@/lib/observability/llm-usage", () => ({
  runWithLlmUsageContext: (_ctx: unknown, fn: () => unknown) => fn(),
  setLlmUsageContext,
  safeUsageOwnerId: async (lookup: () => Promise<string | null>) => lookup(),
}));

vi.mock("@/lib/gen/verify/product-postcheck", () => ({
  runProductPostcheck,
}));

vi.mock("@/lib/gen/verify/live-review", () => ({
  pickUserRequest: () => "",
  summarizeBrief: () => "",
  LIVE_REVIEW_TOTAL_TIMEOUT_MS: 90_000,
}));

vi.mock("@/lib/openclaw/live-review-access", () => ({
  isLiveReviewEnabled: () => false,
}));

vi.mock("@/lib/gen/verify/live-review-session", () => ({
  beginLiveReviewSession,
  finishLiveReviewSession,
}));

vi.mock("@/lib/logging/event-bus", () => ({
  emit: emitBusEvent,
}));

vi.mock("@/lib/gen/preview/session-store", () => ({
  getActivePreviewSessionAsync,
}));

vi.mock("@/lib/gen/preview/tier2-config", () => ({
  getPreviewHostBaseUrl,
}));

vi.mock("@/lib/gen/verify/product-postcheck-preview-wait", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/gen/verify/product-postcheck-preview-wait")>();
  return {
    ...actual,
    waitForProductPostcheckPreviewRunning,
    readProductPostcheckPreviewProbe,
  };
});

vi.mock("@/lib/db/services/live-review-runs", () => ({
  abandonLiveReviewRun,
  deleteLiveReviewScreenshotUrls,
}));

vi.mock("@/lib/db/services/product-postcheck-runs", () => ({
  claimProductPostcheckRun,
  completeProductPostcheckRun,
  mapProductPostcheckResultToStatus: (result: {
    skipped: boolean;
    skippedReason: string | null;
    productBlocked: boolean;
  }) => {
    if (result.skippedReason === "preview_superseded") return "superseded";
    if (result.productBlocked) return "blocked";
    if (result.skipped) return "failed";
    return "passed";
  },
  normalizeProductPostcheckMutationRevision: (value: number | null | undefined) =>
    typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : 0,
}));

function req(body: unknown): Request {
  return new Request("http://localhost/api/engine/chats/chat_1/product-postcheck", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function setF2ProductPostcheck(value: boolean): void {
  (FEATURES as unknown as { f2ProductPostcheck: boolean }).f2ProductPostcheck = value;
}

describe("POST product-postcheck", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setF2ProductPostcheck(false);
    beginLiveReviewSession.mockResolvedValue({
      captureEnabled: false,
      claim: null,
      earlyResult: { status: "skipped", reason: "flag_off" },
      chatId: "chat_1",
      versionId: "v1",
      filesRevision: null,
      userId: "user_1",
    });
    finishLiveReviewSession.mockImplementation(
      async (session: { earlyResult?: { status: string; reason: string } | null }) =>
        session.earlyResult ?? { status: "skipped", reason: "flag_off" },
    );
    getActivePreviewSessionAsync.mockResolvedValue({
      previewSessionId: "ps_n",
      lifecycleToken: "life_n",
      previewUrl: "https://vm-fly-jakem.fly.dev/chat_1",
      versionId: "v1",
      filesRevision: "rev_n",
      createdAt: 1,
      lastUsedAt: 1,
    });
    abandonLiveReviewRun.mockResolvedValue(undefined);
    deleteLiveReviewScreenshotUrls.mockResolvedValue(undefined);
    getPreviewHostBaseUrl.mockReturnValue(null);
    waitForProductPostcheckPreviewRunning.mockResolvedValue({
      ok: true,
      probe: {
        running: true,
        versionId: "v1",
        filesRevision: "rev_n",
        previewSessionId: "ps_n",
        lifecycleToken: "life_n",
        mutationRevision: 1,
        previewUrl: "[REDACTED]/chat_1",
        readinessState: "ready",
        httpReady: true,
      },
    });
    readProductPostcheckPreviewProbe.mockResolvedValue({
      running: false,
      versionId: "v1",
      filesRevision: "rev_n",
      previewSessionId: "ps_n",
      lifecycleToken: "life_n",
      mutationRevision: 1,
      previewUrl: "[REDACTED]/chat_1",
      readinessState: null,
      httpReady: null,
    });
    claimProductPostcheckRun.mockResolvedValue({
      kind: "acquired",
      runId: "run_test",
      claimGeneration: 1,
      owner: "user_1",
    });
    completeProductPostcheckRun.mockResolvedValue(true);
  });

  it("feature flag off => skipped utan DB/Playwright-körning", async () => {
    const res = await POST(req({ versionId: "v1", previewUrl: "https://vm-fly-jakem.fly.dev/chat_1" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    const body = await res.json();
    expect(body.skipped).toBe(true);
    expect(body.skippedReason).toBe("feature_disabled");
    expect(getVersion).not.toHaveBeenCalled();
    expect(runProductPostcheck).not.toHaveBeenCalled();
  });

  it("feature flag off + null previewUrl => ingen degraded-emit (default-OFF prod tyst)", async () => {
    // The client calls this route unconditionally. `feature_disabled` returns
    // before version-scope, so a default-OFF deployment must do no DB read and
    // emit nothing — otherwise every version would show "degraded" (false-RED).
    const res = await POST(req({ versionId: "v1", previewUrl: null }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    const body = await res.json();
    expect(body.skippedReason).toBe("feature_disabled");
    expect(getVersion).not.toHaveBeenCalled();
    expect(emitBusEvent).not.toHaveBeenCalled();
  });

  it("saknad files_revision ⇒ skip preview_not_running, inte preview_superseded", async () => {
    setF2ProductPostcheck(true);
    getVersion.mockResolvedValue({ version: { id: "v1", files_revision: null } });
    getPreviewHostBaseUrl.mockReturnValue("https://preview-host.example");
    const res = await POST(req({ versionId: "v1", previewUrl: "[REDACTED]/chat_1" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    const body = await res.json();
    expect(body.skipped).toBe(true);
    expect(body.skippedReason).toBe("preview_not_running");
    expect(waitForProductPostcheckPreviewRunning).not.toHaveBeenCalled();
    expect(runProductPostcheck).not.toHaveBeenCalled();
  });

  it("feature flag on + missing previewUrl => skipped + version.degraded (false-green guard)", async () => {
    setF2ProductPostcheck(true);
    getVersion.mockResolvedValue({ version: { id: "v1", files_revision: "rev_n" } });
    getActivePreviewSessionAsync.mockResolvedValue({
      previewSessionId: "ps_n",
      lifecycleToken: "life_n",
      previewUrl: "",
      versionId: "v1",
      filesRevision: "rev_n",
      createdAt: 1,
      lastUsedAt: 1,
    });
    const res = await POST(req({ versionId: "v1", previewUrl: null }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    const body = await res.json();
    expect(body.skipped).toBe(true);
    expect(body.skippedReason).toBe("missing_preview_url");
    expect(body.attestation).toEqual({
      previewSessionId: "ps_n",
      lifecycleToken: "life_n",
      filesRevision: "rev_n",
    });
    // Scope now runs before the skip so a skipped DOM check is surfaced on the
    // version-status projection (cannot read as solid green).
    expect(getVersion).toHaveBeenCalled();
    expect(runProductPostcheck).not.toHaveBeenCalled();
    expect(emitBusEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        t: "version.degraded",
        versionId: "v1",
        chatId: "chat_1",
        kind: "product_postcheck_skipped",
        meta: expect.objectContaining({
          skippedReason: "missing_preview_url",
          attestedPreviewSessionId: "ps_n",
          attestedLifecycleToken: "life_n",
          attestedFilesRevision: "rev_n",
        }),
      }),
    );
  });

  it("feature flag on + klienten skickar null men sessionen har URL => kör mot sessionens URL", async () => {
    setF2ProductPostcheck(true);
    getVersion.mockResolvedValue({ version: { id: "v1", files_revision: "rev_n" } });
    runProductPostcheck.mockResolvedValue({
      ok: true,
      skipped: false,
      skippedReason: null,
      warnings: [],
      warningCount: 0,
      productBlocked: false,
      durationMs: 8,
      checkedUrl: "https://vm-fly-jakem.fly.dev/chat_1",
    });
    const res = await POST(req({ versionId: "v1", previewUrl: null }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    const body = await res.json();
    expect(body.skipped).toBe(false);
    expect(runProductPostcheck).toHaveBeenCalledWith(
      expect.objectContaining({
        previewUrl: "https://vm-fly-jakem.fly.dev/chat_1",
      }),
    );
    expect(body.checkedUrl).toBe("https://vm-fly-jakem.fly.dev/chat_1");
  });

  it("feature flag on + missing previewUrl + okänd version => 404, ingen emit", async () => {
    setF2ProductPostcheck(true);
    getVersion.mockResolvedValue(null);
    const res = await POST(req({ versionId: "ghost", previewUrl: null }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    expect(res.status).toBe(404);
    expect(emitBusEvent).not.toHaveBeenCalled();
  });

  it("feature flag on + preview URL men postcheck-skip => version.degraded (regression)", async () => {
    setF2ProductPostcheck(true);
    getVersion.mockResolvedValue({ version: { id: "v1", files_revision: "rev_n" } });
    runProductPostcheck.mockResolvedValue({
      ok: true,
      skipped: true,
      skippedReason: "playwright_unavailable",
      warnings: [],
      warningCount: 0,
      productBlocked: false,
      durationMs: 5,
      checkedUrl: "https://vm-fly-jakem.fly.dev/chat_1",
    });
    const res = await POST(req({ versionId: "v1", previewUrl: "https://vm-fly-jakem.fly.dev/chat_1" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    const body = await res.json();
    expect(body.skipped).toBe(true);
    expect(emitBusEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        t: "version.degraded",
        kind: "product_postcheck_skipped",
        meta: expect.objectContaining({
          skippedReason: "playwright_unavailable",
          attestedPreviewSessionId: "ps_n",
          attestedLifecycleToken: "life_n",
          attestedFilesRevision: "rev_n",
        }),
      }),
    );
  });

  it("feature flag on + preview URL => kör server-helper efter version-scope-check", async () => {
    setF2ProductPostcheck(true);
    getVersion.mockResolvedValue({ version: { id: "v1", files_revision: "rev_n" } });
    runProductPostcheck.mockResolvedValue({
      ok: true,
      skipped: false,
      skippedReason: null,
      warnings: [{ code: "broken_anchor", message: "Anchor target saknas" }],
      warningCount: 1,
      productBlocked: false,
      durationMs: 10,
      checkedUrl: "https://vm-fly-jakem.fly.dev/chat_1",
    });

    const res = await POST(req({ versionId: "v1", previewUrl: "https://vm-fly-jakem.fly.dev/chat_1" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.skipped).toBe(false);
    expect(body.warningCount).toBe(1);
    expect(getVersion).toHaveBeenCalled();
    expect(runProductPostcheck).toHaveBeenCalledWith({
      previewUrl: "https://vm-fly-jakem.fly.dev/chat_1",
      chatId: "chat_1",
      versionId: "v1",
      // Budgeten räknas av från routens väggklocka, så en exakt siffra här är
      // en tidsbomb: assertionen höll bara så länge hela routen hann köra på
      // under en millisekund. Lås intervallet i stället för millisekunden.
      timeoutMs: expect.any(Number),
      captureEnabled: false,
      captureUserId: "user_1",
      filesRevision: "rev_n",
      previewSessionId: "ps_n",
      lifecycleToken: "life_n",
    });
    const { timeoutMs } = runProductPostcheck.mock.calls[0][0] as { timeoutMs: number };
    expect(timeoutMs).toBeGreaterThan(270_000);
    expect(timeoutMs).toBeLessThanOrEqual(280_000);
  });

  it("feature flag on + productBlocked => version.degraded {product_postcheck_blocked}", async () => {
    setF2ProductPostcheck(true);
    getVersion.mockResolvedValue({ version: { id: "v1", files_revision: "rev_n" } });
    runProductPostcheck.mockResolvedValue({
      ok: true,
      skipped: false,
      skippedReason: null,
      warnings: [
        { code: "mobile_menu_failed", message: "Mobilmeny kunde inte verifieras" },
        { code: "broken_anchor", message: "Anchor target saknas för #pris" },
        { code: "broken_anchor", message: "Anchor target saknas för #kontakt" },
        { code: "hydration_dom_loss", message: "SSR CTA försvann efter hydrering" },
      ],
      warningCount: 4,
      productBlocked: true,
      durationMs: 12,
      checkedUrl: "https://vm-fly-jakem.fly.dev/chat_1",
    });
    const res = await POST(req({ versionId: "v1", previewUrl: "https://vm-fly-jakem.fly.dev/chat_1" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    const body = await res.json();
    expect(body.productBlocked).toBe(true);
    expect(emitBusEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        t: "version.degraded",
        versionId: "v1",
        chatId: "chat_1",
        kind: "product_postcheck_blocked",
        meta: expect.objectContaining({
          blockingCodes: expect.arrayContaining([
            "mobile_menu_failed",
            "broken_anchor",
            "hydration_dom_loss",
          ]),
          warningCount: 4,
          attestedPreviewSessionId: "ps_n",
          attestedLifecycleToken: "life_n",
          attestedFilesRevision: "rev_n",
        }),
      }),
    );
  });

  it("feature flag on + körde rent (ej blockerad) => ingen degraded-emit", async () => {
    setF2ProductPostcheck(true);
    getVersion.mockResolvedValue({ version: { id: "v1", files_revision: "rev_n" } });
    runProductPostcheck.mockResolvedValue({
      ok: true,
      skipped: false,
      skippedReason: null,
      warnings: [],
      warningCount: 0,
      productBlocked: false,
      durationMs: 8,
      checkedUrl: "https://vm-fly-jakem.fly.dev/chat_1",
    });
    await POST(req({ versionId: "v1", previewUrl: "https://vm-fly-jakem.fly.dev/chat_1" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    expect(emitBusEvent).not.toHaveBeenCalled();
  });

  it("scope miss => 404", async () => {
    setF2ProductPostcheck(true);
    getVersion.mockResolvedValue(null);
    const res = await POST(req({ versionId: "v1", previewUrl: "https://vm-fly-jakem.fly.dev/chat_1" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    expect(res.status).toBe(404);
    expect(runProductPostcheck).not.toHaveBeenCalled();
  });

  it("live review session + postcheck ok => attaches critic result without blocking", async () => {
    setF2ProductPostcheck(true);
    beginLiveReviewSession.mockResolvedValue({
      captureEnabled: true,
      claim: { kind: "acquired" },
      earlyResult: null,
      chatId: "chat_1",
      versionId: "v1",
      filesRevision: "rev_a",
      userId: "user_1",
    });
    getVersion.mockResolvedValue({
      version: { id: "v1", version_number: 1, files_json: "[]", files_revision: "rev_a" },
      chat: { messages: [], orchestration_snapshot: null },
    });
    getActivePreviewSessionAsync.mockResolvedValue({
      previewSessionId: "ps_a",
      lifecycleToken: "life_a",
      previewUrl: "https://vm-fly-jakem.fly.dev/chat_1",
      versionId: "v1",
      filesRevision: "rev_a",
      createdAt: 1,
      lastUsedAt: 1,
    });
    runProductPostcheck.mockResolvedValue({
      ok: true,
      skipped: false,
      skippedReason: null,
      warnings: [],
      warningCount: 0,
      productBlocked: false,
      durationMs: 8,
      checkedUrl: "https://vm-fly-jakem.fly.dev/chat_1",
      screenshots: { desktopUrl: "https://blob.example/d.jpg", mobileUrl: null },
      domSummary: null,
    });
    finishLiveReviewSession.mockResolvedValue({
      status: "completed",
      decision: {
        verdict: "pass",
        confidence: 0.8,
        rationale: "Sajten följer briefen.",
        reasoning: "",
        issues: [],
      },
      durationMs: 12,
      modelId: "gpt-4o",
    });
    const res = await POST(req({ versionId: "v1", previewUrl: "https://vm-fly-jakem.fly.dev/chat_1" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    const body = await res.json();
    expect(body.productBlocked).toBe(false);
    expect(body.liveReview.status).toBe("completed");
    expect(runProductPostcheck).toHaveBeenCalledWith(
      expect.objectContaining({
        captureEnabled: true,
        filesRevision: "rev_a",
      }),
    );
    expect(finishLiveReviewSession).toHaveBeenCalled();
    expect(emitBusEvent).not.toHaveBeenCalled();
    expect(setLlmUsageContext).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: "chat_1", userId: "user_1" }),
    );
    expect(setLlmUsageContext).toHaveBeenCalledWith(
      expect.objectContaining({ versionId: "v1" }),
    );
  });

  it("discardar N när samma version ersätts av lifecycle/filesRevision N+1", async () => {
    setF2ProductPostcheck(true);
    getVersion
      .mockResolvedValueOnce({
        version: {
          id: "v1",
          version_number: 1,
          files_json: "{\"app/page.tsx\":\"N\"}",
          files_revision: "rev_n",
        },
        chat: { messages: [], orchestration_snapshot: null },
      })
      .mockResolvedValue({
        version: {
          id: "v1",
          version_number: 1,
          files_json: "{\"app/page.tsx\":\"N+1\"}",
          files_revision: "rev_n_plus_1",
        },
        chat: { messages: [], orchestration_snapshot: null },
      });
    getActivePreviewSessionAsync
      .mockResolvedValueOnce({
        previewSessionId: "ps_n",
        lifecycleToken: "life_n",
        previewUrl: "https://vm-fly-jakem.fly.dev/chat_1",
        versionId: "v1",
        filesRevision: "rev_n",
      })
      .mockResolvedValue({
        previewSessionId: "ps_n_plus_1",
        lifecycleToken: "life_n_plus_1",
        previewUrl: "https://vm-fly-jakem.fly.dev/chat_1",
        versionId: "v1",
        filesRevision: "rev_n_plus_1",
      });
    runProductPostcheck.mockResolvedValue({
      ok: true,
      skipped: false,
      skippedReason: null,
      warnings: [{ code: "mobile_menu_failed", message: "N såg blockerad ut" }],
      warningCount: 1,
      productBlocked: true,
      durationMs: 12,
      checkedUrl: "https://vm-fly-jakem.fly.dev/chat_1",
      routesChecked: 1,
      screenshots: { desktopUrl: "https://blob.example/n.jpg", mobileUrl: null },
    });

    const res = await POST(
      req({ versionId: "v1", previewUrl: "https://vm-fly-jakem.fly.dev/chat_1" }),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );
    const body = await res.json();

    expect(runProductPostcheck).toHaveBeenCalledWith(
      expect.objectContaining({
        previewSessionId: "ps_n",
        lifecycleToken: "life_n",
        filesRevision: "rev_n",
      }),
    );
    expect(body).toEqual(
      expect.objectContaining({
        skipped: true,
        skippedReason: "preview_superseded",
        productBlocked: false,
        screenshots: null,
      }),
    );
    expect(finishLiveReviewSession).not.toHaveBeenCalled();
    expect(deleteLiveReviewScreenshotUrls).toHaveBeenCalledWith({
      desktopUrl: "https://blob.example/n.jpg",
      mobileUrl: null,
    });
    expect(emitBusEvent).not.toHaveBeenCalled();
    expect(emitBusEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: "product_postcheck_blocked" }),
    );
  });

  it("godkänner en tokenlös legacy-session när revision och session förblir samma", async () => {
    setF2ProductPostcheck(true);
    getVersion.mockResolvedValue({
      version: { id: "v1", files_revision: "rev_legacy" },
    });
    getActivePreviewSessionAsync.mockResolvedValue({
      previewSessionId: "ps_legacy",
      lifecycleToken: null,
      previewUrl: "https://vm-fly-jakem.fly.dev/chat_1",
      versionId: "v1",
      filesRevision: "rev_legacy",
    });
    runProductPostcheck.mockResolvedValue({
      ok: true,
      skipped: false,
      skippedReason: null,
      warnings: [],
      warningCount: 0,
      productBlocked: false,
      durationMs: 7,
      checkedUrl: "https://vm-fly-jakem.fly.dev/chat_1",
      routesChecked: 1,
    });

    const res = await POST(
      req({ versionId: "v1", previewUrl: "https://vm-fly-jakem.fly.dev/chat_1" }),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );
    const body = await res.json();

    expect(body.skipped).toBe(false);
    expect(runProductPostcheck).toHaveBeenCalledWith(
      expect.objectContaining({
        previewSessionId: "ps_legacy",
        lifecycleToken: null,
        filesRevision: "rev_legacy",
      }),
    );
    expect(emitBusEvent).not.toHaveBeenCalled();
  });

  it("L7 (b): host still starting ⇒ oattesterat preview_not_ready, ingen emit", async () => {
    setF2ProductPostcheck(true);
    getPreviewHostBaseUrl.mockReturnValue("https://preview-host.example");
    getVersion.mockResolvedValue({ version: { id: "v1", files_revision: "rev_n" } });
    waitForProductPostcheckPreviewRunning.mockResolvedValue({
      ok: false,
      reason: "preview_not_ready",
      lastProbe: {
        running: true,
        versionId: "v1",
        filesRevision: "rev_n",
        previewSessionId: "ps_n",
        lifecycleToken: "life_n",
        mutationRevision: 1,
        previewUrl: "[REDACTED]/chat_1",
        readinessState: "starting",
        httpReady: false,
      },
    });

    const res = await POST(req({ versionId: "v1", previewUrl: "[REDACTED]/chat_1" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    const body = await res.json();

    expect(body.skipped).toBe(true);
    expect(body.skippedReason).toBe("preview_not_ready");
    expect(body.attestation).toBeNull();
    expect(body.productBlocked).toBe(false);
    expect(runProductPostcheck).not.toHaveBeenCalled();
    expect(emitBusEvent).not.toHaveBeenCalled();
  });

  it("L7 (a)+(d)+(f): httpReady:false / timeout attesterar inte — preview_not_running släpper inte grinden", async () => {
    setF2ProductPostcheck(true);
    getPreviewHostBaseUrl.mockReturnValue("https://preview-host.example");
    getVersion.mockResolvedValue({ version: { id: "v1", files_revision: "rev_n" } });
    waitForProductPostcheckPreviewRunning.mockResolvedValue({
      ok: false,
      reason: "preview_not_ready",
      lastProbe: {
        running: true,
        versionId: "v1",
        filesRevision: "rev_n",
        previewSessionId: "ps_n",
        lifecycleToken: "life_n",
        mutationRevision: 1,
        previewUrl: "[REDACTED]/chat_1",
        readinessState: "ready",
        httpReady: false,
      },
    });

    const res = await POST(req({ versionId: "v1", previewUrl: "[REDACTED]/chat_1" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    const body = await res.json();

    expect(body.skippedReason).toBe("preview_not_ready");
    expect(body.skippedReason).not.toBe("preview_not_running");
    expect(body.attestation).toBeNull();
    expect(body).not.toEqual(
      expect.objectContaining({
        attestation: expect.objectContaining({ previewSessionId: "ps_n" }),
      }),
    );
    expect(runProductPostcheck).not.toHaveBeenCalled();
    expect(emitBusEvent).not.toHaveBeenCalled();
  });

  it("L7 (c): wait superseded on filesRevision ⇒ preview_superseded utan attest", async () => {
    setF2ProductPostcheck(true);
    getPreviewHostBaseUrl.mockReturnValue("https://preview-host.example");
    getVersion.mockResolvedValue({ version: { id: "v1", files_revision: "rev_n" } });
    waitForProductPostcheckPreviewRunning.mockResolvedValue({
      ok: false,
      reason: "preview_superseded",
      lastProbe: {
        running: true,
        versionId: "v1",
        filesRevision: "rev_stale",
        previewSessionId: "ps_n",
        lifecycleToken: "life_n",
        mutationRevision: 1,
        previewUrl: "[REDACTED]/chat_1",
        readinessState: "ready",
        httpReady: true,
      },
    });

    const res = await POST(req({ versionId: "v1", previewUrl: "[REDACTED]/chat_1" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    const body = await res.json();

    expect(body.skippedReason).toBe("preview_superseded");
    expect(body.attestation).toBeNull();
    expect(runProductPostcheck).not.toHaveBeenCalled();
    expect(emitBusEvent).not.toHaveBeenCalled();
  });

  it("sessionens previewUrl vinner över klientens på samma tillåtna host", async () => {
    setF2ProductPostcheck(true);
    getPreviewHostBaseUrl.mockReturnValue("https://preview-host.example");
    getVersion.mockResolvedValue({ version: { id: "v1", files_revision: "rev_n" } });
    waitForProductPostcheckPreviewRunning.mockResolvedValue({
      ok: true,
      probe: {
        running: true,
        versionId: "v1",
        filesRevision: "rev_n",
        previewSessionId: "ps_n",
        lifecycleToken: "life_n",
        previewUrl: "https://vm-fly-jakem.fly.dev/chat_1",
        readinessState: "ready",
      },
    });
    runProductPostcheck.mockResolvedValue({
      ok: true,
      skipped: false,
      skippedReason: null,
      warnings: [],
      warningCount: 0,
      productBlocked: false,
      durationMs: 8,
      checkedUrl: "https://vm-fly-jakem.fly.dev/chat_1",
    });

    const res = await POST(
      req({
        versionId: "v1",
        previewUrl: "https://vm-fly-jakem.fly.dev/chat_1/stale",
      }),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );
    const body = await res.json();

    expect(runProductPostcheck).toHaveBeenCalledWith(
      expect.objectContaining({
        previewUrl: "https://vm-fly-jakem.fly.dev/chat_1",
      }),
    );
    expect(body.checkedUrl).toBe("https://vm-fly-jakem.fly.dev/chat_1");
    expect(body.skipped).toBe(false);
    expect(body.attestation).toEqual({
      previewSessionId: "ps_n",
      lifecycleToken: "life_n",
      filesRevision: "rev_n",
    });
  });

  it("L7 (e): full tupel ⇒ ready och postcheck körs", async () => {
    setF2ProductPostcheck(true);
    getPreviewHostBaseUrl.mockReturnValue("https://preview-host.example");
    getVersion.mockResolvedValue({ version: { id: "v1", files_revision: "rev_n" } });
    runProductPostcheck.mockResolvedValue({
      ok: true,
      skipped: false,
      skippedReason: null,
      warnings: [],
      warningCount: 0,
      productBlocked: false,
      durationMs: 8,
      checkedUrl: "[REDACTED]/chat_1",
    });

    const res = await POST(req({ versionId: "v1", previewUrl: "[REDACTED]/chat_1" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    const body = await res.json();

    expect(waitForProductPostcheckPreviewRunning).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedVersionId: "v1",
        expectedFilesRevision: "rev_n",
        expectedPreviewSessionId: "ps_n",
        expectedLifecycleToken: "life_n",
      }),
    );
    expect(waitForProductPostcheckPreviewRunning.mock.calls[0]?.[0]).not.toHaveProperty(
      "expectedMutationRevision",
    );
    expect(body.skipped).toBe(false);
    expect(body.attestation).toEqual({
      previewSessionId: "ps_n",
      lifecycleToken: "life_n",
      filesRevision: "rev_n",
    });
    expect(runProductPostcheck).toHaveBeenCalled();
    expect(claimProductPostcheckRun).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.objectContaining({
          versionId: "v1",
          filesRevision: "rev_n",
          previewSession: "ps_n",
          lifecycleToken: "life_n",
          mutationRevision: 1,
        }),
      }),
    );
    expect(emitBusEvent).not.toHaveBeenCalled();
  });

  it("(a) två samtidiga POST → en claim, ett browserjobb, andra claim_busy", async () => {
    setF2ProductPostcheck(true);
    getVersion.mockResolvedValue({ version: { id: "v1", files_revision: "rev_n" } });
    claimProductPostcheckRun
      .mockResolvedValueOnce({
        kind: "acquired",
        runId: "run_winner",
        claimGeneration: 1,
        owner: "user_1",
      })
      .mockResolvedValueOnce({
        kind: "busy",
        runId: "run_winner",
        claimGeneration: 1,
        status: "running",
      });
    let releaseWinner: (() => void) | undefined;
    runProductPostcheck.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseWinner = () =>
            resolve({
              ok: true,
              skipped: false,
              skippedReason: null,
              warnings: [],
              warningCount: 0,
              productBlocked: false,
              durationMs: 8,
              checkedUrl: "[REDACTED]/chat_1",
              routesChecked: 1,
            });
        }),
    );

    const pending = [
      POST(req({ versionId: "v1", previewUrl: "[REDACTED]/chat_1" }), {
        params: Promise.resolve({ chatId: "chat_1" }),
      }),
      POST(req({ versionId: "v1", previewUrl: "[REDACTED]/chat_1" }), {
        params: Promise.resolve({ chatId: "chat_1" }),
      }),
    ];
    await vi.waitFor(() => {
      expect(claimProductPostcheckRun).toHaveBeenCalledTimes(2);
    });
    expect(runProductPostcheck).toHaveBeenCalledTimes(1);
    releaseWinner?.();
    const settled = await Promise.all(
      pending.map(async (p) => {
        const res = await p;
        return { status: res.status, body: await res.json() };
      }),
    );
    const busy = settled.find((item) => item.body.skippedReason === "claim_busy");
    const winner = settled.find((item) => item.body.skipped !== true);
    expect(winner?.status).toBe(200);
    expect(winner?.body.verificationRunId).toBe("run_winner");
    expect(busy?.status).toBe(200);
    expect(busy?.body.skippedReason).toBe("claim_busy");
    expect(busy?.body.verificationRunId).toBe("run_winner");
    expect(busy?.body.attestation).toBeNull();
    expect(runProductPostcheck).toHaveBeenCalledTimes(1);
    expect(emitBusEvent).not.toHaveBeenCalled();
  });

  it("(b) DB-fel vid claim → 503 + Retry-After, ingen browser", async () => {
    setF2ProductPostcheck(true);
    getVersion.mockResolvedValue({ version: { id: "v1", files_revision: "rev_n" } });
    claimProductPostcheckRun.mockResolvedValue({
      kind: "unavailable",
      reason: "db_error",
    });

    const res = await POST(req({ versionId: "v1", previewUrl: "[REDACTED]/chat_1" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    const body = await res.json();
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("3");
    expect(body).toEqual({
      error: "Product postcheck claim unavailable (database error). Try again shortly.",
      code: "claim_unavailable",
      retryable: true,
    });
    expect(runProductPostcheck).not.toHaveBeenCalled();
    expect(beginLiveReviewSession).not.toHaveBeenCalled();
    expect(emitBusEvent).not.toHaveBeenCalled();
  });

  it("L7 (f): även ett gammalt wait-skäl preview_not_running attesteras inte", async () => {
    setF2ProductPostcheck(true);
    getPreviewHostBaseUrl.mockReturnValue("https://preview-host.example");
    getVersion.mockResolvedValue({ version: { id: "v1", files_revision: "rev_n" } });
    waitForProductPostcheckPreviewRunning.mockResolvedValue({
      ok: false,
      reason: "preview_not_running",
      lastProbe: {
        running: true,
        versionId: "v1",
        filesRevision: "rev_n",
        previewSessionId: "ps_n",
        lifecycleToken: "life_n",
        mutationRevision: 1,
        previewUrl: "[REDACTED]/chat_1",
        readinessState: "starting",
        httpReady: false,
      },
    });

    const res = await POST(req({ versionId: "v1", previewUrl: "[REDACTED]/chat_1" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    const body = await res.json();

    expect(body.skippedReason).toBe("preview_not_ready");
    expect(body.attestation).toBeNull();
    expect(emitBusEvent).not.toHaveBeenCalled();
    expect(runProductPostcheck).not.toHaveBeenCalled();
    expect(claimProductPostcheckRun).not.toHaveBeenCalled();
  });

  it("discardar legacy-resultatet när samma session får lifecycle-token", async () => {
    setF2ProductPostcheck(true);
    getVersion.mockResolvedValue({
      version: { id: "v1", files_revision: "rev_legacy" },
    });
    getActivePreviewSessionAsync
      .mockResolvedValueOnce({
        previewSessionId: "ps_shared",
        lifecycleToken: null,
        previewUrl: "https://vm-fly-jakem.fly.dev/chat_1",
        versionId: "v1",
        filesRevision: "rev_legacy",
      })
      .mockResolvedValue({
        previewSessionId: "ps_shared",
        lifecycleToken: "life_n_plus_1",
        previewUrl: "https://vm-fly-jakem.fly.dev/chat_1",
        versionId: "v1",
        filesRevision: "rev_legacy",
      });
    runProductPostcheck.mockResolvedValue({
      ok: true,
      skipped: false,
      skippedReason: null,
      warnings: [],
      warningCount: 0,
      productBlocked: false,
      durationMs: 7,
      checkedUrl: "https://vm-fly-jakem.fly.dev/chat_1",
      routesChecked: 1,
    });

    const res = await POST(
      req({ versionId: "v1", previewUrl: "https://vm-fly-jakem.fly.dev/chat_1" }),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );
    const body = await res.json();

    expect(body).toEqual(
      expect.objectContaining({
        skipped: true,
        skippedReason: "preview_superseded",
        productBlocked: false,
      }),
    );
    expect(emitBusEvent).not.toHaveBeenCalled();
  });

  it("client filesRevision that no longer matches DB → preview_superseded without attest", async () => {
    setF2ProductPostcheck(true);
    getVersion.mockResolvedValue({ version: { id: "v1", files_revision: "rev_n_plus_1" } });
    const res = await POST(
      req({
        versionId: "v1",
        previewUrl: "[REDACTED]/chat_1",
        filesRevision: "rev_n",
      }),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );
    const body = await res.json();
    expect(body).toEqual(
      expect.objectContaining({
        skipped: true,
        skippedReason: "preview_superseded",
        attestation: null,
      }),
    );
    expect(runProductPostcheck).not.toHaveBeenCalled();
    expect(waitForProductPostcheckPreviewRunning).not.toHaveBeenCalled();
  });

  it("skickar klientens exakta filesRevision till preview-wait", async () => {
    setF2ProductPostcheck(true);
    getPreviewHostBaseUrl.mockReturnValue("https://preview-host.example");
    getVersion.mockResolvedValue({ version: { id: "v1", files_revision: "rev_exact" } });
    waitForProductPostcheckPreviewRunning.mockResolvedValue({
      ok: true,
      probe: {
        running: true,
        versionId: "v1",
        filesRevision: "rev_exact",
        previewSessionId: "ps_n",
        lifecycleToken: "life_n",
        previewUrl: "[REDACTED]/chat_1",
        readinessState: "ready",
      },
    });
    getActivePreviewSessionAsync.mockResolvedValue({
      previewSessionId: "ps_n",
      lifecycleToken: "life_n",
      previewUrl: "[REDACTED]/chat_1",
      versionId: "v1",
      filesRevision: "rev_exact",
    });
    runProductPostcheck.mockResolvedValue({
      ok: true,
      skipped: false,
      skippedReason: null,
      warnings: [],
      warningCount: 0,
      productBlocked: false,
      durationMs: 8,
      checkedUrl: "[REDACTED]/chat_1",
    });

    await POST(
      req({
        versionId: "v1",
        previewUrl: "[REDACTED]/chat_1",
        filesRevision: "rev_exact",
      }),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(waitForProductPostcheckPreviewRunning).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedVersionId: "v1",
        expectedFilesRevision: "rev_exact",
      }),
    );
  });
});
