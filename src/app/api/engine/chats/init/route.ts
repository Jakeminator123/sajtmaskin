import JSZip from "jszip";
import { NextResponse } from "next/server";
import { withRateLimit } from "@/lib/rateLimit";
import { z } from "zod/v4";
import { createProject as createAppProject, saveProjectData } from "@/lib/db/services/projects";
import * as chatRepo from "@/lib/db/chat-repository-pg";
import { getCurrentUser } from "@/lib/auth/auth";
import { ensureSessionIdFromRequest } from "@/lib/auth/session";
import { prepareCredits } from "@/lib/credits/server";
import { resolveAppProjectIdForRequest } from "@/lib/tenant";
import { DEFAULT_MODEL_ID } from "@/lib/models/catalog";
import { resolveEngineModelId } from "@/lib/models/selection";
import type { CodeFile } from "@/lib/gen/parser";
import { startPreviewSession } from "@/lib/gen/preview/preview-session";
import { previewUrlField } from "@/lib/api/preview-url-contract";
import { inferFileLanguage } from "@/lib/utils/infer-file-language";
import { isBlockedEnvImportFilename } from "@/lib/templates/env-import-guard";
import { normalizeImportedRepoFiles } from "@/lib/templates/normalize-imported-package-json";

export const runtime = "nodejs";

const MAX_IMPORT_ARCHIVE_BYTES = 50 * 1024 * 1024;
const MAX_IMPORTED_FILES = 600;
const MAX_IMPORTED_TEXT_BYTES = 16 * 1024 * 1024;
const BLOCKED_IMPORT_PREFIXES = [
  "node_modules/",
  ".git/",
  ".next/",
  "dist/",
  "build/",
  "coverage/",
  "out/",
] as const;
const SKIPPED_IMPORT_FILENAMES = new Set([
  ".ds_store",
]);
const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".html",
  ".md",
  ".mdx",
  ".txt",
  ".yml",
  ".yaml",
  ".toml",
  ".env",
  ".example",
  ".svg",
  ".sql",
  ".sh",
  ".prisma",
  ".graphql",
  ".gql",
]);
const TEXT_BASENAMES = new Set([
  "dockerfile",
  "makefile",
  ".gitignore",
  ".npmrc",
  ".nvmrc",
  ".env",
  ".env.local",
  ".env.example",
  ".env.production",
  ".env.development",
  ".env.test",
  "readme",
  "license",
  // Lockfiles without a recognised extension. package-lock.json / pnpm-lock.yaml
  // / pnpm-lock.yml are already caught by TEXT_EXTENSIONS (.json/.yaml/.yml).
  // yarn.lock and bun.lock* have no extension in TEXT_EXTENSIONS — without an
  // explicit basename entry the route drops them, so the preview-host falls back
  // to `npm install` even when the imported repo ships a yarn.lock (A#7, P1).
  // bun.lock/bun.lockb are included for preservation; the preview-host ignores
  // them at install-command selection time (see normalize-imported-package-json.ts
  // LOCKFILE_NAMES) but they round-trip cleanly as text.
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
]);

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

    return {
      repoUrl: `https://github.com/${owner}/${repo}`,
      ...(branch ? { branch } : {}),
    };
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
  if (!response || !response.ok) return null;

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

async function downloadZipBufferFromUrl(params: {
  url: string;
  maxBytes: number;
  headers?: Record<string, string>;
}): Promise<Buffer> {
  const response = await fetch(params.url, {
    headers: params.headers,
  });

  if (!response.ok) {
    throw new Error(`Failed to download ZIP archive (HTTP ${response.status})`);
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > params.maxBytes) {
    throw new Error("Repository ZIP is too large for import");
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > params.maxBytes) {
    throw new Error("Repository ZIP is too large for import");
  }

  return buffer;
}

