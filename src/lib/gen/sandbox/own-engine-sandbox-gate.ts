import type { PreviewStartContract } from "@/lib/gen/stream/preflight-contract";

/**
 * Own-engine: whether tier-2 live-preview should start after finalize.
 * Compatibility preview is no longer a primary runtime path.
 */
export function shouldRunOwnEngineSandbox(params: {
  isSandboxConfigured: boolean;
  sandbox: PreviewStartContract;
  parsedFileCount: number;
}): boolean {
  return (
    params.isSandboxConfigured &&
    params.sandbox.canStartPreview &&
    params.parsedFileCount > 0
  );
}
