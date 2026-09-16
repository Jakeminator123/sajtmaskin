import { NextResponse } from "next/server";
import { withRateLimit } from "@/lib/rate-limit";
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
import { normalizeImportedRepoFiles } from "@/lib/templates/normalize-imported-package-json";
import { buildImportedRepoBaselineSnapshot } from "@/lib/templates/imported-repo-contract";
import {
  persistImportedRepoInitialization,
  recordImportedRepoPreviewOutcome,
} from "@/lib/templates/imported-repo-initialization";
import {
  decodeLocalZipContent,
  extractImportedFilesFromZip,
  findPrimaryImportedFile,
} from "@/lib/import/extract-imported-archive";
import { ImportInitError, importErrorJson } from "@/lib/import/github-import-errors";
import {
  assertPrivateGithubAccess,
  downloadGithubZipBuffer,
  downloadZipBufferFromUrl,
  resolveGithubImport,
} from "@/lib/import/github-import-transport";
import {
  MAX_REMOTE_ARCHIVE_BYTES,
  type ImportInitPreview,
  type ImportInitSuccess,
} from "@/lib/import/import-init-contract";

export const runtime = "nodejs";

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

function toErrorResponse(error: ImportInitError, attachSessionCookie: (response: Response) => Response) {
  return attachSessionCookie(NextResponse.json(importErrorJson(error), { status: error.status }));
}

