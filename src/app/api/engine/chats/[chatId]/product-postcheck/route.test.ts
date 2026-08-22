import { beforeEach, describe, expect, it, vi } from "vitest";
import { FEATURES } from "@/lib/config";
import { POST } from "./route";

const getVersion = vi.hoisted(() => vi.fn());
const getRequestUserId = vi.hoisted(() => vi.fn(async () => "user_1"));
const runProductPostcheck = vi.hoisted(() => vi.fn());
const emitBusEvent = vi.hoisted(() => vi.fn());
const beginLiveReviewSession = vi.hoisted(() => vi.fn());
const finishLiveReviewSession = vi.hoisted(() => vi.fn());
const discardLiveReviewScreenshots = vi.hoisted(() => vi.fn());
const abandonLiveReviewRun = vi.hoisted(() => vi.fn());
const deleteLiveReviewScreenshotUrls = vi.hoisted(() => vi.fn());
const getLiveReviewRunForVersion = vi.hoisted(() => vi.fn());
const readGenerationOrchestration = vi.hoisted(() => vi.fn());
const setLlmUsageContext = vi.hoisted(() => vi.fn());
const upsertAssistantMessageUiPart = vi.hoisted(() => vi.fn(async () => true));
const pickUserRequestForVersion = vi.hoisted(() => vi.fn(() => "Gör headern blå"));
const summarizeBrief = vi.hoisted(() =>
  vi.fn((snapshot?: Record<string, unknown> | null) => {
    const brief = snapshot?.briefSummary;
    if (brief && typeof brief === "object" && brief !== null && "projectTitle" in brief) {
      const title = (brief as { projectTitle?: unknown }).projectTitle;
      return typeof title === "string" ? title : "";
    }
    return "";
  }),
);

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
  pickUserRequestForVersion,
  summarizeBrief,
}));

vi.mock("@/lib/gen/verify/live-review-session", () => ({
  beginLiveReviewSession,
  discardLiveReviewScreenshots,
  finishLiveReviewSession,
}));

vi.mock("@/lib/gen/version-bound-orchestration", () => ({
  readGenerationOrchestration,
}));

vi.mock("@/lib/logging/event-bus", () => ({
  emit: emitBusEvent,
}));

vi.mock("@/lib/db/services/live-review-runs", () => ({
  abandonLiveReviewRun,
  deleteLiveReviewScreenshotUrls,
  getLiveReviewRunForVersion,
}));

