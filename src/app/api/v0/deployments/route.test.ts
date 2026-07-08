import { beforeEach, describe, expect, it, vi } from "vitest";

const getEngineVersionForChatByIdForRequest = vi.hoisted(() => vi.fn());
const getVersionFiles = vi.hoisted(() => vi.fn());
const getAppProjectByIdForRequest = vi.hoisted(() => vi.fn());
const getStoredProjectEnvVarMap = vi.hoisted(() => vi.fn());
const readAllowPlaceholdersInF3 = vi.hoisted(() => vi.fn());
const prepareCredits = vi.hoisted(() => vi.fn());
const createDeploymentRecord = vi.hoisted(() => vi.fn());
const updateDeploymentStatus = vi.hoisted(() => vi.fn());
const createVercelDeployment = vi.hoisted(() => vi.fn());
const syncEnvVarsToVercelProject = vi.hoisted(() =>
  vi.fn(async () => ({ synced: 0, errors: [] as string[] })),
);

vi.mock("@/lib/db/client", () => ({
  db: {},
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
}));

vi.mock("@/lib/vercelDeploy", () => ({
  createVercelDeployment,
  getVercelDeployment: vi.fn(),
  mapVercelReadyStateToStatus: vi.fn(() => ({ status: "ready" })),
  sanitizeVercelProjectName: (name: string) => name,
  syncEnvVarsToVercelProject,
  toVercelFilesFromTextFiles: (files: Array<{ name: string; content: string }>) => files,
}));

vi.mock("@/lib/gen/version-manager", () => ({
  getVersionFiles,
}));

vi.mock("@/lib/tenant", () => ({
  getAppProjectByIdForRequest,
  getEngineVersionForChatByIdForRequest,
  getChatByIdForRequest: vi.fn(),
  getChatByV0ChatIdForRequest: vi.fn(),
  getEngineChatByIdForRequest: vi.fn(),
}));

vi.mock("@/lib/project-env-vars", () => ({
  getStoredProjectEnvVarMap,
  readAllowPlaceholdersInF3,
}));

const { POST } = await import("./route");

describe("POST /api/v0/deployments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prepareCredits.mockImplementation(() => {
      throw new Error("prepareCredits should not run for precheckOnly tests");
    });
    getStoredProjectEnvVarMap.mockResolvedValue({});
    readAllowPlaceholdersInF3.mockResolvedValue(false);
    syncEnvVarsToVercelProject.mockResolvedValue({ synced: 0, errors: [] });
    getAppProjectByIdForRequest.mockResolvedValue({ id: "proj_1" });
    // Tenant-scoped resolver: version + owned engine chat resolve together.
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat_1", project_id: "proj_1" },
      version: { id: "ver_1", chat_id: "chat_1" },
    });
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

  // A#425 #4 (test gap): happy-path POST must insert the deployment row keyed by
  // the ENGINE ids after the legacy-FK drop, so a FK regression would be caught.
  it("creates the deployment record with the engine chat/version ids on a successful publish", async () => {
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
    updateDeploymentStatus.mockResolvedValue(undefined);

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
    updateDeploymentStatus.mockResolvedValue(undefined);
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
    updateDeploymentStatus.mockResolvedValue(undefined);
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
});
