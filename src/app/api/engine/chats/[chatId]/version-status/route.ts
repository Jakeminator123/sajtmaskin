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
import { emit as emitBusEvent, readAll } from "@/lib/logging/event-bus";
import { selectVersionStatus } from "@/lib/logging/event-bus-projection";
import type { VersionStatus } from "@/lib/logging/event-bus-types";
import {
  isLatestGateVerdictAdvisory,
  isLatestGateVerdictGreen,
  resolveGateFailureSummaryFromLogs,
} from "@/lib/gen/verify/gate-failure-summary";
import type { VersionErrorLog } from "@/lib/db/services/shared";
import { reconcileTerminalDbState } from "@/lib/gen/verify/stale-verification";
import {
  RECONCILED_PROMOTE_SUMMARY,
  settleStaleVerificationIfNeeded,
} from "@/lib/gen/verify/settle-stale-verification";
import { getLatestVersion, promoteVersionIfUnleased } from "@/lib/db/chat-repository-pg";

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

    const events = readAll(scopedVersion.version.id);
    const busStatus = selectVersionStatus(events);

    // Only touch the DB when the spinner is actually stuck: a terminal bus (incl.
    // an F2 design-preview whose verifier was "skipped" → done) needs no DB work,
    // which keeps the 4s poll cheap. The lease-safe watchdog itself refuses to
    // fail valid pending design previews (see `settleStaleVerificationIfNeeded`),
    // so it can never false-red them; stuck F2 rows are additionally covered by
    // the client-side poll cap in `useVersionStatus`.
    let dbVersion = scopedVersion.version;
    const busStuck = busStatus.phase === "verifying" || busStatus.phase === "repairing";
    if (busStuck) {
      // Fetch the error logs at most once, shared by both watchdog resolvers
      // (failure-summary + BB#299 green reconciliation), so the 4s poll stays a
      // single DB read even when the row is actually stale.
      let cachedLogs: VersionErrorLog[] | null = null;
      const loadLogs = async (): Promise<VersionErrorLog[]> => {
        if (cachedLogs === null) {
          cachedLogs = await getEngineVersionErrorLogs(dbVersion.id);
        }
        return cachedLogs;
      };
      const versionIdForReconcile = dbVersion.id;
      // Read the chat head at most once per settle and reuse for the head gate
      // (bugbot medium #518) — mirrors the quality-gate route's
      // `isLatestVersionForChat` (`!latest || latest.id === versionId`). A
      // missing/failed read is treated as head.
      let headResolved = false;
      let isHeadVersion = true;
      const resolveIsHeadVersion = async (): Promise<boolean> => {
        if (!headResolved) {
          const latest = await getLatestVersion(chatId).catch(() => null);
          isHeadVersion = !latest || latest.id === versionIdForReconcile;
          headResolved = true;
        }
        return isHeadVersion;
      };
      const settled = await settleStaleVerificationIfNeeded(dbVersion, {
        resolveFailureSummary: async () =>
          resolveGateFailureSummaryFromLogs(await loadLogs()),
        // BB#299: don't false-red a stale row whose latest gate verdict is green.
        resolveLatestGateGreen: async () => isLatestGateVerdictGreen(await loadLogs()),
        // Bugbot medium (#518): the green reconciliation only applies to the chat
        // head; a non-head (superseded) stale row falls through to terminal-fail.
        resolveIsHeadVersion,
        // Codex P1 (#518): recover a proven-green stale HEAD row to a terminal
        // promoted state via the guarded, LEASE-SAFE promote (bugbot high #518)
        // instead of leaving it spinning — so this 4s poll can reconcile the bus
        // to `done` without ever racing a verify/repair job that holds the lease.
        promoteReconciledVersion: async () => {
          const promoted = await promoteVersionIfUnleased(
            versionIdForReconcile,
            RECONCILED_PROMOTE_SUMMARY,
          );
          // Bugbot medium (#518): mirror the quality-gate route — an advisory
          // (typecheck-only) promotion is NOT solid-green, so emit
          // `version.degraded` after the reconcile-promote takes, else this poll
          // would reconcile the bus to a false green `done`. Clean pass emits
          // nothing. Best-effort telemetry (reuses the memoised log read).
          if (promoted && isLatestGateVerdictAdvisory(await loadLogs())) {
            try {
              emitBusEvent({
                t: "version.degraded",
                versionId: versionIdForReconcile,
                chatId,
                kind: "typecheck_advisory",
                message:
                  "F2 render-first: versionen promotades med typecheck-varningar (advisory).",
                meta: { advisoryChecks: ["typecheck"] },
              });
            } catch {
              // Telemetry only — never block the poll on a bus failure.
            }
          }
          return promoted;
        },
      });
      dbVersion = settled.version;
    }

    // Read-only reconcile: map an ALREADY-terminal DB state (failed/passed) onto
    // a still-spinning bus so a died-mid-verify job can't tick forever. Safe
    // no-op when the DB is non-terminal (e.g. a pending design preview), so this
    // never fabricates a terminal state. release_state is threaded so a
    // promoted+passed row can upgrade a stale terminal bus `failed` (M#flap1).
    const status = reconcileTerminalDbState(
      busStatus,
      dbVersion.verification_state,
      dbVersion.release_state,
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
