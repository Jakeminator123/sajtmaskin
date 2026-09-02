import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRateLimit } from "@/lib/rate-limit";
import { getEngineChatByIdForRequest } from "@/lib/tenant";
import { getVersionById } from "@/lib/db/chat-repository-pg";
import { parseCodeFilesFromFilesJson } from "@/lib/gen/version-manager";
import { buildPortableExportProject } from "@/lib/gen/export/build-portable-export-project";
import {
  GITHUB_EXPORT_MANIFEST_PATH,
  GitHubExportPathConflictError,
  buildGitHubExportPlan,
  parseGitHubExportManifest,
} from "@/lib/gen/export/github-tree-plan";
import { getCurrentUser } from "@/lib/auth/auth";

export const runtime = "nodejs";

const exportSchema = z.object({
  chatId: z.string().min(1, "chatId is required"),
  versionId: z.string().min(1, "versionId is required"),
  repo: z.string().min(1, "repo is required"),
  private: z.boolean().optional(),
});

type GitHubRepoResponse = {
  full_name: string;
  html_url: string;
  default_branch: string;
};

type GitHubRefResponse = {
  object: { sha: string };
};

type GitHubCommitResponse = {
  sha: string;
  tree: { sha: string };
};

type GitHubTreeResponse = {
  sha: string;
};

type GitHubTreeListingResponse = {
  tree: Array<{
    path: string;
    type: "blob" | "tree" | "commit";
    sha?: string;
  }>;
  truncated?: boolean;
};

type GitHubBlobResponse = {
  content?: string;
  encoding?: string;
};

const GITHUB_API = "https://api.github.com";

function normalizeRepoInput(
  input: string,
  fallbackOwner: string,
): {
  owner: string;
  repo: string;
} {
  const trimmed = input.trim().replace(/\.git$/i, "");
  if (trimmed.includes("/")) {
    const [owner, repo] = trimmed.split("/", 2);
    return { owner: owner.trim(), repo: repo.trim() };
  }
  return { owner: fallbackOwner, repo: trimmed };
}

function sanitizeRepoName(value: string): string {
  return value
    .trim()
    .replace(/[^a-z0-9-_./]+/gi, "-")
    .replace(/\.+/g, ".")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .slice(0, 80);
}

