import { beforeEach, describe, expect, it, vi } from "vitest";

const getEngineVersionForChatByIdForRequest = vi.hoisted(() => vi.fn());
const runDeployBuildRepair = vi.hoisted(() => vi.fn());
const deploymentRows = vi.hoisted<{ rows: Array<Record<string, unknown>> }>(() => ({ rows: [] }));

vi.mock("@/lib/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => deploymentRows.rows,
        }),
      }),
    }),
  },
  dbConfigured: true,
}));

vi.mock("@/lib/db/schema", () => ({
  deployments: { id: "id", chatId: "chat_id", versionId: "version_id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: (_col: unknown, value: unknown) => value,
  sql: (strings: TemplateStringsArray) => ({
    op: "sql",
    text: strings?.join?.("") ?? "",
  }),
}));

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

vi.mock("@/lib/bot-protection", () => ({
  requireNotBot: () => null,
}));

vi.mock("@/lib/tenant", () => ({
  getEngineVersionForChatByIdForRequest,
}));

vi.mock("@/lib/deploy/deploy-repair", () => ({
  runDeployBuildRepair,
}));

const { POST } = await import("./route");
const {
  DEPLOY_REPAIR_ORIGIN,
  encodeRepairedFilesEnvelope,
} = await import("@/lib/db/repair-files-payload");

const REPAIR_BASE = '[{"path":"app/page.tsx","content":"A"}]';
const REPAIR_FILES = '[{"path":"app/page.tsx","content":"A-fixed"}]';

function stampedDeployRepair(deploymentId: string): string {
  return encodeRepairedFilesEnvelope({
    repairedFilesJson: REPAIR_FILES,
    baseFilesJson: REPAIR_BASE,
    provenance: { origin: DEPLOY_REPAIR_ORIGIN, deploymentId },
  });
}

function previewOnlyRepair(): string {
  return encodeRepairedFilesEnvelope({
    repairedFilesJson: REPAIR_FILES,
    baseFilesJson: REPAIR_BASE,
  });
}

function repairRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/v0/deployments/repair", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v0/deployments/repair", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: caller owns the version, which is NOT already repaired.
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat_1", project_id: "proj_1" },
      version: { id: "ver_1", chat_id: "chat_1", verification_state: "passed" },
    });
    // Default: a failed deployment belonging to this chat + version.
    deploymentRows.rows = [
      {
        id: "dep_1",
        chatId: "chat_1",
        versionId: "ver_1",
        status: "error",
        vercelDeploymentId: "dpl_1",
        inspectorUrl: null,
      },
    ];
    runDeployBuildRepair.mockResolvedValue({
      status: "repair_available",
      summary: "Server repair passed quality gate.",
      repairAvailableAt: "2026-07-08T00:00:00.000Z",
    });
  });

  it("runs the repair and returns repair_available (no redeploy, no promote)", async () => {
    const res = await POST(repairRequest({ chatId: "chat_1", versionId: "ver_1", deploymentId: "dep_1" }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { status?: string; summary?: string };
    expect(json.status).toBe("repair_available");

    // The repair path was taken exactly once, against the failed version's
    // files with the deployment's Vercel id for build-log context.
    expect(runDeployBuildRepair).toHaveBeenCalledTimes(1);
    expect(runDeployBuildRepair).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "chat_1",
        versionId: "ver_1",
        deploymentId: "dep_1",
        vercelDeploymentId: "dpl_1",
      }),
    );
    // The route never deploys/promotes — it only produces a repair_available
    // version (delegated to runDeployBuildRepair, which never redeploys).
  });

  it("repairs the DEPLOYMENT's version even when the client's active version drifted", async () => {
    // Efter en follow-up (eller reload-hydrering) kan klientens aktiva version
    // vara nyare än den som failade på Vercel. Repairen ska rikta versionen
    // från deployment-raden — ett klient-`versionId` ignoreras/strippas.
    const res = await POST(
      repairRequest({ chatId: "chat_1", versionId: "ver_NEWER", deploymentId: "dep_1" }),
    );
    expect(res.status).toBe(200);
    expect(getEngineVersionForChatByIdForRequest).toHaveBeenCalledWith(
      expect.anything(),
      "chat_1",
      "ver_1",
    );
    expect(runDeployBuildRepair).toHaveBeenCalledWith(
      expect.objectContaining({ versionId: "ver_1" }),
    );
  });

  it("is idempotent only when the pending repair is stamped for this deployment", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat_1", project_id: "proj_1" },
      version: {
        id: "ver_1",
        chat_id: "chat_1",
        verification_state: "repair_available",
        verification_summary: "Server repair passed quality gate.",
        repaired_files_json: stampedDeployRepair("dep_1"),
      },
    });

    const res = await POST(repairRequest({ chatId: "chat_1", versionId: "ver_1", deploymentId: "dep_1" }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { status?: string; alreadyAvailable?: boolean };
    expect(json.status).toBe("repair_available");
    expect(json.alreadyAvailable).toBe(true);
    expect(runDeployBuildRepair).not.toHaveBeenCalled();
  });

  it("does not treat version-global repair_available as proof for this deployment", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat_1", project_id: "proj_1" },
      version: {
        id: "ver_1",
        chat_id: "chat_1",
        verification_state: "repair_available",
        verification_summary: "Preview repair awaiting acceptance.",
        repaired_files_json: previewOnlyRepair(),
      },
    });

    const res = await POST(repairRequest({ chatId: "chat_1", versionId: "ver_1", deploymentId: "dep_1" }));
    expect(res.status).toBe(200);
    expect(runDeployBuildRepair).toHaveBeenCalledTimes(1);
    expect(runDeployBuildRepair).toHaveBeenCalledWith(
      expect.objectContaining({ deploymentId: "dep_1", versionId: "ver_1" }),
    );
    const json = (await res.json()) as { alreadyAvailable?: boolean };
    expect(json.alreadyAvailable).toBeUndefined();
  });

  it("reruns repair when an existing stamp belongs to a different failed deployment", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat_1", project_id: "proj_1" },
      version: {
        id: "ver_1",
        chat_id: "chat_1",
        verification_state: "repair_available",
        repaired_files_json: stampedDeployRepair("dep_OTHER"),
      },
    });

    const res = await POST(repairRequest({ chatId: "chat_1", versionId: "ver_1", deploymentId: "dep_1" }));
    expect(res.status).toBe(200);
    expect(runDeployBuildRepair).toHaveBeenCalledTimes(1);
  });

  it("returns 404 for a version/chat not owned by the requester (tenant guard)", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue(null);

    const res = await POST(
      repairRequest({ chatId: "foreign_chat", versionId: "foreign_ver", deploymentId: "dep_1" }),
    );
    expect(res.status).toBe(404);
    expect(runDeployBuildRepair).not.toHaveBeenCalled();
  });

  it("returns 404 when the deployment belongs to a different chat", async () => {
    deploymentRows.rows = [
      { id: "dep_1", chatId: "other_chat", versionId: "ver_1", status: "error" },
    ];

    const res = await POST(repairRequest({ chatId: "chat_1", versionId: "ver_1", deploymentId: "dep_1" }));
    expect(res.status).toBe(404);
    expect(runDeployBuildRepair).not.toHaveBeenCalled();
  });

  it("returns 404 when the deployment id does not exist", async () => {
    deploymentRows.rows = [];

    const res = await POST(repairRequest({ chatId: "chat_1", versionId: "ver_1", deploymentId: "missing" }));
    expect(res.status).toBe(404);
    expect(runDeployBuildRepair).not.toHaveBeenCalled();
  });

  it("returns 409 DEPLOY_NOT_FAILED when the deployment has not failed", async () => {
    deploymentRows.rows = [
      { id: "dep_1", chatId: "chat_1", versionId: "ver_1", status: "ready" },
    ];

    const res = await POST(repairRequest({ chatId: "chat_1", versionId: "ver_1", deploymentId: "dep_1" }));
    expect(res.status).toBe(409);
    const json = (await res.json()) as { code?: string };
    expect(json.code).toBe("DEPLOY_NOT_FAILED");
    expect(runDeployBuildRepair).not.toHaveBeenCalled();
  });

  it("maps a busy repair (concurrent run) to 409 REPAIR_IN_PROGRESS", async () => {
    runDeployBuildRepair.mockResolvedValue({ status: "repairing", skippedReason: "lease_busy" });

    const res = await POST(repairRequest({ chatId: "chat_1", versionId: "ver_1", deploymentId: "dep_1" }));
    expect(res.status).toBe(409);
    const json = (await res.json()) as { code?: string; status?: string };
    expect(json.code).toBe("REPAIR_IN_PROGRESS");
  });

  it("returns 400 on a missing deploymentId", async () => {
    const res = await POST(repairRequest({ chatId: "chat_1", versionId: "ver_1" }));
    expect(res.status).toBe(400);
    expect(runDeployBuildRepair).not.toHaveBeenCalled();
  });
});
