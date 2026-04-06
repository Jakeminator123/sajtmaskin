/**
 * Canonical re-exports for preview `.env.local` merge helpers.
 * Implementation remains under `@/lib/gen/sandbox/env-local` (legacy path segment).
 */
export {
  buildPreviewEnvLocalContents,
  formatDotenvBody,
  loadPlaceholderRecord,
  mergePreviewEnvRecords,
  buildSandboxEnvLocalContents,
  mergeSandboxEnvRecords,
} from "@/lib/gen/sandbox/env-local";
