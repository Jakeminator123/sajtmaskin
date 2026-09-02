import { beforeEach, describe, expect, it, vi } from "vitest";

// M#818-2: shared F3 env-readiness gate. `/finalize-design` and the stream
// route (`meta.lifecycleStage: "integrations"`) must reach the SAME decision
// from the same version files + stored project env vars.

const getVersionFiles = vi.hoisted(() => vi.fn());
const detectIntegrationsFromVersionFiles = vi.hoisted(() => vi.fn());
const getStoredProjectEnvVarMap = vi.hoisted(() => vi.fn());
const loadPlaceholderKeySet = vi.hoisted(() => vi.fn());
const getLatestEngineVersionErrorLogForCategory = vi.hoisted(() => vi.fn());
const getVersionById = vi.hoisted(() => vi.fn());

vi.mock("@/lib/gen/version-manager", () => ({ getVersionFiles }));
vi.mock("@/lib/db/chat-repository-pg", () => ({ getVersionById }));
vi.mock("@/lib/gen/detect-integrations", () => ({ detectIntegrationsFromVersionFiles }));
vi.mock("@/lib/projects/project-env-vars", () => ({
  getStoredProjectEnvVarMap,
}));
// Bara `loadPlaceholderKeySet` behöver stubbas. Resten av modulen kommer från
// originalet, annars faller sviten så fort någon annan del av importkedjan
// börjar läsa en konstant härifrån (t.ex. `PIPELINE_ENV_LOCAL_MARKER` via
// export-scaffoldet) — ett fel i mocken, inte i koden som testas.
vi.mock("@/lib/gen/preview/env-local", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/gen/preview/env-local")>()),
  loadPlaceholderKeySet,
}));
vi.mock("@/lib/db/services/version-errors", () => ({
  getLatestEngineVersionErrorLogForCategory,
}));

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

beforeEach(() => {
  vi.clearAllMocks();
  getVersionFiles.mockResolvedValue([
    { path: "app/checkout/route.ts", content: "import Stripe from 'stripe';" },
  ]);
  detectIntegrationsFromVersionFiles.mockReturnValue(stripeDetection);
  getStoredProjectEnvVarMap.mockResolvedValue({});
  loadPlaceholderKeySet.mockReturnValue(new Set<string>());
  getLatestEngineVersionErrorLogForCategory.mockResolvedValue({
    category: "product_postcheck.summary",
    meta: { verdict: "passed", productBlocked: false },
  });
  getVersionById.mockResolvedValue({ id: "ver_f2", chat_id: "chat_1" });
});

