import { beforeEach, describe, expect, it, vi } from "vitest";

// M#818-2: shared F3 env-readiness gate. `/finalize-design` and the stream
// route (`meta.lifecycleStage: "integrations"`) must reach the SAME decision
// from the same version files + stored project env vars.

const getVersionFiles = vi.hoisted(() => vi.fn());
const detectIntegrationsFromVersionFiles = vi.hoisted(() => vi.fn());
const getStoredProjectEnvVarMap = vi.hoisted(() => vi.fn());
const readAllowPlaceholdersInF3 = vi.hoisted(() => vi.fn());
const loadPlaceholderKeySet = vi.hoisted(() => vi.fn());

vi.mock("@/lib/gen/version-manager", () => ({ getVersionFiles }));
vi.mock("@/lib/gen/detect-integrations", () => ({ detectIntegrationsFromVersionFiles }));
vi.mock("@/lib/project-env-vars", () => ({
  getStoredProjectEnvVarMap,
  readAllowPlaceholdersInF3,
}));
vi.mock("@/lib/gen/preview/env-local", () => ({ loadPlaceholderKeySet }));

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
});

describe("checkTier3ReadinessForVersion (M#818-2)", () => {
  it("blocks with version_files_unavailable when files cannot be read (G#21)", async () => {
    getVersionFiles.mockResolvedValue([]);
    const result = await checkTier3ReadinessForVersion({
      versionId: "ver_1",
      selectedDossiers: [],
      projectId: "proj_1",
    });
    expect(result).toEqual({ ok: false, reason: "version_files_unavailable" });
  });

  it("blocks with missing_env when a required real key is absent", async () => {
    const result = await checkTier3ReadinessForVersion({
      versionId: "ver_1",
      selectedDossiers: [],
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

  it("passes when the required key has a real stored value", async () => {
    getStoredProjectEnvVarMap.mockResolvedValue({ STRIPE_SECRET_KEY: "sk_test_real" });
    const result = await checkTier3ReadinessForVersion({
      versionId: "ver_1",
      selectedDossiers: [],
      projectId: "proj_1",
    });
    expect(result.ok).toBe(true);
  });

  it("passes trivially when no integrations are detected", async () => {
    detectIntegrationsFromVersionFiles.mockReturnValue([]);
    const result = await checkTier3ReadinessForVersion({
      versionId: "ver_1",
      selectedDossiers: [],
      projectId: null,
    });
    expect(result.ok).toBe(true);
    expect(getStoredProjectEnvVarMap).not.toHaveBeenCalled();
  });
});
