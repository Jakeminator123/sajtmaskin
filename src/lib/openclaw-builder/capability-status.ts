export type BuilderLane = "classic" | "openclaw_shadow" | "openclaw_candidate";
export type CodeContextMode = "none" | "light" | "manifest" | "full";

export type BuilderWritePath = "armed_follow_up" | "approved_quick_edit";
export type BuilderLaneReason = "default_classic" | "lane_unavailable" | "enabled";

export type BuilderCapabilityStatus = {
  schemaVersion: 1;
  runtimeAuthority: false;
  productionSajtagent: {
    toolsProfile: "minimal";
    skillsEnabled: false;
    projectNavigation: false;
    codeContextMode: CodeContextMode;
    canWriteProjectFiles: false;
    writePaths: Array<BuilderWritePath>;
  };
  builderLanes: {
    requested: BuilderLane;
    active: "classic";
    shadowAvailable: false;
    candidateAvailable: false;
    reason: BuilderLaneReason;
  };
  boundIdentity: {
    chatId: string | null;
    versionId: string | null;
    filesRevision: string | null;
  };
};

export type DescribeBuilderCapabilityStatusInput = {
  requestedLane?: BuilderLane | string | null;
  codeContextMode?: CodeContextMode | string | null;
  chatId?: string | null;
  versionId?: string | null;
  filesRevision?: string | null;
};

const BUILDER_LANES = new Set<BuilderLane>([
  "classic",
  "openclaw_shadow",
  "openclaw_candidate",
]);

const UNAVAILABLE_LANES = new Set<BuilderLane>([
  "openclaw_shadow",
  "openclaw_candidate",
]);

const CODE_CONTEXT_MODES = new Set<CodeContextMode>([
  "none",
  "light",
  "manifest",
  "full",
]);

const PRODUCTION_WRITE_PATHS: BuilderWritePath[] = [
  "armed_follow_up",
  "approved_quick_edit",
];

function isBuilderLane(value: unknown): value is BuilderLane {
  return typeof value === "string" && BUILDER_LANES.has(value as BuilderLane);
}

function isCodeContextMode(value: unknown): value is CodeContextMode {
  return typeof value === "string" && CODE_CONTEXT_MODES.has(value as CodeContextMode);
}

function normalizeBoundId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveRequestedLane(value: BuilderLane | string | null | undefined): BuilderLane {
  return isBuilderLane(value) ? value : "classic";
}

function resolveLaneReason(requested: BuilderLane): BuilderLaneReason {
  if (UNAVAILABLE_LANES.has(requested)) return "lane_unavailable";
  // "enabled" is reserved for a runtime-enabled non-default lane. This slice
  // never activates shadow/candidate, so classic always reports default_classic.
  return "default_classic";
}

/**
 * Honest, machine-readable capability report for the planned OpenClaw Builder.
 * Library-only: no I/O, env, fetch, or DB. Never claims runtime authority.
 */
export function describeBuilderCapabilityStatus(
  input: DescribeBuilderCapabilityStatusInput = {},
): BuilderCapabilityStatus {
  const requested = resolveRequestedLane(input.requestedLane);
  const codeContextMode = isCodeContextMode(input.codeContextMode)
    ? input.codeContextMode
    : "none";

  return {
    schemaVersion: 1,
    runtimeAuthority: false,
    productionSajtagent: {
      toolsProfile: "minimal",
      skillsEnabled: false,
      projectNavigation: false,
      codeContextMode,
      canWriteProjectFiles: false,
      writePaths: PRODUCTION_WRITE_PATHS,
    },
    builderLanes: {
      requested,
      active: "classic",
      shadowAvailable: false,
      candidateAvailable: false,
      reason: resolveLaneReason(requested),
    },
    boundIdentity: {
      chatId: normalizeBoundId(input.chatId),
      versionId: normalizeBoundId(input.versionId),
      filesRevision: normalizeBoundId(input.filesRevision),
    },
  };
}
