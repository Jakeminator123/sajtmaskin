import { after, NextResponse } from "next/server";
import { withRateLimit } from "@/lib/rate-limit";
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
import { fetchPreviewHostReadinessVerdict } from "@/lib/gen/preview/preview-host-client";
import type {
  PreviewStatusApiJson,
  PreviewStatusReason,
} from "@/lib/gen/preview/preview-contract";
import { getVersionById } from "@/lib/db/chat-repository-pg";
import {
  applyPreviewReadinessOutcome,
  decidePreviewReadinessOutcome,
} from "@/lib/gen/preview/readiness-stamp";
import {
  classifyReadinessFailure,
  isUnverifiedReadinessFailure,
} from "@/lib/gen/preview/readiness-failure";

const BOOT_GRACE_MS = 90_000;

/**
 * `build_error_overlay` only when the host actually saw a compile failure.
 * An empty-body verdict (client-rendered page) is reported honestly as
 * `preview_unverified_empty_body` so the client renders a notice instead of
 * a red build-error banner.
 */
function readinessFailureReason(buildError: string | null): PreviewStatusReason {
  return isUnverifiedReadinessFailure(classifyReadinessFailure(buildError))
    ? "preview_unverified_empty_body"
    : "build_error_overlay";
}

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
          lifecycleToken: null,
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
          lifecycleToken: null,
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
          lifecycleToken: session.lifecycleToken,
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
          lifecycleToken: session.lifecycleToken,
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

      const resumed = await tryResumeTier2Runtime(session);
      if (!resumed) {
        // A boot can fail BEFORE the dev process ever comes up (install error,
        // failed postcondition, readiness deadline). The host records
        // `readinessState: "failed"` and leaves `running: false` — which the
        // resume path reports as `null`, i.e. indistinguishable from an idle or
        // unreachable session. Read the readiness half directly so a provably
        // dead preview still stamps `preview_success=false`, writes its error
        // row and reaches RepairGate instead of quietly reading as "stopped".
        const verdict = await fetchPreviewHostReadinessVerdict(session.previewSessionId, {
          expectedVersionId: sessionVid,
          expectedLifecycleToken: session.lifecycleToken ?? null,
        }).catch(() => null);
        if (verdict?.readinessState === "failed") {
          const failureDecision = decidePreviewReadinessOutcome(verdict);
          after(async () => {
            await applyPreviewReadinessOutcome({
              chatId,
              versionId,
              bootedFilesRevision: session.filesRevision,
              resumed: verdict,
            });
          });
          const body: PreviewStatusApiJson = {
            ok: true,
            status: "build_error",
            previewSessionId: session.previewSessionId,
            lifecycleToken: session.lifecycleToken,
            previewUrl: session.previewUrl,
            versionId: sessionVid,
            sessionExpiresAt: sessionSoftExpiryAt(session),
            reason: readinessFailureReason(failureDecision.buildError),
            readinessError: failureDecision.buildError,
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

        const booting = isWithinBootGrace(session, now);
        const status = booting ? "starting" : "stopped";
        const reason = booting ? "boot_grace_period" : "provider_not_running_or_unreachable";
        const body: PreviewStatusApiJson = {
          ok: true,
          status,
          previewSessionId: session.previewSessionId,
          lifecycleToken: session.lifecycleToken,
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

      // M#pv1 + req A5: readiness receipt on the SUSPECT/RECOVERY path. The host
      // reported `running: true` for the session pinned to exactly this versionId
      // (session↔version equality checked above, and `tryResumeTier2Runtime`
      // re-verifies versionId host-side). But `running` ≠ HTTP-ready — the host
      // `readinessState` verdict decides `preview_success`:
      //   ready    → stamp true; starting → no stamp; failed → stamp false + log
      //              a build-error row so RepairGate can fire.
      // Scheduled via `after()` (same pattern as repair/analytics routes) so a
      // saturated DB pool can never delay the user-visible status response —
      // the stamp runs post-response. Monotonic + atomic + best-effort inside
      // the writer (single conditional UPDATE, never throws, `true` terminal),
      // and its per-instance confirmed-cache makes repeat polls DB-free.
      const readinessDecision = decidePreviewReadinessOutcome(resumed);
      after(async () => {
        await applyPreviewReadinessOutcome({
          chatId,
          versionId,
          bootedFilesRevision: session.filesRevision,
          resumed,
        });
      });

      if (readinessDecision.previewSuccess === false) {
        const body: PreviewStatusApiJson = {
          ok: true,
          status: "build_error",
          previewSessionId: resumed.previewSessionId,
          lifecycleToken: resumed.lifecycleToken ?? session.lifecycleToken,
          previewUrl: resumed.primaryUrl,
          versionId: sessionVid,
          sessionExpiresAt: sessionSoftExpiryAt(session),
          reason: readinessFailureReason(readinessDecision.buildError),
          readinessError: readinessDecision.buildError,
        };
        logPreviewLifecycleTelemetry({
          kind: "preview_status",
          chatId,
          status: "stopped",
          versionId,
          previewSessionId: resumed.previewSessionId,
        });
        return NextResponse.json(body);
      }

      const stillStarting = readinessDecision.previewSuccess === null;
      const body: PreviewStatusApiJson = {
        ok: true,
        status: stillStarting ? "starting" : "running",
        previewSessionId: resumed.previewSessionId,
        lifecycleToken: resumed.lifecycleToken ?? session.lifecycleToken,
        previewUrl: resumed.primaryUrl,
        versionId: sessionVid,
        sessionExpiresAt: sessionSoftExpiryAt(session),
        ...(stillStarting ? { reason: "boot_grace_period" as const } : {}),
      };
      logPreviewLifecycleTelemetry({
        kind: "preview_status",
        chatId,
        status: stillStarting ? "starting" : "running",
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
