import { beforeEach, describe, expect, it, vi } from "vitest";

// A#25: route-level test för ReleaseGate-pariteten (A#12/Ö1). Helper-testerna
// (`readiness-payload.test.ts`, `engine-version-lifecycle.test.ts`) täcker bara
// `buildReleaseGateBlocker`/`resolveDeployReleaseGate` isolerat — tas WIRINGEN i
// route:n bort (`blockers.push(releaseGateItem)`) förblir de gröna medan
// `canDeploy` tyst börjar ljuga `true` för en overifierad F3. Detta test kör
// hela GET-vägen med riktig gate-logik och mockade datakällor, så den
// regressionen fångas.

const getEngineChatByIdForRequest = vi.hoisted(() => vi.fn());
const getEngineVersionForChatByIdForRequest = vi.hoisted(() => vi.fn());
const getPreferredVersion = vi.hoisted(() => vi.fn());
const getLatestVersion = vi.hoisted(() => vi.fn());
const maybeAutoAcceptTimedOutRepair = vi.hoisted(() => vi.fn());
const promoteVersionIfUnleased = vi.hoisted(() => vi.fn());
const getEngineVersionErrorLogs = vi.hoisted(() => vi.fn());
const createEngineVersionErrorLogs = vi.hoisted(() => vi.fn());
const getVersionFiles = vi.hoisted(() => vi.fn());
const resolveProjectEnv = vi.hoisted(() => vi.fn());
const resolveEnvRequirementsFromVersionFiles = vi.hoisted(() => vi.fn());
const readAllowPlaceholdersInF3 = vi.hoisted(() => vi.fn());
const resolveSelectedDossiersFromSnapshot = vi.hoisted(() => vi.fn());
const settleStaleVerificationIfNeeded = vi.hoisted(() => vi.fn());
const emit = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ db: {}, dbConfigured: false }));

vi.mock("@/lib/logging/event-bus", () => ({ emit }));

