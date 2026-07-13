import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getEngineVersionForChatByIdForRequest = vi.hoisted(() => vi.fn());
const getEngineChatByIdForRequest = vi.hoisted(() => vi.fn());
const deploymentRows = vi.hoisted(() =>
  vi.fn(async (): Promise<Array<Record<string, unknown>>> => []),
);
const getVersionFiles = vi.hoisted(() => vi.fn());
const getAppProjectByIdForRequest = vi.hoisted(() => vi.fn());
const getStoredProjectEnvVarMap = vi.hoisted(() => vi.fn());
const readAllowPlaceholdersInF3 = vi.hoisted(() => vi.fn());
const prepareCredits = vi.hoisted(() => vi.fn());
const createDeploymentRecord = vi.hoisted(() => vi.fn());
const updateDeploymentStatus = vi.hoisted(() => vi.fn());
const getLinkedDomainForChat = vi.hoisted(() => vi.fn());
const getLinkedDomainProjectIdForChat = vi.hoisted(() => vi.fn());
const getLatestVercelProjectIdForChat = vi.hoisted(() => vi.fn());
const setLatestDeploymentLiveUrlForChat = vi.hoisted(() => vi.fn());
const createVercelDeployment = vi.hoisted(() => vi.fn());
const ensureVercelProjectDomain = vi.hoisted(() => vi.fn());
const ensureVercelProject = vi.hoisted(() => vi.fn());
const checkVercelProjectDomain = vi.hoisted(() => vi.fn());
const ensureProjectPublishedIdentity = vi.hoisted(() => vi.fn());
const getProjectById = vi.hoisted(() => vi.fn());
const getProjectData = vi.hoisted(() => vi.fn());
const setProjectVercelLink = vi.hoisted(() => vi.fn());
const markProjectBrandedDomainVerified = vi.hoisted(() => vi.fn());
const clearProjectBrandedDomainVerification = vi.hoisted(() => vi.fn());
const clearProjectCustomDomainVerification = vi.hoisted(() => vi.fn());
const touchProjectBrandedDomainCheckedAt = vi.hoisted(() => vi.fn());
const syncEnvVarsToVercelProject = vi.hoisted(() =>
  vi.fn(async () => ({ synced: 0, errors: [] as string[] })),
);

vi.mock("@/lib/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: deploymentRows,
        }),
      }),
    }),
  },
  dbConfigured: false,
}));

vi.mock("@/lib/rateLimit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

vi.mock("@/lib/botProtection", () => ({
  requireNotBot: () => null,
}));

vi.mock("@/lib/credits/server", () => ({
  prepareCredits,
}));

vi.mock("@/lib/deployment", () => ({
  createDeploymentRecord,
  updateDeploymentStatus,
  getLinkedDomainForChat,
  getLinkedDomainProjectIdForChat,
  getLatestVercelProjectIdForChat,
  setLatestDeploymentLiveUrlForChat,
}));

vi.mock("@/lib/vercelDeploy", () => ({
  createVercelDeployment,
  getVercelDeployment: vi.fn(),
  mapVercelReadyStateToStatus: vi.fn(() => ({ status: "ready" })),
  buildGeneratedVercelProjectName: (name: string) => name,
  sanitizeVercelProjectName: (name: string) => name,
  ensureVercelProjectDomain,
  ensureVercelProject,
  checkVercelProjectDomain,
  syncEnvVarsToVercelProject,
  toVercelFilesFromTextFiles: (files: Array<{ name: string; content: string }>) => files,
}));

vi.mock("@/lib/db/services/projects", () => ({
  clearProjectBrandedDomainVerification,
  clearProjectCustomDomainVerification,
  ensureProjectPublishedIdentity,
  getProjectById,
  getProjectData,
  markProjectBrandedDomainVerified,
  setProjectVercelLink,
  touchProjectBrandedDomainCheckedAt,
}));

vi.mock("@/lib/gen/version-manager", () => ({
  getVersionFiles,
}));

// BB#deploy2: routen loggar deploy-fel när dess statusskrivningar vinner
// error-övergången. Mockad så tester aldrig rör bus/RAG-sidoeffekter.
const logDeployError = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/deploy/deploy-error-log", () => ({
  logDeployError,
}));

vi.mock("@/lib/tenant", () => ({
  getAppProjectByIdForRequest,
  getEngineVersionForChatByIdForRequest,
  getChatByIdForRequest: vi.fn(),
  getChatByV0ChatIdForRequest: vi.fn(),
  getEngineChatByIdForRequest,
}));

vi.mock("@/lib/project-env-vars", () => ({
  getStoredProjectEnvVarMap,
  readAllowPlaceholdersInF3,
}));

const { GET, POST } = await import("./route");

