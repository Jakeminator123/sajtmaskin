import type { SandboxStartContract } from "./preview";

/**
 * Own-engine: whether tier-2 sandbox ska startas efter finalize (SSE `done` / sandbox-block).
 * Sandbox (fidelity 2) är enda previewvägen; tier-1 shim är borttagen.
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
