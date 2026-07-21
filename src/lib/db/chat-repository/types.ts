import {
  type EngineVersionReleaseState,
  type EngineVersionVerificationState,
} from "../engine-version-lifecycle";

export interface Chat {
  id: string;
  project_id: string;
  title: string | null;
  model: string;
  system_prompt: string | null;
  scaffold_id: string | null;
  orchestration_snapshot?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  chat_id: string;
  role: "system" | "user" | "assistant";
  content: string;
  ui_parts?: Record<string, unknown>[] | null;
  token_count: number | null;
  /**
   * Concatenated reasoning emitted during the stream that produced this
   * message. Persisted on assistant messages so the builder UI can
   * re-render the "thinking" panel after a refresh; null otherwise.
   */
  thinking?: string | null;
  created_at: string;
}

export interface Version {
  id: string;
  chat_id: string;
  message_id: string | null;
  version_number: number;
  files_json: string;
  repaired_files_json: string | null;
  preview_url: string | null;
  release_state: EngineVersionReleaseState;
  verification_state: EngineVersionVerificationState;
  verification_summary: string | null;
  repair_available_at: string | null;
  promoted_at: string | null;
  /** F2/F3 lifecycle stage; defaults to "design" for legacy rows. */
  lifecycle_stage: "design" | "integrations";
  /** F3 versions point at the F2 version they were forked from. */
  parent_version_id: string | null;
  /** Fast Edit Lane provenance ("quick_edit") or null for normal versions. */
  edit_kind: string | null;
  created_at: string;
}

export type VersionRepairStatus = {
  versionId: string;
  verificationState: EngineVersionVerificationState;
  hasPendingRepair: boolean;
  repairAvailableAt: string | null;
  wasAutoAccepted?: boolean;
};

export interface GenerationLog {
  id: string;
  chat_id: string;
  model: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  duration_ms: number | null;
  success: number;
  error_message: string | null;
  created_at: string;
}

export interface ChatWithMessages extends Chat {
  messages: Message[];
}
