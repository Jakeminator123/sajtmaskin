/**
 * Pure lifecycle projection for one dossier row in the builder overview.
 *
 * The inputs are evidence that other canonical owners have already derived:
 * selection/pending, exact manifest-file presence, project env values and the
 * file-derived Tier3 requirements. This module deliberately does not load the
 * registry, database or version files itself.
 *
 * The evidence axes are independent. In particular, `configured` is the
 * existing prompt signal (all required real project values are present), not a
 * readiness gate, and version verification is version-scoped rather than a
 * per-dossier fact. The resolver therefore preserves the existing five UI
 * statuses without inventing an ordered selected -> configured -> verified
 * state machine.
 */
import { mapDossierPathToOutput } from "./output-path";
import { dossierRequiresF3, type DossierEntry } from "./types";

export type DossierLifecycleOverviewStatus =
  "self-contained" | "planned" | "blocked-build" | "built-demo" | "built-live";

export interface DossierLifecycleRequirementEvidence {
  key: string;
  /** Complete env-key surface used to match this requirement to a dossier. */
  envKeys: readonly string[];
  /** BUILD-enforced keys the readiness gate still considers missing. */
  missingBuildKeys: readonly string[];
}

export interface DossierLifecycleVersionFile {
  path?: unknown;
  content?: unknown;
}

export interface ResolveDossierLifecycleInput {
  entry: DossierEntry;
  /** Prompt-only signal from canonical dossier selection. */
  configuredBySelection: boolean;
  /**
   * Exact manifest presence from the same `versionFiles`; null means no
   * readable version files exist.
   */
  materialized: boolean | null;
  /**
   * Exact F2-deferred identity. The canonical pending resolver guarantees that
   * this is false once exact materialization is present.
   */
  pending: boolean;
  /** Project-scoped keys with non-empty real values; status uses this set. */
  realEnvKeys: ReadonlySet<string>;
  /** Requirements derived from the same files; null means no readable spec. */
  requirements: readonly DossierLifecycleRequirementEvidence[] | null;
  /** Preloaded version files; null means unavailable, not a known empty set. */
  versionFiles: readonly DossierLifecycleVersionFile[] | null;
}

export interface DossierLifecycleResolution {
  /**
   * Builder-overview status only. Never use this as readiness, deploy,
   * installed-dossier or version-verification evidence: model-built code may
   * legitimately produce `built-live` while exact materialization is false.
   */
  overviewStatus: DossierLifecycleOverviewStatus;
  requiresF3: boolean;
  pending: boolean;
  materialized: boolean | null;
  configured: boolean;
  /** Reporting heuristic; null means the version could not be inspected. */
  detected: boolean | null;
  matchedRequirementKey: string | null;
  /**
   * Whether the overview's server-evidence requirement is satisfied. True also
   * means "no server surface to prove"; null means files were unavailable.
   */
  serverEvidenceSatisfied: boolean | null;
  missingBuildKeys: string[];
  missingFeatureRuntimeKeys: string[];
  buildKeysWithoutRealValue: string[];
}

/** Normalize a version file path for comparison (mirrors version-presence). */
function normalizeProjectPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

const API_ROUTE_PATH_RE = /^app\/api\/(?:.*\/)?route\.(?:ts|tsx|js|jsx|mjs|cjs)$/;

/**
 * Match an env key as a standalone identifier. Keys come from manifests but
 * are escaped defensively.
 */
