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
}));

vi.mock("@/lib/gen/verify/live-review-session", () => ({
  beginLiveReviewSession,
  finishLiveReviewSession,
}));

vi.mock("@/lib/logging/event-bus", () => ({
  emit: emitBusEvent,
}));

vi.mock("@/lib/db/services/live-review-runs", () => ({
  abandonLiveReviewRun: vi.fn(),
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

  it("feature flag on + missing previewUrl => skipped + version.degraded (false-green guard)", async () => {
    setF2ProductPostcheck(true);
    getVersion.mockResolvedValue({ version: { id: "v1" } });
    const res = await POST(req({ versionId: "v1", previewUrl: null }), {
      params: Promise.resolve({ chatId: "chat_1" }),
    });
    const body = await res.json();
    expect(body.skipped).toBe(true);
    expect(body.skippedReason).toBe("missing_preview_url");
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
        meta: expect.objectContaining({ skippedReason: "missing_preview_url" }),
      }),
    );
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
    getVersion.mockResolvedValue({ version: { id: "v1" } });
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
        meta: expect.objectContaining({ skippedReason: "playwright_unavailable" }),
      }),
    );
  });

  it("feature flag on + preview URL => kör server-helper efter version-scope-check", async () => {
    setF2ProductPostcheck(true);
    getVersion.mockResolvedValue({ version: { id: "v1" } });
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
      captureEnabled: false,
      captureUserId: "user_1",
      filesRevision: null,
    });
  });

  it("feature flag on + productBlocked => version.degraded {product_postcheck_blocked}", async () => {
    setF2ProductPostcheck(true);
    getVersion.mockResolvedValue({ version: { id: "v1" } });
    runProductPostcheck.mockResolvedValue({
      ok: true,
      skipped: false,
      skippedReason: null,
      warnings: [
        { code: "mobile_menu_failed", message: "Mobilmeny kunde inte verifieras" },
        { code: "broken_anchor", message: "Anchor target saknas för #pris" },
        { code: "broken_anchor", message: "Anchor target saknas för #kontakt" },
      ],
      warningCount: 3,
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
          blockingCodes: expect.arrayContaining(["mobile_menu_failed", "broken_anchor"]),
          warningCount: 3,
        }),
      }),
    );
  });

  it("feature flag on + körde rent (ej blockerad) => ingen degraded-emit", async () => {
    setF2ProductPostcheck(true);
    getVersion.mockResolvedValue({ version: { id: "v1" } });
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
});
