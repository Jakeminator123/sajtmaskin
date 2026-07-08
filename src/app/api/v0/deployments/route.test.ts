import { beforeEach, describe, expect, it, vi } from "vitest";

const getVersionById = vi.hoisted(() => vi.fn());
const getChat = vi.hoisted(() => vi.fn());
const getVersionFiles = vi.hoisted(() => vi.fn());
const getProjectByIdForRequest = vi.hoisted(() => vi.fn());
const getStoredProjectEnvVarMap = vi.hoisted(() => vi.fn());
const prepareCredits = vi.hoisted(() => vi.fn());
const createDeploymentRecord = vi.hoisted(() => vi.fn());
const updateDeploymentStatus = vi.hoisted(() => vi.fn());
const createVercelDeployment = vi.hoisted(() => vi.fn());

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
  syncEnvVarsToVercelProject: vi.fn(async () => ({ errors: [] })),
  toVercelFilesFromTextFiles: (files: Array<{ name: string; content: string }>) => files,
}));

vi.mock("@/lib/db/chat-repository-pg", () => ({
  getVersionById,
  getChat,
}));

vi.mock("@/lib/gen/version-manager", () => ({
  getVersionFiles,
}));

vi.mock("@/lib/tenant", () => ({
  getProjectByIdForRequest,
  getChatByIdForRequest: vi.fn(),
  getChatByV0ChatIdForRequest: vi.fn(),
}));

vi.mock("@/lib/project-env-vars", () => ({
  getStoredProjectEnvVarMap,
}));

const { POST } = await import("./route");

describe("POST /api/v0/deployments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prepareCredits.mockImplementation(() => {
      throw new Error("prepareCredits should not run for precheckOnly tests");
    });
    getStoredProjectEnvVarMap.mockResolvedValue({});
    getProjectByIdForRequest.mockResolvedValue({ id: "proj_1" });
    getVersionById.mockResolvedValue({
      id: "ver_1",
      chat_id: "chat_1",
    });
    getChat.mockResolvedValue({
      id: "chat_1",
      project_id: "proj_1",
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
