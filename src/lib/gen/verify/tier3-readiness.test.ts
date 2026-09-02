import { beforeEach, describe, expect, it, vi } from "vitest";

const getVersionFiles = vi.hoisted(() => vi.fn());
const detectIntegrationsFromVersionFiles = vi.hoisted(() => vi.fn());
const getStoredProjectEnvVarMap = vi.hoisted(() => vi.fn());
const loadPlaceholderKeySet = vi.hoisted(() => vi.fn());
const getLatestEngineVersionErrorLogForCategory = vi.hoisted(() => vi.fn());
const getVersionById = vi.hoisted(() => vi.fn());

vi.mock("@/lib/gen/version-manager", () => ({ getVersionFiles }));
vi.mock("@/lib/gen/detect-integrations", () => ({ detectIntegrationsFromVersionFiles }));
vi.mock("@/lib/projects/project-env-vars", () => ({
  getStoredProjectEnvVarMap,
}));
vi.mock("@/lib/gen/preview/env-local", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/gen/preview/env-local")>()),
  loadPlaceholderKeySet,
}));
vi.mock("@/lib/db/services/version-errors", () => ({
  getLatestEngineVersionErrorLogForCategory,
}));
vi.mock("@/lib/db/chat-repository-pg", () => ({ getVersionById }));

import {
  checkTier3ReadinessForVersion,
  serverOwnedF3ReadinessParams,
} from "./tier3-readiness";
import type { ProductPostcheckPreviewProbe } from "./product-postcheck-preview-wait";

