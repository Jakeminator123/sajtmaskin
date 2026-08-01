import type { PreviewHostStatusResult } from "./preview-host-client";
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
  resumed: Pick<PreviewHostStatusResult, "readinessState" | "readinessError" | "regeneratedLockfile">,
): PreviewReadinessDecision {
  const regeneratedLockfile = resumed.regeneratedLockfile ?? null;
  switch (resumed.readinessState) {
    case "ready":
    case null:
    case undefined:
      return { previewSuccess: true, buildError: null, regeneratedLockfile };
    case "starting":
      return { previewSuccess: null, buildError: null, regeneratedLockfile };
    case "failed":
      return {
        previewSuccess: false,
        buildError:
          resumed.readinessError ??
          "Preview failed readiness: the page returned a build error / HTTP 500.",
        regeneratedLockfile,
      };
    default:
      return { previewSuccess: true, buildError: null, regeneratedLockfile };
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
  resumed: Pick<
    PreviewHostStatusResult,
    "readinessState" | "readinessError" | "regeneratedLockfile"
  >;
}): Promise<PreviewReadinessDecision> {
  const decision = decidePreviewReadinessOutcome(params.resumed);
  try {
    const { recordPreviewRuntimeOutcomeForVersion } = await import(
      "@/lib/db/services/generation-telemetry"
    );
    if (decision.previewSuccess !== null) {
      await recordPreviewRuntimeOutcomeForVersion(params.versionId, decision.previewSuccess);
    }
    if (decision.buildError) {
      const { createEngineVersionErrorLogs } = await import(
        "@/lib/db/services/version-errors"
      );
      await createEngineVersionErrorLogs(
        [
          {
            chatId: params.chatId,
            versionId: params.versionId,
            level: "error",
            category: "preview",
            message: decision.buildError,
            meta: { source: "preview_readiness_probe" },
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
 * One-shot lockfile round-trip (req A2): after the host regenerates a lockfile
 * via a non-frozen install, write it back into `engine_versions.files_json` and
 * drop the `.sajtmaskin/lockfile-stale.json` marker so future boots use the
 * frozen path again. Idempotent + guarded per version per instance; skips
 * silently when the marker is already gone (nothing to reconcile).
 *
 * NOTE: `updateVersionFiles` invalidates the cached preview URL by design; the
 * host reuses the same session for the chat so the next poll re-pins quickly.
 * This is a rare one-time event (only right after a stale-lockfile reconcile).
 */
export async function persistRegeneratedLockfileForVersion(
  versionId: string,
  regeneratedLockfile: NonNullable<PreviewHostStatusResult["regeneratedLockfile"]>,
): Promise<boolean> {
  if (!versionId || persistedLockfileVersionIds.has(versionId)) return false;
  try {
    const { getVersionFiles } = await import("@/lib/gen/version-manager");
    const files = await getVersionFiles(versionId);
    if (!files) return false;
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
    const wrote = await updateVersionFiles(versionId, JSON.stringify(next));
    if (wrote) persistedLockfileVersionIds.add(versionId);
    return wrote;
  } catch (err) {
    console.warn("[preview-readiness] Failed to persist regenerated lockfile:", err);
    return false;
  }
}

/** Test-only reset of the per-instance persist guard. */
export function __resetPersistedLockfileGuardForTesting(): void {
  persistedLockfileVersionIds.clear();
}
