import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const shouldUseV0Fallback = vi.hoisted(() => vi.fn(() => false));
const getEngineChatByIdForRequest = vi.hoisted(() => vi.fn());
const getEngineVersionForChatByIdForRequest = vi.hoisted(() => vi.fn());
const getChatByV0ChatIdForRequest = vi.hoisted(() => vi.fn());
const getVersionsByChat = vi.hoisted(() => vi.fn());
const updateVersionPreviewUrl = vi.hoisted(() => vi.fn());
const maybeAutoAcceptTimedOutRepair = vi.hoisted(() =>
  vi.fn(async (v: unknown) => ({ version: v, wasAutoAccepted: false })),
);
const addMessage = vi.hoisted(() => vi.fn());
const createDraftVersion = vi.hoisted(() => vi.fn());
const createEngineVersionErrorLogs = vi.hoisted(() => vi.fn());
const readAll = vi.hoisted(() => vi.fn(() => [] as unknown[]));
const getLatestQualityGateSignalsForChat = vi.hoisted(() => vi.fn());
const incContentRevisionMismatch = vi.hoisted(() => vi.fn());
const dbSelect = vi.hoisted(() => vi.fn());

vi.mock("@/lib/logging/event-bus", () => ({ readAll }));

vi.mock("@/lib/gen/engine", () => ({
  shouldUseV0Fallback,
}));

vi.mock("@/lib/tenant", () => ({
  getEngineChatByIdForRequest,
  getEngineVersionForChatByIdForRequest,
  getChatByV0ChatIdForRequest,
}));

vi.mock("@/lib/db/chat-repository-pg", () => ({
  getVersionsByChat,
  updateVersionPreviewUrl,
  maybeAutoAcceptTimedOutRepair,
  addMessage,
  createDraftVersion,
}));

vi.mock("@/lib/db/services/version-errors", () => ({
  createEngineVersionErrorLogs,
}));

// Innehållsrevision R15: list path batches revision reads (not N+1). Mocked so
// importing the route never touches `@/lib/db/client` (same reason as
// version-status's getLatestQualityGateSignalForVersion mock).
vi.mock("@/lib/db/services/generation-telemetry", () => ({
  getLatestQualityGateSignalsForChat,
}));

vi.mock("@/lib/observability/metrics", () => ({
  incContentRevisionMismatch,
}));

vi.mock("@/lib/db/client", () => ({
  dbConfigured: true,
  db: {
    select: dbSelect,
  },
}));

