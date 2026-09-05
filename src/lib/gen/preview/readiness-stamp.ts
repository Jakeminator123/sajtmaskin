import type { PreviewHostStatusResult } from "./preview-host-client";
import { classifyReadinessFailure, isUnverifiedReadinessFailure } from "./readiness-failure";
import { LOCKFILE_STALE_MARKER_PATH } from "@/lib/gen/autofix/dep-completer";

/**
 * Readiness-gated `preview_success` stamping (req A4/A5/A6).
 *
 * `running: true` (child process alive) is NOT `preview_success: true`. The host
 * now reports a `readinessState` verdict from `waitForReady` (no Next build-error
 * overlay / HTTP 500). This helper turns that verdict into the app-side effects:
 *
 * - `ready`   → stamp `preview_success = true` (HTTP-ready, no overlay).
 * - `starting`→ no stamp yet (still booting; a later poll decides).
 * - `failed`  → stamp `preview_success = false` + persist an error row so
 *               `triggerBuildErrorRepair` / `version.build.error` can fire.
 * - `null`    → legacy host without the field → keep the prior "running = ready"
 *               contract (stamp true).
 *
 * Version binding (req A6): callers pass the versionId the SESSION is pinned to
 * AND that the host `/status` confirmed (see `fetchPreviewHostStatus`
 * `expectedVersionId`). The stamp therefore only ever writes for the version the
 * probe actually observed — never a newer DB version.
 */

export type PreviewReadinessDecision = {
  /** `true`/`false` to stamp, or `null` to leave telemetry untouched (still booting). */
  previewSuccess: boolean | null;
  /** Set when a build-error row should be persisted for RepairGate. */
  buildError: string | null;
  /** Present once after a stale-lockfile reconcile; persist into files_json. */
  regeneratedLockfile: PreviewHostStatusResult["regeneratedLockfile"];
};

export function decidePreviewReadinessOutcome(
  resumed: Pick<
    PreviewHostStatusResult,
    "readinessState" | "readinessError" | "installDiagnostics" | "regeneratedLockfile" | "httpReady"
  >,
): PreviewReadinessDecision {
  const regeneratedLockfile = resumed.regeneratedLockfile ?? null;
  switch (resumed.readinessState) {
    case "ready":
      // Stamp true ONLY on a confirmed HTTP-ready verdict. A host that reports
      // `readinessState: "ready"` but `httpReady: false` is contradictory —
      // treat it as still pending rather than a false-green.
      return resumed.httpReady === false
        ? { previewSuccess: null, buildError: null, regeneratedLockfile }
        : { previewSuccess: true, buildError: null, regeneratedLockfile };
    case "failed":
      return {
        previewSuccess: false,
        buildError:
          resumed.readinessError ??
          "Preview failed readiness: the page returned a build error / HTTP 500.",
        regeneratedLockfile,
      };
    // `null`/`undefined` (host omitted the verdict — legacy deploy or the boot
    // hasn't recorded readiness yet) and `"starting"` are PENDING, never a
    // success: process liveness / unknown readiness must NOT stamp
    // `preview_success=true` (Bugbot finding 1). A later poll with a real
    // `ready`/`failed` verdict resolves the outcome.
    case "starting":
    case null:
    case undefined:
    default:
      return { previewSuccess: null, buildError: null, regeneratedLockfile };
  }
}

/**
 * Apply the readiness decision as DB side-effects. Best-effort and never throws
 * — intended to run inside `after()` so it can never delay the status response.
 *
 * Uses dynamic imports so this module (and its callers' unit tests) do not pull
 * the DB client graph unless a stamp actually happens.
 */
export async function applyPreviewReadinessOutcome(params: {
  chatId: string;
  versionId: string;
  bootedFilesRevision?: string | null;
  resumed: Pick<
    PreviewHostStatusResult,
    "readinessState" | "readinessError" | "installDiagnostics" | "regeneratedLockfile" | "httpReady"
  >;
}): Promise<PreviewReadinessDecision> {
  const decision = decidePreviewReadinessOutcome(params.resumed);
  try {
    const { recordPreviewRuntimeOutcomeForVersion } = await import(
      "@/lib/db/services/generation-telemetry"
    );
    if (decision.previewSuccess !== null) {
      const revision = params.bootedFilesRevision?.trim() || null;
      if (revision) {
        await recordPreviewRuntimeOutcomeForVersion(params.versionId, decision.previewSuccess, {
          bootedFilesRevision: revision,
        });
      } else {
        await recordPreviewRuntimeOutcomeForVersion(params.versionId, decision.previewSuccess);
      }
    }
    // Once-per-version failure log (Bugbot HIGH): heartbeat (~25s) and
    // preview-status (~15s) both poll and both re-stamp `failed` — but only a
    // *ready* outcome populates `hasConfirmedPreviewReadyOnInstance`, so without
    // this guard every failed poll would INSERT another identical error row
    // forever. Guard the diagnostics write per version per instance so exactly
    // one build-error row is registered for RepairGate to act on.
    if (decision.buildError && !failedPreviewVersionIds.has(params.versionId)) {
      failedPreviewVersionIds.add(params.versionId);
      const { createEngineVersionErrorLogs } = await import(
        "@/lib/db/services/version-errors"
      );
      // An empty-body verdict is "could not verify", not "broken": the JS-less
      // probe cannot see a client-rendered page. Keep the row (it explains the
      // `preview_success=false` stamp) but log it as a warning and tag the
      // kind so /logg and the defect grouping can tell it from real compile
      // failures (prod chat 28af0778: 7 such rows read as build errors).
      const readinessFailureKind = classifyReadinessFailure(decision.buildError);
      await createEngineVersionErrorLogs(
        [
          {
            chatId: params.chatId,
            versionId: params.versionId,
            level: isUnverifiedReadinessFailure(readinessFailureKind) ? "warning" : "error",
            category: "preview",
            message: decision.buildError,
            meta: {
              source: "preview_readiness_probe",
              readinessFailureKind,
              ...(params.resumed.installDiagnostics
                ? { installDiagnostics: params.resumed.installDiagnostics }
                : {}),
            },
          },
        ],
        { lockTimeoutMs: 2_000 },
      );
    }
    if (decision.regeneratedLockfile) {
      await persistRegeneratedLockfileForVersion(
        params.versionId,
        decision.regeneratedLockfile,
      );
    }
  } catch (err) {
    console.warn("[preview-readiness] Failed to apply readiness outcome:", err);
  }
  return decision;
}

