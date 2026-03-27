/**
 * Own-engine: whether tier-2 sandbox ska startas efter finalize (SSE `done` / sandbox-block).
 * Speglar `isSandboxConfigured() && !previewBlocked && files` — används från
 * `generation-stream.ts`; logiken ska inte dupliceras där.
 */
export function shouldRunOwnEngineSandbox(params: {
  isSandboxConfigured: boolean;
  previewBlocked: boolean;
  parsedFileCount: number;
}): boolean {
  return (
    params.isSandboxConfigured && !params.previewBlocked && params.parsedFileCount > 0
  );
}
