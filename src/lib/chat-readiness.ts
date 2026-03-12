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
  verificationSummary?: string | null;
  appProjectId?: string | null;
  requiredEnvKeys: string[];
  configuredEnvKeys: string[];
  missingEnvKeys: string[];
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
