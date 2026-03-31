import { NextResponse } from "next/server";
import { z } from "zod";
import { withRateLimit } from "@/lib/rateLimit";
import {
  getPreferredVersion,
  getLatestVersion,
  updateVersionSandboxUrl,
  type Version,
} from "@/lib/db/chat-repository-pg";
import { canExposeEnginePreview } from "@/lib/db/engine-version-lifecycle";
import { getEngineChatByIdForRequest, getEngineVersionForChatByIdForRequest } from "@/lib/tenant";
import { getVersionFiles, parseCodeFilesFromFilesJson } from "@/lib/gen/version-manager";
import { startSandboxPreview } from "@/lib/gen/sandbox/sandbox-preview";
import { httpStatusForSandboxPreviewFailure } from "@/lib/gen/sandbox/preview-errors";
import { logSandboxLifecycleTelemetry } from "@/lib/gen/sandbox/lifecycle-telemetry";
import { isSandboxConfigured, SANDBOX_SETUP_HINT } from "@/lib/mcp/runtime-url";

const postBodySchema = z.object({
  versionId: z.string().min(1).optional(),
  forceRestart: z.boolean().optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  return withRateLimit(req, "sandbox:create", async () => {
    try {
      const { chatId } = await ctx.params;

      if (!isSandboxConfigured()) {
        return NextResponse.json(
          {
            ok: false,
            code: "sandbox_disabled",
            message: "Sandbox is not configured on this deployment.",
            hint: SANDBOX_SETUP_HINT,
            retryable: true,
          },
          { status: 503 },
        );
      }

      const chat = await getEngineChatByIdForRequest(req, chatId);
      if (!chat) {
        return NextResponse.json(
          {
            ok: false,
            code: "not_engine_chat",
            message: "Chat not found.",
            retryable: false,
          },
          { status: 404 },
        );
      }

      const raw = await req.json().catch(() => ({}));
      const parsed = postBodySchema.safeParse(raw);
      if (!parsed.success) {
        return NextResponse.json(
          { ok: false, message: "Invalid body", retryable: false },
          { status: 400 },
        );
      }

      let versionRow: Version;

      if (parsed.data.versionId) {
        const scoped = await getEngineVersionForChatByIdForRequest(
          req,
          chatId,
          parsed.data.versionId,
        );
        if (!scoped) {
          return NextResponse.json(
            { ok: false, message: "Version not found.", retryable: false },
            { status: 404 },
          );
        }
        versionRow = scoped.version;
      } else {
        const v = (await getPreferredVersion(chatId)) ?? (await getLatestVersion(chatId));
        if (!v) {
          return NextResponse.json(
            { ok: false, message: "No versions for chat.", retryable: false },
            { status: 400 },
          );
        }
        const scoped = await getEngineVersionForChatByIdForRequest(req, chatId, v.id);
        if (!scoped) {
          return NextResponse.json(
            { ok: false, message: "Version not accessible.", retryable: false },
            { status: 403 },
          );
        }
        versionRow = scoped.version;
      }

      if (!parsed.data.forceRestart && !canExposeEnginePreview(versionRow)) {
        return NextResponse.json(
          {
            ok: false,
            code: "preview_blocked",
            message: "Version cannot be previewed.",
            retryable: false,
          },
          { status: 400 },
        );
      }

      if (
        !parsed.data.forceRestart &&
        typeof versionRow.sandbox_url === "string" &&
        versionRow.sandbox_url.trim()
      ) {
        return NextResponse.json({
          ok: true,
          sandboxUrl: versionRow.sandbox_url.trim(),
          sandboxId: null,
          sandboxPreviewMode: null,
          fidelityTier: 2,
          prodBuildVerified: false,
          startOutcome: "reused_url",
        });
      }

      let files = (await getVersionFiles(versionRow.id)) ?? [];
      if (files.length === 0 && versionRow.files_json?.trim()) {
        const fromJson = parseCodeFilesFromFilesJson(versionRow.files_json);
        if (fromJson?.length) files = fromJson;
      }

      if (files.length === 0) {
        return NextResponse.json(
          {
            ok: false,
            code: "no_files",
            message: "No files in version for sandbox.",
            retryable: false,
          },
          { status: 400 },
        );
      }

      const appProjectId =
        typeof chat.project_id === "string" && chat.project_id.trim() ? chat.project_id.trim() : null;
      const persistedBuildSpec =
        chat.orchestration_snapshot &&
        typeof chat.orchestration_snapshot === "object" &&
        (chat.orchestration_snapshot as Record<string, unknown>).buildSpec &&
        typeof (chat.orchestration_snapshot as Record<string, unknown>).buildSpec === "object"
          ? ((chat.orchestration_snapshot as Record<string, unknown>).buildSpec as Record<string, unknown>)
          : null;
      const previewPolicy =
        persistedBuildSpec?.previewPolicy === "fidelity2" || persistedBuildSpec?.previewPolicy === "fidelity3"
          ? persistedBuildSpec.previewPolicy
          : null;
      const verificationPolicy =
        persistedBuildSpec?.verificationPolicy === "fast" ||
        persistedBuildSpec?.verificationPolicy === "standard" ||
        persistedBuildSpec?.verificationPolicy === "strict"
          ? persistedBuildSpec.verificationPolicy
          : null;

      const started = await startSandboxPreview(files, {
        chatId,
        appProjectId,
        forceRestart: parsed.data.forceRestart === true,
        previewPolicy,
        verificationPolicy,
        versionIdForSession: versionRow.id,
        skipRepair: true,
      });

      if (!started.ok) {
        const status = httpStatusForSandboxPreviewFailure(started.error);
        const retryable = status === 503 || status === 504;
        const headers =
          status === 503 || status === 504
            ? new Headers({ "Retry-After": "5" })
            : undefined;
        return NextResponse.json(
          {
            ok: false,
            stage: started.error.stage,
            message: started.error.message,
            ...(started.error.failureCode ? { failureCode: started.error.failureCode } : {}),
            retryable,
          },
          { status, headers },
        );
      }

      const sr = started.result;
      if (sr.sandboxUrl.trim()) {
        await updateVersionSandboxUrl(versionRow.id, sr.sandboxUrl);
      }

      logSandboxLifecycleTelemetry({
        kind: "sandbox_start_outcome",
        chatId,
        versionId: versionRow.id,
        outcome: sr.startOutcome,
      });

      return NextResponse.json({
        ok: true,
        sandboxUrl: sr.sandboxUrl,
        sandboxId: sr.sandboxId,
        sandboxPreviewMode: sr.sandboxPreviewMode,
        fidelityTier: sr.fidelityTier,
        prodBuildVerified: sr.prodBuildVerified,
        startOutcome: sr.startOutcome,
        ...(sr.prodBuildLogSnippet ? { prodBuildLogSnippet: sr.prodBuildLogSnippet } : {}),
      });
    } catch (err) {
      console.error("[sandbox-preview] POST", err);
      return NextResponse.json(
        {
          ok: false,
          message: err instanceof Error ? err.message : "Unknown error",
          retryable: true,
        },
        { status: 500 },
      );
    }
  });
}
