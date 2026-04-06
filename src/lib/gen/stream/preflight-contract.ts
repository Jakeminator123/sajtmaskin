export type PreflightIssueCategory =
  | "code_structure_failure"
  | "dependency_install_failure"
  | "env_config_missing"
  | "shim_preview_failure"
  | "non_blocking_quality_warning";

/** Only tier-2 live preview or no in-app preview; compatibility shim is no longer primary. */
export type PreviewPrimaryTarget = "preview" | "none";

export interface PreflightIssueLike {
  file: string;
  severity: "error" | "warning";
  message: string;
  category: PreflightIssueCategory;
}

export interface PreflightIssueInput {
  file: string;
  severity: "error" | "warning";
  message: string;
  category?: PreflightIssueCategory | null;
}

export interface PreviewStartContract {
  canStartPreview: boolean;
  primaryPreviewTarget: PreviewPrimaryTarget;
  shimBlocked: boolean;
  requiresEnvConfig: boolean;
  hasCriticalInstallRisk: boolean;
  hasCriticalCodeFailure: boolean;
  compatibilityPreviewAllowed: boolean;
  issueCounts: Record<PreflightIssueCategory, number>;
  blockingCategories: PreflightIssueCategory[];
}

function createInitialCounts(): Record<PreflightIssueCategory, number> {
  return {
    code_structure_failure: 0,
    dependency_install_failure: 0,
    env_config_missing: 0,
    shim_preview_failure: 0,
    non_blocking_quality_warning: 0,
  };
}

function detectPreflightIssueCategory(params: {
  file: string;
  severity: "error" | "warning";
  message: string;
}): PreflightIssueCategory {
  const file = params.file.toLowerCase();
  const message = params.message.toLowerCase();

  if (file === "preview" || message.includes("preview entrypoint") || message.includes("while preparing preview")) {
    return "shim_preview_failure";
  }

  if (
    file.endsWith("package.json") ||
    message.includes("eresolve") ||
    message.includes("peer") ||
    message.includes("npm install") ||
    message.includes("react >=19") ||
    message.includes("fiber") ||
    message.includes("drei")
  ) {
    return "dependency_install_failure";
  }

  if (
    message.includes("env var") ||
    message.includes("environment variable") ||
    message.includes("missing env") ||
    message.includes("requires auth_secret") ||
    message.includes("nextauth_url") ||
    message.includes("api key") ||
    message.includes("secret")
  ) {
    return "env_config_missing";
  }

  if (params.severity === "warning") {
    return "non_blocking_quality_warning";
  }

  return "code_structure_failure";
}

export function resolvePreflightIssueCategory(params: PreflightIssueInput): PreflightIssueCategory {
  return params.category ?? detectPreflightIssueCategory(params);
}

export function buildPreviewStartContract(params: {
  issues: PreflightIssueLike[];
  finalizedPreviewFileCount: number;
}): PreviewStartContract {
  const compatibilityPreviewAllowed = false;
  const issueCounts = createInitialCounts();

  for (const issue of params.issues) {
    issueCounts[issue.category] += 1;
  }

  const hasCriticalCodeFailure = params.issues.some(
    (issue) => issue.severity === "error" && issue.category === "code_structure_failure",
  );
  const hasCriticalInstallRisk = params.issues.some(
    (issue) => issue.severity === "error" && issue.category === "dependency_install_failure",
  );
  const requiresEnvConfig = params.issues.some(
    (issue) => issue.severity === "error" && issue.category === "env_config_missing",
  );
  const shimBlocked = params.issues.some(
    (issue) => issue.severity === "error" && issue.category === "shim_preview_failure",
  );

  const canStartPreview =
    params.finalizedPreviewFileCount > 0 &&
    !hasCriticalCodeFailure &&
    !hasCriticalInstallRisk &&
    !requiresEnvConfig;

  const primaryPreviewTarget: PreviewPrimaryTarget = canStartPreview ? "preview" : "none";

  const blockingCategories = ([
    hasCriticalCodeFailure ? "code_structure_failure" : null,
    hasCriticalInstallRisk ? "dependency_install_failure" : null,
    requiresEnvConfig ? "env_config_missing" : null,
    !canStartPreview && shimBlocked && primaryPreviewTarget === "none" ? "shim_preview_failure" : null,
  ].filter(Boolean) as PreflightIssueCategory[]);

  return {
    canStartPreview,
    primaryPreviewTarget,
    shimBlocked,
    requiresEnvConfig,
    hasCriticalInstallRisk,
    hasCriticalCodeFailure,
    compatibilityPreviewAllowed,
    issueCounts,
    blockingCategories,
  };
}
