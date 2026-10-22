/**
 * Commit a Sajtmaskin export into a GitHub repository with the Git Data API.
 *
 * One owner for two callers:
 *   - `POST /api/github/export` — the customer's own GitHub (OAuth token).
 *   - `sites-backup.ts` — Sajtmaskin's sites organisation (App installation token).
 *
 * The flow is an incremental export, never a force-push: read the base commit
 * and tree, let `buildGitHubExportPlan` decide which paths to write and which
 * Sajtmaskin-owned paths to delete, then create tree → commit → move the branch.
 *
 * Empty repositories (just created, or created by the customer without a
 * README) reject every Git Data call with 409. GitHub's documented way out is
 * the Contents API, so the first export seeds one of OUR files as the root
 * commit and then continues as a normal incremental export.
 *
 * `textTransport` exists because of GitHub's secondary rate limit (~500
 * content-creating requests per hour). `blob` uploads one blob per file and
 * preserves bytes exactly — right for the customer export. `inline` sends text
 * files in the tree request itself (one call for the whole site) and only
 * uploads blobs for binaries — right for an automatic backup on every publish.
 */
import {
  GITHUB_EXPORT_MANIFEST_PATH,
  buildGitHubExportPlan,
  parseGitHubExportManifest,
  type GitHubExportFile,
  type GitHubExportSourceFile,
} from "@/lib/gen/export/github-tree-plan";

const GITHUB_API = "https://api.github.com";

export type GitHubRepoSummary = {
  full_name: string;
  html_url: string;
  default_branch: string;
};

type GitHubRefResponse = { object: { sha: string } };
type GitHubCommitResponse = { sha: string; tree: { sha: string } };
type GitHubTreeResponse = { sha: string };
type GitHubTreeListingResponse = {
  tree: Array<{ path: string; type: "blob" | "tree" | "commit"; sha?: string }>;
  truncated?: boolean;
};
type GitHubBlobResponse = { content?: string; encoding?: string };

type GitHubTreeEntry =
  | { path: string; mode: "100644"; type: "blob"; sha: string | null }
  | { path: string; mode: "100644"; type: "blob"; content: string };

/** The export has no files at all (an empty project). */
export class GitHubExportNoFilesError extends Error {
  readonly code = "github_export_no_files" as const;
  constructor() {
    super("No files available to export");
    this.name = "GitHubExportNoFilesError";
  }
}

export async function githubRequest<T>(
  token: string,
  path: string,
  options: RequestInit = {},
): Promise<{ ok: boolean; status: number; data: T | null }> {
  const response = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "sajtmaskin",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
  });

  const data = (await response.json().catch(() => null)) as T | null;
  return { ok: response.ok, status: response.status, data };
}

/** GitHub repo names allow letters, digits, `.`, `-` and `_`. */
export function sanitizeRepoName(value: string): string {
  return value
    .trim()
    .replace(/[^a-z0-9-_./]+/gi, "-")
    .replace(/\.+/g, ".")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .slice(0, 80);
}

async function ensureRepo(params: {
  token: string;
  owner: string;
  repo: string;
  isPrivate: boolean;
  ownerIsOrg: boolean;
}): Promise<{ repo: GitHubRepoSummary; created: boolean }> {
  const { token, owner, repo, isPrivate, ownerIsOrg } = params;
  const existing = await githubRequest<GitHubRepoSummary>(token, `/repos/${owner}/${repo}`);
  if (existing.ok && existing.data) {
    return { repo: existing.data, created: false };
  }
  if (existing.status !== 404) {
    throw new Error("Failed to access GitHub repository");
  }

  const createPath = ownerIsOrg ? `/orgs/${owner}/repos` : "/user/repos";
  const createRes = await githubRequest<GitHubRepoSummary>(token, createPath, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: repo, private: isPrivate, auto_init: false }),
  });
  if (!createRes.ok || !createRes.data) {
    throw new Error("Failed to create GitHub repository");
  }
  return { repo: createRes.data, created: true };
}

async function getBaseCommit(params: {
  token: string;
  owner: string;
  repo: string;
  branch: string;
}): Promise<{ commitSha: string; treeSha: string } | null> {
  const { token, owner, repo, branch } = params;
  const ref = await githubRequest<GitHubRefResponse>(
    token,
    `/repos/${owner}/${repo}/git/refs/heads/${branch}`,
  );
  if (!ref.ok || !ref.data) return null;

  const commit = await githubRequest<GitHubCommitResponse>(
    token,
    `/repos/${owner}/${repo}/git/commits/${ref.data.object.sha}`,
  );
  if (!commit.ok || !commit.data) return null;
  return { commitSha: commit.data.sha, treeSha: commit.data.tree.sha };
}

