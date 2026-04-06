/**
 * Legacy compat path.
 * Canonical implementation now lives in `@/lib/gen/preview/session-store`.
 */
export type {
  Tier2Provider,
  SandboxSessionEntry,
  TouchSandboxSessionParams,
  GetSandboxSessionOptions,
} from "@/lib/gen/preview/session-store";

export {
  getActiveSandboxSession,
  bumpSandboxSessionActivity,
  clearSandboxSession,
  getActiveSandboxSessionAsync,
  touchSandboxSessionAsync,
  clearSandboxSessionAsync,
  resetSandboxSessionStoreForTests,
  SANDBOX_SESSION_IDLE_MS,
  SANDBOX_SESSION_HARD_CAP_MS,
} from "@/lib/gen/preview/session-store";