function envKeyIdentifierPattern(key: string): RegExp {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`);
}

/**
 * Server-side evidence for the overview's `built-live` cap.
 *
 * Exact dossier injection requires every manifest server file. A model-built
 * implementation may instead prove itself through an API route that reads a
 * server-safe dossier env key. Partial manifest injection never falls through
 * to that model-built heuristic.
 */
function resolveServerEvidenceSatisfied(
  entry: DossierEntry,
  versionFiles: readonly DossierLifecycleVersionFile[] | null,
): boolean | null {
  const serverPaths = (entry.files ?? [])
    .filter((file) => file.role === "server")
    .map((file) => normalizeProjectPath(mapDossierPathToOutput(file.path)));
  if (serverPaths.length === 0) return true;
  if (versionFiles === null) return null;

  const files = versionFiles.flatMap((file) =>
    typeof file.path === "string" && file.path.trim().length > 0
      ? [
          {
            path: normalizeProjectPath(file.path),
            content: typeof file.content === "string" ? file.content : "",
          },
        ]
      : [],
  );
  const presentPaths = new Set(files.map((file) => file.path));
  const presentServerCount = serverPaths.filter((path) => presentPaths.has(path)).length;
  if (presentServerCount === serverPaths.length) return true;
  if (presentServerCount > 0) return false;

  const envKeys = (entry.envVars ?? [])
    .filter((env) => (env.enforcement ?? "build") !== "warn-only")
    .map((env) => env.key)
    .filter(
      (key): key is string =>
        typeof key === "string" && key.length > 0 && !key.startsWith("NEXT_PUBLIC_"),
    );
  if (envKeys.length === 0) return false;
  const keyPatterns = envKeys.map(envKeyIdentifierPattern);

  return files.some(
    (file) =>
      API_ROUTE_PATH_RE.test(file.path) &&
      file.content.includes("process.env") &&
      keyPatterns.some((pattern) => pattern.test(file.content)),
  );
}

/** Match the requirement with the largest env-surface overlap. */
function matchRequirement(
  entry: DossierEntry,
  requirements: readonly DossierLifecycleRequirementEvidence[],
): DossierLifecycleRequirementEvidence | undefined {
  const dossierEnvKeys = (entry.envVars ?? []).map((env) => env.key);
  let best: DossierLifecycleRequirementEvidence | undefined;
  let bestOverlap = 0;
  for (const requirement of requirements) {
    const surface = new Set(requirement.envKeys);
    let overlap = 0;
    for (const key of dossierEnvKeys) {
      if (surface.has(key)) overlap += 1;
    }
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = requirement;
    }
  }
  return best;
}

/**
 * Resolve the existing dossier-overview status from precomputed evidence.
 *
 * Precedence is intentionally identical to the API route's historical policy:
 * pending -> self-contained -> undetected/planned -> blocked -> demo/live.
 */
export function resolveDossierLifecycle(
  input: ResolveDossierLifecycleInput,
): DossierLifecycleResolution {
  const { entry } = input;
  const requiresF3 = dossierRequiresF3(entry);
  const matchedRequirement =
    input.requirements === null ? undefined : matchRequirement(entry, input.requirements);
  const missingFeatureRuntimeKeys = (entry.envVars ?? [])
    .filter(
      (env) =>
        (env.enforcement ?? "build") === "feature-runtime" && !input.realEnvKeys.has(env.key),
    )
    .map((env) => env.key);
  const buildKeysWithoutRealValue = (entry.envVars ?? [])
    .filter((env) => (env.enforcement ?? "build") === "build" && !input.realEnvKeys.has(env.key))
    .map((env) => env.key);
  const serverEvidenceSatisfied = resolveServerEvidenceSatisfied(entry, input.versionFiles);

  let overviewStatus: DossierLifecycleOverviewStatus;
  let missingBuildKeys: string[] = [];
  if (input.pending) {
    overviewStatus = "planned";
  } else if (!requiresF3) {
    overviewStatus = "self-contained";
  } else if (!matchedRequirement) {
    overviewStatus = "planned";
  } else {
    missingBuildKeys = [...matchedRequirement.missingBuildKeys];
    if (missingBuildKeys.length > 0) {
      overviewStatus = "blocked-build";
    } else if (
      missingFeatureRuntimeKeys.length > 0 ||
      buildKeysWithoutRealValue.length > 0 ||
      serverEvidenceSatisfied !== true
    ) {
      overviewStatus = "built-demo";
    } else {
      overviewStatus = "built-live";
    }
  }

  return {
    overviewStatus,
    requiresF3,
    pending: input.pending,
    materialized: input.materialized,
    configured: input.configuredBySelection,
    detected: input.requirements === null ? null : matchedRequirement !== undefined,
    matchedRequirementKey: matchedRequirement?.key ?? null,
    serverEvidenceSatisfied,
    missingBuildKeys,
    missingFeatureRuntimeKeys,
    buildKeysWithoutRealValue,
  };
}
