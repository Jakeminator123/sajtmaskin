import {
  findPackageTreeConflictsInFiles,
  formatPackageTreeConflictDetail,
  INSTALL_PEER_FALLBACK_CHECK,
  type PackageTreeConflict,
} from "@/lib/gen/validation/package-tree-compat";
import {
  installPeerFallbackReceiptBlocksPublish,
  type InstallPeerFallbackReceiptLog,
} from "@/lib/gen/validation/install-peer-fallback-receipt";

export const DEPLOY_PACKAGE_TREE_ERESOLVE = "DEPLOY_PACKAGE_TREE_ERESOLVE" as const;
export const DEPLOY_INSTALL_PEER_FALLBACK = "DEPLOY_INSTALL_PEER_FALLBACK" as const;

export type PackageTreePublishGateCode =
  | typeof DEPLOY_PACKAGE_TREE_ERESOLVE
  | typeof DEPLOY_INSTALL_PEER_FALLBACK;

export type PackageTreePublishGateResult =
  | { allowed: true }
  | {
      allowed: false;
      code: PackageTreePublishGateCode;
      message: string;
      conflict?: PackageTreeConflict;
    };

export function resolvePackageTreeFileGate(
  files: ReadonlyArray<{ path: string; content: string }>,
): PackageTreePublishGateResult {
  const found = findPackageTreeConflictsInFiles(files);
  const conflict = found?.conflicts[0];
  if (!conflict) return { allowed: true };
  return {
    allowed: false,
    code: DEPLOY_PACKAGE_TREE_ERESOLVE,
    message: formatPackageTreeConflictDetail(conflict),
    conflict,
  };
}

const FALLBACK_BLOCK: PackageTreePublishGateResult = {
  allowed: false,
  code: DEPLOY_INSTALL_PEER_FALLBACK,
  message:
    "Preview started only after npm --legacy-peer-deps. That bypass is not a publish-ready install; Vercel npm install will ERESOLVE the same tree. Fix the package.json peers (bump Next or pin React to a coherent pair) before publishing.",
};

export function resolveInstallPeerFallbackGate(
  latestGateAdvisoryChecks: readonly string[],
): PackageTreePublishGateResult {
  if (!latestGateAdvisoryChecks.includes(INSTALL_PEER_FALLBACK_CHECK)) {
    return { allowed: true };
  }
  return FALLBACK_BLOCK;
}

/** File tree first, then revision-bound fallback receipt, then latest-gate advisory. */
export function resolvePackageTreePublishGate(params: {
  files: ReadonlyArray<{ path: string; content: string }>;
  latestGateAdvisoryChecks?: readonly string[];
  errorLogs?: readonly InstallPeerFallbackReceiptLog[];
  filesRevision?: string | null;
}): PackageTreePublishGateResult {
  const fileGate = resolvePackageTreeFileGate(params.files);
  if (!fileGate.allowed) return fileGate;
  if (installPeerFallbackReceiptBlocksPublish(params.errorLogs ?? [], params.filesRevision)) {
    return FALLBACK_BLOCK;
  }
  return resolveInstallPeerFallbackGate(params.latestGateAdvisoryChecks ?? []);
}
