/**
 * `GET /api/engine/chats/[chatId]/version-status?versionId=…`
 *
 * Server-projection of the OMTAG-06 event bus to a `VersionStatus` shape
 * for client consumption. This is the **client-readable** counterpart to
 * the existing `selectVersionStatus()` projection that already runs
 * server-side via the bus subscribers — same code path, just exposed as
 * an HTTP read so the builder UI doesn't have to derive status from
 * disparate DB row flags via the now-removed `resolveEngineVersionDisplayStatus`.
 *
 * Use case: `useVersionStatus()` hook in the builder polls / re-fetches
 * this endpoint to keep the active version's status in sync with the
 * authoritative bus stream. `VersionMismatchOverlay` is intentionally
 * driven by `/preview-status` via `usePreviewSession`, because it tracks
 * the live VM session rather than the event-bus lifecycle. As of område
 * 6-2 the version-history badges read the bus too — via the
 * server-enriched `busStatus` field on the `/versions` route — so the
 * legacy DB resolver is no longer the status source for the builder.
 *
 * Terminal backstop: this route reads the bus projection, but a background
 * verify job that dies without emitting a terminal event would otherwise
 * leave the bus stuck on `verifying`/`repairing` forever — a perpetual
 * "Verifierar"-spinner. So we run the same lease-safe stale-verification
 * watchdog as `/readiness` (shared `settleStaleVerificationIfNeeded`) and
 * reconcile the bus projection with the authoritative DB terminal state
 * (`reconcileTerminalDbState`). This guarantees the spinner always resolves.
 */

import { NextResponse } from "next/server";
import { withRateLimit } from "@/lib/rateLimit";
import { getEngineVersionForChatByIdForRequest } from "@/lib/tenant";
import { getEngineVersionErrorLogs } from "@/lib/db/services/version-errors";
import { readAll } from "@/lib/logging/event-bus";
import { selectVersionStatus } from "@/lib/logging/event-bus-projection";
import type { VersionStatus } from "@/lib/logging/event-bus-types";
import { resolveGateFailureSummaryFromLogs } from "@/lib/gen/verify/gate-failure-summary";
import { reconcileTerminalDbState } from "@/lib/gen/verify/stale-verification";
import { settleStaleVerificationIfNeeded } from "@/lib/gen/verify/settle-stale-verification";

export type VersionStatusApiResponse =
  | { ok: true; versionId: string; status: VersionStatus }
  | { ok: false; error: string };

export async function GET(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  return withRateLimit(req, "engine:version-status", () => handleGET(req, ctx));
}

async function handleGET(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await ctx.params;
    const url = new URL(req.url);
    const versionId = url.searchParams.get("versionId")?.trim();

    if (!versionId) {
      return NextResponse.json<VersionStatusApiResponse>(
        { ok: false, error: "versionId query parameter is required." },
        { status: 400 },
      );
    }

    const scopedVersion = await getEngineVersionForChatByIdForRequest(req, chatId, versionId);
    if (!scopedVersion) {
      return NextResponse.json<VersionStatusApiResponse>(
        { ok: false, error: "Version not found for chat." },
        { status: 404 },
      );
    }

    // Lease-safe stale watchdog: settle a version stuck past the route budget
    // to a terminal DB state. The failure-summary read is lazy — it only runs
    // when a row is actually stale, keeping the 4s poll cheap in the hot path.
    const { version: dbVersion } = await settleStaleVerificationIfNeeded(
      scopedVersion.version,
      {
        resolveFailureSummary: async () =>
          resolveGateFailureSummaryFromLogs(
            await getEngineVersionErrorLogs(scopedVersion.version.id),
          ),
      },
    );

    const events = readAll(dbVersion.id);
    // Reconcile the bus projection with the authoritative DB terminal state so
    // a died-mid-verify job can never leave the spinner ticking forever.
    const status = reconcileTerminalDbState(
      selectVersionStatus(events),
      dbVersion.verification_state,
    );

    return NextResponse.json<VersionStatusApiResponse>({
      ok: true,
      versionId: dbVersion.id,
      status,
    });
  } catch (err) {
    console.error("[version-status] GET", err);
    return NextResponse.json<VersionStatusApiResponse>(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
