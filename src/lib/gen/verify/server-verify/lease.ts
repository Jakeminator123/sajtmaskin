import { dbConfigured } from "@/lib/db/client";
import {
  getLatestVersion,
  getPreferredVersion,
  acquireVersionLease,
  releaseVersionLease,
  type VersionJobKind,
} from "@/lib/db/chat-repository-pg";
import { warnLog } from "@/lib/utils/debug";
import { isQualityGateConfigured } from "../preview-quality-gate";

export const inflight = new Set<string>();

export function isServerVerifyEligible(versionId: string): boolean {
  if (!dbConfigured) return false;
  if (!isQualityGateConfigured()) return false;
  if (inflight.has(versionId)) return false;
  return true;
}

type LeaseOutcome = { proceed: true; runId?: string } | { proceed: false };

/**
 * Acquire the distributed per-version lease (Plan C / P1). The local `inflight`
 * Set is the cheap pre-DB short-circuit; this is the cross-instance truth.
 *
 *  - lease granted        -> { proceed: true, runId }
 *  - another live lease   -> { proceed: false } (another instance owns it; bail)
 *  - DB error / no table  -> { proceed: false } — fail closed. A thrown acquire
 *    (missing `engine_version_jobs`, transient outage) must not proceed with
 *    only the process-local Set: two pods would then both mutate the same
 *    version, and `runId === undefined` drops the lease EXISTS check so
 *    downstream writes degrade to an unscoped `WHERE id = versionId`.
 *    `isServerVerifyEligible` already requires `dbConfigured`, so a DB-less
 *    local/test environment never reaches this path. Callers
 *    (`triggerServerVerification`, `triggerBuildErrorRepair`) no-op on
 *    `proceed: false` — they do not throw.
 */
export async function acquireVerifyLease(
  versionId: string,
  kind: VersionJobKind,
): Promise<LeaseOutcome> {
  try {
    const lease = await acquireVersionLease(versionId, kind);
    if (!lease) return { proceed: false };
    return { proceed: true, runId: lease.runId };
  } catch (err) {
    warnLog(
      "engine",
      "[server-verify] version lease acquire failed; skipping job (fail-closed)",
      { versionId, kind, error: err instanceof Error ? err.message : String(err) },
    );
    return { proceed: false };
  }
}

export async function releaseVerifyLease(
  versionId: string,
  runId: string | undefined,
): Promise<void> {
  if (!runId) return;
  await releaseVersionLease(versionId, runId).catch(() => {});
}

export async function isLatestVersionForChat(
  chatId: string,
  versionId: string,
): Promise<boolean> {
  const preferred =
    (await getPreferredVersion(chatId).catch(() => null)) ??
    (await getLatestVersion(chatId).catch(() => null));
  return !preferred || preferred.id === versionId;
}