function toBase64(content: string | Buffer): string {
  return Buffer.isBuffer(content)
    ? content.toString("base64")
    : Buffer.from(content, "utf8").toString("base64");
}

async function initializeEmptyRepository(params: {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  file: GitHubExportFile;
}): Promise<void> {
  const { token, owner, repo, branch, file } = params;
  const encodedPath = file.path.split("/").map(encodeURIComponent).join("/");
  const response = await githubRequest<{ commit?: { sha?: string } }>(
    token,
    `/repos/${owner}/${repo}/contents/${encodedPath}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Initial export from Sajtmaskin",
        branch,
        content: toBase64(file.content),
      }),
    },
  );
  if (!response.ok) {
    throw new Error("Failed to initialize empty GitHub repository");
  }
}

async function getBaseTree(params: {
  token: string;
  owner: string;
  repo: string;
  treeSha: string;
}): Promise<GitHubTreeListingResponse["tree"]> {
  const { token, owner, repo, treeSha } = params;
  const tree = await githubRequest<GitHubTreeListingResponse>(
    token,
    `/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`,
  );
  if (!tree.ok || !tree.data) {
    throw new Error("Failed to inspect existing GitHub tree");
  }
  if (tree.data.truncated) {
    throw new Error("Existing GitHub tree is too large to export safely");
  }
  return tree.data.tree;
}

async function readPreviousExportManifest(params: {
  token: string;
  owner: string;
  repo: string;
  tree: GitHubTreeListingResponse["tree"];
}): Promise<string[]> {
  const { token, owner, repo, tree } = params;
  const manifestEntry = tree.find(
    (entry) => entry.type === "blob" && entry.path === GITHUB_EXPORT_MANIFEST_PATH && entry.sha,
  );
  if (!manifestEntry?.sha) return [];

  const blob = await githubRequest<GitHubBlobResponse>(
    token,
    `/repos/${owner}/${repo}/git/blobs/${manifestEntry.sha}`,
  );
  if (!blob.ok || !blob.data?.content) {
    throw new Error("Failed to read previous Sajtmaskin export manifest");
  }
  const encoded =
    blob.data.encoding === "base64"
      ? blob.data.content
      : Buffer.from(blob.data.content, "utf8").toString("base64");
  return parseGitHubExportManifest(Buffer.from(encoded, "base64").toString("utf8"));
}

/**
 * Inline tree content must be valid UTF-8 text. Buffers, empty files and any
 * string that does not survive a UTF-8 round trip go through the blob API.
 */
function canInlineAsText(content: string | Buffer): content is string {
  if (typeof content !== "string" || content.length === 0) return false;
  return Buffer.from(content, "utf8").toString("utf8") === content;
}

export interface CommitExportParams {
  token: string;
  owner: string;
  repo: string;
  isPrivate: boolean;
  /** `true` → repos are created under `/orgs/{owner}`, else `/user/repos`. */
  ownerIsOrg: boolean;
  files: GitHubExportSourceFile[];
  commitMessage: string;
  /** See module doc. Default `blob`. */
  textTransport?: "blob" | "inline";
}

export interface CommitExportResult {
  repo: GitHubRepoSummary;
  created: boolean;
  commitSha: string;
  fileCount: number;
  deletedCount: number;
}

/**
 * Throws `GitHubExportNoFilesError`, `GitHubExportPathConflictError` (from the
 * plan) or a plain `Error` with a GitHub step name; callers map those to HTTP.
 */
export async function commitExportToGitHub(params: CommitExportParams): Promise<CommitExportResult> {
  const { token, owner, repo, isPrivate, ownerIsOrg, files, commitMessage } = params;
  const textTransport = params.textTransport ?? "blob";

  const previewFiles = buildGitHubExportPlan(files).files.filter(
    (file) => file.path !== GITHUB_EXPORT_MANIFEST_PATH,
  );
  if (previewFiles.length === 0) throw new GitHubExportNoFilesError();

  const repoResult = await ensureRepo({ token, owner, repo, isPrivate, ownerIsOrg });
  const defaultBranch = repoResult.repo.default_branch || "main";

  // Two exports to the same branch can race (e.g. two publishes close together):
  // both read the same head, the second fast-forward PATCH is rejected with 422.
  // Re-read the head and rebuild on top of it instead of ever force-pushing.
  for (let attempt = 1; ; attempt += 1) {
    const outcome = await commitOnCurrentHead({
      token,
      owner,
      repo,
      defaultBranch,
      files,
      seedFile: previewFiles[0],
      commitMessage,
      textTransport,
    });
    if (outcome.kind === "committed") {
      return {
        repo: repoResult.repo,
        created: repoResult.created,
        commitSha: outcome.commitSha,
        fileCount: outcome.fileCount,
        deletedCount: outcome.deletedCount,
      };
    }
    if (attempt >= MAX_REF_UPDATE_ATTEMPTS) {
      throw new Error("Failed to update GitHub branch: it kept moving during export");
    }
  }
}

/** A rejected fast-forward is retried this many times in total. */
export const MAX_REF_UPDATE_ATTEMPTS = 3;

type CommitAttempt =
  | { kind: "committed"; commitSha: string; fileCount: number; deletedCount: number }
  | { kind: "ref-moved" };

async function commitOnCurrentHead(params: {
  token: string;
  owner: string;
  repo: string;
  defaultBranch: string;
  files: GitHubExportSourceFile[];
  seedFile: GitHubExportFile;
  commitMessage: string;
  textTransport: "blob" | "inline";
}): Promise<CommitAttempt> {
  const { token, owner, repo, defaultBranch, files, seedFile, commitMessage, textTransport } =
    params;

  let base = await getBaseCommit({ token, owner, repo, branch: defaultBranch });
  if (!base) {
    await initializeEmptyRepository({
      token,
      owner,
      repo,
      branch: defaultBranch,
      file: seedFile,
    });
    base = await getBaseCommit({ token, owner, repo, branch: defaultBranch });
    if (!base) throw new Error("GitHub repository is still empty after initialization");
  }

  const existingTree = await getBaseTree({ token, owner, repo, treeSha: base.treeSha });
  const previousManifestPaths = await readPreviousExportManifest({
    token,
    owner,
    repo,
    tree: existingTree,
  });
  const existingBlobPaths = existingTree
    .filter((entry) => entry.type !== "tree")
    .map((entry) => entry.path);

  // May throw GitHubExportPathConflictError — deliberately not caught here.
  const plan = buildGitHubExportPlan(files, { previousManifestPaths, existingBlobPaths });

  const treeEntries: GitHubTreeEntry[] = [];
  for (const file of plan.files) {
    if (textTransport === "inline" && canInlineAsText(file.content)) {
      treeEntries.push({ path: file.path, mode: "100644", type: "blob", content: file.content });
      continue;
    }
    const blob = await githubRequest<{ sha: string }>(token, `/repos/${owner}/${repo}/git/blobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: toBase64(file.content), encoding: "base64" }),
    });
    if (!blob.ok || !blob.data) {
      throw new Error("Failed to upload files to GitHub");
    }
    treeEntries.push({ path: file.path, mode: "100644", type: "blob", sha: blob.data.sha });
  }
  for (const path of plan.deletionPaths) {
    // GitHub Create-tree requires path+mode+type+sha; sha:null deletes.
    treeEntries.push({ path, mode: "100644", type: "blob", sha: null });
  }

  const treeResponse = await githubRequest<GitHubTreeResponse>(
    token,
    `/repos/${owner}/${repo}/git/trees`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tree: treeEntries, base_tree: base.treeSha }),
    },
  );
  if (!treeResponse.ok || !treeResponse.data) {
    throw new Error("Failed to create GitHub tree");
  }

  const commitResponse = await githubRequest<GitHubCommitResponse>(
    token,
    `/repos/${owner}/${repo}/git/commits`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: commitMessage,
        tree: treeResponse.data.sha,
        parents: [base.commitSha],
      }),
    },
  );
  if (!commitResponse.ok || !commitResponse.data) {
    throw new Error("Failed to create GitHub commit");
  }

  // The branch always exists here: either it had commits, or the seed commit
  // created it. One code path, no "create ref" twin to drift. No `force`: a
  // moved branch is a 422 "not a fast forward", which the caller retries.
  const updateRef = await githubRequest(token, `/repos/${owner}/${repo}/git/refs/heads/${defaultBranch}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sha: commitResponse.data.sha, force: false }),
  });
  if (updateRef.status === 422) {
    return { kind: "ref-moved" };
  }
  if (!updateRef.ok) {
    throw new Error("Failed to update GitHub branch");
  }

  return {
    kind: "committed",
    commitSha: commitResponse.data.sha,
    fileCount: plan.files.length,
    deletedCount: plan.deletionPaths.length,
  };
}
