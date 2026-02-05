import { NextResponse } from "next/server";
import { assertV0Key, v0 } from "@/lib/v0";
import { db } from "@/lib/db/client";
import { chats, versions } from "@/lib/db/schema";
import { nanoid } from "nanoid";
import { withRateLimit } from "@/lib/rateLimit";
import { z } from "zod/v4";
import { ensureProjectForRequest } from "@/lib/tenant";
import { getCurrentUser } from "@/lib/auth/auth";
import { ensureSessionIdFromRequest } from "@/lib/auth/session";
import { sanitizeV0Metadata } from "@/lib/v0/sanitize-metadata";
import { prepareCredits } from "@/lib/credits/server";

export const runtime = "nodejs";

type GitHubRepoRef = {
  owner: string;
  repo: string;
};

function normalizeGithubRepoUrl(
  inputUrl: string,
  inputBranch?: string,
): { repoUrl: string; branch?: string } {
  try {
    const url = new URL(inputUrl);
    const host = url.hostname.replace(/^www\./, "");
    const parts = url.pathname.split("/").filter(Boolean);

    if (host !== "github.com") {
      return { repoUrl: inputUrl, ...(inputBranch ? { branch: inputBranch } : {}) };
    }

    const owner = parts[0];
    const repoRaw = parts[1];
    if (!owner || !repoRaw) {
      return { repoUrl: inputUrl, ...(inputBranch ? { branch: inputBranch } : {}) };
    }

    const repo = repoRaw.replace(/\.git$/i, "");

    let branch = inputBranch?.trim() || "";
    if (!branch) {
      const treeIdx = parts.indexOf("tree");
      if (treeIdx >= 0 && typeof parts[treeIdx + 1] === "string") {
        branch = parts[treeIdx + 1];
      }
    }

    const repoUrl = `https://github.com/${owner}/${repo}`;
    return { repoUrl, ...(branch ? { branch } : {}) };
  } catch {
    return { repoUrl: inputUrl, ...(inputBranch ? { branch: inputBranch } : {}) };
  }
}

function parseGithubRepo(repoUrl: string): GitHubRepoRef | null {
  try {
    const url = new URL(repoUrl);
    const host = url.hostname.replace(/^www\./, "");
    if (host !== "github.com") return null;
    const [owner, repoRaw] = url.pathname.split("/").filter(Boolean);
    if (!owner || !repoRaw) return null;
    return { owner, repo: repoRaw.replace(/\.git$/i, "") };
  } catch {
    return null;
  }
}

async function fetchGithubRepoMeta(
  repo: GitHubRepoRef,
  token?: string | null,
): Promise<{ private: boolean; defaultBranch: string } | null> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}`, {
    headers,
  }).catch(() => null);

  if (!response || !response.ok) {
    return null;
  }

  const data = (await response.json()) as { private?: boolean; default_branch?: string };
  return {
    private: Boolean(data.private),
    defaultBranch: data.default_branch || "",
  };
}

function buildGithubZipUrl(repo: GitHubRepoRef, branch: string): string {
  const safeBranch = branch.trim();
  return `https://github.com/${repo.owner}/${repo.repo}/archive/refs/heads/${encodeURIComponent(
    safeBranch,
  )}.zip`;
}

async function downloadGithubZipBase64(params: {
  repo: GitHubRepoRef;
  branch: string;
  token: string;
  maxBytes: number;
}): Promise<{ base64: string; byteLength: number }> {
  const response = await fetch(
    `https://api.github.com/repos/${params.repo.owner}/${params.repo.repo}/zipball/${encodeURIComponent(
      params.branch,
    )}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${params.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  if (!response.ok) {
    throw new Error("Failed to download GitHub archive");
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > params.maxBytes) {
    throw new Error("Repository ZIP is too large for import");
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > params.maxBytes) {
    throw new Error("Repository ZIP is too large for import");
  }

  return { base64: buffer.toString("base64"), byteLength: buffer.byteLength };
}