async function githubRequest<T>(
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

async function ensureRepo(params: {
  token: string;
  owner: string;
  repo: string;
  isPrivate: boolean;
  fallbackOwner: string;
}): Promise<{ repo: GitHubRepoResponse; created: boolean }> {
  const { token, owner, repo, isPrivate, fallbackOwner } = params;
  const repoPath = `/repos/${owner}/${repo}`;
  const existing = await githubRequest<GitHubRepoResponse>(token, repoPath);
  if (existing.ok && existing.data) {
    return { repo: existing.data, created: false };
  }

  if (existing.status !== 404) {
    throw new Error("Failed to access GitHub repository");
  }

  const isOrg = owner !== fallbackOwner;
  const createPath = isOrg ? `/orgs/${owner}/repos` : "/user/repos";
  const createRes = await githubRequest<GitHubRepoResponse>(token, createPath, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: repo,
      private: isPrivate,
      auto_init: false,
    }),
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

export async function POST(request: NextRequest) {
  return withRateLimit(request, "github:export", async () => {
    try {
      const user = await getCurrentUser(request);
      if (!user || !user.github_token || !user.github_username) {
        return NextResponse.json(
          {
            success: false,
            error: "GitHub is not connected",
            setup: "Connect GitHub via /api/auth/github",
          },
          { status: 401 },
        );
      }

      const body = await request.json().catch(() => null);
      const parsed = exportSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: "Validation failed", details: parsed.error.issues },
          { status: 400 },
        );
      }

      const { chatId, versionId, repo: repoInput, private: isPrivate = true } = parsed.data;
      const repoParsed = normalizeRepoInput(repoInput, user.github_username);
      const owner = sanitizeRepoName(repoParsed.owner);
      const repoName = sanitizeRepoName(repoParsed.repo);
      if (!owner || !repoName) {
        return NextResponse.json({ success: false, error: "Invalid repo name" }, { status: 400 });
      }

      const engineChat = await getEngineChatByIdForRequest(request, chatId);
      if (!engineChat) {
        return NextResponse.json(
          {
            success: false,
            error: "Legacy V0-export är inte längre tillgänglig. Export fungerar bara för own-engine-chattar.",
          },
          { status: 410 },
        );
      }

      const ev = await getVersionById(versionId);
      if (!ev || ev.chat_id !== engineChat.id) {
        return NextResponse.json({ success: false, error: "Version not found" }, { status: 404 });
      }
      const rawFiles = parseCodeFilesFromFilesJson(ev.files_json) ?? [];
      const portableProject = await buildPortableExportProject(rawFiles, chatId);
      const previewFiles = buildGitHubExportPlan(portableProject).files.filter(
        (file) => file.path !== GITHUB_EXPORT_MANIFEST_PATH,
      );
      if (previewFiles.length === 0) {
        return NextResponse.json(
          { success: false, error: "No files available to export" },
          { status: 400 },
        );
      }
      const exportLabel = `${chatId}:${versionId}`;

      const token = user.github_token;
      const repoResult = await ensureRepo({
        token,
        owner,
        repo: repoName,
        isPrivate,
        fallbackOwner: user.github_username,
      });

      const base = await getBaseCommit({
        token,
        owner,
        repo: repoName,
        branch: repoResult.repo.default_branch || "main",
      });
      const existingTree = base
        ? await getBaseTree({
            token,
            owner,
            repo: repoName,
            treeSha: base.treeSha,
          })
        : [];
      const previousManifestPaths = base
        ? await readPreviousExportManifest({
            token,
            owner,
            repo: repoName,
            tree: existingTree,
          })
        : [];
      const existingBlobPaths = existingTree
        .filter((entry) => entry.type !== "tree")
        .map((entry) => entry.path);

      let files: ReturnType<typeof buildGitHubExportPlan>["files"];
      let deletionPaths: string[];
      try {
        const plan = buildGitHubExportPlan(portableProject, {
          previousManifestPaths,
          existingBlobPaths,
        });
        files = plan.files;
        deletionPaths = plan.deletionPaths;
      } catch (error) {
        if (error instanceof GitHubExportPathConflictError) {
          return NextResponse.json(
            { success: false, error: error.message },
            { status: 409 },
          );
        }
        throw error;
      }

      const treeEntries: Array<{
        path: string;
        mode: "100644";
        type: "blob";
        sha: string | null;
      }> = [];
      for (const file of files) {
        const response = await githubRequest<{ sha: string }>(
          token,
          `/repos/${owner}/${repoName}/git/blobs`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content: Buffer.from(file.content, "utf8").toString("base64"),
              encoding: "base64",
            }),
          },
        );

        if (!response.ok || !response.data) {
          throw new Error("Failed to upload files to GitHub");
        }

        treeEntries.push({
          path: file.path,
          mode: "100644",
          type: "blob",
          sha: response.data.sha,
        });
      }
      for (const path of deletionPaths) {
        // GitHub Create-tree requires path+mode+type+sha; sha:null deletes.
        treeEntries.push({
          path,
          mode: "100644",
          type: "blob",
          sha: null,
        });
      }

      const treeResponse = await githubRequest<GitHubTreeResponse>(
        token,
        `/repos/${owner}/${repoName}/git/trees`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tree: treeEntries,
            ...(base?.treeSha ? { base_tree: base.treeSha } : {}),
          }),
        },
      );

      if (!treeResponse.ok || !treeResponse.data) {
        throw new Error("Failed to create GitHub tree");
      }

      const commitResponse = await githubRequest<GitHubCommitResponse>(
        token,
        `/repos/${owner}/${repoName}/git/commits`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: `Export from Sajtmaskin (${exportLabel})`,
            tree: treeResponse.data.sha,
            ...(base?.commitSha ? { parents: [base.commitSha] } : {}),
          }),
        },
      );

      if (!commitResponse.ok || !commitResponse.data) {
        throw new Error("Failed to create GitHub commit");
      }

      if (base?.commitSha) {
        const updateRef = await githubRequest(
          token,
          `/repos/${owner}/${repoName}/git/refs/heads/${repoResult.repo.default_branch}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sha: commitResponse.data.sha }),
          },
        );
        if (!updateRef.ok) {
          throw new Error("Failed to update GitHub branch");
        }
      } else {
        const createRef = await githubRequest(token, `/repos/${owner}/${repoName}/git/refs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ref: `refs/heads/${repoResult.repo.default_branch || "main"}`,
            sha: commitResponse.data.sha,
          }),
        });
        if (!createRef.ok) {
          throw new Error("Failed to create GitHub branch");
        }
      }

      return NextResponse.json({
        success: true,
        repo: repoResult.repo.full_name,
        repoUrl: repoResult.repo.html_url,
        created: repoResult.created,
        commitSha: commitResponse.data.sha,
      });
    } catch (error) {
      console.error("[API/GitHub Export] Error:", error);
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 },
      );
    }
  });
}
