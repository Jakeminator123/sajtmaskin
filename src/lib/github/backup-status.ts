/**
 * Portal-facing read of the last code backup to Sajtmaskin's GitHub org.
 *
 * Kept apart from `sites-backup.ts` so the portal API (`site-overview.ts`)
 * does not import the App-token client and Git Data code just to show a date.
 * Written by `sites-backup.ts` under `project_data.meta.githubBackup`.
 */
export const GITHUB_BACKUP_META_KEY = "githubBackup";

export type GithubBackupStatus = {
  /** `org/site-<projectId>` */
  repo: string;
  repoUrl: string;
  commitSha: string;
  versionId: string;
  deploymentId: string | null;
  /** ISO timestamp of the backup commit. */
  at: string;
};

export function readGithubBackupFromMeta(
  meta: Record<string, unknown> | null | undefined,
): GithubBackupStatus | null {
  if (!meta || typeof meta !== "object") return null;
  const raw = (meta as Record<string, unknown>)[GITHUB_BACKUP_META_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const status = raw as Record<string, unknown>;
  if (
    typeof status.repo !== "string" ||
    typeof status.repoUrl !== "string" ||
    typeof status.commitSha !== "string" ||
    typeof status.versionId !== "string" ||
    typeof status.at !== "string"
  ) {
    return null;
  }
  return {
    repo: status.repo,
    repoUrl: status.repoUrl,
    commitSha: status.commitSha,
    versionId: status.versionId,
    deploymentId: typeof status.deploymentId === "string" ? status.deploymentId : null,
    at: status.at,
  };
}