async function downloadGithubZipBuffer(params: {
  repo: GitHubRepoRef;
  branch: string;
  token: string;
  maxBytes: number;
}): Promise<Buffer> {
  return downloadZipBufferFromUrl({
    url: `https://api.github.com/repos/${params.repo.owner}/${params.repo.repo}/zipball/${encodeURIComponent(
      params.branch,
    )}`,
    maxBytes: params.maxBytes,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${params.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
}

function normalizeImportedPath(rawPath: string): string | null {
  const normalized = rawPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("\0")) return null;
  if (normalized.split("/").some((segment) => segment === "..")) return null;
  if (BLOCKED_IMPORT_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return null;
  const basename = normalized.split("/").pop()?.toLowerCase() ?? "";
  if (SKIPPED_IMPORT_FILENAMES.has(basename)) return null;
  // Secret hygiene: never import a real .env from a template archive (#38).
  if (isBlockedEnvImportFilename(basename)) return null;
  return normalized;
}

function shouldTreatAsText(filePath: string): boolean {
  const lowerPath = filePath.toLowerCase();
  const basename = lowerPath.split("/").pop() ?? "";
  if (TEXT_BASENAMES.has(basename)) return true;
  for (const extension of TEXT_EXTENSIONS) {
    if (lowerPath.endsWith(extension)) return true;
  }
  return false;
}

function looksBinary(buffer: Buffer): boolean {
  if (buffer.length === 0) return false;
  let suspicious = 0;
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  for (const byte of sample) {
    if (byte === 0) return true;
    if ((byte < 7 || (byte > 14 && byte < 32)) && byte !== 9 && byte !== 10 && byte !== 13) {
      suspicious += 1;
    }
  }
  return suspicious / sample.length > 0.1;
}

function stripCommonArchiveRoot(paths: string[]): string[] {
  if (paths.length === 0) return paths;
  const segments = paths.map((filePath) => filePath.split("/").filter(Boolean));
  const first = segments[0]?.[0];
  if (!first) return paths;
  const shouldStrip = segments.every((parts) => parts.length > 1 && parts[0] === first);
  if (!shouldStrip) return paths;
  return segments.map((parts) => parts.slice(1).join("/"));
}

async function extractImportedFilesFromZip(buffer: Buffer): Promise<CodeFile[]> {
  const zip = await JSZip.loadAsync(buffer);
  const rawEntries = Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .map((entry) => entry.name);
  const normalizedEntries = stripCommonArchiveRoot(rawEntries);

  const files: CodeFile[] = [];
  let totalBytes = 0;

  for (let index = 0; index < rawEntries.length; index += 1) {
    const originalName = rawEntries[index];
    const strippedName = normalizedEntries[index];
    const safePath = normalizeImportedPath(strippedName);
    if (!safePath) continue;
    if (!shouldTreatAsText(safePath)) continue;

    const entry = zip.files[originalName];
    const contentBuffer = Buffer.from(await entry.async("uint8array"));
    if (looksBinary(contentBuffer)) continue;

    totalBytes += contentBuffer.byteLength;
    if (files.length >= MAX_IMPORTED_FILES) {
      throw new Error(`Too many files in import (${files.length} >= ${MAX_IMPORTED_FILES})`);
    }
    if (totalBytes > MAX_IMPORTED_TEXT_BYTES) {
      throw new Error(
        `Imported project contains too much text content (${totalBytes} bytes > ${MAX_IMPORTED_TEXT_BYTES})`,
      );
    }

    files.push({
      path: safePath,
      content: contentBuffer.toString("utf8"),
      language: inferFileLanguage(safePath),
    });
  }

  return files;
}

function findPrimaryImportedFile(files: Array<{ path: string; content: string }>): string {
  if (files.length === 0) return "";
  const mainFile =
    files.find(
      (file) =>
        file.path.includes("app/page.tsx") ||
        file.path.includes("src/app/page.tsx") ||
        file.path.endsWith("page.tsx") ||
        file.path.endsWith("Page.tsx"),
    ) ??
    files.find((file) => file.path.endsWith(".tsx")) ??
    files[0];
  return mainFile?.content ?? "";
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
      const user = await getCurrentUser(req);
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
      const trimmedMessage = message?.trim() || "";

      const resolvedProjectId = projectId
        ? await resolveAppProjectIdForRequest(req, { appProjectId: projectId }, { sessionId })
        : null;
      if (projectId && !resolvedProjectId) {
        return attachSessionCookie(
          NextResponse.json(
            { error: "Project not found or not accessible for this session" },
            { status: 404 },
          ),
        );
      }

      let importLabel = `ZIP Import ${new Date().toISOString().slice(0, 10)}`;
      let importedFiles: CodeFile[] = [];

      if (source.type === "github") {
        const normalized = normalizeGithubRepoUrl(source.url, source.branch);
        const repoRef = parseGithubRepo(normalized.repoUrl);
        if (!repoRef) {
          return attachSessionCookie(
            NextResponse.json({ error: "Invalid GitHub repository URL" }, { status: 400 }),
          );
        }

        const githubToken = user?.github_token || null;
        const repoMeta = await fetchGithubRepoMeta(repoRef, githubToken);
        const resolvedBranch = normalized.branch || repoMeta?.defaultBranch || "";
        const isPrivate = repoMeta?.private ?? false;

        if (!resolvedBranch) {
          return attachSessionCookie(
            NextResponse.json(
              { error: "Branch is required for ZIP import. Please specify a branch." },
              { status: 400 },
            ),
          );
        }

        const zipBuffer = isPrivate
          ? (() => {
              if (!githubToken) {
                throw new Error("Connect GitHub to import private repositories.");
              }
              return downloadGithubZipBuffer({
                repo: repoRef,
                branch: resolvedBranch,
                token: githubToken,
                maxBytes: MAX_IMPORT_ARCHIVE_BYTES,
              });
            })()
          : downloadZipBufferFromUrl({
              url: buildGithubZipUrl(repoRef, resolvedBranch),
              maxBytes: MAX_IMPORT_ARCHIVE_BYTES,
            });

        importedFiles = await extractImportedFilesFromZip(await zipBuffer);
        importLabel = `Import: ${repoRef.owner}/${repoRef.repo}`;
      } else {
        const zipBuffer =
          "content" in source
            ? Buffer.from(source.content, "base64")
            : await downloadZipBufferFromUrl({
                url: source.url,
                maxBytes: MAX_IMPORT_ARCHIVE_BYTES,
              });

        if (zipBuffer.byteLength > MAX_IMPORT_ARCHIVE_BYTES) {
          throw new Error("Repository ZIP is too large for import");
        }
        importedFiles = await extractImportedFilesFromZip(zipBuffer);
      }

      if (importedFiles.length === 0) {
        return attachSessionCookie(
          NextResponse.json(
            {
              error: "No supported text files found in import archive",
              details:
                "Import currently keeps text-based project files only (code, config, styles, markdown, svg).",
            },
            { status: 400 },
          ),
        );
      }

      // Normalize: safe deterministic package.json repairs (same pass as the
      // template route — e.g. framer-motion / motion-dom lockstep skew).
      const importNormalize = normalizeImportedRepoFiles(importedFiles);
      if (importNormalize.applied.length > 0) {
        console.info(
          "[API /engine/chats/init] Normalize applied on import:",
          importNormalize.applied.join("; "),
        );
        importedFiles = importNormalize.files;
      }

      const creditCheck = await prepareCredits(
        req,
        "prompt.create",
        { modelId: "pro" },
        { sessionId },
      );
      if (!creditCheck.ok) {
        return attachSessionCookie(creditCheck.response);
      }

      const project =
        resolvedProjectId != null
          ? { id: resolvedProjectId }
          : await createAppProject(
              importLabel,
              "import",
              source.type === "github"
                ? `Imported from ${source.url}`
                : "Imported from ZIP archive",
              user ? undefined : sessionId || undefined,
              user?.id,
            );

      const engineModel = resolveEngineModelId(DEFAULT_MODEL_ID);
      const chat = await chatRepo.createChat(project.id, engineModel);
      if (trimmedMessage) {
        await chatRepo.addMessage(chat.id, "user", trimmedMessage);
      }
      const assistantSummary = trimmedMessage
        ? "Projektet importerades till own-engine och ar redo for vidare andringar. Din startinstruktion sparades i chatten, men har inte korsts automatiskt an."
        : "Projektet importerades till own-engine och ar redo for vidare andringar.";
      const assistantMessage = await chatRepo.addMessage(chat.id, "assistant", assistantSummary);
      // Provenance: a ZIP/GitHub import is a verbatim repo import, exactly like
      // the template route. The marker (a) excludes the row from the browser
      // resume-verify lane (it never had a post-check lane to resume) and
      // (b) opts follow-ups into the imported-repo preflight relaxation in
      // finalize (arbitrary repos don't conform to the scaffold contract).
      const version = await chatRepo.createDraftVersion(
        chat.id,
        assistantMessage.id,
        JSON.stringify(importedFiles),
        undefined,
        { editKind: "imported_repo" },
      );
      const previewSessionStarted = await startPreviewSession(importedFiles, {
        chatId: chat.id,
        appProjectId: project.id,
        versionIdForSession: version.id,
        skipRepair: true,
        // Imported project is already complete (zip source) and should not be scaffold-merged.
        skipProjectScaffold: true,
      });
      if (!previewSessionStarted.ok) {
        throw new Error(
          `Tier-2 preview failed (${previewSessionStarted.error.stage}): ${previewSessionStarted.error.message}`,
        );
      }
      const previewUrl = previewSessionStarted.result.previewUrl?.trim();
      if (!previewUrl) {
        throw new Error("Tier-2 preview started without a preview URL.");
      }
      await chatRepo.updateVersionPreviewUrl(version.id, previewUrl);

      await saveProjectData({
        project_id: project.id,
        chat_id: chat.id,
        demo_url: previewUrl,
        current_code: findPrimaryImportedFile(importedFiles),
        files: importedFiles.map((file) => ({
          name: file.path,
          content: file.content,
          locked: lockedSet.has(file.path.replace(/^\.?\//, "")),
        })),
        messages: (await chatRepo.getChat(chat.id))?.messages ?? [],
        meta: {
          source: "import-init:own-engine",
          importSource: source.type,
          importLockedFiles: configLockedFiles,
        },
      });

      try {
        await creditCheck.commit();
      } catch (error) {
        console.error("[credits] Failed to charge init:", error);
      }

      return attachSessionCookie(
        NextResponse.json({
          success: true,
          id: chat.id,
          chatId: chat.id,
          versionId: version.id,
          ...previewUrlField(previewUrl),
          projectId: project.id,
          source: source.type,
          lockedFiles: configLockedFiles,
        }),
      );
    } catch (err) {
      console.error("Init chat error:", err);
      const message = err instanceof Error ? err.message : "Unknown error";
      const status =
        message.includes("Connect GitHub") ? 401 :
        message.includes("too large") ? 413 :
        500;
      return attachSessionCookie(
        NextResponse.json(
          { error: message },
          { status },
        ),
      );
    }
  });
}
