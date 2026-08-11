"use client";

/**
 * Toolbar "Byggblock" popover: the primary user surface for selecting,
 * inspecting AND configuring dossiers. Data is lazily fetched from
 * `GET /api/engine/chats/[chatId]/dossiers` when the popover opens (and
 * re-fetched when the active version changes or after a save).
 *
 * Owner decision 2026-07-13 (supersedes the earlier catalog/status-only
 * contract): expanded hard-dossier rows carry masked env-key inputs in BOTH
 * F2 and F3, saving to the canonical project env-vars API. Saving a
 * feature-runtime key flips the dossier from "Byggd — demo aktiv" to
 * "Byggd — live" without a new LLM round. The chat stays silent about env
 * (F2-mute is about chat traffic, not voluntary configuration), and secrets
 * are write-only: the panel only ever reads boolean `hasRealValue` flags.
 * A finalize-design 412 focuses the affected dossier here (pure UI action —
 * the server's missingByIntegration stays the source of truth).
 *
 * Facade: hooks live in `usePreviewPanelDossiersController`; presentation in
 * `dossiers/DossiersPopoverView`. Public export surface is unchanged.
 */
import { usePreviewPanelDossiersController } from "./hooks/usePreviewPanelDossiersController";
import { DossiersPopoverView } from "./dossiers/DossiersPopoverView";
import type { PreviewPanelDossiersProps } from "./dossiers/dossiers-shared";

export type { PreviewPanelDossiersProps } from "./dossiers/dossiers-shared";

export function PreviewPanelDossiers({
  chatId,
  versionId,
  lifecycleStage,
  className,
  onRequestDossier,
  catalogPickDisabled = false,
  onCountsChange,
  activeVersionMeta,
}: PreviewPanelDossiersProps) {
  const vm = usePreviewPanelDossiersController({
    chatId,
    versionId,
    lifecycleStage,
    onRequestDossier,
    catalogPickDisabled,
    onCountsChange,
  });
  return <DossiersPopoverView {...vm} className={className} activeVersionMeta={activeVersionMeta} />;
}
