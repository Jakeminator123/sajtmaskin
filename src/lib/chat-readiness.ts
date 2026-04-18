export type ChatReadinessSeverity = "blocker" | "warning" | "info";

export type ChatReadinessStatus = "blocked" | "warning" | "ready";

export type ChatReadinessAction = "env" | "versions" | "preview" | "deploy" | "seo";

export type ChatReadinessItem = {
  id: string;
  title: string;
  detail?: string | null;
  severity: ChatReadinessSeverity;
  action?: ChatReadinessAction;
};

export type ChatReadinessInfo = {
  versionId: string | null;
  lifecycleStatus?: string | null;
  /**
   * F2 vs F3 stage of the active version (`design` | `integrations`).
   * Used by the builder UI to hide the env panel in F2 and show the
   * "Bygg nu" trigger in its place. See
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
