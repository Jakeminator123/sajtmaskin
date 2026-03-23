const AUTO_DEPLOY_ENABLED =
  typeof window !== "undefined" &&
  (document.documentElement.dataset.autoDeployAfterRepair === "1" ||
    localStorage.getItem("sajtmaskin:auto-deploy-after-repair") === "1");

const deployedVersions = new Set<string>();

/**
 * Fire-and-forget auto-deploy to Vercel after a version passes quality gate.
 * Guarded by SAJTMASKIN_AUTO_DEPLOY_AFTER_REPAIR flag and deduped per versionId.
 */
export function maybeAutoDeployVersion(params: {
  chatId: string;
  versionId: string;
  projectId?: string | null;
}): void {
  if (!AUTO_DEPLOY_ENABLED) return;
  const { chatId, versionId, projectId } = params;
  if (deployedVersions.has(versionId)) return;
  deployedVersions.add(versionId);

  void (async () => {
    try {
      const res = await fetch("/api/v0/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId,
          versionId,
          projectId: projectId ?? undefined,
          target: "production",
          imageStrategy: "external",
        }),
      });
      if (res.ok) {
        console.info(`[auto-deploy] Triggered deploy for version ${versionId}`);
      } else {
        const data = await res.json().catch(() => null);
        console.warn(`[auto-deploy] Deploy failed (HTTP ${res.status}):`, data?.error ?? "unknown");
      }
    } catch (err) {
      console.warn("[auto-deploy] Network error:", err instanceof Error ? err.message : err);
    }
  })();
}
