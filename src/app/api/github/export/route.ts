import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { assertV0Key, v0 } from "@/lib/v0";
import { withRateLimit } from "@/lib/rateLimit";
import { db } from "@/lib/db/client";
import { versions } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getChatByIdForRequest, getChatByV0ChatIdForRequest } from "@/lib/tenant";
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

const GITHUB_API = "https://api.github.com";
const BLOCKED_PATHS = ["node_modules/", ".git/"];
const BLOCKED_FILES = [".env", ".env.local", ".env.production", ".env.development", ".env.test"];

function normalizeRepoInput(input: string, fallbackOwner: string): {
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

function normalizeFilePath(raw: string): string | null {
  const normalized = raw.replace(/^\.?\//, "").replace(/^\/+/, "");
  if (!normalized) return null;
  if (normalized.split("/").some((seg) => seg === "..")) return null;
  if (BLOCKED_FILES.some((name) => normalized === name || normalized.startsWith(`${name}/`))) {
    return null;
  }
  if (BLOCKED_PATHS.some((prefix) => normalized.startsWith(prefix))) {
    return null;
  }
  return normalized;
}

async function githubRequest<T>(
  token: string,
  path: string,
  options: RequestInit = {}
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
    `/repos/${owner}/${repo}/git/refs/heads/${branch}`
  );
  if (!ref.ok || !ref.data) return null;

  const commit = await githubRequest<GitHubCommitResponse>(
    token,
    `/repos/${owner}/${repo}/git/commits/${ref.data.object.sha}`
  );
  if (!commit.ok || !commit.data) return null;

  return { commitSha: commit.data.sha, treeSha: commit.data.tree.sha };
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
          { status: 401 }
        );
      }

      const body = await request.json().catch(() => null);
      const parsed = exportSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: "Validation failed", details: parsed.error.issues },
          { status: 400 }
        );
      }

      const { chatId, versionId, repo: repoInput, private: isPrivate = true } = parsed.data;
      const repoParsed = normalizeRepoInput(repoInput, user.github_username);
      const owner = sanitizeRepoName(repoParsed.owner);
      const repoName = sanitizeRepoName(repoParsed.repo);
      if (!owner || !repoName) {
        return NextResponse.json(
          { success: false, error: "Invalid repo name" },
          { status: 400 }
        );
      }

      assertV0Key();

      let chat = await getChatByV0ChatIdForRequest(request, chatId);
      if (!chat) chat = await getChatByIdForRequest(request, chatId);
      if (!chat) {
        return NextResponse.json({ success: false, error: "Chat not found" }, { status: 404 });
      }

      let version = await db
        .select()
        .from(versions)
        .where(and(eq(versions.chatId, chat.id), eq(versions.id, versionId)))
        .limit(1);

      if (version.length === 0) {
        version = await db
          .select()
          .from(versions)
          .where(and(eq(versions.chatId, chat.id), eq(versions.v0VersionId, versionId)))
          .limit(1);
      }

      if (version.length === 0) {
        return NextResponse.json({ success: false, error: "Version not found" }, { status: 404 });
      }

      const v0VersionId = version[0].v0VersionId;
      const v0ChatId = chat.v0ChatId;

      const v0Version = await v0.chats.getVersion({
        chatId: v0ChatId,
        versionId: v0VersionId,
        includeDefaultFiles: true,
      });

      const rawFiles = Array.isArray((v0Version as any)?.files)
        ? ((v0Version as any).files as Array<{ name?: string; content?: string }>)
        : [];

      const files = rawFiles
        .map((file) => ({
          name: typeof file.name === "string" ? file.name : "",
          content: typeof file.content === "string" ? file.content : "",
        }))
        .map((file) => ({
          path: normalizeFilePath(file.name),
          content: file.content,
        }))
        .filter((file) => Boolean(file.path && file.content));

      if (files.length === 0) {
        return NextResponse.json(
          { success: false, error: "No files available to export" },
          { status: 400 }
        );
      }

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

      const treeEntries = [];
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
          }
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
        }
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
            message: `Export from Sajtmaskin (${v0ChatId}:${v0VersionId})`,
            tree: treeResponse.data.sha,
            ...(base?.commitSha ? { parents: [base.commitSha] } : {}),
          }),
        }
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
          }
        );
        if (!updateRef.ok) {
          throw new Error("Failed to update GitHub branch");
        }
      } else {
        const createRef = await githubRequest(
          token,
          `/repos/${owner}/${repoName}/git/refs`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ref: `refs/heads/${repoResult.repo.default_branch || "main"}`,
              sha: commitResponse.data.sha,
            }),
          }
        );
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
        { status: 500 }
      );
    }
  });
}
