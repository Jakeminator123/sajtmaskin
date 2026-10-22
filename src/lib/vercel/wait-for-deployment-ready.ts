/**
 * Wait until Vercel reports a terminal state for one deployment.
 *
 * `createVercelDeployment` resolving means Vercel ACCEPTED the files, not that
 * the build succeeded. Anything that must only describe a working site (the
 * GitHub code backup of "what is live") waits for READY here first. The wait is
 * bounded: callers run inside `after()` and share the function's max duration,
 * so a slow build yields `timeout` and the caller skips rather than guesses.
 */
import { getVercelDeployment, mapVercelReadyStateToStatus } from "./vercel-deploy";

export type DeploymentReadyOutcome = "ready" | "error" | "cancelled" | "timeout";

export interface WaitForReadyOptions {
  /**
   * Total budget; default 120 s. It runs on top of the time the deploy route
   * already used, so it stays well under the function's max duration; a site
   * that builds slower is simply backed up on its next publish.
   */
  timeoutMs?: number;
  /** Poll interval; default 10 s. */
  intervalMs?: number;
  /** Test seams. */
  getDeployment?: (id: string) => Promise<{ readyState: string | null }>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export async function waitForVercelDeploymentReady(
  vercelDeploymentId: string,
  options: WaitForReadyOptions = {},
): Promise<DeploymentReadyOutcome> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const intervalMs = options.intervalMs ?? 10_000;
  const getDeployment = options.getDeployment ?? getVercelDeployment;
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const deadline = now() + timeoutMs;

  for (;;) {
    try {
      const { readyState } = await getDeployment(vercelDeploymentId);
      const { status } = mapVercelReadyStateToStatus(readyState);
      if (status === "ready" || status === "error" || status === "cancelled") return status;
    } catch {
      // A transient API error is not a verdict on the deployment; keep polling
      // until the deadline instead of treating it as failure.
    }
    if (now() + intervalMs > deadline) return "timeout";
    await sleep(intervalMs);
  }
}