vi.mock("@/lib/db/schema", () => ({
  versions: {
    id: Symbol("id"),
    v0VersionId: Symbol("v0VersionId"),
    v0MessageId: Symbol("v0MessageId"),
    demoUrl: Symbol("demoUrl"),
    pinned: Symbol("pinned"),
    pinnedAt: Symbol("pinnedAt"),
    createdAt: Symbol("createdAt"),
    chatId: Symbol("chatId"),
  },
  engineVersionErrorLogs: {
    version_id: Symbol("version_id"),
    category: Symbol("category"),
    message: Symbol("message"),
    meta: Symbol("meta"),
    created_at: Symbol("created_at"),
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn(),
  or: vi.fn(),
  sql: (strings: TemplateStringsArray) => ({
    op: "sql",
    text: strings?.join?.("") ?? "",
  }),
}));

import { GET, PATCH } from "./route";

const REVISION_N = "1".repeat(32);
const REVISION_N_PLUS_1 = "2".repeat(32);

const terminalDoneBus = [
  {
    t: "version.done",
    id: "e1",
    ts: "2026-08-04T10:00:00.000Z",
    runId: "root",
    versionId: "ver_rewritten",
    chatId: "chat_1",
    durationMs: 1000,
  },
];

describe("GET /api/engine/chats/[chatId]/versions", () => {
  beforeEach(() => {
    shouldUseV0Fallback.mockReturnValue(false);
    getEngineChatByIdForRequest.mockReset();
    getEngineVersionForChatByIdForRequest.mockReset();
    getChatByV0ChatIdForRequest.mockReset();
    getVersionsByChat.mockReset();
    updateVersionPreviewUrl.mockReset();
    maybeAutoAcceptTimedOutRepair.mockReset();
    maybeAutoAcceptTimedOutRepair.mockImplementation(async (v: unknown) => ({
      version: v,
      wasAutoAccepted: false,
    }));
    createEngineVersionErrorLogs.mockReset();
    createEngineVersionErrorLogs.mockResolvedValue(null);
    readAll.mockReset();
    readAll.mockReturnValue([]);
    getLatestQualityGateSignalsForChat.mockReset();
    getLatestQualityGateSignalsForChat.mockResolvedValue(new Map());
    incContentRevisionMismatch.mockReset();
    dbSelect.mockReset();
    dbSelect.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(async () => []),
        })),
      })),
    }));
    delete process.env.SAJTMASKIN_CONTENT_REVISION_GATE;
  });

  afterEach(() => {
    delete process.env.SAJTMASKIN_CONTENT_REVISION_GATE;
  });

  it("returns failed own-engine versions without a preview URL", async () => {
    getEngineChatByIdForRequest.mockResolvedValue({ id: "chat_1" });
    getVersionsByChat.mockResolvedValue([
      {
        id: "ver_failed",
        created_at: "2026-03-13T10:01:00.000Z",
        version_number: 3,
        message_id: "msg_1",
        sandbox_url: "https://sandbox.example",
        release_state: "draft",
        verification_state: "failed",
        verification_summary: "Broken build",
        promoted_at: null,
      },
    ]);

    const response = await GET(
      new Request("https://example.com/api/engine/chats/chat_1/versions"),
      {
        params: Promise.resolve({ chatId: "chat_1" }),
      },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.versions).toHaveLength(1);
    expect(json.versions[0].previewUrl).toBeNull();
    expect(json.versions[0]).not.toHaveProperty("legacyShimPreviewUrl");
  });

  it("forwards lifecycleStage so VersionHistory tooltip can tell F2 design from F3 integrations", async () => {
    // Postmortem follow-up: VersionHistory.tsx tooltip läser `lifecycleStage`
    // för att skilja F2 design-rader (server-verify skipped) från F3
    // integrations-rader (server-verify aktiv). Pre-fix mappade route.ts
    // bort fältet och frontend defaultade alltid till "design", vilket gjorde
    // att F3 integrations-rader felaktigt visades som "Klar" istället för
    // "Verifierar".
    getEngineChatByIdForRequest.mockResolvedValue({ id: "chat_1" });
    getVersionsByChat.mockResolvedValue([
      {
        id: "ver_f3",
        created_at: "2026-04-28T10:00:00.000Z",
        version_number: 5,
        message_id: "msg_1",
        release_state: "draft",
        verification_state: "pending",
        verification_summary: null,
        promoted_at: null,
        lifecycle_stage: "integrations",
      },
      {
        id: "ver_f2",
        created_at: "2026-04-28T09:00:00.000Z",
        version_number: 4,
        message_id: "msg_0",
        release_state: "draft",
        verification_state: "pending",
        verification_summary: null,
        promoted_at: null,
        lifecycle_stage: "design",
      },
    ]);

    const response = await GET(
      new Request("https://example.com/api/engine/chats/chat_1/versions"),
      {
        params: Promise.resolve({ chatId: "chat_1" }),
      },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.versions).toHaveLength(2);
    expect(json.versions[0].lifecycleStage).toBe("integrations");
    expect(json.versions[1].lifecycleStage).toBe("design");
  });

  it("keeps own-engine version rows free of legacyShimPreviewUrl entirely", async () => {
    getEngineChatByIdForRequest.mockResolvedValue({ id: "chat_1" });
    getVersionsByChat.mockResolvedValue([
      {
        id: "ver_ok",
        created_at: "2026-03-13T10:01:00.000Z",
        version_number: 3,
        message_id: "msg_1",
        sandbox_url: "https://sandbox.example",
        release_state: "draft",
        verification_state: "passed",
        verification_summary: null,
        promoted_at: null,
      },
    ]);
    const response = await GET(
      new Request("https://example.com/api/engine/chats/chat_1/versions"),
      {
        params: Promise.resolve({ chatId: "chat_1" }),
      },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.versions).toHaveLength(1);
    expect(json.versions[0].previewUrl).toBeNull();
    expect(json.versions[0]).not.toHaveProperty("legacyShimPreviewUrl");
  });

  it("reconciles a still-spinning bus badge to the terminal DB state (no perpetual VersionHistory spinner)", async () => {
    // A version whose bus stream is stuck non-terminal (repair started, no
    // terminal event) but whose DB row is already `failed` must render a
    // terminal lifecycle badge — not a perpetual "Reparerar". Read-only
    // reconcile parity with /version-status (#337 follow-up).
    getEngineChatByIdForRequest.mockResolvedValue({ id: "chat_1" });
    getVersionsByChat.mockResolvedValue([
      {
        id: "ver_stuck",
        created_at: "2026-07-01T17:47:00.000Z",
        version_number: 3,
        message_id: "msg_1",
        release_state: "draft",
        verification_state: "failed",
        verification_summary: "took too long",
        promoted_at: null,
      },
    ]);
    readAll.mockReturnValue([
      {
        t: "version.repair.started",
        id: "e1",
        ts: "2026-07-01T17:47:10.000Z",
        runId: "root",
        versionId: "ver_stuck",
        chatId: "chat_1",
        reason: "verify",
        trigger: "server-verify",
      },
    ]);

    const response = await GET(
      new Request("https://example.com/api/engine/chats/chat_1/versions"),
      {
        params: Promise.resolve({ chatId: "chat_1" }),
      },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    // Without the reconcile this would be "repairing" (a perpetual spinner).
    expect(json.versions[0].busStatus.phase).toBe("failed");
  });

  it("batches persisted postcheck signals and degrades every affected history row without N+1", async () => {
    getEngineChatByIdForRequest.mockResolvedValue({ id: "chat_1" });
    getVersionsByChat.mockResolvedValue([
      {
        id: "ver_2",
        created_at: "2026-08-26T10:02:00Z",
        version_number: 2,
        message_id: "msg_2",
        release_state: "promoted",
        verification_state: "passed",
        verification_summary: "PASS",
        promoted_at: "2026-08-26T10:02:30Z",
      },
      {
        id: "ver_1",
        created_at: "2026-08-26T10:00:00Z",
        version_number: 1,
        message_id: "msg_1",
        release_state: "promoted",
        verification_state: "passed",
        verification_summary: "PASS",
        promoted_at: "2026-08-26T10:00:30Z",
      },
    ]);
    dbSelect.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(async () => [
            {
              versionId: "ver_2",
              category: "product_postcheck.skipped",
              message: "F2 Product Postcheck skipped.",
              meta: { skippedReason: "transport_error" },
              created_at: "2026-08-26T10:03:00Z",
            },
            {
              versionId: "ver_1",
              category: "product_postcheck.skipped",
              message: "F2 Product Postcheck skipped.",
              meta: { skippedReason: "timeout" },
              created_at: "2026-08-26T10:01:00Z",
            },
          ]),
        })),
      })),
    }));

    const response = await GET(
      new Request("https://example.com/api/engine/chats/chat_1/versions"),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(dbSelect).toHaveBeenCalledTimes(1);
    expect(
      json.versions.map((version: { busStatus: { degradations: Array<{ kind: string }> } }) =>
        version.busStatus.degradations.map((item) => item.kind),
      ),
    ).toEqual([
      ["product_postcheck_skipped"],
      ["product_postcheck_skipped"],
    ]);
  });

  it("degrades empty-bus terminal history rows when the batched postcheck read fails", async () => {
    getEngineChatByIdForRequest.mockResolvedValue({ id: "chat_1" });
    getVersionsByChat.mockResolvedValue([
      {
        id: "ver_1",
        created_at: "2026-08-26T10:00:00Z",
        version_number: 1,
        message_id: "msg_1",
        release_state: "promoted",
        verification_state: "passed",
        verification_summary: "PASS",
        promoted_at: "2026-08-26T10:00:30Z",
      },
    ]);
    readAll.mockReturnValue([]);
    dbSelect.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(async () => {
            throw new Error("db read failed");
          }),
        })),
      })),
    }));

    const response = await GET(
      new Request("https://example.com/api/engine/chats/chat_1/versions"),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.versions[0].busStatus.phase).toBe("done");
    expect(json.versions[0].busStatus.degradations).toEqual([
      expect.objectContaining({
        kind: "product_postcheck_skipped",
        meta: expect.objectContaining({ skippedReason: "log_read_error" }),
      }),
    ]);
    expect(json.versions[0].busStatus.verificationBlocked).toBe(false);
  });

  describe("innehållsrevision (R15) — historikbadgen får inte visa solid Klar för omskrivet innehåll", () => {
    beforeEach(() => {
      getEngineChatByIdForRequest.mockResolvedValue({ id: "chat_1" });
      getVersionsByChat.mockResolvedValue([
        {
          id: "ver_rewritten",
          created_at: "2026-08-04T10:00:00.000Z",
          version_number: 2,
          message_id: "msg_1",
          release_state: "draft",
          verification_state: "pending",
          verification_summary: null,
          promoted_at: null,
        },
      ]);
      readAll.mockReturnValue(terminalDoneBus);
    });

    it("degraderar terminal busStatus när senaste gate-signalen är stale (flagga PÅ)", async () => {
      process.env.SAJTMASKIN_CONTENT_REVISION_GATE = "true";
      getLatestQualityGateSignalsForChat.mockResolvedValue(
        new Map([
          [
            "ver_rewritten",
            {
              result: "preflight_passed",
              revisionMatch: "stale",
              verdictRevision: REVISION_N,
              contentRevision: REVISION_N_PLUS_1,
            },
          ],
        ]),
      );

      const response = await GET(
        new Request("https://example.com/api/engine/chats/chat_1/versions"),
        { params: Promise.resolve({ chatId: "chat_1" }) },
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.versions[0].busStatus.phase).toBe("done");
      expect(json.versions[0].busStatus.degradations.map((d: { kind: string }) => d.kind)).toEqual([
        "stale_content_revision",
      ]);
      expect(incContentRevisionMismatch).toHaveBeenCalledWith("versions_list", {
        verdict: "preflight_passed",
      });
    });

    it("degraderar även när bussen är tom och DB:n är terminal — serverless cold start (Bugbot)", async () => {
      process.env.SAJTMASKIN_CONTENT_REVISION_GATE = "true";
      // Per-instans in-memory buss: en ny instans har inga events alls, och
      // reconcileTerminalDbState uppgraderar idle → done från DB-tillståndet.
      readAll.mockReturnValue([]);
      getVersionsByChat.mockResolvedValue([
        {
          id: "ver_rewritten",
          created_at: "2026-08-04T10:00:00.000Z",
          version_number: 2,
          message_id: "msg_1",
          release_state: "draft",
          verification_state: "passed",
          verification_summary: null,
          promoted_at: null,
        },
      ]);
      getLatestQualityGateSignalsForChat.mockResolvedValue(
        new Map([
          [
            "ver_rewritten",
            {
              result: "preflight_passed",
              revisionMatch: "stale",
              verdictRevision: REVISION_N,
              contentRevision: REVISION_N_PLUS_1,
            },
          ],
        ]),
      );

      const response = await GET(
        new Request("https://example.com/api/engine/chats/chat_1/versions"),
        { params: Promise.resolve({ chatId: "chat_1" }) },
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(getLatestQualityGateSignalsForChat).toHaveBeenCalledWith("chat_1");
      expect(json.versions[0].busStatus.phase).toBe("done");
      expect(json.versions[0].busStatus.degradations.map((d: { kind: string }) => d.kind)).toEqual([
        "stale_content_revision",
      ]);
      expect(incContentRevisionMismatch).toHaveBeenCalledWith("versions_list", {
        verdict: "preflight_passed",
      });
    });

    it("läser inte revision alls med flaggan av (exakt dagens beteende)", async () => {
      const response = await GET(
        new Request("https://example.com/api/engine/chats/chat_1/versions"),
        { params: Promise.resolve({ chatId: "chat_1" }) },
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(getLatestQualityGateSignalsForChat).not.toHaveBeenCalled();
      expect(json.versions[0].busStatus.phase).toBe("done");
      expect(json.versions[0].busStatus.degradations).toEqual([]);
      expect(incContentRevisionMismatch).not.toHaveBeenCalled();
    });

    it("degraderar inte när revisionMatch är unknown eller current (fail-open)", async () => {
      process.env.SAJTMASKIN_CONTENT_REVISION_GATE = "true";
      for (const revisionMatch of ["unknown", "current"] as const) {
        getLatestQualityGateSignalsForChat.mockResolvedValue(
          new Map([
            [
              "ver_rewritten",
              {
                result: "preflight_passed",
                revisionMatch,
                verdictRevision: revisionMatch === "current" ? REVISION_N_PLUS_1 : null,
                contentRevision: revisionMatch === "current" ? REVISION_N_PLUS_1 : null,
              },
            ],
          ]),
        );

        const response = await GET(
          new Request("https://example.com/api/engine/chats/chat_1/versions"),
          { params: Promise.resolve({ chatId: "chat_1" }) },
        );
        const json = await response.json();

        expect(json.versions[0].busStatus.phase).toBe("done");
        expect(json.versions[0].busStatus.degradations).toEqual([]);
        expect(incContentRevisionMismatch).not.toHaveBeenCalled();
        incContentRevisionMismatch.mockReset();
      }
    });
  });

  it("returns empty versions when chat is not engine-backed and has no legacy DB mapping", async () => {
    getEngineChatByIdForRequest.mockResolvedValue(null);
    getChatByV0ChatIdForRequest.mockResolvedValue(null);

    const response = await GET(
      new Request("https://example.com/api/engine/chats/chat_external/versions"),
      { params: Promise.resolve({ chatId: "chat_external" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.versions).toEqual([]);
    // P0 stream-abort recovery (2026-04-26). Even when the chat is not
    // engine-backed and has no legacy mapping, the route always emits a
    // chatStatus envelope so useVersions can decide whether to keep
    // polling. With no run log on disk we default to in_progress.
    expect(json.chatStatus).toEqual({
      status: "in_progress",
      statusReason: null,
      hasVersion: false,
      updatedAt: null,
    });
  });

  it("persists preview URLs for own-engine versions", async () => {
    getEngineChatByIdForRequest.mockResolvedValue({ id: "chat_1" });
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat_1" },
      version: { id: "ver_1" },
    });
    updateVersionPreviewUrl.mockResolvedValue(true);

    const response = await PATCH(
      new Request("https://example.com/api/engine/chats/chat_1/versions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versionId: "ver_1",
          previewUrl: "https://sandbox.example/ver_1",
        }),
      }),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(updateVersionPreviewUrl).toHaveBeenCalledWith("ver_1", "https://sandbox.example/ver_1");
    expect(json).toEqual({
      success: true,
      versionId: "ver_1",
      previewUrl: "https://sandbox.example/ver_1",
    });
  });
});
