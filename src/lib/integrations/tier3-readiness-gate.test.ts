import { beforeEach, describe, expect, it, vi } from "vitest";

// M#818-2: shared F3 env-readiness gate. `/finalize-design` and the stream
// route (`meta.lifecycleStage: "integrations"`) must reach the SAME decision
// from the same version files + stored project env vars.

const getVersionFiles = vi.hoisted(() => vi.fn());
const detectIntegrationsFromVersionFiles = vi.hoisted(() => vi.fn());
const getStoredProjectEnvVarMap = vi.hoisted(() => vi.fn());
const readAllowPlaceholdersInF3 = vi.hoisted(() => vi.fn());
const loadPlaceholderKeySet = vi.hoisted(() => vi.fn());
const getLatestEngineVersionErrorLogs = vi.hoisted(() => vi.fn());

vi.mock("@/lib/gen/version-manager", () => ({ getVersionFiles }));
vi.mock("@/lib/gen/detect-integrations", () => ({ detectIntegrationsFromVersionFiles }));
vi.mock("@/lib/project-env-vars", () => ({
  getStoredProjectEnvVarMap,
  readAllowPlaceholdersInF3,
}));
vi.mock("@/lib/gen/preview/env-local", () => ({ loadPlaceholderKeySet }));
vi.mock("@/lib/db/services/version-errors", () => ({ getLatestEngineVersionErrorLogs }));

import { checkTier3ReadinessForVersion } from "./tier3-readiness-gate";

const stripeDetection = [
  {
    key: "stripe",
    provider: "stripe",
    name: "Stripe",
    intent: "payments",
    envVars: ["STRIPE_SECRET_KEY"],
    envEnforcement: { STRIPE_SECRET_KEY: "build" },
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  getVersionFiles.mockResolvedValue([
    { path: "app/checkout/route.ts", content: "import Stripe from 'stripe';" },
  ]);
  detectIntegrationsFromVersionFiles.mockReturnValue(stripeDetection);
  getStoredProjectEnvVarMap.mockResolvedValue({});
  readAllowPlaceholdersInF3.mockResolvedValue(false);
  loadPlaceholderKeySet.mockReturnValue(new Set<string>());
  getLatestEngineVersionErrorLogs.mockResolvedValue([]);
});

describe("checkTier3ReadinessForVersion (M#818-2)", () => {
  it("blocks with version_files_unavailable when files cannot be read (G#21)", async () => {
    getVersionFiles.mockResolvedValue([]);
    const result = await checkTier3ReadinessForVersion({
      versionId: "ver_1",
      orchestrationSnapshot: null,
      projectId: "proj_1",
    });
    expect(result).toEqual({ ok: false, reason: "version_files_unavailable" });
  });

  it("blocks with missing_env when a required real key is absent", async () => {
    const result = await checkTier3ReadinessForVersion({
      versionId: "ver_1",
      orchestrationSnapshot: null,
      projectId: "proj_1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "missing_env") {
      expect(result.readiness.missingByIntegration).toEqual([
        expect.objectContaining({ missing: ["STRIPE_SECRET_KEY"] }),
      ]);
    } else {
      throw new Error(`expected missing_env, got ${JSON.stringify(result)}`);
    }
  });

  it("blocks on a pending approved clerk provider even when parent files have no clerk evidence (M#f3env1)", async () => {
    detectIntegrationsFromVersionFiles.mockReturnValue([]);
    const result = await checkTier3ReadinessForVersion({
      versionId: "ver_1",
      orchestrationSnapshot: null,
      projectId: "proj_1",
      pendingApprovedProviderKeys: ["clerk"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "missing_env") {
      expect(result.readiness.missingByIntegration).toEqual([
        expect.objectContaining({
          key: "clerk",
          missing: expect.arrayContaining([
            "CLERK_SECRET_KEY",
            "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
          ]),
        }),
      ]);
    } else {
      throw new Error(`expected missing_env from pending provider, got ${JSON.stringify(result)}`);
    }
  });

  it("keeps a pending dossierless provider (posthog) non-blocking (warn-only policy)", async () => {
    detectIntegrationsFromVersionFiles.mockReturnValue([]);
    const result = await checkTier3ReadinessForVersion({
      versionId: "ver_1",
      orchestrationSnapshot: null,
      projectId: "proj_1",
      pendingApprovedProviderKeys: ["posthog"],
    });
    expect(result.ok).toBe(true);
  });

  it("passes when the required key has a real stored value", async () => {
    getStoredProjectEnvVarMap.mockResolvedValue({ STRIPE_SECRET_KEY: "sk_test_real" });
    const result = await checkTier3ReadinessForVersion({
      versionId: "ver_1",
      orchestrationSnapshot: null,
      projectId: "proj_1",
    });
    expect(result.ok).toBe(true);
  });

  it("passes trivially when no integrations are detected", async () => {
    detectIntegrationsFromVersionFiles.mockReturnValue([]);
    const result = await checkTier3ReadinessForVersion({
      versionId: "ver_1",
      orchestrationSnapshot: null,
      projectId: null,
    });
    expect(result.ok).toBe(true);
    expect(getStoredProjectEnvVarMap).not.toHaveBeenCalled();
  });

  it("blocks with product_postcheck_blocked when the newest summary row is blocking (Codex P1 r5)", async () => {
    getLatestEngineVersionErrorLogs.mockResolvedValue([
      { category: "product_postcheck.summary", meta: { productBlocked: true } },
    ]);
    const result = await checkTier3ReadinessForVersion({
      versionId: "ver_1",
      orchestrationSnapshot: null,
      projectId: "proj_1",
    });
    expect(result).toEqual({ ok: false, reason: "product_postcheck_blocked" });
    // The block fires before any spec derivation.
    expect(getVersionFiles).not.toHaveBeenCalled();
  });

  it("can inherit Product Postcheck from an exact-file F2 parent", async () => {
    getLatestEngineVersionErrorLogs.mockResolvedValue([
      { category: "product_postcheck.summary", meta: { productBlocked: true } },
    ]);

    const result = await checkTier3ReadinessForVersion({
      versionId: "ver_f3_exact",
      productPostcheckVersionId: "ver_f2_parent",
      orchestrationSnapshot: null,
      projectId: "proj_1",
    });

    expect(result).toEqual({ ok: false, reason: "product_postcheck_blocked" });
    expect(getLatestEngineVersionErrorLogs).toHaveBeenCalledWith(
      "ver_f2_parent",
      200,
    );
    expect(getVersionFiles).not.toHaveBeenCalled();
  });

  it("lets a later passing summary unblock (newest row wins) and fails open on read errors", async () => {
    getLatestEngineVersionErrorLogs.mockResolvedValue([
      // Newest-first (ORDER BY created_at DESC in the service).
      { category: "product_postcheck.summary", meta: { productBlocked: false } },
      { category: "product_postcheck.summary", meta: { productBlocked: true } },
    ]);
    detectIntegrationsFromVersionFiles.mockReturnValue([]);
    const unblocked = await checkTier3ReadinessForVersion({
      versionId: "ver_1",
      orchestrationSnapshot: null,
      projectId: null,
    });
    expect(unblocked.ok).toBe(true);

    getLatestEngineVersionErrorLogs.mockRejectedValue(new Error("db down"));
    const failOpen = await checkTier3ReadinessForVersion({
      versionId: "ver_1",
      orchestrationSnapshot: null,
      projectId: null,
    });
    expect(failOpen.ok).toBe(true);
  });
});