const initChatSchema = z.object({
  source: z.union([
    z.object({
      type: z.literal("github"),
      url: z.string().url("Invalid GitHub URL"),
      branch: z.string().optional(),
      preferZip: z.boolean().optional(),
    }),
    z.object({
      type: z.literal("zip"),
      content: z.string().min(1, "ZIP content is required"),
    }),
    z.object({
      type: z.literal("zip"),
      url: z.string().url("Invalid ZIP URL"),
    }),
  ]),
  message: z.string().optional(),
  projectId: z.string().optional(),
  lockConfigFiles: z.boolean().default(false),
  lockedFiles: z.array(z.string()).optional(),
});

export async function POST(req: Request) {
  const session = ensureSessionIdFromRequest(req);
  const sessionId = session.sessionId;
  const attachSessionCookie = (response: Response) => {
    if (session.setCookie) {
      response.headers.set("Set-Cookie", session.setCookie);
    }
    return response;
  };
  return withRateLimit(req, "chat:create", async () => {
    try {
      assertV0Key();

      const body = await req.json().catch(() => ({}));

      const validationResult = initChatSchema.safeParse(body);
      if (!validationResult.success) {
        return attachSessionCookie(
          NextResponse.json(
            { error: "Validation failed", details: validationResult.error.issues },
            { status: 400 },
          ),
        );
      }

      const { source, message, projectId, lockConfigFiles, lockedFiles } = validationResult.data;

      const configLockedFiles =
        lockedFiles ||
        (lockConfigFiles
          ? [
              "package.json",
              "tsconfig.json",
              "next.config.js",
              "next.config.mjs",
              "tailwind.config.cjs",
              "tailwind.config.js",
              ".env",
              ".env.local",
              ".gitignore",
            ]
          : []);
      const lockedSet = new Set(configLockedFiles.map((p) => p.replace(/^\.?\//, "")));

      const initParams: any = {
        ...(projectId ? { projectId } : {}),
        ...(message ? { message } : {}),
      };

      if (source.type === "github") {
        const normalized = normalizeGithubRepoUrl(source.url, source.branch);
        const repoRef = parseGithubRepo(normalized.repoUrl);
        const preferZip = Boolean(source.preferZip);
        const user = await getCurrentUser(req);
        const githubToken = user?.github_token || null;
        const repoMeta = repoRef ? await fetchGithubRepoMeta(repoRef, githubToken) : null;
        const resolvedBranch = normalized.branch || repoMeta?.defaultBranch || "";
        const isPrivate = repoMeta?.private ?? false;

        if (preferZip || (isPrivate && githubToken)) {
          if (!repoRef) {
            return attachSessionCookie(
              NextResponse.json({ error: "Invalid GitHub repository URL" }, { status: 400 }),
            );
          }
          if (!resolvedBranch) {
            return attachSessionCookie(
              NextResponse.json(
                { error: "Branch is required for ZIP import. Please specify a branch." },
                { status: 400 },
              ),
            );
          }
          if (isPrivate) {
            if (!githubToken) {
              return attachSessionCookie(
                NextResponse.json(
                  { error: "Connect GitHub to import private repositories." },
                  { status: 401 },
                ),
              );
            }
            const zip = await downloadGithubZipBase64({
              repo: repoRef,
              branch: resolvedBranch,
              token: githubToken,
              maxBytes: 50 * 1024 * 1024,
            });
            initParams.type = "zip";
            initParams.zip = { content: zip.base64 };
          } else {
            initParams.type = "zip";
            initParams.zip = { url: buildGithubZipUrl(repoRef, resolvedBranch) };
          }
        } else {
          initParams.type = "repo";
          initParams.repo = {
            url: normalized.repoUrl,
            ...(normalized.branch ? { branch: normalized.branch } : {}),
          };
        }
      } else {
        initParams.type = "zip";
        initParams.zip = "content" in source ? { content: source.content } : { url: source.url };
      }

      const creditCheck = await prepareCredits(
        req,
        "prompt.create",
        { modelId: "v0-pro" },
        { sessionId },
      );
      if (!creditCheck.ok) {
        return attachSessionCookie(creditCheck.response);
      }

      const result = await (v0.chats as any).init(initParams);

      try {
        if (lockConfigFiles) {
          const v0ChatIdCandidate =
            (result && typeof result === "object" && (result as any).id) ||
            (result && typeof result === "object" && (result as any).chat?.id) ||
            null;

          if (typeof v0ChatIdCandidate === "string" && v0ChatIdCandidate.length > 0) {
            const v0Chat = await v0.chats.getById({ chatId: v0ChatIdCandidate });
            const latestVersionId =
              (v0Chat as any)?.latestVersion?.id ||
              (v0Chat as any)?.latestVersion?.versionId ||
              null;

            if (latestVersionId) {
              const version = await v0.chats.getVersion({
                chatId: v0ChatIdCandidate,
                versionId: latestVersionId,
                includeDefaultFiles: true,
              });

              const files = Array.isArray((version as any)?.files) ? (version as any).files : [];
              if (files.length > 0) {
                const updatedFiles = files.map((f: any) => {
                  const rawName = typeof f?.name === "string" ? f.name : "";
                  const normalized = rawName.replace(/^\.?\//, "");
                  const shouldLock = lockedSet.has(normalized);
                  return {
                    name: rawName,
                    content: typeof f?.content === "string" ? f.content : "",
                    locked: shouldLock,
                  };
                });

                await v0.chats.updateVersion({
                  chatId: v0ChatIdCandidate,
                  versionId: latestVersionId,
                  files: updatedFiles,
                });
              }
            }
          }
        }
      } catch (lockErr) {
        console.error("Failed to lock config files after init:", lockErr);
      }

      let internalChatId: string | null = null;
      let internalProjectId: string | null = null;
      try {
        internalChatId = nanoid();
        const chatResult = "id" in result ? result : null;
        const v0ProjectId =
          (chatResult && "projectId" in chatResult ? chatResult.projectId : null) ||
          projectId ||
          "";

        if (v0ProjectId) {
          const importName =
            source.type === "github"
              ? (() => {
                  const normalized = normalizeGithubRepoUrl(source.url, source.branch);
                  try {
                    const u = new URL(normalized.repoUrl);
                    return `Import: ${u.pathname.replace(/^\//, "")}`;
                  } catch {
                    return `Import: ${source.url}`;
                  }
                })()
              : `ZIP Import ${new Date().toISOString().slice(0, 10)}`;

          const project = await ensureProjectForRequest({
            req,
            v0ProjectId,
            name: importName,
            sessionId,
          });
          internalProjectId = project.id;
        }

        if (chatResult && "id" in chatResult) {
          await db.insert(chats).values({
            id: internalChatId,
            v0ChatId: chatResult.id,
            v0ProjectId,
            projectId: internalProjectId,
            webUrl: ("webUrl" in chatResult ? chatResult.webUrl : null) || null,
          });

          const latestVersion = (chatResult as any).latestVersion;
          if (latestVersion) {
            const versionId = latestVersion.id || latestVersion.versionId;
            const demoUrl = latestVersion.demoUrl || latestVersion.demo_url || null;

            if (versionId) {
              await db.insert(versions).values({
                id: nanoid(),
                chatId: internalChatId,
                v0VersionId: versionId,
                v0MessageId: latestVersion.messageId || null,
                demoUrl: demoUrl,
                metadata: sanitizeV0Metadata(latestVersion),
              });
            }
          }
        }
      } catch (dbError) {
        console.error("Failed to save init chat to database:", dbError);
      }

      try {
        await creditCheck.commit();
      } catch (error) {
        console.error("[credits] Failed to charge init:", error);
      }

      return attachSessionCookie(
        NextResponse.json({
          ...result,
          internalChatId,
          projectId: internalProjectId,
          source: source.type,
          lockedFiles: configLockedFiles,
        }),
      );
    } catch (err) {
      console.error("Init chat error:", err);
      return attachSessionCookie(
        NextResponse.json(
          { error: err instanceof Error ? err.message : "Unknown error" },
          { status: 500 },
        ),
      );
    }
  });
}
