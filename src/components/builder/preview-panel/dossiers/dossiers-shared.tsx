"use client";

import { Badge } from "@/components/ui/badge";
import { describeF3Requirement } from "@/lib/builder/dossier-axes";
import type {
  DossierOverviewEntry,
  DossierOverviewResponse,
  DossierStatusDescriptor,
} from "@/lib/builder/dossier-overview";

export interface PreviewPanelDossiersProps {
  chatId: string;
  versionId: string | null;
  lifecycleStage?: "design" | "integrations" | null;
  className?: string;
  /**
   * Called when the user picks a dossier from the "Bläddra katalog"-tab.
   * Threaded from `BuilderShellContent` down to `vm.sendMessage` so picking
   * a catalog row sends the deterministic `buildAddDossierMessage`-format
   * (`Lägg till byggblocket "<label>" (id: <id>)`) through the existing
   * chat flow instead of a separate mutation path. When absent (e.g. this
   * component rendered without the callback wired up), catalog rows are
   * shown but not selectable.
   */
  onRequestDossier?: (payload: { id: string; label: string }) => void;
  /**
   * True while a catalog pick must wait: a generation is streaming (sending
   * would abort it) or an unanswered pending question exists. Rows are
   * disabled with a short hint while true.
   */
  catalogPickDisabled?: boolean;
  /**
   * Lucka 3 (ägarbeslut 2026-08-11): reports the wired-list counts on every
   * fetch so `builder-shell-content/` can weave `builtLive`/`builtDemo` into
   * the F3-statusradens framgångstitel — without a second fetch of the same
   * route from `PreviewPanelF3Trigger`.
   */
  onCountsChange?: (counts: DossierOverviewResponse["counts"] | null) => void;
  /**
   * Lucka 2 (ägarbeslut 2026-08-11): vilken version popoverns huvudrad
   * beskriver, buren av den befintliga versionslistan (`versionNumber` +
   * `createdAt`) — ingen ny signal.
   */
  activeVersionMeta?: { versionNumber?: number | null; createdAt?: string | Date | null } | null;
}

/**
 * "Version 4 · byggd 14:32" i popoverns huvudrad — ersätter raden
 * `Version: N kopplade · M fristående`, som bara dubblerade fliken
 * `Inkopplade (N)` och katalogfiltren utan att säga VILKEN version statusen
 * gäller (lucka 2, ägarbeslut 2026-08-11).
 */
export function describeActiveVersionLabel(
  meta: { versionNumber?: number | null; createdAt?: string | Date | null } | null | undefined,
): string | null {
  const versionLabel =
    typeof meta?.versionNumber === "number" ? `Version ${meta.versionNumber}` : null;
  let timeLabel: string | null = null;
  if (meta?.createdAt) {
    const date = meta.createdAt instanceof Date ? meta.createdAt : new Date(meta.createdAt);
    if (!Number.isNaN(date.getTime())) {
      timeLabel = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
  }
  if (versionLabel && timeLabel) return `${versionLabel} · byggd ${timeLabel}`;
  if (versionLabel) return versionLabel;
  if (timeLabel) return `Byggd ${timeLabel}`;
  return null;
}

export type PanelTab = "wired" | "catalog";

export const TONE_BADGE_CLASS: Record<DossierStatusDescriptor["tone"], string> = {
  neutral: "border-sky-500/40 bg-sky-500/10 text-sky-200",
  success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  warning: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  muted: "border-gray-600/50 bg-gray-500/10 text-gray-300",
};

export const ENFORCEMENT_LABEL: Record<
  DossierOverviewEntry["envVars"][number]["enforcement"],
  string
> = {
  build: "krävs",
  "feature-runtime": "vid användning",
  "warn-only": "valfri",
};

/**
 * Presentation-only heading tooltip. The group buckets rows for reading; it
 * never influences which dossier the pipeline picks (that is the capability).
 */
export const GROUP_HEADING_TITLE =
  "Bara en rubrik för läsbarhet — gruppen påverkar aldrig vilket byggblock som väljs. Det gör funktionen (capability) som briefen ber om.";

/** Amber "Kräver F3" badge — the axis hard/soft does NOT answer. */
export function RequiresF3Badge() {
  const descriptor = describeF3Requirement(true);
  return (
    <Badge
      variant="outline"
      className="shrink-0 border-violet-500/40 bg-violet-500/10 text-[9px] text-violet-200"
      title={descriptor.hint}
    >
      {descriptor.label}
    </Badge>
  );
}
