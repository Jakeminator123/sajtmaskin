import { parseCodeProject, serializeCodeProject, type CodeFile } from "@/lib/gen/parser";
import type { RoutePlan } from "@/lib/gen/route-plan";
import { runLlmRepairGate, type RepairLedger } from "@/lib/gen/autofix/llm-repair-gate";
import { partitionGeneratedFilesForProtectedPaths } from "@/lib/gen/scaffolds/protected-paths";
import { devLogAppend } from "@/lib/logging/dev-log";
import type { CanonicalModelId } from "@/lib/models/catalog";
import type { BuildSpec } from "@/lib/gen/build-spec";
import { normPath } from "./file-heuristics";
import { buildMissingHomeRouteIssue, findHomePageFile } from "./home-route-analysis";

export const HOME_ROUTE_RECOVERY_PATH = "app/page.tsx";
const HOME_ROUTE_RECOVERY_TIMEOUT_MS = 60_000;

function formatRoutePlanForHomeRecovery(routePlan: RoutePlan | null | undefined): string {
  if (!routePlan || routePlan.routes.length === 0) return "Route plan: unavailable";
  const routes = routePlan.routes
    .slice(0, 8)
    .map((route) => {
      const required = route.required ? "required" : "optional";
      return `${route.path} (${route.name}; ${required}) — ${route.intent}`;
    })
    .join("; ");
  return `Route plan: siteType=${routePlan.siteType}; routes=${routes}`;
}

function formatBuildSpecForHomeRecovery(buildSpec: BuildSpec | null | undefined): string {
  if (!buildSpec) return "Build spec: unavailable";
  return [
    `Build spec: intent=${buildSpec.buildIntent}`,
    `mode=${buildSpec.generationMode}`,
    `scaffoldId=${buildSpec.scaffoldId ?? "unknown"}`,
    `stylePack=${buildSpec.stylePack}`,
    `qualityTarget=${buildSpec.qualityTarget}`,
    `routePlanSummary=${buildSpec.routePlanSummary}`,
  ].join("; ");
}

function summarizeFilesForHomeRecovery(files: CodeFile[]): string {
  const paths = files.map((file) => normPath(file.path)).sort();
  const sample = paths.slice(0, 24).join(", ");
  return `Existing generated files (${paths.length}): ${sample}${paths.length > 24 ? ", ..." : ""}`;
}

export async function tryRecoverMissingHomeRoute(params: {
  chatId: string;
  resolvedTier?: CanonicalModelId;
  files: CodeFile[];
  originalPrompt?: string;
  buildSpec: BuildSpec | null | undefined;
  routePlan: RoutePlan | null | undefined;
  repairLedger?: RepairLedger;
  repairScopeId?: string;
}): Promise<{ files: CodeFile[]; recovered: boolean; attempted: boolean; message?: string }> {
  const detectedHome = findHomePageFile(params.files);
  const homeIssue = buildMissingHomeRouteIssue(detectedHome, params.files);
  if (!homeIssue) {
    return { files: params.files, recovered: false, attempted: false };
  }

  const content = serializeCodeProject(params.files);
  const errors = [
    `${HOME_ROUTE_RECOVERY_PATH}:1:1 CRITICAL: ${homeIssue.message}`,
    `Create or replace ${HOME_ROUTE_RECOVERY_PATH} with a complete Next.js App Router page. The scaffold default is blocked by LLM_ONLY_PATHS and must not be used as a silent fallback.`,
    "The recovered page must be a real branded startsida with hero, CTA, and relevant sections; never return an empty, trivial, placeholder, or skeleton-only page.",
    `Original prompt / brief: ${params.originalPrompt?.trim() || "unavailable"}`,
    formatBuildSpecForHomeRecovery(params.buildSpec),
    formatRoutePlanForHomeRecovery(params.routePlan),
    summarizeFilesForHomeRecovery(params.files),
  ];

  try {
    const repairGate = await runLlmRepairGate({
      content,
      errors,
      chatId: params.chatId,
      timeoutMs: HOME_ROUTE_RECOVERY_TIMEOUT_MS,
      requiredFiles: [HOME_ROUTE_RECOVERY_PATH],
      resolvedTier: params.resolvedTier,
      scopeId: params.repairScopeId,
      phase: "home-route-recovery",
      ledger: params.repairLedger,
    });
    const repairResult = repairGate.result;
    if (!repairResult.success || typeof repairResult.fixedContent !== "string") {
      return {
        files: params.files,
        recovered: false,
        attempted: true,
        message:
          repairResult.missingFiles?.length
            ? `missing required files: ${repairResult.missingFiles.join(", ")}`
            : "repair gate did not return a successful app/page.tsx",
      };
    }

    const recoveredProject = parseCodeProject(repairResult.fixedContent);
    const protectedPartition =
      partitionGeneratedFilesForProtectedPaths(recoveredProject.files);
    const recoveredFiles = protectedPartition.kept;
    if (protectedPartition.dropped.length > 0) {
      const droppedPaths = protectedPartition.dropped.map((file) => file.path);
      devLogAppend("in-progress", {
        type: "scaffold-protected-overwrite-blocked",
        chatId: params.chatId,
        branch: "home-route-recovery",
        droppedPaths,
      });
    }
    const recoveredHome = findHomePageFile(recoveredFiles);
    if (!recoveredHome || normPath(recoveredHome.path) !== HOME_ROUTE_RECOVERY_PATH) {
      return {
        files: params.files,
        recovered: false,
        attempted: true,
        message: "repair gate output did not include app/page.tsx",
      };
    }

    return { files: recoveredFiles, recovered: true, attempted: true };
  } catch (error) {
    return {
      files: params.files,
      recovered: false,
      attempted: true,
      message: error instanceof Error ? error.message : "unknown home route recovery error",
    };
  }
}