const clerkDetection = [
  {
    key: "clerk",
    provider: "clerk",
    name: "Clerk",
    intent: "auth",
    envVars: ["CLERK_SECRET_KEY", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"],
    envEnforcement: {
      CLERK_SECRET_KEY: "build",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "build",
    },
  },
];

function readyPreview(versionId = "ver_f3", filesRevision = "rev_f3"): ProductPostcheckPreviewProbe {
  return {
    running: true,
    versionId,
    filesRevision,
    previewSessionId: "ps_1",
    lifecycleToken: "life_1",
    mutationRevision: 2,
    previewUrl: "http://127.0.0.1/",
    readinessState: "ready",
    httpReady: true,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getVersionFiles.mockResolvedValue([
    { path: "app/page.tsx", content: "export default function Page(){}" },
  ]);
  detectIntegrationsFromVersionFiles.mockReturnValue([]);
  getStoredProjectEnvVarMap.mockResolvedValue({});
  loadPlaceholderKeySet.mockReturnValue(new Set<string>());
  getLatestEngineVersionErrorLogForCategory.mockResolvedValue({
    category: "product_postcheck.summary",
    meta: { verdict: "passed", productBlocked: false },
  });
  getVersionById.mockResolvedValue({ id: "ver_f2", chat_id: "chat_1" });
});

describe("checkTier3ReadinessForVersion (L1)", () => {
  it("saknad F2-parent är never ready", async () => {
    const result = await checkTier3ReadinessForVersion({
      versionId: "ver_f3",
      chatId: "chat_1",
      parentVersionId: null,
      requireF2Parent: true,
      orchestrationSnapshot: null,
      projectId: "proj_1",
    });
    expect(result).toEqual({
      ready: false,
      ok: false,
      reason: "f3_parent_version_missing",
      retryable: false,
    });
    expect(getLatestEngineVersionErrorLogForCategory).not.toHaveBeenCalled();
  });

  it("DB-fel vid parent-läsning är readiness_unavailable + retry", async () => {
    getVersionById.mockRejectedValue(new Error("db down"));
    const result = await checkTier3ReadinessForVersion({
      versionId: "ver_f3",
      chatId: "chat_1",
      parentVersionId: "ver_f2",
      requireF2Parent: true,
      orchestrationSnapshot: null,
      projectId: "proj_1",
    });
    expect(result).toEqual({
      ready: false,
      ok: false,
      reason: "readiness_unavailable",
      retryable: true,
    });
  });

  it("pending/indeterminate postcheck-dom släpper inte och är retrybar", async () => {
    getLatestEngineVersionErrorLogForCategory.mockResolvedValue(null);
    const pending = await checkTier3ReadinessForVersion({
      versionId: "ver_1",
      orchestrationSnapshot: null,
      projectId: "proj_1",
    });
    expect(pending).toMatchObject({
      ready: false,
      reason: "product_postcheck_pending",
      verdict: "pending",
      retryable: true,
    });

    getLatestEngineVersionErrorLogForCategory.mockRejectedValue(new Error("db down"));
    const indeterminate = await checkTier3ReadinessForVersion({
      versionId: "ver_1",
      orchestrationSnapshot: null,
      projectId: "proj_1",
    });
    expect(indeterminate).toMatchObject({
      ready: false,
      reason: "product_postcheck_indeterminate",
      verdict: "indeterminate",
      retryable: true,
    });
  });

  it("DB-fel i env-läsning är never ready + retry", async () => {
    detectIntegrationsFromVersionFiles.mockReturnValue(clerkDetection);
    getStoredProjectEnvVarMap.mockRejectedValue(new Error("env db down"));
    const result = await checkTier3ReadinessForVersion({
      versionId: "ver_1",
      orchestrationSnapshot: null,
      projectId: "proj_1",
    });
    expect(result).toEqual({
      ready: false,
      ok: false,
      reason: "readiness_unavailable",
      retryable: true,
    });
  });

  it("L7: passed + ofullständig preview-tupel släpper inte", async () => {
    const result = await checkTier3ReadinessForVersion({
      versionId: "ver_f3",
      filesRevision: "rev_f3",
      previewIdentity: {
        ...readyPreview(),
        readinessState: "starting",
        httpReady: false,
      },
      orchestrationSnapshot: null,
      projectId: null,
    });
    expect(result).toEqual({
      ready: false,
      ok: false,
      reason: "preview_not_ready",
      retryable: true,
    });
  });

  it("(f) passed + ready L7-preview + env ok → ready", async () => {
    const result = await checkTier3ReadinessForVersion({
      versionId: "ver_f3",
      filesRevision: "rev_f3",
      previewIdentity: readyPreview(),
      orchestrationSnapshot: null,
      projectId: null,
    });
    expect(result.ready).toBe(true);
    expect(result.ok).toBe(true);
  });

  it("(g) route och server-verify ger identiskt svar för samma input", async () => {
    const shared = {
      versionId: "ver_f3",
      chatId: "chat_1",
      parentVersionId: "ver_f2",
      filesRevision: "rev_f3",
      preloadedFiles: [
        { path: "app/page.tsx", content: "export default function Page(){}", language: "tsx" },
      ],
      orchestrationSnapshot: { selectedDossierIds: ["clerk-auth"] },
      projectId: "proj_1",
    };
    const routeParams = serverOwnedF3ReadinessParams(shared);
    const serverParams = serverOwnedF3ReadinessParams(shared);
    expect(routeParams).toEqual(serverParams);

    const [routeResult, serverResult] = await Promise.all([
      checkTier3ReadinessForVersion(routeParams),
      checkTier3ReadinessForVersion(serverParams),
    ]);
    expect(routeResult).toEqual(serverResult);
    expect(routeResult.ready).toBe(true);
  });

  it("allowed_skip kräver inte live preview-tupel", async () => {
    getLatestEngineVersionErrorLogForCategory.mockResolvedValue({
      category: "product_postcheck.summary",
      meta: { verdict: "allowed_skip" },
    });
    const result = await checkTier3ReadinessForVersion({
      versionId: "ver_f3",
      filesRevision: "rev_f3",
      previewIdentity: {
        ...readyPreview(),
        running: false,
        readinessState: "starting",
        httpReady: false,
      },
      orchestrationSnapshot: null,
      projectId: null,
    });
    expect(result.ready).toBe(true);
  });
});
