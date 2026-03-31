import { beforeEach, describe, expect, it, vi } from "vitest";

const getVersionById = vi.hoisted(() => vi.fn());
const getChat = vi.hoisted(() => vi.fn());
const getVersionFiles = vi.hoisted(() => vi.fn());
const getProjectByIdForRequest = vi.hoisted(() => vi.fn());
const getStoredProjectEnvVarMap = vi.hoisted(() => vi.fn());

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
  prepareCredits: vi.fn(() => {
    throw new Error("prepareCredits should not run for precheckOnly tests");
  }),
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

  it("precheckOnly surfaces missing env when version implies Stripe and project env empty", async () => {
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
      deployReadiness?: { ready: boolean; missingEnv: string[] };
    };
    expect(json.deployReadiness?.ready).toBe(false);
    expect(json.deployReadiness?.missingEnv).toContain("STRIPE_SECRET_KEY");
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
});