describe("checkTier3ReadinessForVersion (M#818-2)", () => {
  it("blocks with version_files_unavailable when files cannot be read (G#21)", async () => {
    getVersionFiles.mockResolvedValue([]);
    const result = await checkTier3ReadinessForVersion({
      versionId: "ver_1",
      orchestrationSnapshot: null,
      projectId: "proj_1",
    });
    expect(result).toEqual({
      ready: false,
      ok: false,
      reason: "version_files_unavailable",
      retryable: true,
    });
  });

  it("blocks with missing_env when a required real key is absent AND has no placeholder", async () => {
    detectIntegrationsFromVersionFiles.mockReturnValue(clerkDetection);
    const result = await checkTier3ReadinessForVersion({
      versionId: "ver_1",
      orchestrationSnapshot: null,
      projectId: "proj_1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "missing_env") {
      expect(result.readiness.missingByIntegration).toEqual([
        expect.objectContaining({
          missing: ["CLERK_SECRET_KEY", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"],
        }),
      ]);
    } else {
      throw new Error(`expected missing_env, got ${JSON.stringify(result)}`);
    }
  });

  it("passes on a placeholder-covered build key (placeholders alltid tillåtna, 2026-07-22)", async () => {
    detectIntegrationsFromVersionFiles.mockReturnValue(clerkDetection);
    loadPlaceholderKeySet.mockReturnValue(
      new Set(["CLERK_SECRET_KEY", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"]),
    );
    const result = await checkTier3ReadinessForVersion({
      versionId: "ver_1",
      orchestrationSnapshot: null,
      projectId: "proj_1",
    });
    expect(result.ok).toBe(true);
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
    detectIntegrationsFromVersionFiles.mockReturnValue(clerkDetection);
    getStoredProjectEnvVarMap.mockResolvedValue({
      CLERK_SECRET_KEY: "sk_test_real",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_real",
    });
    const result = await checkTier3ReadinessForVersion({
      versionId: "ver_1",
      orchestrationSnapshot: null,
      projectId: "proj_1",
    });
    expect(result.ok).toBe(true);
  });

  it("keeps exact Stripe feature-runtime enforcement non-blocking", async () => {
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
    getLatestEngineVersionErrorLogForCategory.mockResolvedValue({
      category: "product_postcheck.summary",
      meta: { productBlocked: true },
    });
    const result = await checkTier3ReadinessForVersion({
      versionId: "ver_1",
      orchestrationSnapshot: null,
      projectId: "proj_1",
    });
    expect(result).toEqual({
      ready: false,
      ok: false,
      reason: "product_postcheck_blocked",
      verdict: "blocked",
      retryable: false,
    });
    // The block fires before any spec derivation.
    expect(getVersionFiles).not.toHaveBeenCalled();
  });

  it("can inherit Product Postcheck from an exact-file F2 parent", async () => {
    getLatestEngineVersionErrorLogForCategory.mockResolvedValue({
      category: "product_postcheck.summary",
      meta: { productBlocked: true },
    });

    const result = await checkTier3ReadinessForVersion({
      versionId: "ver_f3_exact",
      productPostcheckVersionId: "ver_f2_parent",
      orchestrationSnapshot: null,
      projectId: "proj_1",
    });

    expect(result).toEqual({
      ready: false,
      ok: false,
      reason: "product_postcheck_blocked",
      verdict: "blocked",
      retryable: false,
    });
    // Category-scoped read (Codex P2 #353): exact query, no 200-row window
    // that per-warning postcheck rows could crowd the summary out of.
    expect(getLatestEngineVersionErrorLogForCategory).toHaveBeenCalledWith(
      "ver_f2_parent",
      "product_postcheck.summary",
    );
    expect(getVersionFiles).not.toHaveBeenCalled();
  });

  it("lets a later passing summary unblock (newest row wins)", async () => {
    // The category-scoped service query returns the NEWEST summary row only
    // (ORDER BY created_at DESC LIMIT 1) — an older blocking row is invisible.
    getLatestEngineVersionErrorLogForCategory.mockResolvedValue({
      category: "product_postcheck.summary",
      meta: { productBlocked: false, verdict: "passed" },
    });
    detectIntegrationsFromVersionFiles.mockReturnValue([]);
    const unblocked = await checkTier3ReadinessForVersion({
      versionId: "ver_1",
      orchestrationSnapshot: null,
      projectId: null,
    });
    expect(unblocked.ok).toBe(true);
  });

  it("(a) saknad summary blockerar F3 som pending — aldrig pass", async () => {
    getLatestEngineVersionErrorLogForCategory.mockResolvedValue(null);
    const result = await checkTier3ReadinessForVersion({
      versionId: "ver_1",
      orchestrationSnapshot: null,
      projectId: "proj_1",
    });
    expect(result).toEqual({
      ready: false,
      ok: false,
      reason: "product_postcheck_pending",
      verdict: "pending",
      retryable: true,
    });
    expect(getVersionFiles).not.toHaveBeenCalled();
  });

  it("(b) DB-fel vid läsning är indeterminate och blockerar F3", async () => {
    getLatestEngineVersionErrorLogForCategory.mockRejectedValue(new Error("db down"));
    const result = await checkTier3ReadinessForVersion({
      versionId: "ver_1",
      orchestrationSnapshot: null,
      projectId: null,
    });
    expect(result).toEqual({
      ready: false,
      ok: false,
      reason: "product_postcheck_indeterminate",
      verdict: "indeterminate",
      retryable: true,
    });
  });

  it("(e) passed persisterad släpper F3", async () => {
    getLatestEngineVersionErrorLogForCategory.mockResolvedValue({
      category: "product_postcheck.summary",
      meta: { verdict: "passed", productBlocked: false },
    });
    detectIntegrationsFromVersionFiles.mockReturnValue([]);
    const result = await checkTier3ReadinessForVersion({
      versionId: "ver_1",
      orchestrationSnapshot: null,
      projectId: null,
    });
    expect(result.ok).toBe(true);
  });

  it("(g) superseded är retrybar och släpper inte F3", async () => {
    getLatestEngineVersionErrorLogForCategory.mockResolvedValue({
      category: "product_postcheck.summary",
      meta: { verdict: "superseded" },
    });
    const result = await checkTier3ReadinessForVersion({
      versionId: "ver_1",
      orchestrationSnapshot: null,
      projectId: "proj_1",
    });
    expect(result).toEqual({
      ready: false,
      ok: false,
      reason: "product_postcheck_superseded",
      verdict: "superseded",
      retryable: true,
    });
    expect(getVersionFiles).not.toHaveBeenCalled();
  });
});
