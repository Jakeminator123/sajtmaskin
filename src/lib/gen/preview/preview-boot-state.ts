import type { PreviewHostReadinessVerdict } from "./preview-host-client";

/** Host statuses that never describe a boot in progress. */
const NOT_BOOTING_HOST_STATUSES = new Set(["error", "hibernated", "destroyed"]);

/**
 * Does a version- and lifecycle-bound host readiness verdict describe a boot
 * that is still IN PROGRESS for the pinned session?
 *
 * `fetchPreviewHostStatus` answers "can this resume as running?" and returns
 * null until the runtime is up. Under SM-080 a fresh boot spends 30–90 s on
 * guest machine create, install and first compile; reading that window as a
 * dead session made concurrent callers destroy it and start a new machine
 * (2026-11-11, chat ff62820f). The caller binds the verdict to the expected
 * version and lifecycle token; this only reads the boot state.
 *
 * Fail-safe: an older host that omits both `status` and `readinessState`, a
 * failed readiness, an `error` boot loop and a hibernated session all return
 * false, so the caller keeps its destroy + re-pin path for them. A
 * `warm_project` session whose process died is rebooted by the host's own
 * `/status` read (it queues a boot for a non-running, non-booting session),
 * so it counts as booting too.
 */
export function isBootingPinnedSession(
  verdict: Pick<PreviewHostReadinessVerdict, "running" | "readinessState" | "hostStatus">,
): boolean {
  if (verdict.running) return false;
  if (verdict.readinessState === "failed") return false;
  const hostStatus = verdict.hostStatus ?? null;
  if (hostStatus && NOT_BOOTING_HOST_STATUSES.has(hostStatus)) return false;
  return (
    verdict.readinessState === "starting" ||
    hostStatus === "starting" ||
    hostStatus === "warm_project"
  );
}