describe("POST /api/v0/deployments", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    prepareCredits.mockImplementation(() => {
      throw new Error("prepareCredits should not run for precheckOnly tests");
    });
    getStoredProjectEnvVarMap.mockResolvedValue({});
    readAllowPlaceholdersInF3.mockResolvedValue(false);
    syncEnvVarsToVercelProject.mockResolvedValue({ synced: 0, errors: [] });
    // BB#deploy2: updateDeploymentStatus returnerar transition-info; default =
    // ingen error-övergång (tester som testar transitionen overridar själva).
    updateDeploymentStatus.mockResolvedValue({ transitionedToError: false });
    // Default: ingen custom-domän kopplad (dagens beteende) → projektnamn-låset
    // (A2) släpper alltid igenom om inte ett test explicit kopplar en domän.
    getLinkedDomainForChat.mockResolvedValue(null);
    getLinkedDomainProjectIdForChat.mockResolvedValue(null);
    getLatestVercelProjectIdForChat.mockResolvedValue(null);
    getAppProjectByIdForRequest.mockResolvedValue({ id: "proj_1", name: "Demo" });
    getProjectData.mockResolvedValue(null);
    getProjectById.mockResolvedValue(null);
    setProjectVercelLink.mockResolvedValue(null);
    ensureProjectPublishedIdentity.mockResolvedValue({
      publishedSlug: "demo",
      brandedDomain: null,
      brandedDomainVerifiedAt: null,
      customDomain: null,
      customDomainVerifiedAt: null,
    });
    ensureVercelProject.mockResolvedValue({ id: "vp_1", name: "demo" });
    checkVercelProjectDomain.mockResolvedValue(true);
    markProjectBrandedDomainVerified.mockResolvedValue({ id: "proj_1" });
    touchProjectBrandedDomainCheckedAt.mockResolvedValue(undefined);
    ensureVercelProjectDomain.mockResolvedValue({ name: "demo.sites.example", verified: true });
    // Tenant-scoped resolver: version + owned engine chat resolve together.
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat_1", project_id: "proj_1" },
      version: { id: "ver_1", chat_id: "chat_1" },
    });
    getEngineChatByIdForRequest.mockResolvedValue(null);
    deploymentRows.mockResolvedValue([]);
    getVersionFiles.mockResolvedValue([
      { path: "package.json", content: '{"name":"demo","private":true}' },
    ]);
  });

  it("precheckOnly returns 200 with deployReadiness without calling credits", async () => {
    const req = new Request("http://localhost/api/v0/deployments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId: "chat_1",
        versionId: "ver_1",
        precheckOnly: true,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      precheckOnly?: boolean;
      deployReadiness?: { ready: boolean; missingEnv: string[] };
      fileCount?: number;
    };
    expect(json.precheckOnly).toBe(true);
    expect(json.fileCount).toBe(1);
    expect(json.deployReadiness?.ready).toBe(true);
    expect(json.deployReadiness?.missingEnv).toEqual([]);
  });

  it("precheckOnly surfaces placeholder-covered Stripe env as warning, not blocker", async () => {
    // STRIPE_SECRET_KEY is in `41-tier3-stub-placeholders.env.txt`, so it
    // counts as `placeholderCoveredKeys` rather than `missingEnvKeys`. The
    // deploy gate (matching the F3 readiness gate) treats placeholder-covered
    // keys as warnings — the deploy can still proceed and Vercel gets the
    // user-stored value (or none, surfaced via the warning).
    getVersionFiles.mockResolvedValue([
      {
        path: "lib/pay.ts",
        content: 'import Stripe from "stripe";\nexport const x = new Stripe(process.env.STRIPE_SECRET_KEY!);\n',
      },
    ]);

    const req = new Request("http://localhost/api/v0/deployments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId: "chat_1",
        versionId: "ver_1",
        precheckOnly: true,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      deployReadiness?: {
        ready: boolean;
        missingEnv: string[];
        warnings: string[];
      };
    };
    expect(json.deployReadiness?.ready).toBe(true);
    expect(json.deployReadiness?.missingEnv).not.toContain("STRIPE_SECRET_KEY");
    expect(
      json.deployReadiness?.warnings.some((w) => w.includes("STRIPE_SECRET_KEY")),
    ).toBe(true);
  });

  // BUG-fix: deploy must align with the readiness route's F2/F3 env logic.
  // Previously `resolveEnvRequirementsFromVersionFiles` was called WITHOUT
  // `lifecycleStage`/`selectedDossiers` in the deploy route, so every version
  // was evaluated with F2 (`design`) logic — an F3 (`integrations`) version's
  // tier-3-stub-covered key (e.g. Stripe) was silently treated as merely
  // "placeholder covered" (warning) instead of genuinely missing (blocker),
  // even though the readiness route already blocked the same version.
  it("precheckOnly blocks a tier-3 placeholder-covered key for an F3 (integrations) version, matching readiness", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat_1", project_id: "proj_1" },
      version: { id: "ver_1", chat_id: "chat_1", lifecycle_stage: "integrations" },
    });
    getVersionFiles.mockResolvedValue([
      {
        path: "lib/pay.ts",
        content:
          'import Stripe from "stripe";\nexport const x = new Stripe(process.env.STRIPE_SECRET_KEY!);\n',
      },
    ]);

    const req = new Request("http://localhost/api/v0/deployments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId: "chat_1",
        versionId: "ver_1",
        precheckOnly: true,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      deployReadiness?: { ready: boolean; missingEnv: string[] };
    };
    // F2 default would have surfaced this as a warning only (see the test
    // above) — F3 must treat it as genuinely missing, matching readiness.
    expect(json.deployReadiness?.ready).toBe(false);
    expect(json.deployReadiness?.missingEnv).toContain("STRIPE_SECRET_KEY");
  });

  // Product decision: placeholder-covered / feature-runtime env keys must
  // NEVER hard-block deploy (demo sites with an info sign stay publishable).
  // They now also carry a structured, per-key warning naming the degraded
  // integration instead of only a flat joined string.
  it("precheckOnly surfaces a structured envWarnings entry naming the degraded integration", async () => {
    getVersionFiles.mockResolvedValue([
      {
        path: "lib/pay.ts",
        content:
          'import Stripe from "stripe";\nexport const x = new Stripe(process.env.STRIPE_SECRET_KEY!);\n',
      },
    ]);

    const req = new Request("http://localhost/api/v0/deployments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId: "chat_1",
        versionId: "ver_1",
        precheckOnly: true,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      deployReadiness?: { ready: boolean };
      envWarnings?: Array<{ key: string; integration: string; reason: string; message: string }>;
    };
    expect(json.deployReadiness?.ready).toBe(true);
    expect(json.envWarnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "STRIPE_SECRET_KEY",
          integration: "Stripe",
          reason: "placeholder",
        }),
      ]),
    );
  });

  it("precheckOnly runs auto-fix by default (K-007): removes pnpm-lock, no skip message in fixesApplied", async () => {
    getVersionFiles.mockResolvedValue([
      { path: "package.json", content: '{"name":"demo","private":true}' },
      { path: "pnpm-lock.yaml", content: "lockfile:\n" },
    ]);

    const req = new Request("http://localhost/api/v0/deployments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId: "chat_1",
        versionId: "ver_1",
        precheckOnly: true,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      precheckOnly?: boolean;
      fixesApplied?: string[];
      fileCount?: number;
    };
    expect(json.precheckOnly).toBe(true);
    expect(json.fileCount).toBe(1);
    expect(json.fixesApplied?.some((f) => /Removed lockfiles|pnpm/i.test(f))).toBe(true);
    expect(json.fixesApplied?.some((f) => /skip|hoppats|skipped/i.test(f))).toBe(false);
  });

  it("precheckOnly with skipAutoFix skips applyPreDeployFixes and records skip in fixesApplied", async () => {
    getVersionFiles.mockResolvedValue([
      { path: "package.json", content: '{"name":"demo","private":true}' },
      { path: "pnpm-lock.yaml", content: "lockfile: ignored when skip\n" },
    ]);

    const req = new Request("http://localhost/api/v0/deployments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId: "chat_1",
        versionId: "ver_1",
        precheckOnly: true,
        skipAutoFix: true,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      precheckOnly?: boolean;
      fixesApplied?: string[];
      fileCount?: number;
    };
    expect(json.precheckOnly).toBe(true);
    expect(json.fileCount).toBe(2);
    expect(
      json.fixesApplied?.some((f) => /skip|hoppats|skipped/i.test(f)),
    ).toBe(true);
  });

  it("precheckOnly lists package.json in deployReadiness.invalidFiles when JSON is invalid", async () => {
    getVersionFiles.mockResolvedValue([
      { path: "package.json", content: "{ not valid package json" },
    ]);

    const req = new Request("http://localhost/api/v0/deployments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId: "chat_1",
        versionId: "ver_1",
        precheckOnly: true,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      deployReadiness?: { ready: boolean; invalidFiles?: string[]; warnings?: string[] };
    };
    expect(json.deployReadiness?.invalidFiles).toEqual(["package.json"]);
    expect(json.deployReadiness?.warnings?.some((w) => w.includes("package.json"))).toBe(true);
  });

  // Pengaväg (Codex P1 på PR #391): refunden får ALDRIG hoppas över för att en
  // best-effort status-/telemetri-skrivning kastar i deploy-catch:en. Charge
  // lyckas → Vercel-anropet fejlar (aldrig live) → status-skrivningen fejlar
  // OCKSÅ → refunden ska ändå köras.
  it("refunds the pre-deploy charge even when the error-status write rejects (Codex P1)", async () => {
    const commit = vi.fn(async () => undefined);
    const refund = vi.fn(async () => undefined);
    prepareCredits.mockImplementation(async () => ({ ok: true, commit, refund }));
    createDeploymentRecord.mockResolvedValue("dep_1");
    createVercelDeployment.mockRejectedValue(new Error("Vercel exploded"));
    updateDeploymentStatus.mockRejectedValue(new Error("status write failed"));

    const req = new Request("http://localhost/api/v0/deployments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId: "chat_1",
        versionId: "ver_1",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(commit).toHaveBeenCalledTimes(1);
    // Kärnan i P1: refund körs trots att updateDeploymentStatus rejectar.
    expect(refund).toHaveBeenCalledTimes(1);
    expect(setProjectVercelLink).not.toHaveBeenCalled();
  });

  // A#2 (tenant/security): the version + its engine chat are resolved through the
  // tenant-scoped `getEngineVersionForChatByIdForRequest`. When it returns null
  // (no such version, version not in chat, orphan chat with no owned project, or
  // a chat owned by another tenant) the deploy must 404 BEFORE any credit charge
  // or Vercel call — so a known chatId+versionId for a foreign/orphan chat can no
  // longer be published under the caller's own projectId.
  it("returns 404 when the version/chat is not owned by the requester (orphan/cross-tenant)", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue(null);
    prepareCredits.mockImplementation(() => {
      throw new Error("prepareCredits must not run before the tenant guard resolves");
    });

    const req = new Request("http://localhost/api/v0/deployments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId: "foreign_chat",
        versionId: "foreign_version",
        projectId: "my_own_project",
        precheckOnly: true,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
    expect(getEngineVersionForChatByIdForRequest).toHaveBeenCalledWith(
      req,
      "foreign_chat",
      "foreign_version",
    );
  });

  // A#2: a body `projectId` may only CONFIRM the chat's owned project — it can
  // never redirect the publish to a different project id.
  it("returns 409 when body projectId does not match the chat's owned project", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat_1", project_id: "proj_1" },
      version: { id: "ver_1", chat_id: "chat_1" },
    });

    const req = new Request("http://localhost/api/v0/deployments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId: "chat_1",
        versionId: "ver_1",
        projectId: "another_project",
        precheckOnly: true,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(409);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toMatch(/does not match chat ownership/i);
  });

  // A#425 #5 (test gap): a version that failed the quality gate must 409 even if
  // the deploy API is called directly, not just via the readiness UI.
  it("returns 409 DEPLOY_VERSION_FAILED for a version that failed the quality gate", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat_1", project_id: "proj_1" },
      version: { id: "ver_1", chat_id: "chat_1", verification_state: "failed" },
    });

    const req = new Request("http://localhost/api/v0/deployments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId: "chat_1",
        versionId: "ver_1",
        precheckOnly: true,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(409);
    const json = (await res.json()) as { code?: string };
    expect(json.code).toBe("DEPLOY_VERSION_FAILED");
  });

  // Publicera-lås (Ö1): F3/integrations får ENDAST publiceras när versionen är
  // bevisat grön (`verification_state === "passed"` eller `release_state ===
  // "promoted"`). En F3-version som aldrig nått grön ReleaseGate (pending/
  // verifying/repair_available) ska 409:a på den skarpa deploy-vägen — dessa
  // tester failar om gaten tas bort ur route:n.
  describe("F3 ReleaseGate publish lock (Ö1)", () => {
    const mockHappyDeployInfra = () => {
      const commit = vi.fn(async () => undefined);
      const refund = vi.fn(async () => undefined);
      prepareCredits.mockImplementation(async () => ({ ok: true, commit, refund }));
      createDeploymentRecord.mockResolvedValue("dep_1");
      createVercelDeployment.mockResolvedValue({
        vercelDeploymentId: "dpl_1",
        vercelProjectId: "vp_1",
        url: "https://example.vercel.app",
        inspectorUrl: null,
        readyState: "READY",
      });
      updateDeploymentStatus.mockResolvedValue({ transitionedToError: false });
      return { commit, refund };
    };

    const deployRequest = () =>
      new Request("http://localhost/api/v0/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: "chat_1", versionId: "ver_1" }),
      });

    it.each(["pending", "verifying", "repair_available"] as const)(
      "returns 409 DEPLOY_RELEASE_GATE_NOT_GREEN for an F3 version in state %s (no charge, no Vercel call)",
      async (verificationState) => {
        const { commit } = mockHappyDeployInfra();
        getEngineVersionForChatByIdForRequest.mockResolvedValue({
          chat: { id: "chat_1", project_id: "proj_1" },
          version: {
            id: "ver_1",
            chat_id: "chat_1",
            lifecycle_stage: "integrations",
            verification_state: verificationState,
          },
        });

        const res = await POST(deployRequest());
        expect(res.status).toBe(409);
        const json = (await res.json()) as { code?: string; error?: string };
        expect(json.code).toBe("DEPLOY_RELEASE_GATE_NOT_GREEN");
        expect(json.error).toMatch(/ReleaseGate/);
        expect(commit).not.toHaveBeenCalled();
        expect(createVercelDeployment).not.toHaveBeenCalled();
      },
    );

    it("allows deploy of an F3 version with verification_state passed", async () => {
      mockHappyDeployInfra();
      getEngineVersionForChatByIdForRequest.mockResolvedValue({
        chat: { id: "chat_1", project_id: "proj_1" },
        version: {
          id: "ver_1",
          chat_id: "chat_1",
          lifecycle_stage: "integrations",
          verification_state: "passed",
        },
      });

      const res = await POST(deployRequest());
      expect(res.status).toBe(200);
      expect(createVercelDeployment).toHaveBeenCalledTimes(1);
    });

    it("allows deploy of a promoted F3 version", async () => {
      mockHappyDeployInfra();
      getEngineVersionForChatByIdForRequest.mockResolvedValue({
        chat: { id: "chat_1", project_id: "proj_1" },
        version: {
          id: "ver_1",
          chat_id: "chat_1",
          lifecycle_stage: "integrations",
          release_state: "promoted",
          verification_state: "passed",
        },
      });

      const res = await POST(deployRequest());
      expect(res.status).toBe(200);
      expect(createVercelDeployment).toHaveBeenCalledTimes(1);
    });

    it("keeps the soft F2 gate: a design version with pending state deploys fine", async () => {
      mockHappyDeployInfra();
      getEngineVersionForChatByIdForRequest.mockResolvedValue({
        chat: { id: "chat_1", project_id: "proj_1" },
        version: {
          id: "ver_1",
          chat_id: "chat_1",
          lifecycle_stage: "design",
          verification_state: "pending",
        },
      });

      const res = await POST(deployRequest());
      expect(res.status).toBe(200);
      expect(createVercelDeployment).toHaveBeenCalledTimes(1);
    });

    it("still blocks a failed F2 version with 409 DEPLOY_VERSION_FAILED on the real deploy path", async () => {
      const { commit } = mockHappyDeployInfra();
      getEngineVersionForChatByIdForRequest.mockResolvedValue({
        chat: { id: "chat_1", project_id: "proj_1" },
        version: {
          id: "ver_1",
          chat_id: "chat_1",
          lifecycle_stage: "design",
          verification_state: "failed",
        },
      });

      const res = await POST(deployRequest());
      expect(res.status).toBe(409);
      const json = (await res.json()) as { code?: string };
      expect(json.code).toBe("DEPLOY_VERSION_FAILED");
      expect(commit).not.toHaveBeenCalled();
      expect(createVercelDeployment).not.toHaveBeenCalled();
    });

    it("precheckOnly reports the F3 gate as releaseGate instead of throwing", async () => {
      getEngineVersionForChatByIdForRequest.mockResolvedValue({
        chat: { id: "chat_1", project_id: "proj_1" },
        version: {
          id: "ver_1",
          chat_id: "chat_1",
          lifecycle_stage: "integrations",
          verification_state: "pending",
        },
      });

      const req = new Request("http://localhost/api/v0/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: "chat_1", versionId: "ver_1", precheckOnly: true }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = (await res.json()) as {
        releaseGate?: { allowed: boolean; code?: string; message?: string };
      };
      expect(json.releaseGate?.allowed).toBe(false);
      expect(json.releaseGate?.code).toBe("DEPLOY_RELEASE_GATE_NOT_GREEN");
    });
  });

  // Projektnamn-lås (Ö2 / A2): en kopplad custom-domän sitter på Vercel-
  // PROJEKTET (namn-baserat). Byter användaren `projectName` vid ompublicering
  // skapas ett nytt Vercel-projekt medan domänen blir kvar (orphan) på det
  // gamla. Så länge en domän är kopplad ska projektnamnet vara LÅST: ett
  // avvikande `projectName` ger 409 `DEPLOY_DOMAIN_LOCKED_PROJECT_NAME` FÖRE
  // credit-commit och Vercel-anrop. Dessa tester failar om guarden tas bort.
  describe("Domain project-name lock (Ö2)", () => {
    const mockHappyDeployInfra = () => {
      const commit = vi.fn(async () => undefined);
      const refund = vi.fn(async () => undefined);
      prepareCredits.mockImplementation(async () => ({ ok: true, commit, refund }));
      createDeploymentRecord.mockResolvedValue("dep_1");
      createVercelDeployment.mockResolvedValue({
        vercelDeploymentId: "dpl_1",
        vercelProjectId: "vp_1",
        url: "https://example.vercel.app",
        inspectorUrl: null,
        readyState: "READY",
      });
      updateDeploymentStatus.mockResolvedValue({ transitionedToError: false });
      return { commit, refund };
    };

    // #486 Fix A: a body `projectName` is only ever a DISPLAY-name edit once
    // the project already has a persisted `vercel_project_name` — the deploy
    // target below (~830+) always reuses that persisted name and ignores the
    // incoming one, so this can never actually retarget hosting. The lock
    // must not false-positive on a pure display-name change (previously 409'd
    // here even though nothing about the hosting target would change).
    it("allows a pure display-name change when a domain is linked but a Vercel project is already persisted (#486 Fix A)", async () => {
      const { commit } = mockHappyDeployInfra();
      getLinkedDomainForChat.mockResolvedValue("mysite.example");
      getAppProjectByIdForRequest.mockResolvedValue({
        id: "proj_1",
        vercel_project_name: "old-project",
      });

      const req = new Request("http://localhost/api/v0/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: "chat_1",
          versionId: "ver_1",
          projectName: "new-project",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(commit).toHaveBeenCalled();
      expect(createVercelDeployment).toHaveBeenCalledTimes(1);
    });

    // (BB#deploy4) The lock's "current project" and the real deploy target
    // must both follow the latest DEPLOYMENT's project id — the same source
    // the domain resolver (`resolve-vercel-project.ts`) uses — not just the
    // best-effort `vercel_project_name` cache, which can be empty/stale when
    // a previous link-write failed. Otherwise a differing display name could
    // either false-lock, or (worse) the deploy could create/reuse a
    // DIFFERENT Vercel project than the one the domain actually resolves to.
    it("(BB#deploy4) derives the lock + deploy target from the latest deployment's project id when vercel_project_name is empty/stale", async () => {
      const { commit } = mockHappyDeployInfra();
      getLinkedDomainForChat.mockResolvedValue("mysite.example");
      getAppProjectByIdForRequest.mockResolvedValue({
        id: "proj_1",
        name: "Demo",
        vercel_project_name: null,
        vercel_project_id: null,
      });
      getLatestVercelProjectIdForChat.mockResolvedValue("vp_real");
      ensureVercelProject.mockResolvedValue({
        id: "vp_real",
        name: "real-provider-project",
      });

      const req = new Request("http://localhost/api/v0/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: "chat_1",
          versionId: "ver_1",
          projectName: "some-new-display-name",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(commit).toHaveBeenCalled();
      expect(ensureVercelProject).toHaveBeenCalledWith(expect.any(String), "vp_real");
      expect(createVercelDeployment).toHaveBeenCalledWith(
        expect.objectContaining({ projectName: "real-provider-project" }),
      );
    });

    // #519 P1 (Codex review round 2): the domain-carrying row can be OLDER
    // than the latest deployment row overall, and the two can carry
    // DIFFERENT project ids (e.g. a legacy row, or any deploy after the
    // domain was saved that didn't re-save it). The domain-row's own id must
    // win — a republish must target the project the domain sits on, never
    // drift to a newer/unrelated project and orphan the domain.
    it("(#519 P1) prefers the domain-bearing row's project id over the latest-deployment-overall id (divergence)", async () => {
      const { commit } = mockHappyDeployInfra();
      getLinkedDomainForChat.mockResolvedValue("mysite.example");
      getLinkedDomainProjectIdForChat.mockResolvedValue("vp_domain_row");
      // A NEWER, unrelated deployment row (no domain of its own) carries a
      // DIFFERENT project id — must NOT win over the domain row's id.
      getLatestVercelProjectIdForChat.mockResolvedValue("vp_newer_unrelated");
      getAppProjectByIdForRequest.mockResolvedValue({
        id: "proj_1",
        name: "Demo",
        vercel_project_name: null,
        vercel_project_id: null,
      });
      ensureVercelProject.mockResolvedValue({
        id: "vp_domain_row",
        name: "domain-row-project",
      });

      const req = new Request("http://localhost/api/v0/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: "chat_1",
          versionId: "ver_1",
          // A pure display-name edit — must not be treated as retargeting,
          // and must never silently deploy to the newer/unrelated project.
          projectName: "some-new-display-name",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(commit).toHaveBeenCalled();
      expect(ensureVercelProject).toHaveBeenCalledWith(
        expect.any(String),
        "vp_domain_row",
      );
      expect(createVercelDeployment).toHaveBeenCalledWith(
        expect.objectContaining({ projectName: "domain-row-project" }),
      );
    });

    // #519 P1: the normal case (domain row and latest-deployment-overall
    // agree on the same project) must stay unchanged.
    it("(#519 P1) normal case: domain row and latest-deployment-overall agree — unchanged behavior", async () => {
      const { commit } = mockHappyDeployInfra();
      getLinkedDomainForChat.mockResolvedValue("mysite.example");
      getLinkedDomainProjectIdForChat.mockResolvedValue("vp_same");
      getLatestVercelProjectIdForChat.mockResolvedValue("vp_same");
      getAppProjectByIdForRequest.mockResolvedValue({
        id: "proj_1",
        name: "Demo",
        vercel_project_name: null,
        vercel_project_id: null,
      });
      ensureVercelProject.mockResolvedValue({
        id: "vp_same",
        name: "same-project",
      });

      const req = new Request("http://localhost/api/v0/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: "chat_1",
          versionId: "ver_1",
          projectName: "renamed-display",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(commit).toHaveBeenCalled();
      expect(ensureVercelProject).toHaveBeenCalledWith(expect.any(String), "vp_same");
    });

    it("allows the deploy when a domain is linked but no projectName is sent (same project reused)", async () => {
      mockHappyDeployInfra();
      getLinkedDomainForChat.mockResolvedValue("mysite.example");
      getAppProjectByIdForRequest.mockResolvedValue({
        id: "proj_1",
        vercel_project_name: "old-project",
      });

      const req = new Request("http://localhost/api/v0/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: "chat_1", versionId: "ver_1" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(createVercelDeployment).toHaveBeenCalledTimes(1);
    });

    it("allows the deploy when a domain is linked and projectName matches the persisted name", async () => {
      mockHappyDeployInfra();
      getLinkedDomainForChat.mockResolvedValue("mysite.example");
      getAppProjectByIdForRequest.mockResolvedValue({
        id: "proj_1",
        vercel_project_name: "old-project",
      });

      const req = new Request("http://localhost/api/v0/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: "chat_1",
          versionId: "ver_1",
          projectName: "old-project",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(createVercelDeployment).toHaveBeenCalledTimes(1);
    });

    it("allows a new projectName when NO domain is linked (today's behavior)", async () => {
      mockHappyDeployInfra();
      getLinkedDomainForChat.mockResolvedValue(null);
      getAppProjectByIdForRequest.mockResolvedValue({
        id: "proj_1",
        vercel_project_name: "old-project",
      });

      const req = new Request("http://localhost/api/v0/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: "chat_1",
          versionId: "ver_1",
          projectName: "brand-new-project",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(createVercelDeployment).toHaveBeenCalledTimes(1);
    });

    // Legacy row (no persisted vercel_project_name/id at all): the fallback
    // generated name is genuinely determined by the incoming projectName, so
    // this IS real retargeting — precheckOnly must still report it as locked.
    it("precheckOnly reports the lock as projectNameLock instead of throwing (legacy row, genuine retargeting)", async () => {
      getLinkedDomainForChat.mockResolvedValue("mysite.example");
      getAppProjectByIdForRequest.mockResolvedValue({ id: "proj_1" });

      const req = new Request("http://localhost/api/v0/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: "chat_1",
          versionId: "ver_1",
          projectName: "new-project",
          precheckOnly: true,
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = (await res.json()) as {
        precheckOnly?: boolean;
        projectNameLock?: {
          locked: boolean;
          domain: string | null;
          currentProjectName: string;
          requestedProjectName: string | null;
        };
      };
      expect(json.precheckOnly).toBe(true);
      expect(json.projectNameLock?.locked).toBe(true);
      expect(json.projectNameLock?.domain).toBe("mysite.example");
      expect(json.projectNameLock?.requestedProjectName).toBe("new-project");
    });

    // Legacy-rad: en kopplad domän men ingen persistad `vercel_project_name`.
    // Låset faller tillbaka på `sajtmaskin-${chatId}` och ska fortfarande
    // blockera ett avvikande projektnamn (domänen sitter på fallback-projektet).
    it("locks a legacy row without vercel_project_name against a differing projectName", async () => {
      const { commit } = mockHappyDeployInfra();
      getLinkedDomainForChat.mockResolvedValue("mysite.example");
      getAppProjectByIdForRequest.mockResolvedValue({ id: "proj_1" });

      const req = new Request("http://localhost/api/v0/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: "chat_1",
          versionId: "ver_1",
          projectName: "renamed-project",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(409);
      const json = (await res.json()) as {
        code?: string;
        projectNameLock?: { currentProjectName: string };
      };
      expect(json.code).toBe("DEPLOY_DOMAIN_LOCKED_PROJECT_NAME");
      // Fallback-namnet är `sajtmaskin-${chatId}` när ingen persisterad finns.
      expect(json.projectNameLock?.currentProjectName).toBe("sajtmaskin-chat_1");
      expect(commit).not.toHaveBeenCalled();
      expect(createVercelDeployment).not.toHaveBeenCalled();
    });

    // Bugbot på #519: en whitespace-only `vercel_project_name` får inte räknas
    // som "känt projekt" — då jämför låset två identiska genererade fallbacks
    // (låser aldrig) medan deployen kan träffa ett annat projekt än domänens.
    // Ska bete sig exakt som legacy-raden ovan: äkta retargeting → 409.
    it("treats a whitespace-only vercel_project_name as no known project (lock still applies)", async () => {
      const { commit } = mockHappyDeployInfra();
      getLinkedDomainForChat.mockResolvedValue("mysite.example");
      getAppProjectByIdForRequest.mockResolvedValue({
        id: "proj_1",
        vercel_project_name: "   ",
      });

      const req = new Request("http://localhost/api/v0/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: "chat_1",
          versionId: "ver_1",
          projectName: "renamed-project",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(409);
      const json = (await res.json()) as { code?: string };
      expect(json.code).toBe("DEPLOY_DOMAIN_LOCKED_PROJECT_NAME");
      expect(commit).not.toHaveBeenCalled();
      expect(createVercelDeployment).not.toHaveBeenCalled();
    });
  });

  // A#425 #4 (test gap): happy-path POST must insert the deployment row keyed by
  // the ENGINE ids after the legacy-FK drop, so a FK regression would be caught.
  it("creates the deployment record with the engine chat/version ids on a successful publish", async () => {
    const commit = vi.fn(async () => undefined);
    const refund = vi.fn(async () => undefined);
    prepareCredits.mockImplementation(async () => ({ ok: true, commit, refund }));
    createDeploymentRecord.mockResolvedValue("dep_1");
    createVercelDeployment.mockResolvedValue({
      vercelDeploymentId: "dpl_1",
      vercelProjectId: null,
      url: "https://example.vercel.app",
      inspectorUrl: null,
      readyState: "READY",
    });
    updateDeploymentStatus.mockResolvedValue({ transitionedToError: false });

    const req = new Request("http://localhost/api/v0/deployments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId: "chat_1",
        versionId: "ver_1",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(createDeploymentRecord).toHaveBeenCalledWith({
      chatId: "chat_1",
      versionId: "ver_1",
    });
  });

  it("reuses the latest deployment project when the app-project cache is missing", async () => {
    prepareCredits.mockImplementation(async () => ({
      ok: true,
      commit: vi.fn(async () => undefined),
      refund: vi.fn(async () => undefined),
    }));
    getAppProjectByIdForRequest.mockResolvedValue({
      id: "proj_1",
      name: "Legacy site",
      vercel_project_id: null,
      vercel_project_name: null,
    });
    getLatestVercelProjectIdForChat.mockResolvedValue("vp_legacy");
    ensureVercelProject.mockResolvedValue({
      id: "vp_legacy",
      name: "legacy-provider-project",
    });
    createDeploymentRecord.mockResolvedValue("dep_1");
    createVercelDeployment.mockResolvedValue({
      vercelDeploymentId: "dpl_1",
      vercelProjectId: "vp_legacy",
      url: "legacy-provider-project.vercel.app",
      inspectorUrl: null,
      readyState: "READY",
    });

    const res = await POST(
      new Request("http://localhost/api/v0/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: "chat_1", versionId: "ver_1" }),
      }),
    );

    expect(res.status).toBe(200);
    expect(ensureVercelProject).toHaveBeenCalledWith(
      expect.any(String),
      "vp_legacy",
    );
    expect(createVercelDeployment).toHaveBeenCalledWith(
      expect.objectContaining({ projectName: "legacy-provider-project" }),
    );
  });

  it("prefers the latest deployment project over a stale app-project cache", async () => {
    prepareCredits.mockImplementation(async () => ({
      ok: true,
      commit: vi.fn(async () => undefined),
      refund: vi.fn(async () => undefined),
    }));
    getAppProjectByIdForRequest.mockResolvedValue({
      id: "proj_1",
      name: "Republished site",
      vercel_project_id: "vp_stale",
      vercel_project_name: "stale-provider-project",
      custom_domain: "republished.example",
      custom_domain_verified_at: new Date("2026-07-10T00:00:00Z"),
    });
    getLatestVercelProjectIdForChat.mockResolvedValue("vp_fresh");
    ensureVercelProject.mockResolvedValue({
      id: "vp_fresh",
      name: "fresh-provider-project",
    });
    createDeploymentRecord.mockResolvedValue("dep_1");
    createVercelDeployment.mockResolvedValue({
      vercelDeploymentId: "dpl_1",
      vercelProjectId: "vp_fresh",
      url: "fresh-provider-project.vercel.app",
      inspectorUrl: null,
      readyState: "READY",
    });

    const res = await POST(
      new Request("http://localhost/api/v0/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: "chat_1", versionId: "ver_1" }),
      }),
    );

    expect(res.status).toBe(200);
    expect(ensureVercelProject).toHaveBeenCalledWith(
      expect.any(String),
      "vp_fresh",
    );
    expect(checkVercelProjectDomain).toHaveBeenCalledWith(
      "vp_fresh",
      "republished.example",
    );
    expect(setProjectVercelLink).toHaveBeenCalledWith(
      "proj_1",
      expect.objectContaining({
        vercelProjectId: "vp_fresh",
        vercelProjectName: "fresh-provider-project",
      }),
    );
    expect(updateDeploymentStatus).toHaveBeenCalledWith(
      "dep_1",
      "ready",
      expect.objectContaining({ vercelProjectId: "vp_fresh" }),
    );
  });

  it("falls back to the app-project cache when deployment lookup is unavailable", async () => {
    prepareCredits.mockImplementation(async () => ({
      ok: true,
      commit: vi.fn(async () => undefined),
      refund: vi.fn(async () => undefined),
    }));
    getAppProjectByIdForRequest.mockResolvedValue({
      id: "proj_1",
      name: "Cached site",
      vercel_project_id: "vp_cached",
      vercel_project_name: "cached-provider-project",
    });
    getLatestVercelProjectIdForChat.mockRejectedValue(new Error("transient db read"));
    ensureVercelProject.mockResolvedValue({
      id: "vp_cached",
      name: "cached-provider-project",
    });
    createDeploymentRecord.mockResolvedValue("dep_1");
    createVercelDeployment.mockResolvedValue({
      vercelDeploymentId: "dpl_1",
      vercelProjectId: "vp_cached",
      url: "cached-provider-project.vercel.app",
      inspectorUrl: null,
      readyState: "READY",
    });

    const res = await POST(
      new Request("http://localhost/api/v0/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: "chat_1", versionId: "ver_1" }),
      }),
    );

    expect(res.status).toBe(200);
    expect(ensureVercelProject).toHaveBeenCalledWith(
      expect.any(String),
      "vp_cached",
    );
  });

  it("provisions and verifies the branded alias before exposing it as liveUrl", async () => {
    vi.stubEnv("SAJTMASKIN_BRANDED_LIVE_URLS", "true");
    vi.stubEnv("SAJTMASKIN_LIVE_SITE_DOMAIN", "sites.sajtmaskin.se");
    const commit = vi.fn(async () => undefined);
    prepareCredits.mockImplementation(async () => ({
      ok: true,
      commit,
      refund: vi.fn(async () => undefined),
    }));
    createDeploymentRecord.mockResolvedValue("dep_1");
    ensureProjectPublishedIdentity.mockResolvedValue({
      publishedSlug: "demo",
      brandedDomain: "demo.sites.sajtmaskin.se",
      brandedDomainVerifiedAt: null,
      customDomain: null,
      customDomainVerifiedAt: null,
    });
    ensureVercelProject.mockResolvedValue({ id: "vp_1", name: "demo" });
    ensureVercelProjectDomain.mockResolvedValue({
      name: "demo.sites.sajtmaskin.se",
      verified: true,
    });
    createVercelDeployment.mockResolvedValue({
      vercelDeploymentId: "dpl_1",
      vercelProjectId: null,
      url: "demo.vercel.app",
      inspectorUrl: null,
      readyState: "READY",
    });

    const res = await POST(
      new Request("http://localhost/api/v0/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: "chat_1", versionId: "ver_1", projectName: "demo" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(commit.mock.invocationCallOrder[0]).toBeLessThan(
      ensureVercelProject.mock.invocationCallOrder[0],
    );
    expect(ensureVercelProjectDomain).toHaveBeenCalledWith(
      "vp_1",
      "demo.sites.sajtmaskin.se",
    );
    expect(updateDeploymentStatus).toHaveBeenCalledWith(
      "dep_1",
      "ready",
      expect.objectContaining({
        vercelProjectId: "vp_1",
        providerUrl: "demo.vercel.app",
        url: "https://demo.sites.sajtmaskin.se",
      }),
    );
  });

  // #486 Fix A: a display-name-only edit must not look like retargeting once
  // the branded domain's Vercel project is already persisted (previously
  // locked here even though the deploy target would stay on "stable-provider"
  // regardless of the requested name).
  it("allows a display-name change once a branded domain is assigned to an already-persisted Vercel project (#486 Fix A)", async () => {
    getAppProjectByIdForRequest.mockResolvedValue({
      id: "proj_1",
      name: "Demo",
      vercel_project_name: "stable-provider",
      branded_domain: "demo.sites.sajtmaskin.se",
      branded_domain_verified_at: new Date(),
    });

    const res = await POST(
      new Request("http://localhost/api/v0/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: "chat_1",
          versionId: "ver_1",
          projectName: "other-provider",
          precheckOnly: true,
        }),
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.projectNameLock).toMatchObject({
      locked: false,
      domain: "demo.sites.sajtmaskin.se",
      currentProjectName: "stable-provider",
    });
  });

  it("falls back to providerUrl and reports a domain warning while branded DNS is pending", async () => {
    vi.stubEnv("SAJTMASKIN_BRANDED_LIVE_URLS", "true");
    vi.stubEnv("SAJTMASKIN_LIVE_SITE_DOMAIN", "sites.sajtmaskin.se");
    prepareCredits.mockImplementation(async () => ({
      ok: true,
      commit: vi.fn(async () => undefined),
      refund: vi.fn(async () => undefined),
    }));
    createDeploymentRecord.mockResolvedValue("dep_1");
    ensureProjectPublishedIdentity.mockResolvedValue({
      publishedSlug: "demo",
      brandedDomain: "demo.sites.sajtmaskin.se",
      brandedDomainVerifiedAt: null,
      customDomain: null,
      customDomainVerifiedAt: null,
    });
    ensureVercelProject.mockResolvedValue({ id: "vp_1", name: "demo" });
    ensureVercelProjectDomain.mockResolvedValue({
      name: "demo.sites.sajtmaskin.se",
      verified: false,
    });
    createVercelDeployment.mockResolvedValue({
      vercelDeploymentId: "dpl_1",
      vercelProjectId: "vp_1",
      url: "demo.vercel.app",
      inspectorUrl: null,
      readyState: "READY",
    });

    const res = await POST(
      new Request("http://localhost/api/v0/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: "chat_1", versionId: "ver_1" }),
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.url).toBe("https://demo.vercel.app");
    expect(body.domainWarnings).toEqual([
      expect.stringContaining("väntar på DNS/TLS-verifiering"),
    ]);
    expect(clearProjectBrandedDomainVerification).toHaveBeenCalled();
    expect(updateDeploymentStatus).toHaveBeenCalledWith(
      "dep_1",
      "ready",
      expect.objectContaining({ url: "https://demo.vercel.app" }),
    );
  });

  it("reconciles a pending branded alias on deployment-history reload", async () => {
    vi.stubEnv("SAJTMASKIN_BRANDED_LIVE_URLS", "true");
    vi.stubEnv("SAJTMASKIN_LIVE_SITE_DOMAIN", "sites.sajtmaskin.se");
    getEngineChatByIdForRequest.mockResolvedValue({
      id: "chat_1",
      project_id: "proj_1",
    });
    getProjectById.mockResolvedValue({
      id: "proj_1",
      vercel_project_id: "vp_1",
      vercel_project_name: "demo",
      published_slug: "demo",
      branded_domain: "demo.sites.sajtmaskin.se",
      branded_domain_verified_at: null,
      custom_domain: null,
      custom_domain_verified_at: null,
    });
    checkVercelProjectDomain.mockResolvedValue(true);
    markProjectBrandedDomainVerified.mockResolvedValue({ id: "proj_1" });

    const res = await GET(
      new Request("http://localhost/api/v0/deployments?chatId=chat_1"),
    );

    expect(res.status).toBe(200);
    expect(markProjectBrandedDomainVerified).toHaveBeenCalledWith(
      "proj_1",
      "demo.sites.sajtmaskin.se",
    );
    expect(setLatestDeploymentLiveUrlForChat).toHaveBeenCalledWith(
      "chat_1",
      "demo.sites.sajtmaskin.se",
    );
    const body = await res.json();
    expect(body.project.brandedDomainVerifiedAt).toBeTruthy();
  });

  it("uses the latest deployment project for history domain reconciliation", async () => {
    getEngineChatByIdForRequest.mockResolvedValue({
      id: "chat_1",
      project_id: "proj_1",
    });
    getProjectById.mockResolvedValue({
      id: "proj_1",
      vercel_project_id: "vp_stale",
      vercel_project_name: "stale-provider-project",
      custom_domain: "republished.example",
      custom_domain_verified_at: new Date("2026-07-10T00:00:00Z"),
    });
    getLatestVercelProjectIdForChat.mockResolvedValue("vp_fresh");

    const res = await GET(
      new Request("http://localhost/api/v0/deployments?chatId=chat_1"),
    );

    expect(res.status).toBe(200);
    expect(checkVercelProjectDomain).toHaveBeenCalledWith(
      "vp_fresh",
      "republished.example",
    );
    const body = await res.json();
    expect(body.project.vercelProjectId).toBe("vp_fresh");
  });

  it("throttles pending branded-domain checks during repeated history reloads", async () => {
    vi.stubEnv("SAJTMASKIN_BRANDED_LIVE_URLS", "true");
    vi.stubEnv("SAJTMASKIN_LIVE_SITE_DOMAIN", "sites.sajtmaskin.se");
    getEngineChatByIdForRequest.mockResolvedValue({
      id: "chat_1",
      project_id: "proj_1",
    });
    getProjectById.mockResolvedValue({
      id: "proj_1",
      vercel_project_id: "vp_1",
      branded_domain: "demo.sites.sajtmaskin.se",
      branded_domain_verified_at: null,
      branded_domain_checked_at: new Date(),
    });

    const res = await GET(
      new Request("http://localhost/api/v0/deployments?chatId=chat_1"),
    );

    expect(res.status).toBe(200);
    expect(checkVercelProjectDomain).not.toHaveBeenCalled();
    expect(markProjectBrandedDomainVerified).not.toHaveBeenCalled();
  });

  it("records a pending branded-domain check so later reloads are throttled", async () => {
    vi.stubEnv("SAJTMASKIN_BRANDED_LIVE_URLS", "true");
    vi.stubEnv("SAJTMASKIN_LIVE_SITE_DOMAIN", "sites.sajtmaskin.se");
    getEngineChatByIdForRequest.mockResolvedValue({
      id: "chat_1",
      project_id: "proj_1",
    });
    getProjectById.mockResolvedValue({
      id: "proj_1",
      vercel_project_id: "vp_1",
      branded_domain: "demo.sites.sajtmaskin.se",
      branded_domain_verified_at: null,
      branded_domain_checked_at: null,
    });
    checkVercelProjectDomain.mockResolvedValue(false);

    const res = await GET(
      new Request("http://localhost/api/v0/deployments?chatId=chat_1"),
    );

    expect(res.status).toBe(200);
    expect(clearProjectBrandedDomainVerification).toHaveBeenCalledWith(
      "proj_1",
      "demo.sites.sajtmaskin.se",
    );
  });

  // #486 Fix C: a VERIFIED branded domain must still be periodically
  // rechecked (mirrors the unconditional custom-domain recheck above) — the
  // old guard (`!brandedDomainVerifiedAt`) skipped this block entirely once
  // verified, so a domain removed/misconfigured on the provider AFTER
  // verification stayed "verified" forever.
  describe("branded-domain recheck when already verified (#486 Fix C)", () => {
    // VADE #519: an already-verified branded domain that stays `configured`
    // on a throttled recheck must NOT re-stamp the live URL every time —
    // only `markProjectBrandedDomainVerified` (which itself always advances
    // `branded_domain_checked_at`) runs, so the throttle clock still moves.
    it("recheck runs once the throttle window has passed for a verified domain, but does NOT re-stamp liveUrl", async () => {
      vi.stubEnv("SAJTMASKIN_BRANDED_LIVE_URLS", "true");
      vi.stubEnv("SAJTMASKIN_LIVE_SITE_DOMAIN", "sites.sajtmaskin.se");
      getEngineChatByIdForRequest.mockResolvedValue({
        id: "chat_1",
        project_id: "proj_1",
      });
      getProjectById.mockResolvedValue({
        id: "proj_1",
        vercel_project_id: "vp_1",
        branded_domain: "demo.sites.sajtmaskin.se",
        branded_domain_verified_at: new Date("2026-07-10T00:00:00Z"),
        branded_domain_checked_at: new Date("2026-07-10T00:00:00Z"),
      });
      checkVercelProjectDomain.mockResolvedValue(true);
      markProjectBrandedDomainVerified.mockResolvedValue({
        id: "proj_1",
        branded_domain_verified_at: new Date("2026-07-10T00:00:00Z"),
      });

      const res = await GET(
        new Request("http://localhost/api/v0/deployments?chatId=chat_1"),
      );

      expect(res.status).toBe(200);
      expect(checkVercelProjectDomain).toHaveBeenCalledWith(
        "vp_1",
        "demo.sites.sajtmaskin.se",
      );
      // Throttle clock still moves (markProjectBrandedDomainVerified always
      // advances branded_domain_checked_at)...
      expect(markProjectBrandedDomainVerified).toHaveBeenCalledWith(
        "proj_1",
        "demo.sites.sajtmaskin.se",
      );
      // ...but the live URL is NOT re-stamped on a mere "still verified"
      // recheck (no transition happened).
      expect(setLatestDeploymentLiveUrlForChat).not.toHaveBeenCalled();
    });

    // VADE #519: a genuine unverified→verified transition must still not
    // promote the branded subdomain over an ALREADY-verified custom domain
    // — custom domain always wins as liveUrl.
    it("does NOT stamp liveUrl on a genuine verification transition when a verified custom domain already wins", async () => {
      vi.stubEnv("SAJTMASKIN_BRANDED_LIVE_URLS", "true");
      vi.stubEnv("SAJTMASKIN_LIVE_SITE_DOMAIN", "sites.sajtmaskin.se");
      getEngineChatByIdForRequest.mockResolvedValue({
        id: "chat_1",
        project_id: "proj_1",
      });
      getProjectById.mockResolvedValue({
        id: "proj_1",
        vercel_project_id: "vp_1",
        branded_domain: "demo.sites.sajtmaskin.se",
        branded_domain_verified_at: null,
        branded_domain_checked_at: null,
        custom_domain: "kund.example",
        custom_domain_verified_at: new Date("2026-07-10T00:00:00Z"),
      });
      checkVercelProjectDomain.mockResolvedValue(true);
      markProjectBrandedDomainVerified.mockResolvedValue({
        id: "proj_1",
        branded_domain_verified_at: new Date("2026-07-13T00:00:00Z"),
      });

      const res = await GET(
        new Request("http://localhost/api/v0/deployments?chatId=chat_1"),
      );

      expect(res.status).toBe(200);
      // The branded domain is still marked verified in the backing table...
      expect(markProjectBrandedDomainVerified).toHaveBeenCalledWith(
        "proj_1",
        "demo.sites.sajtmaskin.se",
      );
      // ...but the live URL must stay on the verified custom domain, never
      // clobbered to the branded subdomain.
      expect(setLatestDeploymentLiveUrlForChat).not.toHaveBeenCalled();
    });

    it("a definitive false revokes a previously verified domain", async () => {
      vi.stubEnv("SAJTMASKIN_BRANDED_LIVE_URLS", "true");
      vi.stubEnv("SAJTMASKIN_LIVE_SITE_DOMAIN", "sites.sajtmaskin.se");
      getEngineChatByIdForRequest.mockResolvedValue({
        id: "chat_1",
        project_id: "proj_1",
      });
      getProjectById.mockResolvedValue({
        id: "proj_1",
        vercel_project_id: "vp_1",
        branded_domain: "demo.sites.sajtmaskin.se",
        branded_domain_verified_at: new Date("2026-07-10T00:00:00Z"),
        branded_domain_checked_at: new Date("2026-07-10T00:00:00Z"),
      });
      checkVercelProjectDomain.mockResolvedValue(false);

      const res = await GET(
        new Request("http://localhost/api/v0/deployments?chatId=chat_1"),
      );

      expect(res.status).toBe(200);
      expect(clearProjectBrandedDomainVerification).toHaveBeenCalledWith(
        "proj_1",
        "demo.sites.sajtmaskin.se",
      );
      expect(touchProjectBrandedDomainCheckedAt).not.toHaveBeenCalled();
      const body = await res.json();
      expect(body.project.brandedDomainVerifiedAt).toBeFalsy();
    });

    it("a transient null keeps the verification and only advances the check clock", async () => {
      vi.stubEnv("SAJTMASKIN_BRANDED_LIVE_URLS", "true");
      vi.stubEnv("SAJTMASKIN_LIVE_SITE_DOMAIN", "sites.sajtmaskin.se");
      getEngineChatByIdForRequest.mockResolvedValue({
        id: "chat_1",
        project_id: "proj_1",
      });
      const verifiedAt = new Date("2026-07-10T00:00:00Z");
      getProjectById.mockResolvedValue({
        id: "proj_1",
        vercel_project_id: "vp_1",
        branded_domain: "demo.sites.sajtmaskin.se",
        branded_domain_verified_at: verifiedAt,
        branded_domain_checked_at: verifiedAt,
      });
      checkVercelProjectDomain.mockResolvedValue(null);

      const res = await GET(
        new Request("http://localhost/api/v0/deployments?chatId=chat_1"),
      );

      expect(res.status).toBe(200);
      expect(touchProjectBrandedDomainCheckedAt).toHaveBeenCalledWith(
        "proj_1",
        "demo.sites.sajtmaskin.se",
      );
      expect(clearProjectBrandedDomainVerification).not.toHaveBeenCalled();
      const body = await res.json();
      expect(body.project.brandedDomainVerifiedAt).toBeTruthy();
    });
  });

  it("only falls back to legacy Vercel hosts in deployment history", async () => {
    getEngineChatByIdForRequest.mockResolvedValue({
      id: "chat_1",
      project_id: "proj_1",
    });
    getProjectById.mockResolvedValue({
      id: "proj_1",
      branded_domain: "old.sites.sajtmaskin.se",
      branded_domain_verified_at: null,
      custom_domain: null,
      custom_domain_verified_at: null,
    });
    deploymentRows.mockResolvedValue([
      {
        id: "dep_stale_domain",
        chatId: "chat_1",
        versionId: "ver_1",
        status: "ready",
        url: "https://old.sites.sajtmaskin.se",
        providerUrl: null,
        inspectorUrl: null,
        vercelDeploymentId: null,
        vercelProjectId: "vp_1",
        createdAt: new Date("2026-07-10T00:00:00Z"),
        updatedAt: new Date("2026-07-10T00:00:00Z"),
      },
      {
        id: "dep_legacy_provider",
        chatId: "chat_1",
        versionId: "ver_2",
        status: "ready",
        url: "legacy-provider.vercel.app",
        providerUrl: null,
        inspectorUrl: null,
        vercelDeploymentId: null,
        vercelProjectId: "vp_1",
        createdAt: new Date("2026-07-09T00:00:00Z"),
        updatedAt: new Date("2026-07-09T00:00:00Z"),
      },
    ]);

    const res = await GET(
      new Request("http://localhost/api/v0/deployments?chatId=chat_1"),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deployments).toEqual([
      expect.objectContaining({ id: "dep_stale_domain", url: null }),
      expect.objectContaining({
        id: "dep_legacy_provider",
        url: "https://legacy-provider.vercel.app",
      }),
    ]);
  });

  // BUG-fix: the ZIP/download export already strips the generated F2
  // placeholder `.env.local` (see `strip-env-local-for-zip.ts`) but the
  // deploy file-assembly did not, so it could ship to Vercel and shadow the
  // project's real configured env values. `env.example` must still ship
  // (Next.js never reads it, so it is harmless documentation).
  it("never includes the generated .env.local in the Vercel deploy files payload", async () => {
    const commit = vi.fn(async () => undefined);
    const refund = vi.fn(async () => undefined);
    prepareCredits.mockImplementation(async () => ({ ok: true, commit, refund }));
    createDeploymentRecord.mockResolvedValue("dep_1");
    createVercelDeployment.mockResolvedValue({
      vercelDeploymentId: "dpl_1",
      vercelProjectId: "vp_1",
      url: "https://example.vercel.app",
      inspectorUrl: null,
      readyState: "READY",
    });
    updateDeploymentStatus.mockResolvedValue({ transitionedToError: false });
    getVersionFiles.mockResolvedValue([
      { path: "package.json", content: '{"name":"demo","private":true}' },
      { path: ".env.local", content: "STRIPE_SECRET_KEY=sk_test_placeholder_preview_not_real\n" },
      { path: "env.example", content: "STRIPE_SECRET_KEY=\n" },
    ]);

    const req = new Request("http://localhost/api/v0/deployments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId: "chat_1",
        versionId: "ver_1",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(createVercelDeployment).toHaveBeenCalledTimes(1);
    const call = createVercelDeployment.mock.calls[0][0] as { files: Array<{ name: string }> };
    const filePaths = call.files.map((f) => f.name);
    expect(filePaths).not.toContain(".env.local");
    expect(filePaths).toContain("env.example");
    expect(filePaths).toContain("package.json");
  });

  // BUG-fix: env-var project sync errors used to be swallowed into a
  // `console.warn` only — the caller (and therefore the UI) had no way to
  // know integrations might not survive a future dashboard-triggered
  // rebuild. Surface it as a warning in the response instead.
  it("surfaces syncEnvVarsToVercelProject errors as envSyncWarnings in the response", async () => {
    const commit = vi.fn(async () => undefined);
    const refund = vi.fn(async () => undefined);
    prepareCredits.mockImplementation(async () => ({ ok: true, commit, refund }));
    createDeploymentRecord.mockResolvedValue("dep_1");
    createVercelDeployment.mockResolvedValue({
      vercelDeploymentId: "dpl_1",
      vercelProjectId: "vp_1",
      url: "https://example.vercel.app",
      inspectorUrl: null,
      readyState: "READY",
    });
    updateDeploymentStatus.mockResolvedValue({ transitionedToError: false });
    syncEnvVarsToVercelProject.mockResolvedValue({
      synced: 0,
      errors: ["Vercel env sync failed (HTTP 500)"],
    });

    const req = new Request("http://localhost/api/v0/deployments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId: "chat_1",
        versionId: "ver_1",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { envSyncWarnings?: string[] };
    expect(json.envSyncWarnings?.some((w) => w.includes("Vercel env sync failed"))).toBe(true);
  });

  it("does NOT refund when Vercel accepted the deploy and a later write fails", async () => {
    const commit = vi.fn(async () => undefined);
    const refund = vi.fn(async () => undefined);
    prepareCredits.mockImplementation(async () => ({ ok: true, commit, refund }));
    createDeploymentRecord.mockResolvedValue("dep_1");
    createVercelDeployment.mockResolvedValue({
      vercelDeploymentId: "dpl_1",
      vercelProjectId: null,
      url: "https://example.vercel.app",
      inspectorUrl: null,
      readyState: "QUEUED",
    });
    // Status-skrivningen EFTER lyckad deploy kastar → felet bubblar, men
    // deployen är live: ingen refund (annars gratis deploy).
    updateDeploymentStatus.mockRejectedValue(new Error("status write failed"));

    const req = new Request("http://localhost/api/v0/deployments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId: "chat_1",
        versionId: "ver_1",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(refund).not.toHaveBeenCalled();
  });

  // R1 (Codex #443): the deploy env gate must block on the SAME list as the F3
  // readiness gate — `buildBlockingKeys` (build-enforcement keys), NOT the
  // broader `missingEnvKeys`. `feature-runtime`/`warn-only` keys (e.g. Resend
  // `EMAIL_FROM`/`CONTACT_EMAIL_TO`) only degrade a single feature at runtime,
  // so they must not 409 the deploy while readiness reports `canDeploy:true`.
  describe("R1: deploy env gate blocks on buildBlockingKeys, not missingEnvKeys", () => {
    const mockHappyDeployInfra = () => {
      const commit = vi.fn(async () => undefined);
      const refund = vi.fn(async () => undefined);
      prepareCredits.mockImplementation(async () => ({ ok: true, commit, refund }));
      createDeploymentRecord.mockResolvedValue("dep_1");
      createVercelDeployment.mockResolvedValue({
        vercelDeploymentId: "dpl_1",
        vercelProjectId: "vp_1",
        url: "https://example.vercel.app",
        inspectorUrl: null,
        readyState: "READY",
      });
      updateDeploymentStatus.mockResolvedValue({ transitionedToError: false });
      return { commit, refund };
    };

    it("does NOT block deploy on a missing feature-runtime env key, and still surfaces it as a warning", async () => {
      mockHappyDeployInfra();
      // F3 version referencing an invented email-recipient key. The resolver
      // classifies `CONTACT_EMAIL_TO` as `feature-runtime` (custom-email group):
      // it lands in `missingEnvKeys` (unconfigured, no placeholder) but NOT in
      // `buildBlockingKeys`. Pre-fix this 409'd `DEPLOY_MISSING_ENV` even though
      // readiness reported `canDeploy:true` — now the deploy proceeds.
      getEngineVersionForChatByIdForRequest.mockResolvedValue({
        chat: { id: "chat_1", project_id: "proj_1" },
        version: {
          id: "ver_1",
          chat_id: "chat_1",
          lifecycle_stage: "integrations",
          verification_state: "passed",
        },
      });
      getVersionFiles.mockResolvedValue([
        {
          path: "app/api/contact/route.ts",
          content:
            "export async function POST() {\n  const to = process.env.CONTACT_EMAIL_TO;\n  return Response.json({ to });\n}\n",
        },
      ]);

      const req = new Request("http://localhost/api/v0/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: "chat_1", versionId: "ver_1" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(createVercelDeployment).toHaveBeenCalledTimes(1);
      const json = (await res.json()) as {
        envWarnings?: Array<{ key: string; reason: string }>;
        deployReadiness?: { missingEnv: string[] };
      };
      // The key is not blocking, but it is still surfaced: structured warning
      // AND the legacy `missingEnv` observability list.
      expect(
        json.envWarnings?.some(
          (w) => w.key === "CONTACT_EMAIL_TO" && w.reason === "feature-runtime",
        ),
      ).toBe(true);
      expect(json.deployReadiness?.missingEnv).toContain("CONTACT_EMAIL_TO");
    });

    it("still returns 409 DEPLOY_MISSING_ENV for a missing build-enforcement key (no charge, no Vercel call)", async () => {
      const { commit } = mockHappyDeployInfra();
      // A custom `process.env.*` reference the pipeline cannot classify lands
      // in the `custom-env` bucket, which stays `build`-enforcement (the
      // conservative default). Unconfigured + no placeholder → it is in
      // `buildBlockingKeys` and must keep hard-blocking the deploy.
      getEngineVersionForChatByIdForRequest.mockResolvedValue({
        chat: { id: "chat_1", project_id: "proj_1" },
        version: {
          id: "ver_1",
          chat_id: "chat_1",
          lifecycle_stage: "integrations",
          verification_state: "passed",
        },
      });
      getVersionFiles.mockResolvedValue([
        {
          path: "lib/secret.ts",
          content: "export const token = process.env.MY_SECRET_TOKEN;\n",
        },
      ]);

      const req = new Request("http://localhost/api/v0/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: "chat_1", versionId: "ver_1" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(409);
      const json = (await res.json()) as {
        code?: string;
        buildBlockingKeys?: string[];
        deployReadiness?: { missingEnv: string[] };
      };
      expect(json.code).toBe("DEPLOY_MISSING_ENV");
      expect(json.buildBlockingKeys).toContain("MY_SECRET_TOKEN");
      // A hard env block must not charge credits or hit Vercel.
      expect(commit).not.toHaveBeenCalled();
      expect(createVercelDeployment).not.toHaveBeenCalled();
    });

    it("does NOT block an F2 (design) deploy on a placeholder-covered build key (env-flow-f2-mute)", async () => {
      mockHappyDeployInfra();
      // F2-regression (bugbot high på #461): i design-stadiet ligger en
      // tier-3-placeholder-täckt build-nyckel (Stripe) i `buildBlockingKeys`
      // (allowPlaceholdersInF3 är alltid false där) men INTE i
      // `missingEnvKeys`. F2-gaten måste därför fortsätta blocka på
      // `missingEnvKeys` — demo-sajter med infoskylt ska förbli publicerbara.
      getEngineVersionForChatByIdForRequest.mockResolvedValue({
        chat: { id: "chat_1", project_id: "proj_1" },
        version: {
          id: "ver_1",
          chat_id: "chat_1",
          lifecycle_stage: "design",
          verification_state: "pending",
        },
      });
      getVersionFiles.mockResolvedValue([
        {
          path: "lib/pay.ts",
          content:
            'import Stripe from "stripe";\nexport const x = new Stripe(process.env.STRIPE_SECRET_KEY!);\n',
        },
      ]);

      const req = new Request("http://localhost/api/v0/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: "chat_1", versionId: "ver_1" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(createVercelDeployment).toHaveBeenCalledTimes(1);
    });
  });

  // BB#deploy2 (granska-svärmen på #469): den initiala statusskrivningen efter
  // createVercelDeployment kan VINNA den atomiska övergången till `error` (vid
  // synkront Vercel-ERROR i create-svaret). Då måste POST-vägen äga loggen —
  // annars ser webhook/poll transitionedToError=false och build-felet loggas
  // aldrig någonstans.
  it("loggar deploy-felet (source refresh) när POST:ens initiala statusskrivning vinner error-övergången", async () => {
    const commit = vi.fn(async () => undefined);
    const refund = vi.fn(async () => undefined);
    prepareCredits.mockImplementation(async () => ({ ok: true, commit, refund }));
    createDeploymentRecord.mockResolvedValue("dep_err");
    createVercelDeployment.mockResolvedValue({
      vercelDeploymentId: "dpl_err",
      vercelProjectId: "vp_1",
      url: "https://example.vercel.app",
      inspectorUrl: "https://vercel.com/i/dpl_err",
      readyState: "ERROR",
    });
    const vercelDeployMocks = await import("@/lib/vercelDeploy");
    vi.mocked(vercelDeployMocks.mapVercelReadyStateToStatus).mockReturnValueOnce({
      status: "error",
    } as ReturnType<typeof vercelDeployMocks.mapVercelReadyStateToStatus>);
    updateDeploymentStatus.mockResolvedValue({ transitionedToError: true });

    const req = new Request("http://localhost/api/v0/deployments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: "chat_1", versionId: "ver_1" }),
    });

    await POST(req);

    expect(logDeployError).toHaveBeenCalledTimes(1);
    expect(logDeployError).toHaveBeenCalledWith(
      expect.objectContaining({
        deploymentId: "dep_err",
        vercelDeploymentId: "dpl_err",
        source: "refresh",
      }),
    );
  });
});
