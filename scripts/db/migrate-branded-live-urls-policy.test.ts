import { afterEach, expect, it, vi } from "vitest";
import {
  assertBrandedLiveUrlMigrationMode,
  brandedMigrationBindState,
  parseBrandedLiveUrlMigrationArgs,
  planBrandedMigrationRollback,
  resolveBrandedLiveUrlMigrationPolicy,
  resolveBrandedMigrationPrimaryAddress,
  selectBrandedMigrationDeployment,
  shouldProcessBrandedMigrationProject,
} from "./migrate-branded-live-urls-policy";

afterEach(() => vi.unstubAllEnvs());

it("keeps apply closed until A4 can prove the immutable deployed artifact", () => {
  expect(() => assertBrandedLiveUrlMigrationMode(["--apply"])).toThrow(
    /disabled until A4 verifies the immutable provider deployment artifact/,
  );
  expect(() => assertBrandedLiveUrlMigrationMode(["--limit=10"])).not.toThrow();
});

it("parses explicit project selection and treats --limit alone as an unbounded scan", () => {
  expect(parseBrandedLiveUrlMigrationArgs(["--limit=10"])).toMatchObject({
    apply: false,
    limit: 10,
    onlyProjectId: null,
    attestedProductionDeploymentId: null,
    unboundedScan: true,
  });
  expect(
    parseBrandedLiveUrlMigrationArgs([
      "--project-id=proj_1",
      "--production-deployment-id=dpl_prod",
      "--limit=3",
    ]),
  ).toMatchObject({
    onlyProjectId: "proj_1",
    attestedProductionDeploymentId: "dpl_prod",
    limit: 3,
    unboundedScan: false,
  });
  expect(shouldProcessBrandedMigrationProject("proj_1", "proj_1")).toBe(true);
  expect(shouldProcessBrandedMigrationProject("proj_2", "proj_1")).toBe(false);
  expect(shouldProcessBrandedMigrationProject("proj_2", null)).toBe(true);
});

it("migrates only the exact reviewed revision and denies auth signals", () => {
  vi.stubEnv("SAJTMASKIN_BRANDED_LIVE_URLS", "true");
  vi.stubEnv(
    "SAJTMASKIN_BRANDED_PILOT_ALLOWLIST",
    JSON.stringify([
      { projectId: "project_1", versionId: "version_1", filesRevision: "revision_1" },
    ]),
  );

  expect(
    resolveBrandedLiveUrlMigrationPolicy({
      projectId: "project_1",
      versionId: "version_1",
      filesRevision: "revision_1",
      selectedDossiers: [],
    }),
  ).toMatchObject({ allowed: true, reason: "eligible" });
  expect(
    resolveBrandedLiveUrlMigrationPolicy({
      projectId: "project_1",
      versionId: "version_1",
      filesRevision: "revision_after_edit",
      selectedDossiers: [],
    }),
  ).toMatchObject({ allowed: false, reason: "version_content_changed" });
  expect(
    resolveBrandedLiveUrlMigrationPolicy({
      projectId: "project_1",
      versionId: "version_1",
      filesRevision: "revision_1",
      snapshot: { requestedCapabilities: ["auth"] },
      selectedDossiers: [],
    }),
  ).toMatchObject({ allowed: false, reason: "auth_capability" });
});

it("does not select the newest READY when production identity is missing or other-project", () => {
  const latestReady = {
    versionId: "ver_new",
    vercelProjectId: "vp_1",
    vercelDeploymentId: "dpl_new",
  };
  const production = {
    versionId: "ver_prod",
    vercelProjectId: "vp_1",
    vercelDeploymentId: "dpl_prod",
  };

  expect(
    selectBrandedMigrationDeployment({
      rows: [latestReady, production],
      attestedProductionDeploymentId: null,
    }),
  ).toMatchObject({ status: "unknown", reason: "production_identity_unknown", row: null });
  expect(
    selectBrandedMigrationDeployment({
      rows: [latestReady, production],
      attestedProductionDeploymentId: "dpl_missing",
    }),
  ).toMatchObject({ status: "unknown", row: null });
  expect(
    selectBrandedMigrationDeployment({
      rows: [latestReady, production],
      attestedProductionDeploymentId: "dpl_prod",
      attestedVercelProjectId: "vp_1",
    }),
  ).toMatchObject({
    status: "selected",
    row: { versionId: "ver_prod", vercelDeploymentId: "dpl_prod" },
  });
  expect(
    selectBrandedMigrationDeployment({
      rows: [{ ...production, vercelProjectId: "vp_other" }],
      attestedProductionDeploymentId: "dpl_prod",
      attestedVercelProjectId: "vp_1",
    }),
  ).toMatchObject({ status: "unknown", row: null });
});

it("lets a verified custom domain win and treats a matching bind as idempotent", () => {
  expect(
    resolveBrandedMigrationPrimaryAddress({
      verifiedCustomDomain: "www.kund.se",
      brandedCandidate: "demo.sites.sajtmaskin.se",
    }),
  ).toEqual({ kind: "custom", host: "www.kund.se" });
  expect(
    resolveBrandedMigrationPrimaryAddress({
      verifiedCustomDomain: null,
      brandedCandidate: "demo.sites.sajtmaskin.se",
    }),
  ).toEqual({ kind: "branded", host: "demo.sites.sajtmaskin.se" });
  expect(
    brandedMigrationBindState({
      desiredHost: "demo.sites.sajtmaskin.se",
      boundHost: "demo.sites.sajtmaskin.se",
      boundVerified: true,
    }),
  ).toBe("idempotent");
  expect(
    brandedMigrationBindState({
      desiredHost: "demo.sites.sajtmaskin.se",
      boundHost: null,
      boundVerified: false,
    }),
  ).toBe("needs_bind");
  expect(
    brandedMigrationBindState({
      desiredHost: "demo.sites.sajtmaskin.se",
      boundHost: "old.sites.sajtmaskin.se",
      boundVerified: true,
    }),
  ).toBe("needs_rebind");
});

it("plans rollback that keeps a verified custom host and never deletes it first", () => {
  expect(
    planBrandedMigrationRollback({
      verifiedCustomDomain: "www.kund.se",
      brandedHost: "demo.sites.sajtmaskin.se",
    }),
  ).toMatchObject({
    primaryAfterRollback: "custom",
    keepHost: "www.kund.se",
    dropBrandedAlias: "demo.sites.sajtmaskin.se",
  });
  expect(
    planBrandedMigrationRollback({
      verifiedCustomDomain: null,
      brandedHost: "demo.sites.sajtmaskin.se",
    }),
  ).toMatchObject({
    primaryAfterRollback: "provider",
    dropBrandedAlias: "demo.sites.sajtmaskin.se",
  });
});