vi.mock("@/lib/db/chat-repository-pg", () => ({
  upsertAssistantMessageUiPart,
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
    abandonLiveReviewRun.mockResolvedValue(undefined);
    deleteLiveReviewScreenshotUrls.mockResolvedValue(undefined);
    discardLiveReviewScreenshots.mockImplementation(
      async (screenshots: { desktopUrl: string | null; mobileUrl: string | null } | null) => {
        if (!screenshots) return;
        screenshots.desktopUrl = null;
        screenshots.mobileUrl = null;
      },
    );
    getLiveReviewRunForVersion.mockResolvedValue(null);
    readGenerationOrchestration.mockResolvedValue(null);
    summarizeBrief.mockImplementation((snapshot?: Record<string, unknown> | null) => {
      const brief = snapshot?.briefSummary;
      if (brief && typeof brief === "object" && brief !== null && "projectTitle" in brief) {
        const title = (brief as { projectTitle?: unknown }).projectTitle;
        return typeof title === "string" ? title : "";
      }
      return "";
    });
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
    const res = await POST(
      req({ versionId: "v1", previewUrl: "https://vm-fly-jakem.fly.dev/chat_1" }),
      {
        params: Promise.resolve({ chatId: "chat_1" }),
      },
    );
    const body = await res.json();
    expect(body.skipped).toBe(true);
    expect(body.skippedReason).toBe("feature_disabled");
    expect(body.liveReview).toMatchObject({
      status: "skipped",
      reason: "postcheck_skipped",
    });
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
    expect(body.liveReview).toMatchObject({ status: "skipped", reason: "preview_not_ready" });
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
    const res = await POST(
      req({ versionId: "v1", previewUrl: "https://vm-fly-jakem.fly.dev/chat_1" }),
      {
        params: Promise.resolve({ chatId: "chat_1" }),
      },
    );
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

    const res = await POST(
      req({ versionId: "v1", previewUrl: "https://vm-fly-jakem.fly.dev/chat_1" }),
      {
        params: Promise.resolve({ chatId: "chat_1" }),
      },
    );
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
    const res = await POST(
      req({ versionId: "v1", previewUrl: "https://vm-fly-jakem.fly.dev/chat_1" }),
      {
        params: Promise.resolve({ chatId: "chat_1" }),
      },
    );
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
    const res = await POST(
      req({ versionId: "v1", previewUrl: "https://vm-fly-jakem.fly.dev/chat_1" }),
      {
        params: Promise.resolve({ chatId: "chat_1" }),
      },
    );
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
      versionId: "v3",
      filesRevision: "rev_c",
      userId: "user_1",
    });
    getVersion.mockResolvedValue({
      version: {
        id: "v3",
        message_id: "msg_v3",
        parent_version_id: "v1",
        version_number: 3,
        files_json: "[]",
        files_revision: "rev_c",
      },
      chat: { messages: [], orchestration_snapshot: null },
    });
    readGenerationOrchestration.mockResolvedValue({
      snapshot: {
        baseVersionId: "v1",
        baseFilesRevision: "rev_parent",
        briefSummary: { projectTitle: "historical" },
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
    const res = await POST(
      req({ versionId: "v3", previewUrl: "https://vm-fly-jakem.fly.dev/chat_1" }),
      {
        params: Promise.resolve({ chatId: "chat_1" }),
      },
    );
    const body = await res.json();
    expect(body.productBlocked).toBe(false);
    expect(body.liveReview.status).toBe("completed");
    expect(runProductPostcheck).toHaveBeenCalledWith(
      expect.objectContaining({
        captureEnabled: true,
        filesRevision: "rev_c",
      }),
    );
    expect(finishLiveReviewSession).toHaveBeenCalled();
    expect(finishLiveReviewSession).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        previousVersionId: "v1",
        previousFilesRevision: "rev_parent",
        userRequest: "Gör headern blå",
      }),
    );
    expect(pickUserRequestForVersion).toHaveBeenCalledWith([], "msg_v3");
    expect(upsertAssistantMessageUiPart).toHaveBeenCalledWith(
      "chat_1",
      "msg_v3",
      expect.objectContaining({
        type: "tool:live-review",
        toolCallId: "live-review:v3",
        output: expect.objectContaining({
          liveReview: expect.objectContaining({ status: "completed" }),
        }),
      }),
    );
    expect(emitBusEvent).not.toHaveBeenCalled();
    expect(setLlmUsageContext).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: "chat_1", userId: "user_1" }),
    );
    expect(setLlmUsageContext).toHaveBeenCalledWith(expect.objectContaining({ versionId: "v3" }));
    expect(finishLiveReviewSession).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ briefSummary: "historical" }),
    );
  });

  it("returns a visible skipped review when the critic throws", async () => {
    setF2ProductPostcheck(true);
    beginLiveReviewSession.mockResolvedValue({
      captureEnabled: true,
      claim: { kind: "acquired", row: { id: "run_1", claimedAt: new Date() } },
      earlyResult: null,
      chatId: "chat_1",
      versionId: "v1",
      filesRevision: "rev_a",
      userId: "user_1",
    });
    getVersion.mockResolvedValue({
      version: { id: "v1", version_number: 1, files_json: "[]", files_revision: "rev_a" },
      chat: {
        messages: [],
        orchestration_snapshot: { briefSummary: { projectTitle: "Newest chat brief" } },
      },
    });
    readGenerationOrchestration.mockResolvedValue({
      snapshot: { lastVersionId: "v1" },
    });
    runProductPostcheck.mockResolvedValue({
      ok: true,
      skipped: false,
      skippedReason: null,
      warnings: [],
      warningCount: 0,
      productBlocked: false,
      routesChecked: 1,
      durationMs: 8,
      checkedUrl: "https://vm-fly-jakem.fly.dev/chat_1",
      screenshots: { desktopUrl: "https://blob.example/d.jpg", mobileUrl: null },
      domSummary: null,
    });
    finishLiveReviewSession.mockRejectedValue(new Error("critic timeout"));

    const res = await POST(
      req({ versionId: "v1", previewUrl: "https://vm-fly-jakem.fly.dev/chat_1" }),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );
    const body = await res.json();

    expect(body.liveReview).toEqual({
      status: "skipped",
      reason: "review_error",
      detail: "critic timeout",
    });
    expect(abandonLiveReviewRun).toHaveBeenCalled();
    expect(discardLiveReviewScreenshots).toHaveBeenCalled();
    expect(body.screenshots).toEqual({ desktopUrl: null, mobileUrl: null });
    expect(finishLiveReviewSession).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ briefSummary: "" }),
    );
    expect(summarizeBrief).not.toHaveBeenCalledWith(
      expect.objectContaining({ briefSummary: { projectTitle: "Newest chat brief" } }),
    );
  });

  it("returns a visible runtime-crash review when Product Postcheck throws", async () => {
    setF2ProductPostcheck(true);
    getVersion.mockResolvedValue({
      version: { id: "v1", files_revision: "rev_a" },
      chat: { messages: [], orchestration_snapshot: null },
    });
    runProductPostcheck.mockRejectedValue(new Error("chromium crashed"));

    const res = await POST(
      req({ versionId: "v1", previewUrl: "https://vm-fly-jakem.fly.dev/chat_1" }),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );
    const body = await res.json();

    expect(body.skippedReason).toBe("runtime_error");
    expect(body.liveReview).toEqual({
      status: "skipped",
      reason: "runtime_crash",
      detail: "chromium crashed",
    });
  });
});