const persistedLockfileVersionIds = new Set<string>();

/**
 * Versions for which a readiness-failure diagnostics row has already been
 * written on this instance. Prevents heartbeat/status polls from inserting a
 * duplicate build-error row on every failed poll (Bugbot HIGH) — the false
 * `preview_success` stamp is monotonic in the writer, but the error-log INSERT
 * has no such guard on its own.
 */
const failedPreviewVersionIds = new Set<string>();

/**
 * One-shot lockfile round-trip (req A2): after the host regenerates a lockfile
 * via a non-frozen install, write it back into `engine_versions.files_json` and
 * drop the `.sajtmaskin/lockfile-stale.json` marker so future boots use the
 * frozen path again. Idempotent + guarded per version per instance; skips
 * silently when the marker is already gone (nothing to reconcile).
 *
 * Preview binding (Bugbot HIGH): this write changes `files_json` but NOT what
 * the running VM serves — the host already installed from the regenerated
 * lockfile. It therefore passes `preservePreviewUrl: true` so a live/starting
 * session stays bound and the builder doesn't desync (nulling the URL would
 * have forced a needless re-boot on the first poll that returns a lockfile).
 * This is a rare one-time event (only right after a stale-lockfile reconcile).
 */
export async function persistRegeneratedLockfileForVersion(
  versionId: string,
  regeneratedLockfile: NonNullable<PreviewHostStatusResult["regeneratedLockfile"]>,
): Promise<boolean> {
  if (!versionId || persistedLockfileVersionIds.has(versionId)) return false;
  try {
    // Snapshot, not just the parsed files: the raw `files_json` string is the
    // compare-and-swap token for the write below. This is a read-modify-write
    // of the WHOLE file array, so without it a repair or user edit that lands
    // between the read and the write is overwritten wholesale.
    const { getVersionFilesSnapshot } = await import("@/lib/gen/version-manager");
    const snapshot = await getVersionFilesSnapshot(versionId);
    if (!snapshot) return false;
    const files = snapshot.files;
    const markerPath = LOCKFILE_STALE_MARKER_PATH;
    const lockfilePath = regeneratedLockfile.path.replace(/\\/g, "/");
    const hasMarker = files.some((f) => f.path.replace(/\\/g, "/") === markerPath);
    if (!hasMarker) {
      // Already reconciled (or never stale) — don't churn files_json.
      persistedLockfileVersionIds.add(versionId);
      return false;
    }
    const next = files
      .filter((f) => f.path.replace(/\\/g, "/") !== markerPath)
      .map((f) =>
        f.path.replace(/\\/g, "/") === lockfilePath
          ? { ...f, content: regeneratedLockfile.content }
          : f,
      );
    const alreadyHasLockfile = files.some(
      (f) => f.path.replace(/\\/g, "/") === lockfilePath,
    );
    if (!alreadyHasLockfile) {
      next.push({
        path: regeneratedLockfile.path,
        content: regeneratedLockfile.content,
        language: "yaml",
      });
    }
    const { updateVersionFiles } = await import("@/lib/db/chat-repository-pg");
    const wrote = await updateVersionFiles(versionId, JSON.stringify(next), {
      preservePreviewUrl: true,
      expectedFilesJson: snapshot.filesJson,
    });
    // Deliberately NOT marking the guard on a CAS miss: the row moved under us,
    // so the reconcile has not happened and a later poll should retry against
    // the new base. Marking it here would drop the lockfile silently.
    if (wrote) persistedLockfileVersionIds.add(versionId);
    return wrote;
  } catch (err) {
    console.warn("[preview-readiness] Failed to persist regenerated lockfile:", err);
    return false;
  }
}

/** Test-only reset of the per-instance persist + failure-log guards. */
export function __resetPersistedLockfileGuardForTesting(): void {
  persistedLockfileVersionIds.clear();
  failedPreviewVersionIds.clear();
}
