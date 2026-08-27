import { beforeEach, describe, expect, it, vi } from "vitest";

const getEngineVersionForChatByIdForRequest = vi.hoisted(() => vi.fn());
const readAll = vi.hoisted(() => vi.fn());
const settleStaleVerificationIfNeeded = vi.hoisted(() => vi.fn());
const getEngineVersionErrorLogs = vi.hoisted(() => vi.fn());
const promoteVersionIfUnleased = vi.hoisted(() => vi.fn());
const getLatestVersion = vi.hoisted(() => vi.fn());
const emit = vi.hoisted(() => vi.fn());
const getLatestQualityGateSignalForVersion = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

vi.mock("@/lib/tenant", () => ({
  getEngineVersionForChatByIdForRequest,
}));

vi.mock("@/lib/logging/event-bus", () => ({
  readAll,
  emit,
}));

// Both of these transitively import `@/lib/db/client`, which throws at module
// load without a DB connection string (CI test env). Mock them so importing the
// route never touches the DB, mirroring the existing tenant/event-bus mocks.
vi.mock("@/lib/db/services/version-errors", () => ({
  getEngineVersionErrorLogs,
}));

// Innehållsrevision steg 3: the route reads the verdict revision when the bus is
// terminal AND the gate flag is on. Mocked for the same reason as the rest —
// the real service imports `@/lib/db/client`.
vi.mock("@/lib/db/services/generation-telemetry", () => ({
  getLatestQualityGateSignalForVersion,
}));

vi.mock("@/lib/gen/verify/settle-stale-verification", () => ({
  settleStaleVerificationIfNeeded,
  // Plain string constant; stubbed so importing the route does not pull the
  // real settle module (which imports `@/lib/db/chat-repository-pg`).
  RECONCILED_PROMOTE_SUMMARY: "Rekoncilierad (test)",
}));

// The route now imports `promoteVersionIfUnleased` + `getLatestVersion`
// directly; mocking chat-repository-pg keeps the real module (and its
// `@/lib/db/client` import that throws without a connection string) out of the
// test graph.
vi.mock("@/lib/db/chat-repository-pg", () => ({
  promoteVersionIfUnleased,
  getLatestVersion,
}));

import { GET } from "./route";

