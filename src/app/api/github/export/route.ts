import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRateLimit } from "@/lib/rate-limit";
import { getEngineChatByIdForRequest } from "@/lib/tenant";
import { getVersionById } from "@/lib/db/chat-repository-pg";
import { parseCodeFilesFromFilesJson } from "@/lib/gen/version-manager";
import { buildPortableExportProject } from "@/lib/gen/export/build-portable-export-project";
import {
  OwnerTransferSiteUrlRequiredError,
  buildOwnerTransferPackage,
} from "@/lib/gen/export/owner-transfer-package";
import { GitHubExportPathConflictError } from "@/lib/gen/export/github-tree-plan";
import {
  GitHubExportNoFilesError,
  GitHubExportTreeTooLargeError,
  commitExportToGitHub,
  sanitizeRepoName,
} from "@/lib/github/git-data-export";
import { getCurrentUser } from "@/lib/auth/auth";
import { getSessionIdFromRequest } from "@/lib/auth/session";
import { getProjectByIdForOwner } from "@/lib/db/services/projects";
import {
  loadProjectExportMedia,
  loadProjectProviderOrigin,
} from "@/lib/projects/project-export-media";

export const runtime = "nodejs";

const exportSchema = z.object({
  chatId: z.string().min(1, "chatId is required").max(128),
  versionId: z.string().min(1, "versionId is required").max(128),
  repo: z.string().min(1, "repo is required").max(256),
  private: z.boolean().optional(),
  projectId: z.string().trim().min(1).max(128).optional(),
  siteUrl: z
    .url()
    .max(2_048)
    .refine((value) => {
      const url = new URL(value);
      const hostname = url.hostname.replace(/\.+$/, "");
      const isSajtmaskinHost =
        hostname === "sajtmaskin.se" ||
        hostname.endsWith(".sajtmaskin.se") ||
        hostname === "sajtmaskin.vercel.app";
      return (
        (url.protocol === "https:" || url.protocol === "http:") &&
        !isSajtmaskinHost &&
        url.pathname === "/" &&
        !url.search &&
        !url.hash
      );
    }, "siteUrl must be a new http(s) origin outside Sajtmaskin")
    .transform((value) => new URL(value).origin)
    .optional(),
});

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

/**
 * Export a published version to the customer's own GitHub (OAuth token).
 * Git Data mechanics live in `@/lib/github/git-data-export`, shared with the
 * Sajtmaskin sites-org backup; this route owns auth, scoping and HTTP mapping.
 */
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

      const {
        chatId,
        versionId,
        repo: repoInput,
        private: isPrivate = true,
        projectId,
        siteUrl,
      } = parsed.data;
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
            error:
              "Legacy V0-export är inte längre tillgänglig. Export fungerar bara för own-engine-chattar.",
          },
          { status: 410 },
        );
      }
      // All export entry points share the authorized chat's project scope.
      // A client-supplied project is only an additional consistency check.
      const exportProjectId = projectId ?? engineChat.project_id;
      if (exportProjectId) {
        const project = await getProjectByIdForOwner(exportProjectId, {
          userId: user.id,
          sessionId: getSessionIdFromRequest(request),
        });
        if (!project || engineChat.project_id !== project.id) {
          return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
        }
      }

      const ev = await getVersionById(versionId);
      if (!ev || ev.chat_id !== engineChat.id) {
        return NextResponse.json({ success: false, error: "Version not found" }, { status: 404 });
      }
      const rawFiles = parseCodeFilesFromFilesJson(ev.files_json) ?? [];
      const portableProject = await buildPortableExportProject(rawFiles, chatId);
      const media = exportProjectId
        ? await loadProjectExportMedia({
            projectId: exportProjectId,
            userId: user.id,
            referencedText: portableProject.map((file) => file.content).join("\n"),
          })
        : [];
      const providerOrigin = await loadProjectProviderOrigin({
        chatId: engineChat.id,
        versionId: ev.id,
      });
      const transferProject = buildOwnerTransferPackage({
        projectFiles: portableProject,
        media,
        siteUrl,
        providerOrigin,
      });

      let result;
      try {
        result = await commitExportToGitHub({
          token: user.github_token,
          owner,
          repo: repoName,
          isPrivate,
          ownerIsOrg: owner !== user.github_username,
          files: transferProject,
          commitMessage: `Export from Sajtmaskin (${chatId}:${versionId})`,
          // Byte-exact per-file blobs: this is the customer's copy of record.
          textTransport: "blob",
        });
      } catch (error) {
        if (error instanceof GitHubExportNoFilesError) {
          return NextResponse.json({ success: false, error: error.message }, { status: 400 });
        }
        if (error instanceof GitHubExportPathConflictError) {
          return NextResponse.json({ success: false, error: error.message }, { status: 409 });
        }
        throw error;
      }

      return NextResponse.json({
        success: true,
        repo: result.repo.full_name,
        repoUrl: result.repo.html_url,
        created: result.created,
        commitSha: result.commitSha,
        mediaCount: media.length,
      });
    } catch (error) {
      if (error instanceof OwnerTransferSiteUrlRequiredError) {
        return NextResponse.json({ success: false, error: error.message }, { status: 400 });
      }
      if (error instanceof GitHubExportTreeTooLargeError) {
        return NextResponse.json({ success: false, error: error.message }, { status: 409 });
      }
      console.error("[API/GitHub Export] Error:", error);
      return NextResponse.json(
        {
          success: false,
          error: "GitHub-exporten misslyckades. Försök igen senare.",
        },
        { status: 500 },
      );
    }
  });
}
