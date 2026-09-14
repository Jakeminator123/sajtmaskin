import { afterEach, expect, it, vi } from "vitest";
import {
  assertBrandedLiveUrlMigrationMode,
  resolveBrandedLiveUrlMigrationPolicy,
} from "./migrate-branded-live-urls-policy";

afterEach(() => vi.unstubAllEnvs());

it("keeps apply closed until A4 can prove the immutable deployed artifact", () => {
  expect(() => assertBrandedLiveUrlMigrationMode(["--apply"])).toThrow(
    /disabled until A4 verifies the immutable provider deployment artifact/,
  );
  expect(() => assertBrandedLiveUrlMigrationMode(["--limit=10"])).not.toThrow();
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
