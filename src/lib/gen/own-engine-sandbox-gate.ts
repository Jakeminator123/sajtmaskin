import type { SandboxStartContract } from "./preview";

/**
 * Own-engine: whether tier-2 sandbox ska startas efter finalize (SSE `done` / sandbox-block).
 * Sandbox är nu primär previewväg; compatibility-shim får inte blockera tier 2.
 */
export function shouldRunOwnEngineSandbox(params: {
  isSandboxConfigured: boolean;
  sandbox: SandboxStartContract;
  parsedFileCount: number;
}): boolean {
  return (
    params.isSandboxConfigured &&
    params.sandbox.canStartSandbox &&
    params.parsedFileCount > 0
  );
}
