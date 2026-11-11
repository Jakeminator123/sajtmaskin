/**
 * Last export of a project to the customer's own GitHub (OAuth token), stored
 * under `project_data.meta.githubExport` so the next export suggests the same
 * repo. Separate namespace from `githubBackup` (Sajtmaskin's own org backup).
 *
 * Only a hint for the export dialog: the export route still resolves owner and
 * repo from the request, and the customer can type another repo.
 */
export const GITHUB_EXPORT_META_KEY = "githubExport";

export type GithubExportStatus = {
  /** `owner/repo` as GitHub returned it. */
  repo: string;
  repoUrl: string;
  commitSha: string;
  versionId: string;
  /** ISO timestamp of the export commit. */
  at: string;
};

export function readGithubExportFromMeta(meta: unknown): GithubExportStatus | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const raw = (meta as Record<string, unknown>)[GITHUB_EXPORT_META_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const status = raw as Record<string, unknown>;
  if (
    typeof status.repo !== "string" ||
    !status.repo.includes("/") ||
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
    at: status.at,
  };
}
