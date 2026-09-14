import {
  collectBrandedPilotCapabilitySignals,
  resolveBrandedPilotDeploymentEligibility,
} from "@/lib/branded-pilot-eligibility";

export function assertBrandedLiveUrlMigrationMode(argv: readonly string[]): void {
  if (argv.includes("--apply")) {
    throw new Error(
      "Branded migration apply is disabled until A4 verifies the immutable provider deployment artifact. Run without --apply for the eligibility inventory.",
    );
  }
}

/** Pure migration boundary: denied candidates must never reach provider/DB writes. */
export function resolveBrandedLiveUrlMigrationPolicy(params: {
  projectId: string;
  versionId: string;
  filesRevision: string | null;
  snapshot?: unknown;
  selectedDossiers?: ReadonlyArray<{ entry?: { capability?: unknown } }> | null;
}) {
  return resolveBrandedPilotDeploymentEligibility({
    projectId: params.projectId,
    versionId: params.versionId,
    filesRevision: params.filesRevision,
    capabilities: collectBrandedPilotCapabilitySignals({
      snapshot: params.snapshot,
      selectedDossiers: params.selectedDossiers,
    }),
  });
}
