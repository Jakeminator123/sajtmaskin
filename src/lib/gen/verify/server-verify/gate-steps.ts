/**
 * Steps both verification lanes (server-verify and the quality gate) share
 * while they hold the version lease: the deadline check, the gate run over one
 * files snapshot and the bounded promote retry.
 */
import { promoteVersion } from "@/lib/db/chat-repository-pg";
import { buildExportableProject, chatUsesVerbatimRepo } from "@/lib/gen/export/build-exportable-project";
import type { getVersionFilesSnapshot } from "@/lib/gen/version-manager";
import { maybeAnalyzeVisualQAForPassedExportable, qualityGateAllPassed, runQualityGateOnExportable } from "../preview-quality-gate";
import { isTypecheckOnlyAdvisory, resolvePostRepairGateChecks } from "../quality-gate-checks";

export type VersionFilesSnapshot = NonNullable<Awaited<ReturnType<typeof getVersionFilesSnapshot>>>;

export class VerificationDeadlineExceeded extends Error {}
export function checkVerificationDeadline(deadlineEpochMs: number | undefined): void {
  if (deadlineEpochMs !== undefined && Date.now() >= deadlineEpochMs) {
    throw new VerificationDeadlineExceeded("Verification time budget exhausted");
  }
}

/** M#vlane2 promote-retry tuning: 1 initial attempt + up to 2 retries, short backoff. */
const PROMOTE_MAX_ATTEMPTS = 3;
const PROMOTE_RETRY_BACKOFF_MS = 120;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Whether a thrown promote-UPDATE error is a transient DB condition worth
 * retrying: a `statement_timeout` under row-lock contention (the prod incident
 * 2026-07-13 profile — two verify leases 12 s apart on the same version row),
 * a serialization/deadlock, or a dropped connection. A non-transient error
 * (constraint violation, etc.) is NOT retried.
 */
function isTransientPromoteError(err: unknown): boolean {
  const code =
    err && typeof err === "object" && typeof (err as { code?: unknown }).code === "string"
      ? (err as { code: string }).code
      : null;
  // Postgres SQLSTATEs: 57014 statement_timeout/query_canceled,
  // 40001 serialization_failure, 40P01 deadlock_detected, 08* connection exceptions.
  if (
    code &&
    (code === "57014" || code === "40001" || code === "40P01" || code.startsWith("08"))
  ) {
    return true;
  }
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("statement timeout") ||
    msg.includes("statement_timeout") ||
    msg.includes("canceling statement") ||
    msg.includes("deadlock") ||
    msg.includes("could not serialize") ||
    msg.includes("connection terminated") ||
    msg.includes("connection reset") ||
    msg.includes("timeout")
  );
}

/**
 * M#vlane2 + BB#299: the promote-UPDATE occasionally died on a transient
 * `statement_timeout` (prod incident 2026-07-13), which left a passed gate
 * stuck at `verifying` and — ~13 min later — false-red by the readiness
 * watchdog. Retry the write a bounded number of times with a short backoff on
 * transient DB errors so a momentary lock/timeout no longer strands a clean
 * promotion. A lease-conditioned no-op (`null`) is NOT retried (another run
 * took over / guard refusal). A throw on the last attempt (or a non-transient
 * error) resolves to `null`, which the caller maps to the existing retryable
 * `promoteError` branch (never a false-red).
 */
export async function promoteVersionWithRetry(
  versionId: string,
  summary: string,
  runId: string | undefined,
  verifyDeadlineEpochMs?: number,
): Promise<Awaited<ReturnType<typeof promoteVersion>> | null> {
  for (let attempt = 1; attempt <= PROMOTE_MAX_ATTEMPTS; attempt++) {
    checkVerificationDeadline(verifyDeadlineEpochMs);
    try {
      return await promoteVersion(versionId, summary, runId);
    } catch (err) {
      const transient = isTransientPromoteError(err);
      if (!transient || attempt === PROMOTE_MAX_ATTEMPTS) {
        console.warn(
          `[quality-gate] Promote failed (attempt ${attempt}/${PROMOTE_MAX_ATTEMPTS}, transient=${transient}):`,
          err,
        );
        return null;
      }
      await sleep(PROMOTE_RETRY_BACKOFF_MS * attempt);
    }
  }
  return null;
}

export async function evaluateVersionGateSnapshot(params: {
  chatId: string; versionId: string; snapshot: VersionFilesSnapshot;
  forceBuildCheck?: boolean;
  verifyDeadlineEpochMs?: number;
  beforeVerify?: () => Promise<void>;
}) {
  checkVerificationDeadline(params.verifyDeadlineEpochMs);
  const previewPolicy = params.snapshot.lifecycleStage === "integrations" ? "fidelity3" : "fidelity2";
  const exportable = await buildExportableProject(params.snapshot.files, {
    verbatimRepo: await chatUsesVerbatimRepo(params.chatId),
  });
  await params.beforeVerify?.();
  checkVerificationDeadline(params.verifyDeadlineEpochMs);
  const gateResult = await runQualityGateOnExportable({
    chatId: params.chatId, versionId: params.versionId, exportable,
    checks: resolvePostRepairGateChecks(params.forceBuildCheck === true, previewPolicy),
    verifyDeadlineEpochMs: params.verifyDeadlineEpochMs,
  });
  checkVerificationDeadline(params.verifyDeadlineEpochMs);
  if (!gateResult) return null;
  const passed = qualityGateAllPassed(gateResult.results);
  const advisory = isTypecheckOnlyAdvisory({
    isDesignPreview: previewPolicy === "fidelity2", gatePassed: passed,
    buildOriginated: params.forceBuildCheck === true, results: gateResult.results,
  });
  const visualQA = maybeAnalyzeVisualQAForPassedExportable({ exportable, results: gateResult.results });
  return { exportable, gateResult, passed, advisory, visualQA };
}
