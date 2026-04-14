import { NextResponse } from "next/server";
import { withRateLimit } from "@/lib/rateLimit";
import { getEngineChatByIdForRequest } from "@/lib/tenant";
import {
  getActivePreviewSessionAsync,
  PREVIEW_SESSION_HARD_CAP_MS,
  PREVIEW_SESSION_IDLE_MS,
  type PreviewSessionEntry,
} from "@/lib/gen/preview/session-store";
import { logPreviewLifecycleTelemetry } from "@/lib/gen/preview/lifecycle-telemetry";
import { isTier2PreviewConfigured } from "@/lib/gen/preview/tier2-config";
import { tryResumeTier2Runtime } from "@/lib/gen/preview/tier2-resume";
import type { PreviewStatusApiJson } from "@/lib/gen/preview/preview-contract";

const BOOT_GRACE_MS = 90_000;

function sessionSoftExpiryAt(entry: PreviewSessionEntry): number {
  return Math.min(entry.createdAt + PREVIEW_SESSION_HARD_CAP_MS, entry.lastUsedAt + PREVIEW_SESSION_IDLE_MS);
}

function isWithinBootGrace(entry: PreviewSessionEntry, now: number): boolean {
  return now - entry.createdAt < BOOT_GRACE_MS;
}

export async function GET(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  return withRateLimit(req, "preview-session:status", async () => {
    try {
      const { chatId } = await ctx.params;
      const url = new URL(req.url);
      const versionId = url.searchParams.get("versionId")?.trim();
      const clientPreviewSessionId = url.searchParams.get("previewSessionId")?.trim() || null;

      if (!versionId) {
        return NextResponse.json({ ok: false, message: "versionId query parameter is required." }, { status: 400 });
      }

      if (!isTier2PreviewConfigured()) {
        const body: PreviewStatusApiJson = {
          ok: true,
          status: "missing",
          previewSessionId: null,
          previewUrl: null,
          versionId: null,
          sessionExpiresAt: null,
          reason: "preview_session_not_configured",
        };
        return NextResponse.json(body);
      }

      const chat = await getEngineChatByIdForRequest(req, chatId);
      if (!chat) {
        return NextResponse.json({ ok: false, message: "Chat not found." }, { status: 404 });
      }

      const now = Date.now();
      const session = await getActivePreviewSessionAsync(chatId);

      if (!session) {
        const body: PreviewStatusApiJson = {
          ok: true,
          status: "missing",
          previewSessionId: null,
          previewUrl: null,
          versionId: null,
          sessionExpiresAt: null,
          reason: "no_session",
        };
        logPreviewLifecycleTelemetry({
          kind: "preview_status",
          chatId,
          status: "missing",
          versionId,
          sandboxId: null,
        });
        return NextResponse.json(body);
      }

      const sessionVid = session.versionId ?? null;
      if (sessionVid !== versionId) {
        const body: PreviewStatusApiJson = {
          ok: true,
          status: "version_mismatch",
          previewSessionId: session.sandboxId,
          previewUrl: session.sandboxUrl,
          versionId: sessionVid,
          sessionExpiresAt: sessionSoftExpiryAt(session),
          reason: "session_bound_to_other_version",
        };
        logPreviewLifecycleTelemetry({
          kind: "preview_status",
          chatId,
          status: "version_mismatch",
          versionId,
          sandboxId: session.sandboxId,
        });
        return NextResponse.json(body);
      }

      if (clientPreviewSessionId && session.sandboxId !== clientPreviewSessionId) {
        const body: PreviewStatusApiJson = {
          ok: true,
          status: "stopped",
          previewSessionId: session.sandboxId,
          previewUrl: session.sandboxUrl,
          versionId: sessionVid,
          sessionExpiresAt: sessionSoftExpiryAt(session),
          reason: "preview_session_id_mismatch",
        };
        logPreviewLifecycleTelemetry({
          kind: "preview_status",
          chatId,
          status: "stopped",
          versionId,
          sandboxId: session.sandboxId,
        });
        return NextResponse.json(body);
      }

      const resumed = await tryResumeTier2Runtime(session);
      if (!resumed) {
        const booting = isWithinBootGrace(session, now);
        const status = booting ? "starting" : "stopped";
        const reason = booting ? "boot_grace_period" : "provider_not_running_or_unreachable";
        const body: PreviewStatusApiJson = {
          ok: true,
          status,
          previewSessionId: session.sandboxId,
          previewUrl: session.sandboxUrl,
          versionId: sessionVid,
          sessionExpiresAt: sessionSoftExpiryAt(session),
          reason,
        };
        logPreviewLifecycleTelemetry({
          kind: "preview_status",
          chatId,
          status,
          versionId,
          sandboxId: session.sandboxId,
        });
        return NextResponse.json(body);
      }

      const body: PreviewStatusApiJson = {
        ok: true,
        status: "running",
        previewSessionId: resumed.sandboxId,
        previewUrl: resumed.primaryUrl,
        versionId: sessionVid,
        sessionExpiresAt: sessionSoftExpiryAt(session),
      };
      logPreviewLifecycleTelemetry({
        kind: "preview_status",
        chatId,
        status: "running",
        versionId,
        sandboxId: resumed.sandboxId,
      });
      return NextResponse.json(body);
    } catch (err) {
      console.error("[preview-status] GET", err);
      return NextResponse.json(
        {
          ok: false,
          message: err instanceof Error ? err.message : "Unknown error",
        },
        { status: 500 },
      );
    }
  });
}
