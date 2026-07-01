import { NextResponse } from "next/server";
import { z } from "zod";
import { withRateLimit } from "@/lib/rateLimit";
import { OPENCLAW } from "@/lib/config";
import { getOpenClawSurfaceStatus } from "@/lib/openclaw/status";
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
import { requestQuickEditOps } from "@/lib/openclaw/edit";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({
  chatId: z.string().min(1),
  instruction: z.string().min(1).max(2_000),
  /** The version the widget is looking at — used as the edit base + stale check. */
  activeVersionId: z.string().min(1).optional(),
  /** Explicit client "known latest"; falls back to activeVersionId. */
  engineLatestKnownVersionId: z.string().min(1).optional(),
});

function httpStatusForQuickEditFailure(reason: string): number {
  switch (reason) {
    case "unsafe_path":
    case "protected_path":
    case "empty_ops":
      return 400;
    case "ambiguous_match":
      return 409;
    case "integrations_base":
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

/**
 * Prompt-driven OpenClaw edit agent. Turns a natural-language instruction into
 * deterministic quick-edit ops and applies them to the user's latest version
 * via the existing quick-edit lane (no heavy scaffold/preflight rebuild).
 *
 * Reversibility: the whole route 404s when OPENCLAW_EDIT_AGENT is off, so the
 * feature is a no-op by default. Persistence + preview patching are delegated
 * entirely to `runQuickEdit`; this route never writes to the DB or logs.
 */
export async function POST(req: Request) {
  // Hard feature gate: when the master flag is off the route does not exist.
  if (!OPENCLAW.editAgentEnabled) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  return withRateLimit(req, "openclaw:edit", async () => {
    try {
      // The surface must be enabled (gateway + token + IMPLEMENT flag) to produce ops.
      const surface = getOpenClawSurfaceStatus();
      if (!surface.surfaceEnabled) {
        return NextResponse.json(
          { ok: false, error: "OpenClaw surface disabled", blockers: surface.blockers },
          { status: 503 },
        );
      }

      const raw = await req.json().catch(() => ({}));
      const parsed = bodySchema.safeParse(raw);
      if (!parsed.success) {
        return NextResponse.json(
          { ok: false, error: "Invalid body", details: parsed.error.issues },
          { status: 400 },
        );
      }
      const { chatId, instruction } = parsed.data;

      // Cross-tenant guard: verify the REQUESTER owns this chat before any read.
      const chat = await getEngineChatByIdForRequest(req, chatId);
      if (!chat) {
        return NextResponse.json({ ok: false, error: "Chat not found" }, { status: 404 });
      }

      // Resolve the edit base: explicit activeVersionId (ownership re-verified)
      // else the server's preferred/latest version.
      let baseVersion: Version;
      if (parsed.data.activeVersionId) {
        const scoped = await getEngineVersionForChatByIdForRequest(
          req,
          chatId,
          parsed.data.activeVersionId,
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

      // Stale-base guard (mirrors the quick-edit route): reject if the client's
      // known-latest disagrees with the server's preferred AND the base isn't it,
      // so the widget re-syncs instead of forking version history.
      const knownLatest =
        parsed.data.engineLatestKnownVersionId ?? parsed.data.activeVersionId ?? null;
      if (knownLatest) {
        const serverPreferred =
          (await getPreferredVersion(chatId)) ?? (await getLatestVersion(chatId));
        const serverPreferredId = serverPreferred?.id ?? null;
        if (
          serverPreferredId !== null &&
          knownLatest !== serverPreferredId &&
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

      // F3 (integrations) bases decline quick-edit; surface a clear error so the
      // widget can steer the user to the builder chat for larger changes.
      if (baseVersion.lifecycle_stage === "integrations") {
        return NextResponse.json(
          {
            ok: false,
            reason: "integrations_base",
            error:
              "Den här versionen är en integrationsversion (F3) och kan inte snabbredigeras. Använd builder-chatten för större ändringar.",
          },
          { status: 422 },
        );
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

      // Server-LLM step: ask the gateway for deterministic ops from the prompt.
      const opsResult = await requestQuickEditOps({ instruction, files: baseFiles });
      if (!opsResult.ok) {
        return NextResponse.json(
          { ok: false, reason: "ops_generation_failed", error: opsResult.error },
          { status: opsResult.status && opsResult.status >= 500 ? 502 : 422 },
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
        ops: opsResult.ops,
        appProjectId,
        summary: opsResult.summary,
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
        summary: opsResult.summary ?? null,
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
