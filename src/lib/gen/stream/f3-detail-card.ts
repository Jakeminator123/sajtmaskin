/**
 * F3 detail-card evidence (SM-009).
 *
 * Early SSE `meta.fileEvidenceCapabilities` is computed on the BASE
 * version's files (orchestration) before finalize — true about the parent,
 * but silent about what THIS round delivers. Finalize therefore re-emits
 * meta through {@link applyPostMergeF3DetailCardEvidence} so a same-round
 * delivery never reads as `planned` after landing. The early meta keeps the
 * base evidence as-is: stripping it made the card wrong for
 * already-delivered integrations, and permanently wrong on error/abort
 * (Bugbot on #1023).
 *
 * Status values are the existing five `overviewStatus` members from
 * `resolveDossierLifecycle` — no new status model.
 */
import {
  resolveFinalDossierFileEvidence,
  type FinalDossierFileEvidence,
} from "./finalize-version/dossier-file-evidence";

export type { FinalDossierFileEvidence };

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