vi.mock("@/lib/rateLimit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

vi.mock("@/lib/tenant", () => ({
  getEngineChatByIdForRequest,
  getEngineVersionForChatByIdForRequest,
}));

vi.mock("@/lib/db/chat-repository-pg", () => ({
  getPreferredVersion,
  getLatestVersion,
  maybeAutoAcceptTimedOutRepair,
  promoteVersionIfUnleased,
}));

vi.mock("@/lib/db/services/version-errors", () => ({
  getEngineVersionErrorLogs,
  createEngineVersionErrorLogs,
}));

vi.mock("@/lib/gen/version-manager", () => ({ getVersionFiles }));

vi.mock("@/lib/project-env-resolver", () => ({
  resolveProjectEnv,
  resolveEnvRequirementsFromVersionFiles,
}));

vi.mock("@/lib/project-env-vars", () => ({ readAllowPlaceholdersInF3 }));

vi.mock("@/lib/gen/dossiers/snapshot-selection", () => ({
  resolveSelectedDossiersFromSnapshot,
}));

vi.mock("@/lib/gen/verify/settle-stale-verification", () => ({
  settleStaleVerificationIfNeeded,
  RECONCILED_PROMOTE_SUMMARY: "Rekoncilierad (test)",
}));

const { GET } = await import("./route");

function readinessRequest(chatId = "chat_1") {
  const req = new Request(`http://localhost/api/engine/chats/${chatId}/readiness`);
  return { req, ctx: { params: Promise.resolve({ chatId }) } };
}

function emptyEnvRequirements() {
  return {
    detectedIntegrations: [],
    requiredEnvKeys: [],
    configuredEnvKeys: [],
    missingEnvKeys: [],
    placeholderCoveredKeys: [],
    buildBlockingKeys: [],
    featureRuntimeKeys: [],
    warnOnlyKeys: [],
  };
}

type ReadinessBody = {
  success?: boolean;
  readiness?: {
    canDeploy: boolean;
    status: string;
    blockers: Array<{ id: string }>;
    warnings: Array<{ id: string }>;
    info: { lifecycleStage?: string | null };
  };
};

describe("GET readiness — ReleaseGate paritet (A#25 / A#12)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEngineChatByIdForRequest.mockResolvedValue({ id: "chat_1", project_id: "proj_1" });
    maybeAutoAcceptTimedOutRepair.mockImplementation(async (v: unknown) => ({
      version: v,
      wasAutoAccepted: false,
    }));
    settleStaleVerificationIfNeeded.mockImplementation(async (v: unknown) => ({ version: v }));
    promoteVersionIfUnleased.mockResolvedValue({ id: "ver_1", verification_state: "passed" });
    getVersionFiles.mockResolvedValue([]);
    resolveProjectEnv.mockResolvedValue({
      source: "none",
      projectId: null,
      configuredKeys: new Set(),
      configuredMap: {},
    });
    resolveEnvRequirementsFromVersionFiles.mockReturnValue(emptyEnvRequirements());
    readAllowPlaceholdersInF3.mockResolvedValue(false);
    resolveSelectedDossiersFromSnapshot.mockReturnValue([]);
    getEngineVersionErrorLogs.mockResolvedValue([]);
    createEngineVersionErrorLogs.mockResolvedValue(undefined);
  });

  it("blocks canDeploy for an F3 version that has not passed ReleaseGate (verifying)", async () => {
    getPreferredVersion.mockResolvedValue({
      id: "ver_1",
      chat_id: "chat_1",
      lifecycle_stage: "integrations",
      verification_state: "verifying",
      release_state: null,
      verification_summary: null,
    });

    const { req, ctx } = readinessRequest();
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const json = (await res.json()) as ReadinessBody;

    // Kontraktets kärna: en ogrön F3 kan ALDRIG visa grön Publicera-knapp.
    expect(json.readiness?.canDeploy).toBe(false);
    expect(json.readiness?.blockers.map((b) => b.id)).toContain("release-gate-not-green");
  });

  it("allows canDeploy for a green F3 version (passed + promoted)", async () => {
    getPreferredVersion.mockResolvedValue({
      id: "ver_1",
      chat_id: "chat_1",
      lifecycle_stage: "integrations",
      verification_state: "passed",
      release_state: "promoted",
      verification_summary: null,
    });

    const { req, ctx } = readinessRequest();
    const res = await GET(req, ctx);
    const json = (await res.json()) as ReadinessBody;

    expect(json.readiness?.canDeploy).toBe(true);
    expect(json.readiness?.blockers.map((b) => b.id)).not.toContain("release-gate-not-green");
  });

  it("does not release-gate-block an F2 (design) version (soft gate)", async () => {
    getPreferredVersion.mockResolvedValue({
      id: "ver_1",
      chat_id: "chat_1",
      lifecycle_stage: "design",
      verification_state: "pending",
      release_state: null,
      verification_summary: null,
    });

    const { req, ctx } = readinessRequest();
    const res = await GET(req, ctx);
    const json = (await res.json()) as ReadinessBody;

    expect(json.readiness?.blockers.map((b) => b.id)).not.toContain("release-gate-not-green");
    expect(json.readiness?.canDeploy).toBe(true);
  });

  it("returns 404 when the chat is not owned by the caller", async () => {
    getEngineChatByIdForRequest.mockResolvedValue(null);

    const { req, ctx } = readinessRequest();
    const res = await GET(req, ctx);
    expect(res.status).toBe(404);
  });

  it("threads head + guarded-promote callbacks into the stale watchdog (Codex P1 / bugbot #518 wiring)", async () => {
    getPreferredVersion.mockResolvedValue({
      id: "ver_1",
      chat_id: "chat_1",
      lifecycle_stage: "integrations",
      verification_state: "verifying",
      release_state: null,
      verification_summary: null,
    });
    let capturedOpts:
      | {
          resolveIsHeadVersion?: () => Promise<boolean> | boolean;
          promoteReconciledVersion?: () => Promise<unknown>;
        }
      | undefined;
    settleStaleVerificationIfNeeded.mockImplementation(
      async (v: unknown, opts: typeof capturedOpts) => {
        capturedOpts = opts;
        return { version: v };
      },
    );
    // The reconcile target IS the chat head.
    getLatestVersion.mockResolvedValue({ id: "ver_1" });

    const { req, ctx } = readinessRequest();
    await GET(req, ctx);

    expect(settleStaleVerificationIfNeeded).toHaveBeenCalledOnce();
    expect(typeof capturedOpts?.resolveIsHeadVersion).toBe("function");
    expect(typeof capturedOpts?.promoteReconciledVersion).toBe("function");
    // Head gate resolves true for the head version — and calling it twice reads
    // getLatestVersion only ONCE (memoised in the wiring, no double DB read).
    expect(await capturedOpts?.resolveIsHeadVersion?.()).toBe(true);
    expect(await capturedOpts?.resolveIsHeadVersion?.()).toBe(true);
    expect(getLatestVersion).toHaveBeenCalledTimes(1);
    // The promote callback is now head-agnostic (the gate sits before it).
    await capturedOpts?.promoteReconciledVersion?.();
    expect(promoteVersionIfUnleased).toHaveBeenCalledWith("ver_1", expect.any(String));
  });

  it("head gate resolves FALSE when the version is not the chat head (bugbot medium #518)", async () => {
    getPreferredVersion.mockResolvedValue({
      id: "ver_1",
      chat_id: "chat_1",
      lifecycle_stage: "integrations",
      verification_state: "verifying",
      release_state: null,
      verification_summary: null,
    });
    let capturedOpts:
      | { resolveIsHeadVersion?: () => Promise<boolean> | boolean }
      | undefined;
    settleStaleVerificationIfNeeded.mockImplementation(
      async (v: unknown, opts: typeof capturedOpts) => {
        capturedOpts = opts;
        return { version: v };
      },
    );
    // A newer version is now the chat head.
    getLatestVersion.mockResolvedValue({ id: "ver_2" });

    const { req, ctx } = readinessRequest();
    await GET(req, ctx);

    expect(await capturedOpts?.resolveIsHeadVersion?.()).toBe(false);
  });

  it("emits version.degraded after a reconcile-promote on an ADVISORY verdict (bugbot medium #518)", async () => {
    getPreferredVersion.mockResolvedValue({
      id: "ver_1",
      chat_id: "chat_1",
      lifecycle_stage: "integrations",
      verification_state: "verifying",
      release_state: null,
      verification_summary: null,
    });
    // Latest gate verdict is an F2 typecheck-advisory (warning, no repass).
    getEngineVersionErrorLogs.mockResolvedValue([
      { category: "preflight:quality-gate", level: "warning", meta: { firstFailureCheck: "typecheck" } },
    ]);
    promoteVersionIfUnleased.mockResolvedValue({ id: "ver_1", verification_state: "passed" });
    let capturedOpts:
      | { promoteReconciledVersion?: () => Promise<unknown> }
      | undefined;
    settleStaleVerificationIfNeeded.mockImplementation(
      async (v: unknown, opts: typeof capturedOpts) => {
        capturedOpts = opts;
        return { version: v };
      },
    );

    const { req, ctx } = readinessRequest();
    await GET(req, ctx);

    await capturedOpts?.promoteReconciledVersion?.();
    expect(promoteVersionIfUnleased).toHaveBeenCalledWith("ver_1", expect.any(String));
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        t: "version.degraded",
        versionId: "ver_1",
        chatId: "chat_1",
        kind: "typecheck_advisory",
      }),
    );
  });

  it("does NOT emit version.degraded after a reconcile-promote on a clean PASS (bugbot medium #518)", async () => {
    getPreferredVersion.mockResolvedValue({
      id: "ver_1",
      chat_id: "chat_1",
      lifecycle_stage: "integrations",
      verification_state: "verifying",
      release_state: null,
      verification_summary: null,
    });
    // Latest gate verdict is a clean pass.
    getEngineVersionErrorLogs.mockResolvedValue([
      { category: "preflight:quality-gate", level: "info", meta: { passed: true } },
    ]);
    promoteVersionIfUnleased.mockResolvedValue({ id: "ver_1", verification_state: "passed" });
    let capturedOpts:
      | { promoteReconciledVersion?: () => Promise<unknown> }
      | undefined;
    settleStaleVerificationIfNeeded.mockImplementation(
      async (v: unknown, opts: typeof capturedOpts) => {
        capturedOpts = opts;
        return { version: v };
      },
    );

    const { req, ctx } = readinessRequest();
    await GET(req, ctx);

    await capturedOpts?.promoteReconciledVersion?.();
    expect(promoteVersionIfUnleased).toHaveBeenCalledWith("ver_1", expect.any(String));
    expect(emit).not.toHaveBeenCalled();
  });
});
