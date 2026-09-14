/**
 * Owner for the first branded-host pilot gate.
 *
 * The operator allowlist is deliberately a list of exact project/version
 * pairs. A project approval never rolls forward to a newly generated version.
 * Capability signals add a conservative runtime backstop, while the reviewed
 * pair remains the authority for code that those signals cannot describe.
 */

const PILOT_SAFE_CAPABILITIES = new Set([
  "carousel",
  "command-palette",
  "dashboard-charts",
  "gallery-lightbox",
  "interactive-game",
  "map-display",
  "physics-2d",
  "physics-3d",
  "scroll-story",
  "site-search",
  "spatial-canvas",
  "visual-3d",
]);

const AUTH_CAPABILITIES = new Set(["auth", "clerk-auth", "supabase-auth"]);

export type BrandedPilotEligibilityReason =
  | "eligible"
  | "rollout_disabled"
  | "missing_identity"
  | "allowlist_missing"
  | "allowlist_invalid"
  | "version_not_reviewed"
  | "version_revision_missing"
  | "version_content_changed"
  | "auth_capability"
  | "capability_not_pilot_safe";

export type BrandedPilotEligibility = {
  allowed: boolean;
  reason: BrandedPilotEligibilityReason;
  rejectedCapabilities: string[];
};

type PilotAllowlistEntry = {
  projectId: string;
  versionId: string;
  filesRevision: string;
};

function isAffirmative(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}

function normalizedStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function parsePilotAllowlist(
  raw: string | undefined,
):
  | { state: "missing"; entries: [] }
  | { state: "invalid"; entries: [] }
  | { state: "valid"; entries: PilotAllowlistEntry[] } {
  const value = raw?.trim();
  if (!value) return { state: "missing", entries: [] };
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return { state: "invalid", entries: [] };
    const entries: PilotAllowlistEntry[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") return { state: "invalid", entries: [] };
      const projectId = (item as { projectId?: unknown }).projectId;
      const versionId = (item as { versionId?: unknown }).versionId;
      const filesRevision = (item as { filesRevision?: unknown }).filesRevision;
      if (
        typeof projectId !== "string" ||
        !projectId.trim() ||
        typeof versionId !== "string" ||
        !versionId.trim() ||
        typeof filesRevision !== "string" ||
        !filesRevision.trim()
      ) {
        return { state: "invalid", entries: [] };
      }
      entries.push({
        projectId: projectId.trim(),
        versionId: versionId.trim(),
        filesRevision: filesRevision.trim().toLowerCase(),
      });
    }
    return { state: "valid", entries };
  } catch {
    return { state: "invalid", entries: [] };
  }
}

/** Collect every persisted/detected capability signal; unknown values stay visible. */
export function collectBrandedPilotCapabilitySignals(params: {
  snapshot?: unknown;
  selectedDossiers?: ReadonlyArray<{ entry?: { capability?: unknown } }> | null;
}): string[] {
  const result = new Set<string>();
  const snapshot =
    params.snapshot && typeof params.snapshot === "object"
      ? (params.snapshot as Record<string, unknown>)
      : null;
  if (snapshot) {
    const briefSummary =
      snapshot.briefSummary && typeof snapshot.briefSummary === "object"
        ? (snapshot.briefSummary as Record<string, unknown>)
        : null;
    const legacyBrief =
      snapshot.brief && typeof snapshot.brief === "object"
        ? (snapshot.brief as Record<string, unknown>)
        : null;
    for (const source of [
      snapshot.requestedCapabilities,
      briefSummary?.requestedCapabilities,
      legacyBrief?.requestedCapabilities,
    ]) {
      for (const capability of normalizedStrings(source)) result.add(capability);
    }
  }
  for (const selected of params.selectedDossiers ?? []) {
    for (const capability of normalizedStrings([selected.entry?.capability])) {
      result.add(capability);
    }
  }
  return [...result].sort();
}

export function resolveBrandedPilotEligibility(params: {
  projectId?: string | null;
  versionId?: string | null;
  capabilities?: ReadonlyArray<string> | null;
}): BrandedPilotEligibility {
  if (!isAffirmative(process.env.SAJTMASKIN_BRANDED_LIVE_URLS)) {
    return { allowed: false, reason: "rollout_disabled", rejectedCapabilities: [] };
  }

  const projectId = params.projectId?.trim() ?? "";
  const versionId = params.versionId?.trim() ?? "";
  if (!projectId || !versionId) {
    return { allowed: false, reason: "missing_identity", rejectedCapabilities: [] };
  }

  const allowlist = parsePilotAllowlist(process.env.SAJTMASKIN_BRANDED_PILOT_ALLOWLIST);
  if (allowlist.state === "missing") {
    return { allowed: false, reason: "allowlist_missing", rejectedCapabilities: [] };
  }
  if (allowlist.state === "invalid") {
    return { allowed: false, reason: "allowlist_invalid", rejectedCapabilities: [] };
  }
  if (
    !allowlist.entries.some(
      (entry) => entry.projectId === projectId && entry.versionId === versionId,
    )
  ) {
    return { allowed: false, reason: "version_not_reviewed", rejectedCapabilities: [] };
  }

  const capabilities = [...new Set(normalizedStrings(params.capabilities ?? []))].sort();
  const authCapabilities = capabilities.filter((capability) => AUTH_CAPABILITIES.has(capability));
  if (authCapabilities.length > 0) {
    return {
      allowed: false,
      reason: "auth_capability",
      rejectedCapabilities: authCapabilities,
    };
  }
  const rejectedCapabilities = capabilities.filter(
    (capability) => !PILOT_SAFE_CAPABILITIES.has(capability),
  );
  if (rejectedCapabilities.length > 0) {
    return {
      allowed: false,
      reason: "capability_not_pilot_safe",
      rejectedCapabilities,
    };
  }
  return { allowed: true, reason: "eligible", rejectedCapabilities: [] };
}

/**
 * Deploy/migration check for the mutable engine_versions row. URL display uses
 * the pair-only decision above: a later edit must not hide an already deployed
 * reviewed build, while every new provider write must match the reviewed bytes.
 */
export function resolveBrandedPilotDeploymentEligibility(params: {
  projectId?: string | null;
  versionId?: string | null;
  filesRevision?: string | null;
  capabilities?: ReadonlyArray<string> | null;
}): BrandedPilotEligibility {
  const base = resolveBrandedPilotEligibility(params);
  if (!base.allowed) return base;
  const revision = params.filesRevision?.trim().toLowerCase() ?? "";
  if (!revision) {
    return { allowed: false, reason: "version_revision_missing", rejectedCapabilities: [] };
  }
  const allowlist = parsePilotAllowlist(process.env.SAJTMASKIN_BRANDED_PILOT_ALLOWLIST);
  if (allowlist.state !== "valid") {
    return {
      allowed: false,
      reason: allowlist.state === "missing" ? "allowlist_missing" : "allowlist_invalid",
      rejectedCapabilities: [],
    };
  }
  const exact = allowlist.entries.some(
    (entry) =>
      entry.projectId === params.projectId?.trim() &&
      entry.versionId === params.versionId?.trim() &&
      entry.filesRevision === revision,
  );
  return exact
    ? base
    : { allowed: false, reason: "version_content_changed", rejectedCapabilities: [] };
}
