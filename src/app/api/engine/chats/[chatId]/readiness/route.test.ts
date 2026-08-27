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
const deriveTier3BuildSpecForVersion = vi.hoisted(() => vi.fn());
const emit = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ db: {}, dbConfigured: false }));

vi.mock("@/lib/logging/event-bus", () => ({ emit }));

vi.mock("@/lib/rate-limit", () => ({
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

vi.mock("@/lib/projects/project-env-resolver", () => ({
  resolveProjectEnv,
  resolveEnvRequirementsFromVersionFiles,
}));

vi.mock("@/lib/projects/project-env-vars", () => ({ readAllowPlaceholdersInF3 }));

vi.mock("@/lib/gen/dossiers/snapshot-selection", () => ({
  resolveSelectedDossiersFromSnapshot,
}));

vi.mock("@/lib/gen/verify/settle-stale-verification", () => ({
  settleStaleVerificationIfNeeded,
  RECONCILED_PROMOTE_SUMMARY: "Rekoncilierad (test)",
}));

vi.mock("@/lib/integrations/tier3-readiness-gate", () => ({
  deriveTier3BuildSpecForVersion,
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
    designDeployBlockingKeys: [],
  };
}

type ReadinessBody = {
  success?: boolean;
  readiness?: {
    canDeploy: boolean;
    status: string;
    blockers: Array<{ id: string }>;
    warnings: Array<{ id: string; title?: string; severity?: string }>;
    info: {
      lifecycleStage?: string | null;
      hasRealBuildIntegrations?: boolean;
      productPostcheckBlocksF3?: boolean;
      productPostcheckBlockedReason?: string | null;
    };
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
    deriveTier3BuildSpecForVersion.mockResolvedValue({ requirements: [] });
  });

  // A1: the readiness poll is one of the four reads that 500:ed 29 times during
  // the 2026-07-13 pool exhaustion. A transient failure must be retryable.
  it("degrades to a retryable 503 + Retry-After on a transient DB failure", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    getEngineChatByIdForRequest.mockRejectedValue(
      new Error("timeout exceeded when trying to connect"),
    );

    const { req, ctx } = readinessRequest();
    const res = await GET(req, ctx);

    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("3");
    const body = (await res.json()) as { code?: string; retryable?: boolean };
    expect(body.code).toBe("db_unavailable");
    expect(body.retryable).toBe(true);
    warn.mockRestore();
  });

  it("still returns 500 for a non-transient failure", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    getEngineChatByIdForRequest.mockRejectedValue(new TypeError("bad readiness input"));

    const { req, ctx } = readinessRequest();
    const res = await GET(req, ctx);

    expect(res.status).toBe(500);
    expect(res.headers.get("Retry-After")).toBeNull();
    error.mockRestore();
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

  // Ö4a: `hasRealBuildIntegrations` styr vad "Bygg integrationer" LOVAR om
  // kostnad. En spec som inte går att härleda är samma `null` som får den
  // delade gaten att svara `version_files_unavailable` → 409 från
  // `/finalize-design`. Rapporteras den som `false` lovar knappen den gratis
  // deterministiska vägen för ett klick som felar.
  it("säger 'vet ej' i stället för 'gratis' när build-specen inte går att härleda", async () => {
    getPreferredVersion.mockResolvedValue({
      id: "ver_1",
      chat_id: "chat_1",
      lifecycle_stage: "design",
      verification_state: "passed",
      release_state: null,
      verification_summary: null,
    });
    deriveTier3BuildSpecForVersion.mockResolvedValue(null);

    const { req, ctx } = readinessRequest();
    const json = (await (await GET(req, ctx)).json()) as ReadinessBody;

    expect(json.readiness?.info.hasRealBuildIntegrations).toBeUndefined();
  });

  it("rapporterar true när en härledd spec kräver riktiga byggnycklar", async () => {
    getPreferredVersion.mockResolvedValue({
      id: "ver_1",
      chat_id: "chat_1",
      lifecycle_stage: "design",
      verification_state: "passed",
      release_state: null,
      verification_summary: null,
    });
    deriveTier3BuildSpecForVersion.mockResolvedValue({
      requirements: [{ key: "stripe", requiredRealEnvKeys: ["STRIPE_SECRET_KEY"] }],
    });

    const { req, ctx } = readinessRequest();
    const json = (await (await GET(req, ctx)).json()) as ReadinessBody;

    expect(json.readiness?.info.hasRealBuildIntegrations).toBe(true);
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

  // M#li2-paritet: deploy-routens F2-gren 409:ar (`DEPLOY_MISSING_ENV`) på den
  // delade mängden `designDeployBlockingKeys` — readiness måste blocka samma
  // version, annars ljuger `canDeploy:true` tills användaren klickar Publicera.
  it("F2: blocks canDeploy on the shared designDeployBlockingKeys set (M#li2)", async () => {
    getPreferredVersion.mockResolvedValue({
      id: "ver_1",
      chat_id: "chat_1",
      lifecycle_stage: "design",
      verification_state: "pending",
      release_state: null,
      verification_summary: null,
    });
    resolveEnvRequirementsFromVersionFiles.mockReturnValue({
      ...emptyEnvRequirements(),
      requiredEnvKeys: ["MY_SECRET_TOKEN"],
      missingEnvKeys: ["MY_SECRET_TOKEN"],
      buildBlockingKeys: ["MY_SECRET_TOKEN"],
      designDeployBlockingKeys: ["MY_SECRET_TOKEN"],
    });

    const { req, ctx } = readinessRequest();
    const json = (await (await GET(req, ctx)).json()) as ReadinessBody;

    expect(json.readiness?.canDeploy).toBe(false);
    expect(json.readiness?.blockers.map((b) => b.id)).toContain("missing-env");
  });

  // Bugbot on the M#li2 fix: an unsaved chat cannot store keys — the deploy
  // route 403:ar on the missing project link before the env backstop, so the
  // F2 blocker must name the project save, not missing env (same guard as
  // the integrations branch).
  it("F2: names project-context-missing (not missing-env) for an unsaved chat", async () => {
    getEngineChatByIdForRequest.mockResolvedValue({ id: "chat_1", project_id: null });
    getPreferredVersion.mockResolvedValue({
      id: "ver_1",
      chat_id: "chat_1",
      lifecycle_stage: "design",
      verification_state: "pending",
      release_state: null,
      verification_summary: null,
    });
    resolveEnvRequirementsFromVersionFiles.mockReturnValue({
      ...emptyEnvRequirements(),
      requiredEnvKeys: ["MY_SECRET_TOKEN"],
      missingEnvKeys: ["MY_SECRET_TOKEN"],
      buildBlockingKeys: ["MY_SECRET_TOKEN"],
      designDeployBlockingKeys: ["MY_SECRET_TOKEN"],
    });

    const { req, ctx } = readinessRequest();
    const json = (await (await GET(req, ctx)).json()) as ReadinessBody;

    expect(json.readiness?.canDeploy).toBe(false);
    const blockerIds = json.readiness?.blockers.map((b) => b.id) ?? [];
    expect(blockerIds).toContain("project-context-missing");
    expect(blockerIds).not.toContain("missing-env");
  });

  it("F2: does NOT block on truly-absent feature-runtime keys (Resend, prod 2026-08-01)", async () => {
    getPreferredVersion.mockResolvedValue({
      id: "ver_1",
      chat_id: "chat_1",
      lifecycle_stage: "design",
      verification_state: "pending",
      release_state: null,
      verification_summary: null,
    });
    // Exactly the observed prod shape: feature-runtime keys land in
    // `missingEnvKeys` but the resolver excludes them from the shared set.
    resolveEnvRequirementsFromVersionFiles.mockReturnValue({
      ...emptyEnvRequirements(),
      requiredEnvKeys: ["RESEND_API_KEY", "EMAIL_FROM", "CONTACT_EMAIL_TO"],
      missingEnvKeys: ["EMAIL_FROM", "CONTACT_EMAIL_TO"],
      featureRuntimeKeys: ["EMAIL_FROM", "CONTACT_EMAIL_TO"],
      designDeployBlockingKeys: [],
    });

    const { req, ctx } = readinessRequest();
    const json = (await (await GET(req, ctx)).json()) as ReadinessBody;

    expect(json.readiness?.canDeploy).toBe(true);
    expect(json.readiness?.blockers.map((b) => b.id)).not.toContain("missing-env");
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

  it("propagates 'guard_denied' without emitting version.degraded (Codex P1b round 2)", async () => {
    getPreferredVersion.mockResolvedValue({
      id: "ver_1",
      chat_id: "chat_1",
      lifecycle_stage: "integrations",
      verification_state: "verifying",
      release_state: null,
      verification_summary: null,
    });
    // Advisory verdict, but the guarded promote explicitly denies.
    getEngineVersionErrorLogs.mockResolvedValue([
      { category: "preflight:quality-gate", level: "warning", meta: { firstFailureCheck: "typecheck" } },
    ]);
    promoteVersionIfUnleased.mockResolvedValue("guard_denied");
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

    const result = await capturedOpts?.promoteReconciledVersion?.();
    expect(result).toBe("guard_denied");
    expect(emit).not.toHaveBeenCalled();
  });
});

describe("GET readiness — Product Postcheck (B1 / SM-049)", () => {
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
    createEngineVersionErrorLogs.mockResolvedValue(undefined);
    deriveTier3BuildSpecForVersion.mockResolvedValue({ requirements: [] });
    getPreferredVersion.mockResolvedValue({
      id: "ver_1",
      chat_id: "chat_1",
      lifecycle_stage: "design",
      verification_state: "passed",
      release_state: "promoted",
      verification_summary: null,
    });
  });

  it("exposes postcheck findings as warnings without flipping canDeploy", async () => {
    getEngineVersionErrorLogs.mockResolvedValue([
      {
        category: "product_postcheck.fake_form",
        level: "warning",
        message: "Formulär ser aktivt ut men saknar action/integration.",
        meta: { code: "fake_form", formId: "kontakt" },
        created_at: "2026-08-14T10:00:02Z",
      },
      {
        category: "product_postcheck.summary",
        level: "warning",
        message: "F2 Product Postcheck found 1 warning(s).",
        meta: { warningCount: 1, productBlocked: false },
        created_at: "2026-08-14T10:00:01Z",
      },
    ]);

    const { req, ctx } = readinessRequest();
    const json = (await (await GET(req, ctx)).json()) as ReadinessBody;

    expect(json.readiness?.canDeploy).toBe(true);
    expect(json.readiness?.status).toBe("warning");
    expect(json.readiness?.blockers).toEqual([]);
    expect(json.readiness?.warnings.map((w) => w.id)).toContain("product-postcheck-fake_form");
    expect(json.readiness?.info.productPostcheckBlocksF3).toBe(false);
  });

  it("shows a latest persisted transport skip as warning without blocking F3 or deploy", async () => {
    getEngineVersionErrorLogs.mockResolvedValue([
      {
        category: "product_postcheck.skipped",
        level: "warning",
        message: "F2 Product Postcheck failed before a result was returned.",
        meta: { skippedReason: "transport_error" },
        created_at: "2026-08-26T10:01:00Z",
      },
      {
        category: "product_postcheck.summary",
        level: "info",
        message: "F2 Product Postcheck passed.",
        meta: { warningCount: 0, productBlocked: false },
        created_at: "2026-08-26T10:00:00Z",
      },
    ]);

    const { req, ctx } = readinessRequest();
    const json = (await (await GET(req, ctx)).json()) as ReadinessBody;

    expect(json.readiness?.status).toBe("warning");
    expect(json.readiness?.canDeploy).toBe(true);
    expect(json.readiness?.blockers).toEqual([]);
    expect(json.readiness?.warnings.map((warning) => warning.id)).toContain(
      "product-postcheck-skipped",
    );
    expect(json.readiness?.info.productPostcheckBlocksF3).toBe(false);
  });

  it("sets status blocked with the preview_boot_page cause and leaves canDeploy true (B1)", async () => {
    getEngineVersionErrorLogs.mockResolvedValue([
      {
        category: "product_postcheck.preview_boot_page",
        level: "warning",
        message: "Preview-host visar fortfarande start-/omstartssidan — sajten är inte ready än.",
        meta: { code: "preview_boot_page" },
        created_at: "2026-08-14T21:41:33Z",
      },
      {
        category: "product_postcheck.summary",
        level: "warning",
        message: "F2 Product Postcheck found 1 warning(s).",
        meta: { warningCount: 1, productBlocked: true },
        created_at: "2026-08-14T21:41:33Z",
      },
    ]);

    const { req, ctx } = readinessRequest();
    const json = (await (await GET(req, ctx)).json()) as ReadinessBody;

    expect(json.readiness?.canDeploy).toBe(true);
    expect(json.readiness?.status).toBe("blocked");
    expect(json.readiness?.blockers).toEqual([
      expect.objectContaining({
        id: "product-postcheck-preview_boot_page",
        detail: "product_postcheck.preview_boot_page",
        severity: "blocker",
      }),
    ]);
    expect(json.readiness?.info.productPostcheckBlocksF3).toBe(true);
    expect(json.readiness?.info.productPostcheckBlockedReason).toContain("start-/omstartssidan");
  });

  it("keeps preview_probe_unreadable advisory so readiness is not red", async () => {
    getEngineVersionErrorLogs.mockResolvedValue([
      {
        category: "product_postcheck.preview_probe_unreadable",
        level: "warning",
        message:
          "Produktkontrollen fick inget läsbart sidinnehåll och kan inte avgöra om sajten är klar.",
        meta: { code: "preview_probe_unreadable" },
        created_at: "2026-08-14T21:41:33Z",
      },
      {
        category: "product_postcheck.summary",
        level: "warning",
        message: "F2 Product Postcheck found 1 warning(s).",
        meta: { warningCount: 1, productBlocked: false },
        created_at: "2026-08-14T21:41:33Z",
      },
    ]);

    const { req, ctx } = readinessRequest();
    const json = (await (await GET(req, ctx)).json()) as ReadinessBody;

    expect(json.readiness?.canDeploy).toBe(true);
    expect(json.readiness?.status).toBe("warning");
    expect(json.readiness?.blockers).toEqual([]);
    expect(json.readiness?.warnings.map((w) => w.id)).toEqual([
      "product-postcheck-preview_probe_unreadable",
    ]);
    expect(json.readiness?.info.productPostcheckBlocksF3).toBe(false);
  });

  it("sets the F3-blocked flag when the newest summary is productBlocked", async () => {
    getEngineVersionErrorLogs.mockResolvedValue([
      {
        category: "product_postcheck.mobile_menu_failed",
        level: "warning",
        message: "Mobilmeny kunde inte verifieras: no toggle found.",
        meta: { code: "mobile_menu_failed" },
        created_at: "2026-08-14T10:00:02Z",
      },
      {
        category: "product_postcheck.summary",
        level: "warning",
        message: "F2 Product Postcheck found 1 warning(s).",
        meta: { warningCount: 1, productBlocked: true },
        created_at: "2026-08-14T10:00:01Z",
      },
    ]);

    const { req, ctx } = readinessRequest();
    const json = (await (await GET(req, ctx)).json()) as ReadinessBody;

    expect(json.readiness?.canDeploy).toBe(true);
    expect(json.readiness?.status).toBe("blocked");
    expect(json.readiness?.blockers.map((b) => b.id)).toEqual([
      "product-postcheck-mobile_menu_failed",
    ]);
    expect(json.readiness?.info.productPostcheckBlocksF3).toBe(true);
    expect(json.readiness?.info.productPostcheckBlockedReason).toContain("Mobilmeny");
    expect(json.readiness?.warnings.map((w) => w.id)).not.toContain("product-postcheck-blocks-f3");
  });

  it("leaves readiness unchanged when the log has no postcheck findings", async () => {
    getEngineVersionErrorLogs.mockResolvedValue([]);

    const { req, ctx } = readinessRequest();
    const json = (await (await GET(req, ctx)).json()) as ReadinessBody;

    expect(json.readiness?.status).toBe("ready");
    expect(json.readiness?.canDeploy).toBe(true);
    expect(json.readiness?.warnings).toEqual([]);
    expect(json.readiness?.info.productPostcheckBlocksF3).toBe(false);
  });
});

describe("GET readiness — late preview:client-error warnings (SM-050)", () => {
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
    createEngineVersionErrorLogs.mockResolvedValue(undefined);
    deriveTier3BuildSpecForVersion.mockResolvedValue({ requirements: [] });
    getPreferredVersion.mockResolvedValue({
      id: "ver_1",
      chat_id: "chat_1",
      lifecycle_stage: "design",
      verification_state: "passed",
      release_state: "promoted",
      promoted_at: "2026-08-13T22:08:09.498Z",
      verification_summary: null,
    });
  });

  it("exposes a post-promotion client-error as a warning without flipping canDeploy", async () => {
    getEngineVersionErrorLogs.mockResolvedValue([
      {
        category: "preview:client-error",
        level: "warning",
        message: "[hydration] Text content does not match server-rendered HTML.",
        meta: { kind: "hydration", href: "/" },
        created_at: "2026-08-13T22:10:08.707Z",
      },
    ]);

    const { req, ctx } = readinessRequest();
    const json = (await (await GET(req, ctx)).json()) as ReadinessBody;

    expect(json.readiness?.canDeploy).toBe(true);
    expect(json.readiness?.status).toBe("warning");
    expect(json.readiness?.blockers).toEqual([]);
    expect(json.readiness?.warnings.map((w) => w.id)).toContain("late-client-error");
  });

  it("leaves readiness unchanged for a pre-promotion client-error", async () => {
    getEngineVersionErrorLogs.mockResolvedValue([
      {
        category: "preview:client-error",
        level: "warning",
        message: "[hydration] Text content does not match server-rendered HTML.",
        meta: { kind: "hydration", href: "/" },
        created_at: "2026-08-13T22:07:00.000Z",
      },
    ]);

    const { req, ctx } = readinessRequest();
    const json = (await (await GET(req, ctx)).json()) as ReadinessBody;

    expect(json.readiness?.status).toBe("ready");
    expect(json.readiness?.canDeploy).toBe(true);
    expect(json.readiness?.warnings.map((w) => w.id)).not.toContain("late-client-error");
  });
});