export async function POST(req: Request) {
  const session = ensureSessionIdFromRequest(req);
  const sessionId = session.sessionId;
  const attachSessionCookie = (response: Response) => {
    const setCookies = session.setCookies ?? (session.setCookie ? [session.setCookie] : []);
    for (const setCookie of setCookies) {
      response.headers.append("Set-Cookie", setCookie);
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
            {
              success: false,
              error: "Ogiltiga importuppgifter.",
              code: "validation_failed",
              step: "parse",
              details: validationResult.error.issues,
            },
            { status: 400 },
          ),
        );
      }

      const { source, message, projectId, lockConfigFiles, lockedFiles } = validationResult.data;
      const user = await getCurrentUser(req);
      if (!user) {
        return attachSessionCookie(
          NextResponse.json(
            {
              success: false,
              error: "Skapa ett konto eller logga in för att importera ett projekt.",
              code: "auth_required",
              step: "auth",
              requiresAuth: true,
            },
            { status: 401 },
          ),
        );
      }
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
        return toErrorResponse(
          new ImportInitError({
            message: "Projektet hittades inte eller är inte tillgängligt för den här sessionen.",
            code: "project_not_found",
            step: "persist",
            status: 404,
          }),
          attachSessionCookie,
        );
      }

      let importLabel = `ZIP Import ${new Date().toISOString().slice(0, 10)}`;
      let importedFiles: CodeFile[] = [];

      if (source.type === "github") {
        const githubToken = user.github_token || null;
        const resolved = await resolveGithubImport({
          url: source.url,
          explicitBranch: source.branch,
          token: githubToken,
        });
        assertPrivateGithubAccess({
          isPrivate: resolved.private,
          token: githubToken,
        });

        const zipBuffer = await downloadGithubZipBuffer({
          repo: resolved.repo,
          commitSha: resolved.commitSha,
          token: githubToken,
          maxBytes: MAX_REMOTE_ARCHIVE_BYTES,
        });

        importedFiles = await extractImportedFilesFromZip(zipBuffer);
        importLabel = `Import: ${resolved.repo.owner}/${resolved.repo.repo}`;
      } else {
        const zipBuffer =
          "content" in source
            ? decodeLocalZipContent(source.content)
            : await downloadZipBufferFromUrl({
                url: source.url,
                maxBytes: MAX_REMOTE_ARCHIVE_BYTES,
              });
        importedFiles = await extractImportedFilesFromZip(zipBuffer);
      }

      if (importedFiles.length === 0) {
        return toErrorResponse(
          new ImportInitError({
            message:
              "Inga stödda textfiler hittades i arkivet. Importen tar just nu bara med kod, config, stil och markdown.",
            code: "zip_empty",
            step: "extract",
            status: 400,
          }),
          attachSessionCookie,
        );
      }

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
      const version = await chatRepo.createDraftVersion(
        chat.id,
        assistantMessage.id,
        JSON.stringify(importedFiles),
        undefined,
        { editKind: "imported_repo" },
      );
      const importedRepoOrigin = { kind: source.type } as const;
      const importedRepoBaseline = buildImportedRepoBaselineSnapshot({
        files: importedFiles,
        origin: importedRepoOrigin,
        versionId: version.id,
        filesRevision: version.files_revision ?? null,
      });
      await persistImportedRepoInitialization({
        chatId: chat.id,
        versionId: version.id,
        filesRevision: version.files_revision ?? null,
        model: engineModel,
        buildIntent: null,
        files: importedFiles,
        origin: importedRepoOrigin,
        baseline: importedRepoBaseline,
      });

      await saveProjectData({
        project_id: project.id,
        chat_id: chat.id,
        demo_url: null,
        current_code: findPrimaryImportedFile(importedFiles),
        files: importedFiles.map((file) => ({
          name: file.path,
          content: file.content,
          locked: lockedSet.has(file.path.replace(/^\.?\//, "")),
        })),
        messages: (await chatRepo.getChat(chat.id))?.messages ?? [],
        meta_patch: {
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

      let preview: ImportInitPreview = {
        status: "failed",
        runtimeReady: false,
        retryable: true,
        message: "Preview kunde inte startas. Använd Försök igen i buildern.",
      };
      let previewUrl: string | null = null;

      const previewSessionStarted = await startPreviewSession(importedFiles, {
        chatId: chat.id,
        appProjectId: project.id,
        versionIdForSession: version.id,
        filesRevisionForSession: version.files_revision,
        skipRepair: true,
        skipProjectScaffold: true,
      });
      if (!previewSessionStarted.ok) {
        await recordImportedRepoPreviewOutcome({
          versionId: version.id,
          outcome: "failed",
        });
        preview = {
          status: "failed",
          runtimeReady: false,
          retryable: true,
          message: `Preview kunde inte startas (${previewSessionStarted.error.stage}). Använd Försök igen i buildern — ingen ny import behövs.`,
        };
      } else {
        previewUrl = previewSessionStarted.result.previewUrl?.trim() || null;
        if (!previewUrl) {
          await recordImportedRepoPreviewOutcome({
            versionId: version.id,
            outcome: "failed",
          });
          preview = {
            status: "failed",
            runtimeReady: false,
            retryable: true,
            message: "Preview startade utan adress. Använd Försök igen i buildern — ingen ny import behövs.",
          };
        } else {
          const runtimeReady = previewSessionStarted.result.runtimeReady === true;
          await recordImportedRepoPreviewOutcome({
            versionId: version.id,
            filesRevision:
              previewSessionStarted.result.filesRevision ?? version.files_revision ?? null,
            outcome: runtimeReady ? "runtime-ready" : "pending",
          });
          await chatRepo.updateVersionPreviewUrl(version.id, previewUrl);
          await saveProjectData({
            project_id: project.id,
            chat_id: chat.id,
            demo_url: previewUrl,
            meta_patch: {
              source: "import-init:own-engine",
              importSource: source.type,
              importLockedFiles: configLockedFiles,
            },
          });
          preview = {
            status: runtimeReady ? "ready" : "starting",
            runtimeReady,
            retryable: !runtimeReady,
            ...(runtimeReady
              ? {}
              : { message: "Importen är sparad. Preview startar i buildern." }),
          };
        }
      }

      const payload: ImportInitSuccess = {
        success: true,
        id: chat.id,
        chatId: chat.id,
        versionId: version.id,
        ...previewUrlField(previewUrl),
        preview,
        projectId: project.id,
        source: source.type,
        lockedFiles: configLockedFiles,
      };

      return attachSessionCookie(NextResponse.json(payload));
    } catch (err) {
      console.error("Init chat error:", err);
      if (err instanceof ImportInitError) {
        return toErrorResponse(err, attachSessionCookie);
      }
      const message = err instanceof Error ? err.message : "Importen misslyckades.";
      return attachSessionCookie(
        NextResponse.json(
          {
            success: false,
            error: message,
            code: "import_failed",
            step: "persist",
          },
          { status: 500 },
        ),
      );
    }
  });
}
