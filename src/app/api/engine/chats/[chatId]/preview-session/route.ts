import { NextResponse } from "next/server";
import { z } from "zod";
import { withRateLimit } from "@/lib/rateLimit";
import {
  getPreferredVersion,
  getLatestVersion,
  updateVersionPreviewUrl,
  type Version,
} from "@/lib/db/chat-repository-pg";
import { canExposeEnginePreview } from "@/lib/db/engine-version-lifecycle";
import { getEngineChatByIdForRequest, getEngineVersionForChatByIdForRequest } from "@/lib/tenant";
import { isTier2LivePreviewUrl } from "@/lib/gen/preview/legacy/compatibility-shim";
import { logPreviewLifecycleTelemetry } from "@/lib/gen/preview/lifecycle-telemetry";
import { httpStatusForPreviewSessionFailure } from "@/lib/gen/preview/preview-errors";
import { startPreviewSession } from "@/lib/gen/preview/preview-session";
import {
  isTier2PreviewConfigured,
  TIER2_PREVIEW_SETUP_HINT,
} from "@/lib/gen/preview/tier2-config";
import { getVersionFiles, parseCodeFilesFromFilesJson } from "@/lib/gen/version-manager";
import { devLogAppend } from "@/lib/logging/devLog";
import { incIngressEvent } from "@/lib/observability/metrics";

const postBodySchema = z.object({
  versionId: z.string().min(1).optional(),
  forceRestart: z.boolean().optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  return withRateLimit(req, "preview-session:create", async () => {
    try {
      const { chatId } = await ctx.params;

      if (!isTier2PreviewConfigured()) {
        return NextResponse.json(
          {
            ok: false,
            code: "preview_session_disabled",
            message: "Tier-2 preview is not configured on this deployment.",
            hint: TIER2_PREVIEW_SETUP_HINT,
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
        typeof versionRow.preview_url === "string" &&
        versionRow.preview_url.trim() &&
        isTier2LivePreviewUrl(versionRow.preview_url)
      ) {
        const trimmedPreviewUrl = versionRow.preview_url.trim();
        // P19 ingress 1: preview-session short-circuit. Wrapped + try/catch so
        // telemetry can never block the response — same posture as other
        // observability call-sites in this route.
        try {
          incIngressEvent("preview_reused_url");
        } catch {}
        try {
          devLogAppend("latest", {
            type: "preview.reused-url",
            chatId,
            versionId: versionRow.id,
            previewUrl: trimmedPreviewUrl.slice(0, 60),
          });
        } catch {}
        return NextResponse.json({
          ok: true,
          previewUrl: trimmedPreviewUrl,
          previewSessionId: null,
          previewMode: null,
          previewTier: 2,
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
            message: "No files in version for preview session.",
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

      const started = await startPreviewSession(files, {
        chatId,
        appProjectId,
        forceRestart: parsed.data.forceRestart === true,
        previewPolicy,
        verificationPolicy,
        versionIdForSession: versionRow.id,
        // F3 versions strip tier3-stub layer; F2 keeps it for boot.
        lifecycleStage:
          versionRow.lifecycle_stage === "integrations" ? "integrations" : "design",
        skipRepair: true,
        // DB files are finalize-preflighted and include scaffold baseline.
        skipProjectScaffold: true,
      });

      if (!started.ok) {
        const status = httpStatusForPreviewSessionFailure(started.error);
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
        await updateVersionPreviewUrl(versionRow.id, sr.sandboxUrl);
      }

      logPreviewLifecycleTelemetry({
        kind: "preview_start_outcome",
        chatId,
        versionId: versionRow.id,
        outcome: sr.startOutcome,
        tier2Provider: sr.tier2Meta?.tier2Provider,
      });

      return NextResponse.json({
        ok: true,
        previewUrl: sr.sandboxUrl,
        previewSessionId: sr.sandboxId,
        previewMode: sr.sandboxPreviewMode,
        previewTier: sr.fidelityTier,
        ...(sr.prodBuildVerified !== undefined ? { prodBuildVerified: sr.prodBuildVerified } : {}),
        startOutcome: sr.startOutcome,
        ...(sr.prodBuildLogSnippet ? { prodBuildLogSnippet: sr.prodBuildLogSnippet } : {}),
      });
    } catch (err) {
      console.error("[preview-session] POST", err);
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