describe("GET version-status (engine)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: stale watchdog no-ops (returns the same version untouched).
    settleStaleVerificationIfNeeded.mockImplementation((version: unknown) => ({
      version,
      failed: false,
    }));
    getEngineVersionErrorLogs.mockResolvedValue([]);
    promoteVersionIfUnleased.mockResolvedValue({ id: "v1", verification_state: "passed" });
    // Default: the reconcile target IS the chat head (head guard passes).
    getLatestVersion.mockResolvedValue({ id: "v1" });
    // Default: no verdict revision to compare (gate flag is off in tests).
    getLatestQualityGateSignalForVersion.mockResolvedValue({
      result: null,
      revisionMatch: "unknown",
      verdictRevision: null,
      contentRevision: null,
    });
    delete process.env.SAJTMASKIN_CONTENT_REVISION_GATE;
  });

  it("returns 400 when versionId is missing", async () => {
    const res = await GET(
      new Request("http://localhost/api/engine/chats/chat_1/version-status"),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/versionId/);
  });

  // A1: a pool connect-timeout during a redeploy must not look like a permanent
  // 500 — the client would keep polling at full cadence and deepen the outage.
  it("degrades to a retryable 503 + Retry-After on a transient DB failure", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    getEngineVersionForChatByIdForRequest.mockRejectedValue(
      new Error("timeout exceeded when trying to connect"),
    );

    const res = await GET(
      new Request("http://localhost/api/engine/chats/chat_1/version-status?versionId=v1"),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("3");
    const body = (await res.json()) as { ok: boolean; code?: string; retryable?: boolean };
    expect(body.ok).toBe(false);
    expect(body.code).toBe("db_unavailable");
    expect(body.retryable).toBe(true);
    warn.mockRestore();
  });

  it("still returns 500 for a non-transient failure", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    getEngineVersionForChatByIdForRequest.mockRejectedValue(new TypeError("bad projection"));

    const res = await GET(
      new Request("http://localhost/api/engine/chats/chat_1/version-status?versionId=v1"),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(res.status).toBe(500);
    expect(res.headers.get("Retry-After")).toBeNull();
    error.mockRestore();
  });

  it("returns 404 when the version is not scoped to the chat", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue(null);
    const res = await GET(
      new Request("http://localhost/api/engine/chats/chat_1/version-status?versionId=v1"),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );
    expect(res.status).toBe(404);
  });

  it("projects empty event stream to idle status", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({ version: { id: "v1" } });
    readAll.mockReturnValue([]);

    const res = await GET(
      new Request("http://localhost/api/engine/chats/chat_1/version-status?versionId=v1"),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      versionId?: string;
      status?: { phase: string; degradations: unknown[]; eventCount: number };
    };
    expect(body.ok).toBe(true);
    expect(body.versionId).toBe("v1");
    expect(body.status?.phase).toBe("idle");
    expect(body.status?.eventCount).toBe(0);
    expect(body.status?.degradations).toEqual([]);
  });

  it("surfaces degradations from the projection", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({ version: { id: "v1" } });
    readAll.mockReturnValue([
      {
        t: "version.degraded",
        id: "e1",
        ts: "2026-05-01T10:00:00.000Z",
        runId: "root",
        versionId: "v1",
        chatId: "chat_1",
        kind: "verifier_skipped_by_policy",
        message: "skipped",
        meta: { reason: "design_preview_skip_verify" },
      },
    ]);

    const res = await GET(
      new Request("http://localhost/api/engine/chats/chat_1/version-status?versionId=v1"),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );
    const body = (await res.json()) as {
      ok: boolean;
      status?: { degradations: Array<{ kind: string }> };
    };
    expect(body.ok).toBe(true);
    expect(body.status?.degradations.map((d) => d.kind)).toEqual(["verifier_skipped_by_policy"]);
  });

  it("hides a stale postcheck event after the same version becomes N+1", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      version: { id: "v1", files_revision: "rev_n_plus_1" },
    });
    readAll.mockReturnValue([
      {
        t: "version.degraded",
        id: "e_stale",
        ts: "2026-08-27T10:00:00.000Z",
        runId: "root",
        versionId: "v1",
        chatId: "chat_1",
        kind: "product_postcheck_blocked",
        message: "revision N was blocked",
        meta: { attestedFilesRevision: "rev_n" },
      },
    ]);

    const res = await GET(
      new Request("http://localhost/api/engine/chats/chat_1/version-status?versionId=v1"),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );
    const body = (await res.json()) as {
      status?: { degradations: Array<{ kind: string }>; eventCount: number };
    };

    expect(res.status).toBe(200);
    expect(body.status?.degradations).toEqual([]);
    expect(body.status?.eventCount).toBe(0);
  });

  it("projects the latest persisted postcheck skip onto a terminal status", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      version: {
        id: "v1",
        verification_state: "passed",
        release_state: "promoted",
      },
    });
    readAll.mockReturnValue([]);
    getEngineVersionErrorLogs.mockResolvedValue([
      {
        category: "product_postcheck.skipped",
        message: "F2 Product Postcheck skipped.",
        meta: { skippedReason: "transport_error" },
        created_at: "2026-08-26T10:00:00Z",
      },
    ]);

    const res = await GET(
      new Request("http://localhost/api/engine/chats/chat_1/version-status?versionId=v1"),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );
    const body = (await res.json()) as {
      status: { phase: string; degradations: Array<{ kind: string }> };
    };

    expect(body.status.phase).toBe("done");
    expect(body.status.degradations.map((item) => item.kind)).toContain(
      "product_postcheck_skipped",
    );
  });

  it("degrades an empty-bus terminal status when postcheck logs cannot be read", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      version: {
        id: "v1",
        verification_state: "passed",
        release_state: "promoted",
      },
    });
    readAll.mockReturnValue([]);
    getEngineVersionErrorLogs.mockRejectedValue(new Error("db read failed"));

    const res = await GET(
      new Request("http://localhost/api/engine/chats/chat_1/version-status?versionId=v1"),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );
    const body = (await res.json()) as {
      status: {
        phase: string;
        verificationBlocked: boolean;
        degradations: Array<{ kind: string; meta?: unknown }>;
      };
    };

    expect(body.status.phase).toBe("done");
    expect(body.status.degradations).toEqual([
      expect.objectContaining({
        kind: "product_postcheck_skipped",
        meta: expect.objectContaining({ skippedReason: "log_read_error" }),
      }),
    ]);
    expect(body.status.verificationBlocked).toBe(false);
  });

  // A spinning bus event stream (repair started, no terminal event) reused by
  // the reconcile tests below.
  const spinningBus = [
    {
      t: "version.repair.started",
      id: "e1",
      ts: "2026-07-01T10:00:00.000Z",
      runId: "root",
      versionId: "v1",
      chatId: "chat_1",
      reason: "verify",
      trigger: "server-verify",
    },
  ];

  it("read-only reconcile maps an already-failed DB row onto a still-spinning bus", async () => {
    // DB is already terminal (failed); the watchdog is a no-op pass-through here.
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      version: { id: "v1", verification_state: "failed", lifecycle_stage: "integrations" },
    });
    readAll.mockReturnValue(spinningBus);

    const res = await GET(
      new Request("http://localhost/api/engine/chats/chat_1/version-status?versionId=v1"),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );
    const body = (await res.json()) as { ok: boolean; status?: { phase: string } };
    expect(body.ok).toBe(true);
    // Without reconciliation this would be "repairing" (a perpetual spinner).
    expect(body.status?.phase).toBe("failed");
  });

  it("runs the stale watchdog for a stuck row and reconciles to failed", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      version: { id: "v1", verification_state: "verifying", lifecycle_stage: "integrations" },
    });
    settleStaleVerificationIfNeeded.mockResolvedValue({
      version: { id: "v1", verification_state: "failed" },
      failed: true,
    });
    readAll.mockReturnValue(spinningBus);

    const res = await GET(
      new Request("http://localhost/api/engine/chats/chat_1/version-status?versionId=v1"),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );
    const body = (await res.json()) as { ok: boolean; status?: { phase: string } };
    expect(body.ok).toBe(true);
    expect(settleStaleVerificationIfNeeded).toHaveBeenCalledOnce();
    expect(body.status?.phase).toBe("failed");
  });

  it("threads head + guarded-promote callbacks into the watchdog for a stuck row (Codex P1 / bugbot #518 wiring)", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      version: { id: "v1", verification_state: "verifying", lifecycle_stage: "integrations" },
    });
    readAll.mockReturnValue(spinningBus);
    let capturedOpts:
      | {
          resolveIsHeadVersion?: () => Promise<boolean> | boolean;
          promoteReconciledVersion?: () => Promise<unknown>;
        }
      | undefined;
    settleStaleVerificationIfNeeded.mockImplementation(
      (version: unknown, opts: typeof capturedOpts) => {
        capturedOpts = opts;
        return { version, failed: false };
      },
    );
    // The reconcile target IS the chat head.
    getLatestVersion.mockResolvedValue({ id: "v1" });

    await GET(
      new Request("http://localhost/api/engine/chats/chat_1/version-status?versionId=v1"),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(settleStaleVerificationIfNeeded).toHaveBeenCalledOnce();
    expect(typeof capturedOpts?.resolveIsHeadVersion).toBe("function");
    expect(typeof capturedOpts?.promoteReconciledVersion).toBe("function");
    // Head gate resolves true — calling it twice reads getLatestVersion ONCE
    // (memoised in the wiring, no double DB read per poll).
    expect(await capturedOpts?.resolveIsHeadVersion?.()).toBe(true);
    expect(await capturedOpts?.resolveIsHeadVersion?.()).toBe(true);
    expect(getLatestVersion).toHaveBeenCalledTimes(1);
    // The promote callback is head-agnostic (the gate sits before it).
    await capturedOpts?.promoteReconciledVersion?.();
    expect(promoteVersionIfUnleased).toHaveBeenCalledWith("v1", expect.any(String));
  });

  it("head gate resolves FALSE when the version is not the chat head (bugbot medium #518)", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      version: { id: "v1", verification_state: "verifying", lifecycle_stage: "integrations" },
    });
    readAll.mockReturnValue(spinningBus);
    let capturedOpts:
      | { resolveIsHeadVersion?: () => Promise<boolean> | boolean }
      | undefined;
    settleStaleVerificationIfNeeded.mockImplementation(
      (version: unknown, opts: typeof capturedOpts) => {
        capturedOpts = opts;
        return { version, failed: false };
      },
    );
    // A newer version is now the chat head.
    getLatestVersion.mockResolvedValue({ id: "v2" });

    await GET(
      new Request("http://localhost/api/engine/chats/chat_1/version-status?versionId=v1"),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    expect(await capturedOpts?.resolveIsHeadVersion?.()).toBe(false);
    expect(promoteVersionIfUnleased).not.toHaveBeenCalled();
  });

  it("emits version.degraded after a reconcile-promote on an ADVISORY verdict (bugbot medium #518)", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      version: { id: "v1", verification_state: "verifying", lifecycle_stage: "integrations" },
    });
    readAll.mockReturnValue(spinningBus);
    // Latest gate verdict is an F2 typecheck-advisory (warning, no repass).
    getEngineVersionErrorLogs.mockResolvedValue([
      { category: "preflight:quality-gate", level: "warning", meta: { firstFailureCheck: "typecheck" } },
    ]);
    promoteVersionIfUnleased.mockResolvedValue({ id: "v1", verification_state: "passed" });
    let capturedOpts:
      | { promoteReconciledVersion?: () => Promise<unknown> }
      | undefined;
    settleStaleVerificationIfNeeded.mockImplementation(
      (version: unknown, opts: typeof capturedOpts) => {
        capturedOpts = opts;
        return { version, failed: false };
      },
    );

    await GET(
      new Request("http://localhost/api/engine/chats/chat_1/version-status?versionId=v1"),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    await capturedOpts?.promoteReconciledVersion?.();
    expect(promoteVersionIfUnleased).toHaveBeenCalledWith("v1", expect.any(String));
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        t: "version.degraded",
        versionId: "v1",
        chatId: "chat_1",
        kind: "typecheck_advisory",
      }),
    );
  });

  it("re-reads the bus after a settle-mutated row so THIS poll already reflects the degraded emit (bugbot medium #518, 6th iteration)", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      version: { id: "v1", verification_state: "verifying", lifecycle_stage: "integrations" },
    });
    // First bus read (top of handler): still spinning. Second read (after the
    // settle promoted the row + emitted version.degraded): carries the event.
    readAll
      .mockReturnValueOnce(spinningBus)
      .mockReturnValueOnce([
        ...spinningBus,
        {
          t: "version.degraded",
          id: "e2",
          ts: "2026-07-13T10:00:00.000Z",
          runId: "root",
          versionId: "v1",
          chatId: "chat_1",
          kind: "typecheck_advisory",
          message: "advisory",
          meta: { advisoryChecks: ["typecheck"] },
        },
      ]);
    getEngineVersionErrorLogs.mockResolvedValue([
      { category: "preflight:quality-gate", level: "warning", meta: { firstFailureCheck: "typecheck" } },
    ]);
    promoteVersionIfUnleased.mockResolvedValue({
      id: "v1",
      verification_state: "passed",
      release_state: "promoted",
    });
    // Simulate the real settle flow: the callback runs INSIDE settle and the
    // promoted row (a NEW object) is returned — which must trigger the re-read.
    settleStaleVerificationIfNeeded.mockImplementation(
      async (
        _version: unknown,
        opts: { promoteReconciledVersion?: () => Promise<unknown> },
      ) => {
        const promoted = await opts.promoteReconciledVersion?.();
        return { version: promoted, failed: false };
      },
    );

    const res = await GET(
      new Request("http://localhost/api/engine/chats/chat_1/version-status?versionId=v1"),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );
    const body = (await res.json()) as {
      ok: boolean;
      status?: { degradations: Array<{ kind: string }> };
    };

    expect(readAll).toHaveBeenCalledTimes(2);
    expect(body.ok).toBe(true);
    // The SAME poll that reconciled the row already carries the degradation —
    // no one-poll solid-green window.
    expect(body.status?.degradations.map((d) => d.kind)).toEqual(["typecheck_advisory"]);
  });

  it("does NOT emit version.degraded after a reconcile-promote on a clean PASS (bugbot medium #518)", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      version: { id: "v1", verification_state: "verifying", lifecycle_stage: "integrations" },
    });
    readAll.mockReturnValue(spinningBus);
    // Latest gate verdict is a clean pass.
    getEngineVersionErrorLogs.mockResolvedValue([
      { category: "preflight:quality-gate", level: "info", meta: { passed: true } },
    ]);
    promoteVersionIfUnleased.mockResolvedValue({ id: "v1", verification_state: "passed" });
    let capturedOpts:
      | { promoteReconciledVersion?: () => Promise<unknown> }
      | undefined;
    settleStaleVerificationIfNeeded.mockImplementation(
      (version: unknown, opts: typeof capturedOpts) => {
        capturedOpts = opts;
        return { version, failed: false };
      },
    );

    await GET(
      new Request("http://localhost/api/engine/chats/chat_1/version-status?versionId=v1"),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    await capturedOpts?.promoteReconciledVersion?.();
    expect(promoteVersionIfUnleased).toHaveBeenCalledWith("v1", expect.any(String));
    expect(emit).not.toHaveBeenCalled();
  });

  it("propagates 'guard_denied' without emitting version.degraded (Codex P1b round 2)", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      version: { id: "v1", verification_state: "verifying", lifecycle_stage: "integrations" },
    });
    readAll.mockReturnValue(spinningBus);
    // Advisory verdict, but the guarded promote explicitly denies.
    getEngineVersionErrorLogs.mockResolvedValue([
      { category: "preflight:quality-gate", level: "warning", meta: { firstFailureCheck: "typecheck" } },
    ]);
    promoteVersionIfUnleased.mockResolvedValue("guard_denied");
    let capturedOpts:
      | { promoteReconciledVersion?: () => Promise<unknown> }
      | undefined;
    settleStaleVerificationIfNeeded.mockImplementation(
      (version: unknown, opts: typeof capturedOpts) => {
        capturedOpts = opts;
        return { version, failed: false };
      },
    );

    await GET(
      new Request("http://localhost/api/engine/chats/chat_1/version-status?versionId=v1"),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );

    const result = await capturedOpts?.promoteReconciledVersion?.();
    expect(result).toBe("guard_denied");
    expect(emit).not.toHaveBeenCalled();
  });

  it("never touches the DB when the bus already settled (F2 design-preview skip → done)", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      version: { id: "v1", verification_state: "pending", lifecycle_stage: "design" },
    });
    // Design-preview flow: verifier "skipped" → the projection terminal-settles
    // to `done`, so the bus is NOT stuck and the poll must not touch the DB.
    readAll.mockReturnValue([
      {
        t: "version.verifier.done",
        id: "e1",
        ts: "2026-07-01T10:00:00.000Z",
        runId: "root",
        versionId: "v1",
        chatId: "chat_1",
        blocked: false,
        outcome: "skipped",
      },
    ]);

    const res = await GET(
      new Request("http://localhost/api/engine/chats/chat_1/version-status?versionId=v1"),
      { params: Promise.resolve({ chatId: "chat_1" }) },
    );
    const body = (await res.json()) as { ok: boolean; status?: { phase: string } };
    expect(body.ok).toBe(true);
    expect(settleStaleVerificationIfNeeded).not.toHaveBeenCalled();
    expect(body.status?.phase).toBe("done");
  });

  /**
   * Innehållsrevision steg 3: en TERMINAL bus-status kan beskriva ett äldre
   * innehåll efter en user-edit. Routen läser verdiktets revision bara i det
   * läget, och bara med flaggan på.
   */
  describe("innehållsrevision (steg 3)", () => {
    const terminalBus = [
      {
        t: "version.verifier.done",
        id: "e1",
        ts: "2026-07-01T10:00:00.000Z",
        runId: "root",
        versionId: "v1",
        chatId: "chat_1",
        blocked: false,
        outcome: "passed",
      },
      {
        t: "version.done",
        id: "e2",
        ts: "2026-07-01T10:00:05.000Z",
        runId: "root",
        versionId: "v1",
        chatId: "chat_1",
        durationMs: 5000,
      },
    ];

    beforeEach(() => {
      getEngineVersionForChatByIdForRequest.mockResolvedValue({
        version: {
          id: "v1",
          verification_state: "pending",
          release_state: "draft",
          files_revision: "rev_n_plus_1",
        },
      });
      readAll.mockReturnValue(terminalBus);
    });

    it("degraderar en terminal status vars verdikt gäller en äldre revision", async () => {
      process.env.SAJTMASKIN_CONTENT_REVISION_GATE = "true";
      getLatestQualityGateSignalForVersion.mockResolvedValue({
        result: "preflight_passed",
        revisionMatch: "stale",
        verdictRevision: "1".repeat(32),
        contentRevision: "2".repeat(32),
      });
      readAll.mockReturnValue([
        ...terminalBus,
        {
          t: "version.degraded",
          id: "e_stale_product",
          ts: "2026-07-01T10:00:06.000Z",
          runId: "root",
          versionId: "v1",
          chatId: "chat_1",
          kind: "product_postcheck_blocked",
          message: "revision N was blocked",
          meta: { attestedFilesRevision: "rev_n" },
        },
      ]);

      const res = await GET(
        new Request("http://localhost/api/engine/chats/chat_1/version-status?versionId=v1"),
        { params: Promise.resolve({ chatId: "chat_1" }) },
      );

      const body = (await res.json()) as {
        status?: { phase: string; degradations: Array<{ kind: string }> };
      };
      expect(body.status?.phase).toBe("done");
      expect(body.status?.degradations.map((d) => d.kind)).toEqual(["stale_content_revision"]);
    });

    it("degraderar även när bussen är tom och DB:n är terminal — serverless cold start (Bugbot)", async () => {
      process.env.SAJTMASKIN_CONTENT_REVISION_GATE = "true";
      // Per-instans in-memory buss: en annan instans har inga events, och
      // terminalen kommer från reconcile-uppgraderingen av DB:ns
      // verification_state — bus-only-gaten missade exakt den här pollen.
      getEngineVersionForChatByIdForRequest.mockResolvedValue({
        version: { id: "v1", verification_state: "passed", release_state: "promoted" },
      });
      readAll.mockReturnValue([]);
      getLatestQualityGateSignalForVersion.mockResolvedValue({
        result: "preflight_passed",
        revisionMatch: "stale",
        verdictRevision: "1".repeat(32),
        contentRevision: "2".repeat(32),
      });

      const res = await GET(
        new Request("http://localhost/api/engine/chats/chat_1/version-status?versionId=v1"),
        { params: Promise.resolve({ chatId: "chat_1" }) },
      );

      const body = (await res.json()) as {
        status?: { phase: string; degradations: Array<{ kind: string }> };
      };
      expect(body.status?.phase).toBe("done");
      expect(body.status?.degradations.map((d) => d.kind)).toEqual(["stale_content_revision"]);
    });

    it("läser inte verdiktets revision alls med flaggan av", async () => {
      const res = await GET(
        new Request("http://localhost/api/engine/chats/chat_1/version-status?versionId=v1"),
        { params: Promise.resolve({ chatId: "chat_1" }) },
      );

      const body = (await res.json()) as {
        status?: { phase: string; degradations: unknown[] };
      };
      expect(getLatestQualityGateSignalForVersion).not.toHaveBeenCalled();
      expect(body.status?.phase).toBe("done");
      expect(body.status?.degradations).toEqual([]);
    });

    it("degraderar inget när revisionen matchar (render-first-fönstret orört)", async () => {
      process.env.SAJTMASKIN_CONTENT_REVISION_GATE = "true";
      getLatestQualityGateSignalForVersion.mockResolvedValue({
        result: "preflight_passed",
        revisionMatch: "current",
        verdictRevision: "2".repeat(32),
        contentRevision: "2".repeat(32),
      });

      const res = await GET(
        new Request("http://localhost/api/engine/chats/chat_1/version-status?versionId=v1"),
        { params: Promise.resolve({ chatId: "chat_1" }) },
      );

      const body = (await res.json()) as { status?: { degradations: unknown[] } };
      expect(body.status?.degradations).toEqual([]);
    });

    it("ett läsfel får aldrig fälla statussvaret (best-effort)", async () => {
      process.env.SAJTMASKIN_CONTENT_REVISION_GATE = "true";
      getLatestQualityGateSignalForVersion.mockRejectedValue(new Error("db down"));

      const res = await GET(
        new Request("http://localhost/api/engine/chats/chat_1/version-status?versionId=v1"),
        { params: Promise.resolve({ chatId: "chat_1" }) },
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; status?: { degradations: unknown[] } };
      expect(body.ok).toBe(true);
      expect(body.status?.degradations).toEqual([]);
    });
  });
});
