import { createHash } from "node:crypto";
import type { PreviewHostStatusResult } from "./preview-host-client";
import { classifyReadinessFailure, isUnverifiedReadinessFailure } from "./readiness-failure";
import { LOCKFILE_STALE_MARKER_PATH } from "@/lib/gen/autofix/dep-completer";
import { INSTALL_PEER_FALLBACK_CHECK } from "@/lib/gen/validation/package-tree-compat";
import {
  INSTALL_PEER_FALLBACK_RECEIPT_CATEGORY,
  dependencyFingerprintFromFiles,
  normalizeDependencyFingerprint,
  previewInstallKindFromHostStatus,
} from "@/lib/gen/validation/install-peer-fallback-receipt";

/** Same stored md5 as `engine_versions.files_revision` (`md5(files_json)`). */
function filesRevisionForPersistedJson(filesJson: string): string {
  return createHash("md5").update(filesJson, "utf8").digest("hex");
}

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
    | "readinessState"
    | "readinessError"
    | "installDiagnostics"
    | "regeneratedLockfile"
    | "httpReady"
    | "usedLegacyPeerDeps"
    | "peerConflictDetected"
    | "installKind"
    | "dependencyFingerprint"
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
    | "readinessState"
    | "readinessError"
    | "installDiagnostics"
    | "regeneratedLockfile"
    | "httpReady"
    | "usedLegacyPeerDeps"
    | "peerConflictDetected"
    | "installKind"
    | "dependencyFingerprint"
  >;
}): Promise<PreviewReadinessDecision> {
  const decision = decidePreviewReadinessOutcome(params.resumed);
  try {
    const { recordPreviewRuntimeOutcomeForVersion } = await import(
      "@/lib/db/services/generation-telemetry"
    );
    if (decision.previewSuccess !== null) {
      const revision = params.bootedFilesRevision?.trim() || null;
      const stampOpts = {
        ...(revision ? { bootedFilesRevision: revision } : {}),
        ...(decision.previewSuccess === false && decision.buildError
          ? { previewBlockingReason: decision.buildError }
          : {}),
      };
      if (Object.keys(stampOpts).length > 0) {
        await recordPreviewRuntimeOutcomeForVersion(
          params.versionId,
          decision.previewSuccess,
          stampOpts,
        );
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
    let receiptRevision = params.bootedFilesRevision?.trim() || null;
    let receiptFiles: Array<{ path: string; content: string }> | null = null;
    if (decision.regeneratedLockfile) {
      const persist = await persistRegeneratedLockfileForVersion(
        params.versionId,
        decision.regeneratedLockfile,
      );
      // Only a CAS write this boot performed may move the receipt onto the
      // post-persist revision/files. A miss or already-reconciled read must
      // not fingerprint a competing snapshot.
      if (persist.wrote) {
        if (persist.filesRevision) receiptRevision = persist.filesRevision;
        if (persist.files) receiptFiles = persist.files;
      }
    }
    // Preview started only after --legacy-peer-deps: write a fingerprint-bound
    // receipt the publish gate reads even after a later clean quality-gate.
    // Only a real `strict_pass` may clear it. A fingerprint skip is unknown
    // and must not write usedFallback:false.
    if (decision.previewSuccess === true) {
      const installKind = previewInstallKindFromHostStatus(params.resumed);
      const usedFallback = installKind === "fallback";
      const shouldWriteReceipt = installKind === "fallback" || installKind === "strict_pass";
      const hostFingerprint = normalizeDependencyFingerprint(
        params.resumed.dependencyFingerprint,
      );
      if (shouldWriteReceipt && !receiptFiles && !hostFingerprint) {
        const { getVersionFilesSnapshot } = await import("@/lib/gen/version-manager");
        const snapshot = await getVersionFilesSnapshot(params.versionId);
        if (
          snapshot &&
          receiptRevision &&
          snapshot.filesRevision?.trim() === receiptRevision
        ) {
          receiptFiles = snapshot.files;
        }
      }
      const dependencyFingerprint = receiptFiles
        ? dependencyFingerprintFromFiles(receiptFiles)
        : hostFingerprint;
      const receiptKey = `${params.versionId}:${dependencyFingerprint ?? receiptRevision ?? ""}:${installKind ?? "unknown"}`;
      if (shouldWriteReceipt && !legacyPeerDepsVersionIds.has(receiptKey)) {
        legacyPeerDepsVersionIds.add(receiptKey);
        const { createEngineVersionErrorLogs } = await import(
          "@/lib/db/services/version-errors"
        );
        await createEngineVersionErrorLogs(
          [
            {
              chatId: params.chatId,
              versionId: params.versionId,
              level: usedFallback ? "warning" : "info",
              category: INSTALL_PEER_FALLBACK_RECEIPT_CATEGORY,
              message: usedFallback
                ? "Preview started after npm --legacy-peer-deps. That bypass is not a publish-ready install."
                : "Preview install completed with a strict npm install for this dependency tree.",
              meta: {
                kind: installKind,
                usedFallback,
                filesRevision: receiptRevision,
                dependencyFingerprint,
                bootFilesRevision: params.bootedFilesRevision?.trim() || null,
                source: "preview_install_peer_fallback",
              },
            },
            ...(usedFallback
              ? [
                  {
                    chatId: params.chatId,
                    versionId: params.versionId,
                    level: "warning" as const,
                    category: "preflight:quality-gate",
                    message:
                      "Preview started after npm --legacy-peer-deps. That bypass is not a publish-ready install.",
                    meta: {
                      passed: true,
                      advisory: true,
                      advisoryChecks: [INSTALL_PEER_FALLBACK_CHECK],
                      source: "preview_install_peer_fallback",
                    },
                  },
                ]
              : []),
          ],
          { lockTimeoutMs: 2_000 },
        );
      }
    }
  } catch (err) {
    console.warn("[preview-readiness] Failed to apply readiness outcome:", err);
  }
  return decision;
}

const persistedLockfileRevisions = new Map<string, string | null>();

export type RegeneratedLockfilePersistResult = {
  /** True only when THIS call CAS-wrote `files_json`. */
  wrote: boolean;
  /**
   * Current (or just-written) `files_revision`. Null on CAS miss / read
   * failure so the receipt stays on the boot revision.
   */
  filesRevision: string | null;
  /** File array used for the dependency fingerprint, when known. */
  files?: Array<{ path: string; content: string }>;
};

const EMPTY_LOCKFILE_PERSIST: RegeneratedLockfilePersistResult = {
  wrote: false,
  filesRevision: null,
};

/**
 * Versions for which a readiness-failure diagnostics row has already been
 * written on this instance. Prevents heartbeat/status polls from inserting a
 * duplicate build-error row on every failed poll (Bugbot HIGH) — the false
 * `preview_success` stamp is monotonic in the writer, but the error-log INSERT
 * has no such guard on its own.
 */
const failedPreviewVersionIds = new Set<string>();
const legacyPeerDepsVersionIds = new Set<string>();

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
): Promise<RegeneratedLockfilePersistResult> {
  if (!versionId) return EMPTY_LOCKFILE_PERSIST;
  if (persistedLockfileRevisions.has(versionId)) {
    return {
      wrote: false,
      filesRevision: persistedLockfileRevisions.get(versionId) ?? null,
    };
  }
  try {
    // Snapshot, not just the parsed files: the raw `files_json` string is the
    // compare-and-swap token for the write below. This is a read-modify-write
    // of the WHOLE file array, so without it a repair or user edit that lands
    // between the read and the write is overwritten wholesale.
    const { getVersionFilesSnapshot } = await import("@/lib/gen/version-manager");
    const snapshot = await getVersionFilesSnapshot(versionId);
    if (!snapshot) return EMPTY_LOCKFILE_PERSIST;
    const files = snapshot.files;
    const markerPath = LOCKFILE_STALE_MARKER_PATH;
    const lockfilePath = regeneratedLockfile.path.replace(/\\/g, "/");
    const hasMarker = files.some((f) => f.path.replace(/\\/g, "/") === markerPath);
    if (!hasMarker) {
      // Already reconciled (or never stale) — don't churn files_json.
      const filesRevision = snapshot.filesRevision?.trim() || null;
      persistedLockfileRevisions.set(versionId, filesRevision);
      return { wrote: false, filesRevision, files };
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
    const nextJson = JSON.stringify(next);
    const { updateVersionFiles } = await import("@/lib/db/chat-repository-pg");
    const wrote = await updateVersionFiles(versionId, nextJson, {
      preservePreviewUrl: true,
      expectedFilesJson: snapshot.filesJson,
    });
    // Deliberately NOT marking the guard on a CAS miss: the row moved under us,
    // so the reconcile has not happened and a later poll should retry against
    // the new base. Marking it here would drop the lockfile silently. Do not
    // return a new revision we did not write.
    if (!wrote) return EMPTY_LOCKFILE_PERSIST;
    const filesRevision = filesRevisionForPersistedJson(nextJson);
    persistedLockfileRevisions.set(versionId, filesRevision);
    return { wrote: true, filesRevision, files: next };
  } catch (err) {
    console.warn("[preview-readiness] Failed to persist regenerated lockfile:", err);
    return EMPTY_LOCKFILE_PERSIST;
  }
}

/**
 * Headless receipt for a freshly queued boot. Auth-eval chat `7723af5b`
 * left `preview_success` and `preview_blocking_reason` null because
 * `waitForReady` finished after finalize and no iframe polled
 * preview-status. Poll the host until ready/failed, then reuse
 * {@link applyPreviewReadinessOutcome}. No new drain.
 */
export async function pollAndApplyPreviewReadinessOutcome(params: {
  chatId: string;
  versionId: string;
  previewSessionId: string;
  bootedFilesRevision?: string | null;
  expectedLifecycleToken?: string | null;
  maxWaitMs?: number;
  intervalMs?: number;
}): Promise<PreviewReadinessDecision | null> {
  const maxWaitMs = params.maxWaitMs ?? 180_000;
  const intervalMs = params.intervalMs ?? 8_000;
  const startedAt = Date.now();
  const { fetchPreviewHostReadinessVerdict } = await import("./preview-host-client");

  while (Date.now() - startedAt <= maxWaitMs) {
    const verdict = await fetchPreviewHostReadinessVerdict(params.previewSessionId, {
      expectedVersionId: params.versionId,
      expectedLifecycleToken: params.expectedLifecycleToken ?? null,
    }).catch(() => null);
    if (verdict?.readinessState === "ready" || verdict?.readinessState === "failed") {
      return applyPreviewReadinessOutcome({
        chatId: params.chatId,
        versionId: params.versionId,
        bootedFilesRevision: params.bootedFilesRevision,
        resumed: verdict,
      });
    }
    const remaining = maxWaitMs - (Date.now() - startedAt);
    if (remaining <= 0) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(intervalMs, remaining)));
  }
  return null;
}

/** Test-only reset of the per-instance persist + failure-log guards. */
export function __resetPersistedLockfileGuardForTesting(): void {
  persistedLockfileRevisions.clear();
  failedPreviewVersionIds.clear();
  legacyPeerDepsVersionIds.clear();
}
