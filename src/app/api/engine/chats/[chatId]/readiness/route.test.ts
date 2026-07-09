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
const getEngineVersionErrorLogs = vi.hoisted(() => vi.fn());
const createEngineVersionErrorLogs = vi.hoisted(() => vi.fn());
const getVersionFiles = vi.hoisted(() => vi.fn());
const resolveProjectEnv = vi.hoisted(() => vi.fn());
const resolveEnvRequirementsFromVersionFiles = vi.hoisted(() => vi.fn());
const readAllowPlaceholdersInF3 = vi.hoisted(() => vi.fn());
const resolveSelectedDossiersFromSnapshot = vi.hoisted(() => vi.fn());
const settleStaleVerificationIfNeeded = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ db: {}, dbConfigured: false }));

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
});
