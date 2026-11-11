/**
 * Automatic code backup of a published version into Sajtmaskin's own GitHub
 * organisation (`GITHUB_SITES_ORG`), authenticated as the GitHub App.
 *
 * Why: customers rarely have GitHub, so "export to your GitHub" is used by
 * almost nobody. A copy in our org gives every site a durable history outside
 * the database, a repo we can hand over (`transfer`) when a customer leaves,
 * and code we can read when debugging their site.
 *
 * What is NOT here: the customer never gets access to this repo by itself (it
 * is private in our org), the database stays the source of truth, and a failed
 * backup must never fail or delay a publish — the deploy route runs this with
 * `after()` and swallows errors into a warning.
 *
 * Repo naming: `site-<projectId>`, never the customer's name (collisions, and a
 * repo name leaks into URLs).
 */
import { FEATURES, SECRETS } from "@/lib/config";
import { getVersionById } from "@/lib/db/chat-repository-pg";
import { getProjectData, saveProjectData } from "@/lib/db/services/projects";
import { buildPortableExportProject } from "@/lib/gen/export/build-portable-export-project";
import type { GitHubExportSourceFile } from "@/lib/gen/export/github-tree-plan";
import { sanitizeEnvSecretsForPublicExport } from "@/lib/gen/export/sanitize-public-export";
import { parseCodeFilesFromFilesJson } from "@/lib/gen/version-manager";
import { applyBusinessFactsToFiles } from "@/lib/projects/business-facts-module";
import { readBusinessFactsForDeploy } from "@/lib/projects/business-facts-schema";
import { loadProjectExportMedia } from "@/lib/projects/project-export-media";
import { createInstallationTokenClient } from "./app-installation-token";
import { GITHUB_BACKUP_META_KEY, type GithubBackupStatus } from "./backup-status";
import { commitExportToGitHub, sanitizeRepoName } from "./git-data-export";

let tokenClient: ReturnType<typeof createInstallationTokenClient> | null = null;

function getTokenClient() {
  if (!tokenClient) {
    tokenClient = createInstallationTokenClient({
      appId: SECRETS.githubAppId,
      privateKey: SECRETS.githubAppPrivateKey,
      installationId: SECRETS.githubAppInstallationId,
    });
  }
  return tokenClient;
}

/** Test seam: drop the cached token client. */
export function resetSitesBackupTokenClientForTests(): void {
  tokenClient = null;
}

export function backupRepoNameForProject(projectId: string): string {
  return sanitizeRepoName(`site-${projectId}`);
}

function safeMediaFileName(originalName: string, id: number | string): string {
  const basename = originalName.replace(/\\/g, "/").split("/").pop() || "media.bin";
  const dot = basename.lastIndexOf(".");
  const stem = (dot > 0 ? basename.slice(0, dot) : basename)
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const ext = (dot > 0 ? basename.slice(dot) : "")
    .toLowerCase()
    .replace(/[^.a-z0-9]/g, "")
    .slice(0, 12);
  return `${id}-${stem || "media"}${ext || ".bin"}`;
}

/**
 * Manual-backup fallback: the stored version with secrets stripped and a marked
 * `lib/business-facts.ts` rewritten from the current facts (unknown facts leave
 * the stored file as-is, same rule as the deploy route).
 */
async function storedVersionFilesWithCurrentFacts(params: {
  version: { files_json: unknown };
  chatId: string;
  projectId: string;
}): Promise<Array<{ path: string; content: string }>> {
  const rawFiles = parseCodeFilesFromFilesJson(params.version.files_json as string) ?? [];
  const portable = await buildPortableExportProject(rawFiles, params.chatId);
  const sanitized = sanitizeEnvSecretsForPublicExport(portable);
  const projectData = await getProjectData(params.projectId).catch(() => null);
  const facts = projectData
    ? readBusinessFactsForDeploy(
        (projectData.meta as Record<string, unknown> | null | undefined) ?? {},
      )
    : null;
  if (!facts) return sanitized.map((file) => ({ path: file.path, content: file.content }));
  return applyBusinessFactsToFiles(
    sanitized.map((file) => ({ name: file.path, content: file.content })),
    facts,
  ).files.map((file) => ({ path: file.name, content: file.content }));
}

export interface BackupPublishedVersionParams {
  projectId: string;
  chatId: string;
  versionId: string;
  deploymentId: string | null;
  /** Owner of the project; media in the library are scoped by user. `null` for session projects. */
  userId: string | null;
  /**
   * The exact text files the deploy sent to Vercel (after SEO pass, business
   * facts rewrite and canonical metadata). When given, the backup is this
   * snapshot — not a re-read of the version, which could miss or race a portal
   * edit. Omitted only for a manual backup of a stored version.
   */
  publishedFiles?: ReadonlyArray<{ path: string; content: string }>;
}

/**
 * Commit the published version's source (plus uploaded media) to
 * `GITHUB_SITES_ORG/site-<projectId>` and record the result under
 * `project_data.meta.githubBackup`. Returns `null` when the feature is off.
 *
 * What the repo holds when called from the deploy route: the exact text files
 * that went live (`publishedFiles`: SEO pass, business-facts rewrite and
 * canonical metadata already applied) with secrets stripped, plus media as
 * files. Without `publishedFiles` (manual backup of a stored version) it falls
 * back to the version's files with `lib/business-facts.ts` rewritten from the
 * current Företagsuppgifter. Media URLs are not rewritten; the live site keeps
 * pointing at Vercel Blob.
 */
export async function backupPublishedVersion(
  params: BackupPublishedVersionParams,
): Promise<GithubBackupStatus | null> {
  if (!FEATURES.useGitHubSitesOrg) return null;
  const { projectId, chatId, versionId, deploymentId, userId, publishedFiles } = params;

  const version = await getVersionById(versionId);
  if (!version || version.chat_id !== chatId) {
    throw new Error(`Backup: version ${versionId} does not belong to chat ${chatId}`);
  }

  const safeFiles = publishedFiles
    ? sanitizeEnvSecretsForPublicExport(
        publishedFiles.map((file) => ({ path: file.path, content: file.content, language: "" })),
      ).map((file) => ({ path: file.path, content: file.content }))
    : await storedVersionFilesWithCurrentFacts({ version, chatId, projectId });

  const media = userId
    ? await loadProjectExportMedia({
        projectId,
        userId,
        referencedText: safeFiles.map((file) => file.content).join("\n"),
      })
    : [];

  const files: GitHubExportSourceFile[] = [
    ...safeFiles.map((file) => ({ path: file.path, content: file.content })),
    ...media.map((item) => ({
      path: `public/media/${safeMediaFileName(item.originalName, item.id)}`,
      content: item.body,
    })),
  ];

  const { token } = await getTokenClient().getToken();
  const result = await commitExportToGitHub({
    token,
    owner: SECRETS.githubSitesOrg,
    repo: backupRepoNameForProject(projectId),
    isPrivate: true,
    requirePrivate: true,
    ownerIsOrg: true,
    files,
    commitMessage: `Publish ${deploymentId ?? "manual"} — version ${versionId}`,
    // One tree request for all text files: stays far under GitHub's
    // 500 content-creating requests/hour even with many publishes.
    textTransport: "inline",
  });

  const status: GithubBackupStatus = {
    repo: result.repo.full_name,
    repoUrl: result.repo.html_url,
    commitSha: result.commitSha,
    versionId,
    deploymentId,
    at: new Date().toISOString(),
  };
  await saveProjectData({
    project_id: projectId,
    meta_patch: { [GITHUB_BACKUP_META_KEY]: status },
  });
  return status;
}
