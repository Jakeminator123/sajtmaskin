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
const waitForProductPostcheckRun = vi.hoisted(() => vi.fn());
const completeProductPostcheckRun = vi.hoisted(() => vi.fn());
const failProductPostcheckRun = vi.hoisted(() => vi.fn());

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
  waitForProductPostcheckRun,
  completeProductPostcheckRun,
  failProductPostcheckRun,
}));

function acquiredClaim(overrides: Record<string, unknown> = {}) {
  const claimedAt = new Date("2026-09-01T00:00:00.000Z");
  return {
    kind: "acquired" as const,
    row: {
      id: "ppr_test",
      chatId: "chat_1",
      versionId: "v1",
      filesRevision: "rev_n",
      previewSessionId: "ps_n",
      lifecycleToken: "life_n",
      verificationRunId: "run_test",
      status: "running",
      skipReason: null,
      result: null,
      claimedAt,
      leaseExpiresAt: new Date(claimedAt.getTime() + 6 * 60 * 1000),
      completedAt: null,
      expiresAt: new Date("2026-09-08T00:00:00.000Z"),
      ...overrides,
    },
  };
}

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
      previewUrl: "https://preview.test.invalid/chat_1",
      versionId: "v1",
      filesRevision: "rev_n",
      createdAt: 1,
      lastUsedAt: 1,
    });
    abandonLiveReviewRun.mockResolvedValue(undefined);
    deleteLiveReviewScreenshotUrls.mockResolvedValue(undefined);
    claimProductPostcheckRun.mockResolvedValue(acquiredClaim());
    waitForProductPostcheckRun.mockResolvedValue(null);
    completeProductPostcheckRun.mockResolvedValue(true);
    failProductPostcheckRun.mockResolvedValue(true);
    getPreviewHostBaseUrl.mockReturnValue(null);
    waitForProductPostcheckPreviewRunning.mockResolvedValue({
      ok: true,
      probe: {
        running: true,
        versionId: "v1",
        filesRevision: "rev_n",
        previewSessionId: "ps_n",
        lifecycleToken: "life_n",
        previewUrl: "https://preview.test.invalid/chat_1",
        readinessState: "ready",
      },
    });
    readProductPostcheckPreviewProbe.mockResolvedValue({
      running: false,
      versionId: "v1",
      filesRevision: "rev_n",
      previewSessionId: "ps_n",
      lifecycleToken: "life_n",
      previewUrl: "https://preview.test.invalid/chat_1",
      readinessState: null,
    });
  });

  it("feature flag off => skipped utan DB/Playwright-körning", async () => {
    const res = await POST(req({ versionId: "v1", previewUrl: "https://preview.test.invalid/chat_1" }), {
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
    const res = await POST(req({ versionId: "v1", previewUrl: "https://preview.test.invalid/chat_1" }), {
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
      checkedUrl: "https://preview.test.invalid/chat_1",
    });
    const res = await POST(req({ versionId: "v1", previewUrl: null }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    const body = await res.json();
    expect(body.skipped).toBe(false);
    expect(runProductPostcheck).toHaveBeenCalledWith(
      expect.objectContaining({
        previewUrl: "https://preview.test.invalid/chat_1",
      }),
    );
    expect(body.checkedUrl).toBe("https://preview.test.invalid/chat_1");
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
      checkedUrl: "https://preview.test.invalid/chat_1",
    });
    const res = await POST(req({ versionId: "v1", previewUrl: "https://preview.test.invalid/chat_1" }), {
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
      checkedUrl: "https://preview.test.invalid/chat_1",
    });

    const res = await POST(req({ versionId: "v1", previewUrl: "https://preview.test.invalid/chat_1" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.skipped).toBe(false);
    expect(body.warningCount).toBe(1);
    expect(getVersion).toHaveBeenCalled();
    expect(runProductPostcheck).toHaveBeenCalledWith({
      previewUrl: "https://preview.test.invalid/chat_1",
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
      checkedUrl: "https://preview.test.invalid/chat_1",
    });
    const res = await POST(req({ versionId: "v1", previewUrl: "https://preview.test.invalid/chat_1" }), {
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
      checkedUrl: "https://preview.test.invalid/chat_1",
    });
    await POST(req({ versionId: "v1", previewUrl: "https://preview.test.invalid/chat_1" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    expect(emitBusEvent).not.toHaveBeenCalled();
  });

  it("scope miss => 404", async () => {
    setF2ProductPostcheck(true);
    getVersion.mockResolvedValue(null);
    const res = await POST(req({ versionId: "v1", previewUrl: "https://preview.test.invalid/chat_1" }), {
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
      previewUrl: "https://preview.test.invalid/chat_1",
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
      checkedUrl: "https://preview.test.invalid/chat_1",
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
    const res = await POST(req({ versionId: "v1", previewUrl: "https://preview.test.invalid/chat_1" }), {
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
        previewUrl: "https://preview.test.invalid/chat_1",
        versionId: "v1",
        filesRevision: "rev_n",
      })
      .mockResolvedValue({
        previewSessionId: "ps_n_plus_1",
        lifecycleToken: "life_n_plus_1",
        previewUrl: "https://preview.test.invalid/chat_1",
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
      checkedUrl: "https://preview.test.invalid/chat_1",
      routesChecked: 1,
      screenshots: { desktopUrl: "https://blob.example/n.jpg", mobileUrl: null },
    });

    const res = await POST(
      req({ versionId: "v1", previewUrl: "https://preview.test.invalid/chat_1" }),
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
      previewUrl: "https://preview.test.invalid/chat_1",
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
      checkedUrl: "https://preview.test.invalid/chat_1",
      routesChecked: 1,
    });

    const res = await POST(
      req({ versionId: "v1", previewUrl: "https://preview.test.invalid/chat_1" }),
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

  it("host configured + wait budget slut ⇒ skip preview_not_running med emit", async () => {
    setF2ProductPostcheck(true);
    getPreviewHostBaseUrl.mockReturnValue("https://preview-host.example");
    getVersion.mockResolvedValue({ version: { id: "v1", files_revision: "rev_n" } });
    waitForProductPostcheckPreviewRunning.mockResolvedValue({
      ok: false,
      reason: "preview_not_running",
      lastProbe: {
        running: false,
        versionId: "v1",
        filesRevision: "rev_n",
        previewSessionId: "ps_n",
        lifecycleToken: "life_n",
        previewUrl: "https://preview.test.invalid/chat_1",
        readinessState: "starting",
      },
    });

    const res = await POST(req({ versionId: "v1", previewUrl: "https://preview.test.invalid/chat_1" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    const body = await res.json();

    expect(body.skipped).toBe(true);
    expect(body.skippedReason).toBe("preview_not_running");
    expect(body.attestation).toEqual({
      previewSessionId: "ps_n",
      lifecycleToken: "life_n",
      filesRevision: "rev_n",
    });
    expect(runProductPostcheck).not.toHaveBeenCalled();
    expect(emitBusEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        t: "version.degraded",
        kind: "product_postcheck_skipped",
        message: "F2 Product Postcheck skipped (product_postcheck_skipped: preview_not_running).",
        meta: expect.objectContaining({
          skippedReason: "preview_not_running",
          attestedPreviewSessionId: "ps_n",
          attestedLifecycleToken: "life_n",
          attestedFilesRevision: "rev_n",
        }),
      }),
    );
  });

  it("host configured + wait budget slut utan bind ⇒ skip preview_not_running med emit", async () => {
    setF2ProductPostcheck(true);
    getPreviewHostBaseUrl.mockReturnValue("https://preview-host.example");
    getVersion.mockResolvedValue({ version: { id: "v1", files_revision: "rev_n" } });
    waitForProductPostcheckPreviewRunning.mockResolvedValue({
      ok: false,
      reason: "preview_not_running",
      lastProbe: {
        running: false,
        versionId: null,
        filesRevision: null,
        previewSessionId: null,
        lifecycleToken: null,
        previewUrl: null,
        readinessState: null,
      },
    });

    const res = await POST(req({ versionId: "v1", previewUrl: "https://preview.test.invalid/chat_1" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    const body = await res.json();

    expect(body.skippedReason).toBe("preview_not_running");
    expect(body.attestation).toBeNull();
    expect(body).not.toEqual(
      expect.objectContaining({
        attestation: expect.objectContaining({ previewSessionId: "unbound" }),
      }),
    );
    expect(runProductPostcheck).not.toHaveBeenCalled();
    expect(emitBusEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "product_postcheck_skipped",
        message: "F2 Product Postcheck skipped (product_postcheck_skipped: preview_not_running).",
        meta: expect.objectContaining({
          skippedReason: "preview_not_running",
          attestedPreviewSessionId: null,
          attestedFilesRevision: null,
        }),
      }),
    );
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
        previewUrl: "https://preview.test.invalid/chat_1",
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
      checkedUrl: "https://preview.test.invalid/chat_1",
    });

    const res = await POST(
      req({
        versionId: "v1",
        previewUrl: "https://preview.test.invalid/chat_1/stale",
      }),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );
    const body = await res.json();

    expect(runProductPostcheck).toHaveBeenCalledWith(
      expect.objectContaining({
        previewUrl: "https://preview.test.invalid/chat_1",
      }),
    );
    expect(body.checkedUrl).toBe("https://preview.test.invalid/chat_1");
    expect(body.skipped).toBe(false);
    expect(body.attestation).toEqual({
      previewSessionId: "ps_n",
      lifecycleToken: "life_n",
      filesRevision: "rev_n",
    });
  });

  it("host configured + wait tills running ⇒ kör postcheck", async () => {
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
      checkedUrl: "https://preview.test.invalid/chat_1",
    });

    const res = await POST(req({ versionId: "v1", previewUrl: "https://preview.test.invalid/chat_1" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    const body = await res.json();

    expect(waitForProductPostcheckPreviewRunning).toHaveBeenCalled();
    expect(body.skipped).toBe(false);
    expect(runProductPostcheck).toHaveBeenCalled();
    expect(emitBusEvent).not.toHaveBeenCalled();
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
        previewUrl: "https://preview.test.invalid/chat_1",
        versionId: "v1",
        filesRevision: "rev_legacy",
      })
      .mockResolvedValue({
        previewSessionId: "ps_shared",
        lifecycleToken: "life_n_plus_1",
        previewUrl: "https://preview.test.invalid/chat_1",
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
      checkedUrl: "https://preview.test.invalid/chat_1",
      routesChecked: 1,
    });

    const res = await POST(
      req({ versionId: "v1", previewUrl: "https://preview.test.invalid/chat_1" }),
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

  it("två POST med samma claim-tuple ⇒ runProductPostcheck en gång (single-flight)", async () => {
    setF2ProductPostcheck(true);
    getVersion.mockResolvedValue({ version: { id: "v1", files_revision: "rev_n" } });
    const winnerResult = {
      ok: true,
      skipped: false,
      skippedReason: null,
      warnings: [],
      warningCount: 0,
      productBlocked: false,
      durationMs: 8,
      checkedUrl: "https://preview.test.invalid/chat_1",
      routesChecked: 1,
      attestation: {
        previewSessionId: "ps_n",
        lifecycleToken: "life_n",
        filesRevision: "rev_n",
      },
      verificationRunId: "run_winner",
    };
    let releaseWinner: ((value: typeof winnerResult) => void) | null = null;
    runProductPostcheck.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseWinner = resolve;
        }),
    );

    const store = new Map<
      string,
      { status: "running" | "completed"; result?: typeof winnerResult }
    >();
    const key = "v1|rev_n|ps_n|life_n";
    claimProductPostcheckRun.mockImplementation(async () => {
      const existing = store.get(key);
      if (!existing) {
        store.set(key, { status: "running" });
        return acquiredClaim();
      }
      if (existing.status === "completed" && existing.result) {
        return { kind: "cached" as const, result: existing.result, row: acquiredClaim().row };
      }
      return { kind: "in_flight" as const, row: acquiredClaim().row };
    });
    waitForProductPostcheckRun.mockImplementation(async () => {
      for (let i = 0; i < 50; i += 1) {
        const existing = store.get(key);
        if (existing?.status === "completed" && existing.result) return existing.result;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      return null;
    });
    completeProductPostcheckRun.mockImplementation(async (input: { result: typeof winnerResult }) => {
      store.set(key, { status: "completed", result: input.result });
      return true;
    });

    const first = POST(req({ versionId: "v1", previewUrl: "https://preview.test.invalid/chat_1" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    await vi.waitFor(() => expect(runProductPostcheck).toHaveBeenCalledTimes(1));

    const second = POST(req({ versionId: "v1", previewUrl: "https://preview.test.invalid/chat_1" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    expect(runProductPostcheck).toHaveBeenCalledTimes(1);
    expect(releaseWinner).toBeTruthy();
    releaseWinner!(winnerResult);

    const [firstRes, secondRes] = await Promise.all([first, second]);
    const firstBody = await firstRes.json();
    const secondBody = await secondRes.json();

    expect(runProductPostcheck).toHaveBeenCalledTimes(1);
    expect(firstBody.skipped).toBe(false);
    expect(secondBody.skipped).toBe(false);
    expect(secondBody.checkedUrl).toBe("https://preview.test.invalid/chat_1");
    expect(claimProductPostcheckRun).toHaveBeenCalledTimes(2);
  });

  it("väntetimeout ⇒ oattesterad claim_busy-hold, aldrig ett attesterat skip", async () => {
    setF2ProductPostcheck(true);
    getVersion.mockResolvedValue({ version: { id: "v1", files_revision: "rev_n" } });
    // Vinnaren äger målet och blir inte klar inom vår budget (eller dog).
    claimProductPostcheckRun.mockResolvedValue({
      kind: "in_flight" as const,
      row: acquiredClaim().row,
    });
    waitForProductPostcheckRun.mockResolvedValue(null);

    const res = await POST(req({ versionId: "v1", previewUrl: "https://preview.test.invalid/chat_1" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    const body = await res.json();

    // Ingen andra webbläsare.
    expect(runProductPostcheck).not.toHaveBeenCalled();
    expect(body.skipped).toBe(true);
    expect(body.skippedReason).toBe("claim_busy");
    // Kärnan: ett attesterat skip läses som "kontrollerad, inget blockerar" av
    // productPostcheckNeedsRetry, och F3-grinden hittar sedan ingen summary-rad
    // och går grön. Attesteringen MÅSTE vara null så versionen lämnas pending.
    expect(body.attestation).toBeNull();
    expect(body.productBlocked).toBe(false);
  });

  it("annan lifecycleToken eller previewSessionId ⇒ andra claimet tillåts", async () => {
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
      checkedUrl: "https://preview.test.invalid/chat_1",
      routesChecked: 1,
    });

    const claimed = new Set<string>();
    claimProductPostcheckRun.mockImplementation(
      async (input: {
        versionId: string;
        filesRevision: string;
        previewSessionId: string;
        lifecycleToken: string | null;
      }) => {
        const key = [
          input.versionId,
          input.filesRevision,
          input.previewSessionId,
          input.lifecycleToken ?? "",
        ].join("|");
        if (claimed.has(key)) return { kind: "in_flight" as const, row: acquiredClaim().row };
        claimed.add(key);
        return acquiredClaim({
          previewSessionId: input.previewSessionId,
          lifecycleToken: input.lifecycleToken ?? "",
        });
      },
    );

    const first = await POST(req({ versionId: "v1", previewUrl: "https://preview.test.invalid/chat_1" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    expect((await first.json()).skipped).toBe(false);
    expect(runProductPostcheck).toHaveBeenCalledTimes(1);

    getActivePreviewSessionAsync.mockResolvedValue({
      previewSessionId: "ps_other",
      lifecycleToken: "life_other",
      previewUrl: "https://preview.test.invalid/chat_1",
      versionId: "v1",
      filesRevision: "rev_n",
      createdAt: 1,
      lastUsedAt: 1,
    });
    const second = await POST(req({ versionId: "v1", previewUrl: "https://preview.test.invalid/chat_1" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    expect((await second.json()).skipped).toBe(false);
    expect(runProductPostcheck).toHaveBeenCalledTimes(2);
    expect(claimProductPostcheckRun).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        previewSessionId: "ps_other",
        lifecycleToken: "life_other",
        filesRevision: "rev_n",
        versionId: "v1",
      }),
    );
  });

  it("saknad tabell ⇒ degraderar till att köra postchecken", async () => {
    setF2ProductPostcheck(true);
    getVersion.mockResolvedValue({ version: { id: "v1", files_revision: "rev_n" } });
    claimProductPostcheckRun.mockResolvedValue(null);
    runProductPostcheck.mockResolvedValue({
      ok: true,
      skipped: false,
      skippedReason: null,
      warnings: [],
      warningCount: 0,
      productBlocked: false,
      durationMs: 8,
      checkedUrl: "https://preview.test.invalid/chat_1",
    });

    const res = await POST(req({ versionId: "v1", previewUrl: "https://preview.test.invalid/chat_1" }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    const body = await res.json();

    expect(body.skipped).toBe(false);
    expect(runProductPostcheck).toHaveBeenCalledTimes(1);
    expect(completeProductPostcheckRun).not.toHaveBeenCalled();
  });
});
