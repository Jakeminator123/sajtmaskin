import { beforeEach, describe, expect, it, vi } from "vitest";

const getEngineVersionForChatByIdForRequest = vi.hoisted(() => vi.fn());
const readAll = vi.hoisted(() => vi.fn());
const settleStaleVerificationIfNeeded = vi.hoisted(() => vi.fn());
const getEngineVersionErrorLogs = vi.hoisted(() => vi.fn());
const promoteVersionIfUnleased = vi.hoisted(() => vi.fn());
const getLatestVersion = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rateLimit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

vi.mock("@/lib/tenant", () => ({
  getEngineVersionForChatByIdForRequest,
}));

vi.mock("@/lib/logging/event-bus", () => ({
  readAll,
}));

// Both of these transitively import `@/lib/db/client`, which throws at module
// load without a DB connection string (CI test env). Mock them so importing the
// route never touches the DB, mirroring the existing tenant/event-bus mocks.
vi.mock("@/lib/db/services/version-errors", () => ({
  getEngineVersionErrorLogs,
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
});
