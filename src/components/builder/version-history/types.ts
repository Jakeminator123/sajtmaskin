import type { VersionStatus } from "@/lib/logging/event-bus-types";

export type VersionSummary = {
  id?: string | null;
  versionId?: string | null;
  previewUrl?: string | null;
  demoUrl?: string | null;
  createdAt?: string | Date | null;
  versionNumber?: number | null;
  releaseState?: string | null;
  verificationState?: string | null;
  verificationSummary?: string | null;
  hasPendingRepair?: boolean;
  repairAvailableAt?: string | Date | null;
  promotedAt?: string | Date | null;
  pinned?: boolean;
  canPin?: boolean;
  /**
   * Fast Edit Lane provenance. `"quick_edit"` rows are deterministic, exact
   * edits and are rendered as a minor version (v3.1, v3.2) grouped under their
   * `parentVersionId`. Null/undefined = a normal full version.
   */
  editKind?: string | null;
  /** Engine version id this row was forked from (major for quick_edit rows). */
  parentVersionId?: string | null;
  /**
   * Lifecycle stage from `engine_versions.lifecycle_stage`. Threaded so
   * tooltip/label can tell F2 design rows ("Klar — server-verify körs
   * först vid Bygg integrationer") apart from F3 integrations rows
   * ("Verifierar"). When missing, defaults to "design" via
   * `resolveEngineVersionLifecycleStage`.
   */
  lifecycleStage?: string | null;
  /**
   * OMTAG-06 / område 6-2: server-projected canonical event-bus status
   * (`selectVersionStatus(readAll(versionId))`, enriched by the /versions
   * route) for this row. Drives the lifecycle badge via
   * `mapVersionStatusToDisplay`. Absent/null for rows with no bus events
   * (folds to an "idle" display).
   */
  busStatus?: VersionStatus | null;
};

export type BlobExportResponse = {
  blob?: {
    url?: string;
  };
  error?: string;
};

export type PinVersionResponse = {
  error?: string;
};

export type RestoreVersionResponse = {
  success?: boolean;
  versionId?: string | null;
  demoUrl?: string | null;
  error?: string;
};

export type AcceptRepairResponse = {
  success?: boolean;
  versionId?: string | null;
  previewUrl?: string | null;
  error?: string;
};

export interface VersionHistoryProps {
  chatId: string | null;
  selectedVersionId: string | null;
  activePreviewSessionId?: string | null;
  onVersionSelect: (versionId: string, demoUrl?: string) => void;
  /**
   * Fas 4: efter en lyckad restore/rollback ber vi controllern tvinga en
   * forced re-push av preview-sessionen mot den nyskapade (återställda)
   * versionen, så preview:n konvergerar utan manuell reload. Samma
   * forced-restart-primitiv som `missing`/`stopped`/env-restart använder.
   */
  onPreviewResync?: (versionId: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  /** Pre-fetched versions from parent to avoid duplicate polling */
  versions?: VersionSummary[];
  /** Mutate function from parent's useVersions instance */
  mutateVersions?: () => void | Promise<unknown>;
  /**
   * F2 vs F3 lifecycle gate. Forwarded to dialogs (e.g.
   * VersionDiagnosticsDialog) that conditionally render env-panel actions.
   */
  lifecycleStage?: import("@/lib/db/engine-version-lifecycle").EngineVersionLifecycleStage | null;
  /**
   * When true, row click / restore / accept-repair are no-ops. The panel
   * still opens for viewing, and Compare stays enabled.
   */
  selectDisabled?: boolean;
}
