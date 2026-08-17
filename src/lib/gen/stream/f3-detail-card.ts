/**
 * F3 detail-card evidence (SM-009).
 *
 * Early SSE `meta.fileEvidenceCapabilities` is computed on the BASE
 * version's files (orchestration) before finalize. A same-round delivery
 * then looks `planned` on the chat card even though snapshot + panel
 * already use post-merge files. Post-merge files do not exist at the
 * first `meta` event, so the writer omits that field until finalize and
 * then re-emits meta from {@link applyPostMergeF3DetailCardEvidence}.
 *
 * Status values are the existing five `overviewStatus` members from
 * `resolveDossierLifecycle` — no new status model.
 */
import {
  resolveFinalDossierFileEvidence,
  type FinalDossierFileEvidence,
} from "./finalize-version/dossier-file-evidence";

export type { FinalDossierFileEvidence };

/**
 * Strip base-version dossier evidence from the early `meta` SSE. The card
 * must not render `planned` from parent files when this round may still
 * deliver them.
 */
export function omitEarlyF3DetailCardEvidence<T extends Record<string, unknown>>(
  meta: T,
): Omit<T, "fileEvidenceCapabilities" | "fileEvidenceDossierIds"> {
  const {
    fileEvidenceCapabilities: _fileEvidenceCapabilities,
    fileEvidenceDossierIds: _fileEvidenceDossierIds,
    ...rest
  } = meta;
  return rest;
}

/** Overlay post-merge file evidence onto the stream meta after finalize. */
export function applyPostMergeF3DetailCardEvidence<T extends Record<string, unknown>>(
  meta: T,
  filesJson: string,
): T & FinalDossierFileEvidence {
  return {
    ...meta,
    ...resolveFinalDossierFileEvidence(filesJson),
  };
}
