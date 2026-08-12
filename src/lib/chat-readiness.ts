export type ChatReadinessSeverity = "blocker" | "warning" | "info";

export type ChatReadinessStatus = "blocked" | "warning" | "ready";

export type ChatReadinessAction = "env" | "versions" | "preview" | "deploy" | "seo";

export type ChatReadinessCategory = "blocker" | "advisory";

export type ChatReadinessItem = {
  id: string;
  title: string;
  detail?: string | null;
  severity: ChatReadinessSeverity;
  category?: ChatReadinessCategory;
  action?: ChatReadinessAction;
  /** Env keys this item is about. Lets the UI open the env panel on the exact relevant keys. */
  envKeys?: string[];
};

export function resolveReadinessCategoryFromSeverity(
  severity: ChatReadinessSeverity,
): ChatReadinessCategory {
  return severity === "blocker" ? "blocker" : "advisory";
}

export type ChatReadinessInfo = {
  versionId: string | null;
  lifecycleStatus?: string | null;
  /**
   * F2 vs F3 stage of the active version (`design` | `integrations`).
   * Used by the builder UI to hide the env panel in F2 and show the
   * "Bygg integrationer" trigger in its place. See
   * `.cursor/rules/env-flow-f2-mute.mdc`.
   */
  lifecycleStage?: "design" | "integrations" | null;
  verificationSummary?: string | null;
  appProjectId?: string | null;
  requiredEnvKeys: string[];
  configuredEnvKeys: string[];
  missingEnvKeys: string[];
  /** Keys not configured by user but covered by preview placeholders — deferred to publish. */
  placeholderCoveredKeys?: string[];
  /**
   * Phase-4 narrowing: subset of `missingEnvKeys` whose dossier marks them
   * `enforcement: "build"` (truly blocking F3). When dossier metadata is
   * unavailable the resolver defaults all keys to `build`, so this list is
   * a superset of the strictly-build subset only on legacy runs.
   */
  buildBlockingKeys?: string[];
  /**
   * Phase-4: keys whose dossier marks them `enforcement: "feature-runtime"`
   * — UI shows a configuration banner / popup at runtime when missing.
   * Surfaced as informational warnings, never blockers.
   */
  featureRuntimeKeys?: string[];
  /**
   * Phase-4: keys whose dossier marks them `enforcement: "warn-only"`.
   * Components self-disable when missing; surfaced for diagnostics, not as a blocker.
   */
  warnOnlyKeys?: string[];
  /**
   * True when "Bygg integrationer" (`/finalize-design`) would take the
   * `llm_ready` path — i.e. at least one planned dossier is still absent from
   * the version or a detected integration has a required real build key, so the click spends a
   * `prompt.refine` LLM round (~4–6 diamonds): either a planned dossier still
   * needs installation or existing code has a real build requirement. False
   * means the deterministic
   * exact-file ReleaseGate fork (0 diamonds). Owned HERE (Ö4a): the UI must not
   * re-derive the branch from `buildBlockingKeys` — that subset of
   * `missingEnvKeys` goes empty once the user configures a build key, which
   * would wrongly predict the free path even though the canonical LLM-branch
   * signal stays true. Undefined = readiness could not resolve it (no version, or the
   * build spec could not be derived — the same `null` that makes the shared
   * gate answer `version_files_unavailable`, i.e. a 409 rather than a free
   * build) → UI shows an honest conditional-cost tooltip instead of a promise.
   */
  hasRealBuildIntegrations?: boolean;
};

export type ChatReadiness = {
  status: ChatReadinessStatus;
  canDeploy: boolean;
  blockers: ChatReadinessItem[];
  warnings: ChatReadinessItem[];
  info: ChatReadinessInfo;
};

export function buildChatReadiness(params: {
  blockers?: ChatReadinessItem[];
  warnings?: ChatReadinessItem[];
  info: ChatReadinessInfo;
}): ChatReadiness {
  const blockers = params.blockers ?? [];
  const warnings = params.warnings ?? [];

  return {
    status: blockers.length > 0 ? "blocked" : warnings.length > 0 ? "warning" : "ready",
    canDeploy: blockers.length === 0,
    blockers,
    warnings,
    info: params.info,
  };
}
