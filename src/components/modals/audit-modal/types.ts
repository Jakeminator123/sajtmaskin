import type { AuditResult } from "@/types/audit";

export interface AuditModalProps {
  result: AuditResult | null;
  auditedUrl?: string | null;
  isOpen: boolean;
  onClose: () => void;
  onBuildFromAudit?: (prompt: string) => void;
  /**
   * True when the audit is opened from an already-persisted source (e.g. the
   * /audits list). Starts the modal in the "Sparad" state so re-opening a saved
   * audit does not expose an active "Spara" action that POSTs a duplicate row.
   */
  alreadySaved?: boolean;
}

export type TabId = "overview" | "improvements" | "technical" | "business";

export interface Tab {
  id: TabId;
  label: string;
  icon: string;
}
