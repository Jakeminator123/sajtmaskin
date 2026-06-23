import { NextResponse } from "next/server";
import { z } from "zod";
import { withRateLimit } from "@/lib/rateLimit";
import {
  getEngineChatByIdForRequest,
  getEngineVersionForChatByIdForRequest,
} from "@/lib/tenant";
import {
  getLatestVersion,
  getPreferredVersion,
  type Version,
} from "@/lib/db/chat-repository-pg";
import { getVersionFiles, parseCodeFilesFromFilesJson } from "@/lib/gen/version-manager";
import { runQuickEdit } from "@/lib/gen/quick-edit";
import type { QuickEditOp } from "@/lib/gen/quick-edit";

export const runtime = "nodejs";

const opSchema = z.union([
  z.object({
    kind: z.literal("replace_content"),
    path: z.string().min(1),
    content: z.string(),
  }),
  z.object({
    kind: z.literal("replace_text"),
    path: z.string().min(1),
    find: z.string().min(1),
    replace: z.string(),
    occurrence: z.number().int().positive().optional(),
  }),
]);

const bodySchema = z.object({
  baseVersionId: z.string().min(1).optional(),
  engineLatestKnownVersionId: z.string().min(1).optional(),
  summary: z.string().max(300).optional(),
  ops: z.array(opSchema).min(1).max(50),
});

function httpStatusForQuickEditFailure(reason: string): number {
  switch (reason) {
    case "unsafe_path":
    case "empty_ops":
      return 400;
    case "ambiguous_match":
      return 409;
    case "file_not_found":
    case "no_match":
    case "no_base_files":
      return 422;
    case "no_change":
      return 200;
    default:
      return 422;
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  return withRateLimit(req, "quick-edit:apply", async () => {
    try {
      const { chatId } = await ctx.params;

      const chat = await getEngineChatByIdForRequest(req, chatId);
      if (!chat) {
        return NextResponse.json({ ok: false, error: "Chat not found" }, { status: 404 });
      }

      const raw = await req.json().catch(() => ({}));
      const parsed = bodySchema.safeParse(raw);
      if (!parsed.success) {
        return NextResponse.json(
          { ok: false, error: "Invalid body", details: parsed.error.issues },
          { status: 400 },
        );
      }

      // Resolve the base version (explicit id, else preferred/latest).
      let baseVersion: Version;
      if (parsed.data.baseVersionId) {
        const scoped = await getEngineVersionForChatByIdForRequest(
          req,
          chatId,
          parsed.data.baseVersionId,
        );
        if (!scoped) {
          return NextResponse.json(
            { ok: false, error: "Base version not found for chat" },
            { status: 404 },
          );
        }
        baseVersion = scoped.version;
      } else {
        const v = (await getPreferredVersion(chatId)) ?? (await getLatestVersion(chatId));
        if (!v) {
          return NextResponse.json(
            { ok: false, error: "No versions for chat" },
            { status: 400 },
          );
        }
        baseVersion = v;
      }

      // Stale-base guard (mirrors the chat-stream follow-up rule): if the client
      // is editing against a view that is neither the server's preferred version
      // nor the base it claims, reject so it re-syncs instead of forking history.
      if (parsed.data.engineLatestKnownVersionId) {
        const serverPreferred =
          (await getPreferredVersion(chatId)) ?? (await getLatestVersion(chatId));
        const serverPreferredId = serverPreferred?.id ?? null;
        const latestKnown = parsed.data.engineLatestKnownVersionId;
        if (
          serverPreferredId !== null &&
          latestKnown !== serverPreferredId &&
          baseVersion.id !== serverPreferredId
        ) {
          return NextResponse.json(
            {
              ok: false,
              error: "stale_base_version",
              serverPreferredVersionId: serverPreferredId,
            },
            { status: 409 },
          );
        }
      }

      let baseFiles = (await getVersionFiles(baseVersion.id)) ?? [];
      if (baseFiles.length === 0 && baseVersion.files_json?.trim()) {
        const fromJson = parseCodeFilesFromFilesJson(baseVersion.files_json);
        if (fromJson?.length) baseFiles = fromJson;
      }
      if (baseFiles.length === 0) {
        return NextResponse.json(
          { ok: false, error: "Base version has no files" },
          { status: 400 },
        );
      }

      const appProjectId =
        typeof chat.project_id === "string" && chat.project_id.trim()
          ? chat.project_id.trim()
          : null;

      const result = await runQuickEdit({
        chatId,
        baseVersion,
        baseFiles,
        ops: parsed.data.ops as QuickEditOp[],
        appProjectId,
        summary: parsed.data.summary,
      });

      if (!result.ok) {
        return NextResponse.json(
          { ok: false, reason: result.reason, error: result.message },
          { status: httpStatusForQuickEditFailure(result.reason) },
        );
      }

      return NextResponse.json({
        ok: true,
        versionId: result.versionId,
        messageId: result.messageId,
        changedFiles: result.changedPaths,
        structuralChange: result.structuralChange,
        previewUrl: result.previewUrl,
        previewSessionId: result.previewSessionId,
        previewMode: result.previewMode,
        ...(result.previewError ? { previewError: result.previewError } : {}),
      });
    } catch (err) {
      return NextResponse.json(
        { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
        { status: 500 },
      );
    }
  });
}
