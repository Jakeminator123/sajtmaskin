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
import { getVersionById } from "@/lib/db/chat-repository-pg";

const BOOT_GRACE_MS = 90_000;

function sessionSoftExpiryAt(entry: PreviewSessionEntry): number {
  return Math.min(entry.createdAt + PREVIEW_SESSION_HARD_CAP_MS, entry.lastUsedAt + PREVIEW_SESSION_IDLE_MS);
}

function isWithinBootGrace(entry: PreviewSessionEntry, now: number): boolean {
  return now - entry.createdAt < BOOT_GRACE_MS;
}

async function resolveMismatchDirection(params: {
  chatId: string;
  expectedVersionId: string;
  sessionVersionId: string | null;
}): Promise<PreviewStatusApiJson["mismatchDirection"]> {
  const { chatId, expectedVersionId, sessionVersionId } = params;
  if (!sessionVersionId) return "unknown";
  try {
    const [expected, current] = await Promise.all([
      getVersionById(expectedVersionId),
      getVersionById(sessionVersionId),
    ]);
    if (!expected || !current) return "unknown";
    if (expected.chat_id !== chatId || current.chat_id !== chatId) return "unknown";
    if (current.version_number > expected.version_number) return "session_newer";
    if (current.version_number < expected.version_number) return "session_older";
    return "unknown";
  } catch {
    return "unknown";
  }
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
          previewSessionId: null,
        });
        return NextResponse.json(body);
      }

      const sessionVid = session.versionId ?? null;
      if (sessionVid !== versionId) {
        const mismatchDirection = await resolveMismatchDirection({
          chatId,
          expectedVersionId: versionId,
          sessionVersionId: sessionVid,
        });
        const body: PreviewStatusApiJson = {
          ok: true,
          status: "version_mismatch",
          previewSessionId: session.previewSessionId,
          previewUrl: session.previewUrl,
          versionId: sessionVid,
          sessionExpiresAt: sessionSoftExpiryAt(session),
          reason: "session_bound_to_other_version",
          mismatchDirection,
        };
        logPreviewLifecycleTelemetry({
          kind: "preview_status",
          chatId,
          status: "version_mismatch",
          versionId,
          previewSessionId: session.previewSessionId,
        });
        return NextResponse.json(body);
      }

      if (clientPreviewSessionId && session.previewSessionId !== clientPreviewSessionId) {
        const body: PreviewStatusApiJson = {
          ok: true,
          status: "stopped",
          previewSessionId: session.previewSessionId,
          previewUrl: session.previewUrl,
          versionId: sessionVid,
          sessionExpiresAt: sessionSoftExpiryAt(session),
          reason: "preview_session_id_mismatch",
        };
        logPreviewLifecycleTelemetry({
          kind: "preview_status",
          chatId,
          status: "stopped",
          versionId,
          previewSessionId: session.previewSessionId,
        });
        return NextResponse.json(body);
      }

      // Require CONTENT-readiness (not just a live process) before reporting the
      // session as running here: the builder maps this route's "running" status
      // to the `live` lifecycle, so a still-compiling VM serving the boot page
      // must stay "starting" (false-green guard, BUG-SWARM #3).
      const resumed = await tryResumeTier2Runtime(session, { requireReady: true });
      if (!resumed) {
        const booting = isWithinBootGrace(session, now);
        const status = booting ? "starting" : "stopped";
        const reason = booting ? "boot_grace_period" : "provider_not_running_or_unreachable";
        const body: PreviewStatusApiJson = {
          ok: true,
          status,
          previewSessionId: session.previewSessionId,
          previewUrl: session.previewUrl,
          versionId: sessionVid,
          sessionExpiresAt: sessionSoftExpiryAt(session),
          reason,
        };
        logPreviewLifecycleTelemetry({
          kind: "preview_status",
          chatId,
          status,
          versionId,
          previewSessionId: session.previewSessionId,
        });
        return NextResponse.json(body);
      }

      const body: PreviewStatusApiJson = {
        ok: true,
        status: "running",
        previewSessionId: resumed.previewSessionId,
        previewUrl: resumed.primaryUrl,
        versionId: sessionVid,
        sessionExpiresAt: sessionSoftExpiryAt(session),
      };
      logPreviewLifecycleTelemetry({
        kind: "preview_status",
        chatId,
        status: "running",
        versionId,
        previewSessionId: resumed.previewSessionId,
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
