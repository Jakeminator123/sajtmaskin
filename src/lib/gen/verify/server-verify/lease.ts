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

export type VerifyLeaseDeniedReason = "lease_busy" | "lease_unavailable";

export type VerifyLeaseOutcome =
  | { proceed: true; runId: string }
  | { proceed: false; reason: VerifyLeaseDeniedReason };

/**
 * Acquire the distributed per-version lease (Plan C / P1). The local `inflight`
 * Set is only an intra-process short-circuit — never a substitute for a proven
 * `runId`. `proceed: true` is unrepresentable without one.
 *
 *  - lease granted        -> { proceed: true, runId }
 *  - another live lease   -> { proceed: false, reason: "lease_busy" }
 *  - DB error / no table  -> { proceed: false, reason: "lease_unavailable" }
 *
 * A thrown acquire (missing `engine_version_jobs`, transient outage) must not
 * proceed with only the process-local Set: two pods would then both mutate the
 * same version, and `runId === undefined` drops the lease EXISTS so downstream
 * writes degrade to `WHERE id = versionId`. `isServerVerifyEligible` already
 * requires `dbConfigured`, so a DB-less local/test environment never reaches
 * this path. Callers no-op on `proceed: false` — they do not throw.
 */
export async function acquireVerifyLease(
  versionId: string,
  kind: VersionJobKind,
): Promise<VerifyLeaseOutcome> {
  try {
    const lease = await acquireVersionLease(versionId, kind);
    if (!lease) return { proceed: false, reason: "lease_busy" };
    return { proceed: true, runId: lease.runId };
  } catch (err) {
    warnLog(
      "engine",
      "[server-verify] version lease acquire failed; skipping job (fail-closed)",
      { versionId, kind, error: err instanceof Error ? err.message : String(err) },
    );
    return { proceed: false, reason: "lease_unavailable" };
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
