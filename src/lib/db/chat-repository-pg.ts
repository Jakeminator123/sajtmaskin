/**
 * Postgres-based engine chat repository (Drizzle).
 *
 * This is the canonical own-engine chat store.
 * The exported API remains stable for stream routes and builder flows.
 * `createDraftVersion` is also the canonical primitive for deterministic
 * exact-file F3 forks: callers set `stage: "integrations"` and bind the
 * selected F2 row through `parentVersionId`; ReleaseGate owns promotion.
 */

// Facade: the implementation lives in ./chat-repository/ (domain modules).
// This path re-exports the EXACT public surface the ~35 importers and the
// chat-repository-pg.*.test.ts suites depend on — do not add or remove symbols.

// Re-exported so HTTP routes / helpers can translate a lease-blocked
// `files_json` write into 409 `version_busy` without a second import site.
export { VersionLeaseHeldError } from "./version-lease-error";

export type {
  Chat,
  Message,
  Version,
  VersionRepairStatus,
  GenerationLog,
  ChatWithMessages,
} from "./chat-repository/types";

export {
  createChat,
  getChat,
  listChatsByProject,
  updateChatProjectId,
  updateChatScaffoldId,
} from "./chat-repository/chats";

export { addMessage, consumeF3ContinuationMarker } from "./chat-repository/messages";

export {
  getChatOrchestrationSnapshot,
  updateChatOrchestrationSnapshot,
  appendF3ApprovedToSnapshot,
  getKnownBrokenImageReplacements,
  recordKnownBrokenImageReplacements,
} from "./chat-repository/snapshot";

export {
  addAssistantMessageAndCreateDraftVersion,
  addAssistantMessageAndUpdateExistingVersion,
  createDraftVersion,
  createAndPromoteDraftVersion,
  getLatestVersion,
  getPreferredVersion,
  getVersionsByChat,
  getVersionById,
} from "./chat-repository/versions";

export { updateVersionFiles } from "./chat-repository/version-files";

export type { SaveRepairedFilesResult } from "./chat-repository/repair";
export {
  saveRepairedFiles,
  getRepairStatus,
  acceptRepair,
  maybeAutoAcceptTimedOutRepair,
} from "./chat-repository/repair";

export { updateVersionPreviewUrl } from "./chat-repository/preview-url";

export type { VersionJobKind } from "./chat-repository/leases";
export {
  VERSION_LEASE_TTL_SECONDS,
  acquireVersionLease,
  renewVersionLease,
  releaseVersionLease,
  leaseTableExists,
  hasActiveVersionLease,
} from "./chat-repository/leases";

export {
  markVersionVerifying,
  resetVersionVerificationToPending,
  markVersionRepairing,
  promoteVersion,
  failVersionVerification,
  failVersionVerificationIfUnleased,
  promoteVersionIfUnleased,
  markVersionSupersededByRepair,
} from "./chat-repository/version-lifecycle";

export { logGeneration } from "./chat-repository/generation-logs";
