import { after, NextResponse } from "next/server";
import { z } from "zod";
import { withRateLimit } from "@/lib/rate-limit";
import { getPreferredVersion, getLatestVersion, type Version } from "@/lib/db/chat-repository-pg";
import { getEngineChatByIdForRequest, getEngineVersionForChatByIdForRequest } from "@/lib/tenant";
import { httpStatusForPreviewSessionFailure } from "@/lib/gen/preview/preview-errors";
import { ensureVersionPreview, persistVersionPreviewOutcome } from "@/lib/gen/preview/ensure-version-preview";
import { isTier2PreviewConfigured, TIER2_PREVIEW_SETUP_HINT } from "@/lib/gen/preview/tier2-config";

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

      const outcome = await ensureVersionPreview({
        chat: { id: chatId, project_id: chat.project_id ?? null },
        version: versionRow,
        policy: { previewPolicy, verificationPolicy },
        forceRestart: parsed.data.forceRestart === true,
      });
      if (!outcome.ok) {
        if (outcome.reason === "start_failed") {
          const status = httpStatusForPreviewSessionFailure(outcome.error);
          return NextResponse.json({
            ok: false, stage: outcome.error.stage, message: outcome.error.message,
            ...(outcome.error.failureCode ? { failureCode: outcome.error.failureCode } : {}),
            retryable: status === 503 || status === 504,
          }, { status, headers: status === 503 || status === 504 ? { "Retry-After": "5" } : undefined });
        }
        const failure = {
          preview_blocked: { status: 400, message: "Version cannot be previewed.", retryable: false },
          no_files: { status: 400, message: "No files in version for preview session.", retryable: false },
          version_changed: { status: 409, message: "Version files changed. Try again.", retryable: true },
        }[outcome.reason];
        return NextResponse.json({ ok: false, code: outcome.reason,
          message: failure.message, retryable: failure.retryable }, { status: failure.status });
      }
      const sr = outcome.result;
      if (sr.bookkeepingRequired) {
        after(() => persistVersionPreviewOutcome({ receipt: sr }).then(() => undefined));
      }
      return NextResponse.json({
        ok: true,
        previewUrl: sr.previewUrl,
        previewSessionId: sr.previewSessionId,
        lifecycleToken: sr.lifecycleToken,
        previewMode: sr.previewMode,
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
