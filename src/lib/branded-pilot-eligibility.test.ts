import { afterEach, describe, expect, it, vi } from "vitest";
import {
  collectBrandedPilotCapabilitySignals,
  resolveBrandedPilotDeploymentEligibility,
  resolveBrandedPilotEligibility,
} from "./branded-pilot-eligibility";

afterEach(() => vi.unstubAllEnvs());

function enablePilot(
  entries: Array<{ projectId: string; versionId: string; filesRevision?: string }>,
) {
  vi.stubEnv("SAJTMASKIN_BRANDED_LIVE_URLS", "true");
  vi.stubEnv(
    "SAJTMASKIN_BRANDED_PILOT_ALLOWLIST",
    JSON.stringify(entries.map((entry) => ({ filesRevision: "rev_1", ...entry }))),
  );
}

describe("resolveBrandedPilotEligibility", () => {
  it("is off by default and rejects a missing or malformed allowlist", () => {
    expect(
      resolveBrandedPilotEligibility({ projectId: "project_1", versionId: "version_1" }),
    ).toMatchObject({ allowed: false, reason: "rollout_disabled" });

    vi.stubEnv("SAJTMASKIN_BRANDED_LIVE_URLS", "true");
    expect(
      resolveBrandedPilotEligibility({ projectId: "project_1", versionId: "version_1" }),
    ).toMatchObject({ allowed: false, reason: "allowlist_missing" });
    vi.stubEnv("SAJTMASKIN_BRANDED_PILOT_ALLOWLIST", "not-json");
    expect(
      resolveBrandedPilotEligibility({ projectId: "project_1", versionId: "version_1" }),
    ).toMatchObject({ allowed: false, reason: "allowlist_invalid" });
  });

  it("binds provider writes to the reviewed content revision even when the version id is reused", () => {
    enablePilot([{ projectId: "project_1", versionId: "version_1", filesRevision: "abc123" }]);

    expect(
      resolveBrandedPilotDeploymentEligibility({
        projectId: "project_1",
        versionId: "version_1",
        filesRevision: "abc123",
      }),
    ).toMatchObject({ allowed: true, reason: "eligible" });
    expect(
      resolveBrandedPilotDeploymentEligibility({
        projectId: "project_1",
        versionId: "version_1",
        filesRevision: "changed-after-review",
      }),
    ).toMatchObject({ allowed: false, reason: "version_content_changed" });
  });

  it("requires the exact project and reviewed version pair", () => {
    enablePilot([{ projectId: "project_1", versionId: "version_1" }]);

    expect(
      resolveBrandedPilotEligibility({ projectId: "project_1", versionId: "version_1" }),
    ).toEqual({ allowed: true, reason: "eligible", rejectedCapabilities: [] });
    expect(
      resolveBrandedPilotEligibility({ projectId: "project_1", versionId: "version_2" }),
    ).toMatchObject({ allowed: false, reason: "version_not_reviewed" });
    expect(
      resolveBrandedPilotEligibility({ projectId: "project_2", versionId: "version_1" }),
    ).toMatchObject({ allowed: false, reason: "version_not_reviewed" });
  });

  it("denies auth and every unknown or sensitive capability even for an allowlisted pair", () => {
    enablePilot([{ projectId: "project_1", versionId: "version_1" }]);

    expect(
      resolveBrandedPilotEligibility({
        projectId: "project_1",
        versionId: "version_1",
        capabilities: ["carousel", "auth"],
      }),
    ).toMatchObject({
      allowed: false,
      reason: "auth_capability",
      rejectedCapabilities: ["auth"],
    });
    expect(
      resolveBrandedPilotEligibility({
        projectId: "project_1",
        versionId: "version_1",
        capabilities: ["payments", "future-capability"],
      }),
    ).toMatchObject({
      allowed: false,
      reason: "capability_not_pilot_safe",
      rejectedCapabilities: ["future-capability", "payments"],
    });
  });
});

it("collects both raw unknown signals and file-detected dossier capabilities", () => {
  expect(
    collectBrandedPilotCapabilitySignals({
      snapshot: {
        requestedCapabilities: ["Carousel", "future-capability"],
        briefSummary: { requestedCapabilities: ["auth"] },
      },
      selectedDossiers: [{ entry: { capability: "supabase-auth" } }],
    }),
  ).toEqual(["auth", "carousel", "future-capability", "supabase-auth"]);
});
