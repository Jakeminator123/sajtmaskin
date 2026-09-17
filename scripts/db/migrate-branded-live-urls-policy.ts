import {
  collectBrandedPilotCapabilitySignals,
  resolveBrandedPilotArtifactReview,
} from "@/lib/branded-pilot-eligibility";

export function assertBrandedLiveUrlMigrationMode(argv: readonly string[]): void {
  if (argv.includes("--apply")) {
    throw new Error(
      "Branded migration apply is disabled until A4 verifies the immutable provider deployment artifact. Run without --apply for the eligibility inventory.",
    );
  }
}

export type BrandedMigrationCliArgs = {
  apply: boolean;
  limit: number;
  onlyProjectId: string | null;
  attestedProductionDeploymentId: string | null;
  unboundedScan: boolean;
};

function readArgValue(argv: readonly string[], prefix: string): string | null {
  const raw = argv.find((arg) => arg.startsWith(prefix));
  const value = raw?.slice(prefix.length).trim() || "";
  return value || null;
}

export function parseBrandedLiveUrlMigrationArgs(
  argv: readonly string[],
): BrandedMigrationCliArgs {
  const limitRaw = Number(readArgValue(argv, "--limit=") ?? 10);
  const onlyProjectId = readArgValue(argv, "--project-id=");
  return {
    apply: argv.includes("--apply"),
    limit: Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, limitRaw)) : 10,
    onlyProjectId,
    attestedProductionDeploymentId: readArgValue(argv, "--production-deployment-id="),
    unboundedScan: !onlyProjectId,
  };
}

export function shouldProcessBrandedMigrationProject(
  projectId: string,
  onlyProjectId: string | null,
): boolean {
  return !onlyProjectId || projectId === onlyProjectId;
}

/** Pure migration boundary: denied candidates must never reach provider/DB writes. */
export function resolveBrandedLiveUrlMigrationPolicy(params: {
  projectId: string;
  versionId: string;
  filesRevision: string | null;
  snapshot?: unknown;
  selectedDossiers?: ReadonlyArray<{ entry?: { capability?: unknown } }> | null;
}) {
  return resolveBrandedPilotArtifactReview({
    projectId: params.projectId,
    versionId: params.versionId,
    filesRevision: params.filesRevision,
    capabilities: collectBrandedPilotCapabilitySignals({
      snapshot: params.snapshot,
      selectedDossiers: params.selectedDossiers,
    }),
  });
}

export type BrandedMigrationDeploymentRow = {
  versionId?: string | null;
  vercelProjectId?: string | null;
  vercelDeploymentId?: string | null;
  chatId?: string | null;
};

/**
 * Same fail-closed rule as `selectLivePublishIdentity`: a READY row is never
 * enough. The attested Vercel production deployment must match exactly.
 */
export function selectBrandedMigrationDeployment(params: {
  rows: readonly BrandedMigrationDeploymentRow[];
  attestedProductionDeploymentId: string | null;
  attestedVercelProjectId?: string | null;
}): {
  status: "selected" | "unknown";
  reason: "production_identity_selected" | "production_identity_unknown";
  row: BrandedMigrationDeploymentRow | null;
} {
  const productionDeploymentId = params.attestedProductionDeploymentId?.trim() || null;
  if (!productionDeploymentId) {
    return { status: "unknown", reason: "production_identity_unknown", row: null };
  }
  const expectedProjectId = params.attestedVercelProjectId?.trim() || null;
  const row =
    params.rows.find((candidate) => {
      const rowDeploymentId = candidate.vercelDeploymentId?.trim() || null;
      if (!rowDeploymentId || rowDeploymentId !== productionDeploymentId) return false;
      const rowProjectId = candidate.vercelProjectId?.trim() || null;
      if (expectedProjectId && rowProjectId && rowProjectId !== expectedProjectId) {
        return false;
      }
      return true;
    }) ?? null;
  return row
    ? { status: "selected", reason: "production_identity_selected", row }
    : { status: "unknown", reason: "production_identity_unknown", row: null };
}

export function resolveBrandedMigrationPrimaryAddress(params: {
  verifiedCustomDomain: string | null;
  brandedCandidate: string | null;
}): { kind: "custom" | "branded" | "none"; host: string | null } {
  const custom = params.verifiedCustomDomain?.trim() || null;
  if (custom) return { kind: "custom", host: custom };
  const branded = params.brandedCandidate?.trim() || null;
  if (branded) return { kind: "branded", host: branded };
  return { kind: "none", host: null };
}

export function brandedMigrationBindState(params: {
  desiredHost: string;
  boundHost: string | null;
  boundVerified: boolean;
}): "idempotent" | "needs_bind" | "needs_rebind" {
  const desired = params.desiredHost.trim().toLowerCase();
  const bound = params.boundHost?.trim().toLowerCase() || null;
  if (params.boundVerified && bound === desired) return "idempotent";
  if (bound && bound !== desired) return "needs_rebind";
  return "needs_bind";
}

export function planBrandedMigrationRollback(params: {
  verifiedCustomDomain: string | null;
  brandedHost: string | null;
}): {
  primaryAfterRollback: "custom" | "provider";
  keepHost: string | null;
  dropBrandedAlias: string | null;
  note: string;
} {
  const custom = params.verifiedCustomDomain?.trim() || null;
  const branded = params.brandedHost?.trim() || null;
  if (custom) {
    return {
      primaryAfterRollback: "custom",
      keepHost: custom,
      dropBrandedAlias: branded,
      note: "Befintlig egen domän vinner. Rör inte den host som en publicerad redirect redan pekar mot förrän den ersatts.",
    };
  }
  return {
    primaryAfterRollback: "provider",
    keepHost: null,
    dropBrandedAlias: branded,
    note: "Appflaggan återställer bara URL-valet. Byggda redirects/metadata kräver ompublicering enligt A3.",
  };
}
