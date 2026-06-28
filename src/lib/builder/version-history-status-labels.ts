/**
 * OMTAG-06 / område 6-2 — Swedish badge presentation for the version
 * history lifecycle badge, derived from the canonical event-bus display
 * token (`VersionDisplayStatus` produced by `mapVersionStatusToDisplay`).
 *
 * This is the presentation layer that replaces the inline legacy-token →
 * label/variant/tooltip mapping `VersionHistory.tsx` previously built on
 * top of the now-removed `resolveEngineVersionDisplayStatus`. Keeping it here (pure +
 * unit-tested) means the component only wires data → markup and the
 * label/variant contract has one source of truth.
 *
 * False-green guard (område 7 invariant): a `degraded` token must NEVER
 * render with a solid-success look (`default`/"Publicerad" or a green
 * fill). It surfaces as an amber warning badge so "green but missing X"
 * is visible instead of pretending the run was clean.
 *
 * Legacy ↔ bus differences (documented intentionally — see PR):
 *   - `generating` and `blocked` are NEW lifecycle-badge states the bus
 *     surfaces that the legacy DB resolver folded into "Draft".
 *   - A superseded terminal `failed` version shows "Fel" (not the legacy
 *     "Ersatt"); `mapVersionStatusToDisplay` keeps terminal phases as-is.
 *   - "Fix redo" (repair-available) is no longer a lifecycle-badge state;
 *     it is surfaced by the dedicated verification badge
 *     (`resolveEngineVersionVerificationSurfaceStatus`) + the
 *     "Acceptera fix" action, which `VersionHistory` keeps unchanged.
 */

import type {
  VersionDisplayStatus,
  VersionStatusDisplay,
} from "./version-status-display";

/** Subset of shadcn `Badge` variants this surface uses. */
export type VersionHistoryBadgeVariant = "default" | "secondary" | "destructive" | "outline";

export interface VersionHistoryStatusBadge {
  /** Swedish badge label. */
  label: string;
  /** shadcn `Badge` `variant`. */
  variant: VersionHistoryBadgeVariant;
  /** Optional extra Tailwind classes for accent colors (amber/orange). */
  className?: string;
  /** Hover tooltip explaining what the state means. */
  tooltip: string;
  /** Render an animated spinner icon (active background work). */
  spinner: boolean;
  /** Render the "superseded" rotate icon. */
  retryIcon: boolean;
}

const AMBER = "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300";
const ORANGE = "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300";

const BADGES: Record<VersionDisplayStatus, VersionHistoryStatusBadge> = {
  promoted: {
    label: "Publicerad",
    variant: "default",
    tooltip: "Publicerad live. Klart att deploya.",
    spinner: false,
    retryIcon: false,
  },
  ready: {
    label: "Klar",
    variant: "secondary",
    tooltip: "Klar — generering färdig utan blockerande fel.",
    spinner: false,
    retryIcon: false,
  },
  degraded: {
    label: "Degraderad",
    variant: "outline",
    className: AMBER,
    tooltip:
      "Klar men med luckor: verifier/produkt-postcheck hoppades över eller hittade blockerande produktfel. Öppna diagnostik för detaljer.",
    spinner: false,
    retryIcon: false,
  },
  verifying: {
    label: "Verifierar",
    variant: "secondary",
    tooltip:
      "Server-verify kör i bakgrunden — typecheck/build. Kan landa i 'Publicerad' eller 'Fel' när den är klar.",
    spinner: true,
    retryIcon: false,
  },
  generating: {
    label: "Genererar",
    variant: "secondary",
    tooltip: "Sidan genereras — own-engine streamar kod och innehåll.",
    spinner: true,
    retryIcon: false,
  },
  autofixing: {
    label: "Autofixar",
    variant: "secondary",
    tooltip: "Mekanisk autofix kör deterministiska fixers innan syntaxvalidering.",
    spinner: true,
    retryIcon: false,
  },
  validating: {
    label: "Validerar",
    variant: "secondary",
    tooltip: "Syntax och typecheck valideras innan versionen sparas.",
    spinner: true,
    retryIcon: false,
  },
  preflighting: {
    label: "Sparar",
    variant: "secondary",
    tooltip: "Finaliserar filer, kör preflight och sparar versionen.",
    spinner: true,
    retryIcon: false,
  },
  repairing: {
    label: "Reparerar",
    variant: "outline",
    className: ORANGE,
    tooltip:
      "Server försöker reparera fel automatiskt. Utfallet rapporteras som 'Klar' eller 'Fel'.",
    spinner: true,
    retryIcon: false,
  },
  retrying: {
    label: "Ersatt",
    variant: "outline",
    className: AMBER,
    tooltip: "Ersatt av en nyare version innan denna hann verifieras klart.",
    spinner: false,
    retryIcon: true,
  },
  blocked: {
    label: "Blockerad",
    variant: "outline",
    className: ORANGE,
    tooltip:
      "Förhandsvisning eller verifiering blockerad av öppna problem. Öppna diagnostik-dialogen för detaljer.",
    spinner: false,
    retryIcon: false,
  },
  failed: {
    label: "Fel",
    variant: "destructive",
    tooltip: "Verifiering hittade blockerande fel. Öppna diagnostik-dialogen för detaljer.",
    spinner: false,
    retryIcon: false,
  },
  idle: {
    label: "Draft",
    variant: "secondary",
    tooltip: "Draft. Inte verifierad eller publicerad än.",
    spinner: false,
    retryIcon: false,
  },
};

/**
 * Presentation-only localization for legacy DB verification summaries. The DB
 * intentionally stores terse English machine strings, but builder surfaces are
 * Swedish. Unknown diagnostic details are preserved verbatim so operators do
 * not lose error context.
 */
export function localizeVerificationSummary(
  verificationSummary: string | null | undefined,
): string | null {
  const summary =
    typeof verificationSummary === "string" && verificationSummary.trim()
      ? verificationSummary.trim()
      : null;
  if (!summary) return null;

  const exact: Record<string, string> = {
    "Automatic verification in progress.": "Automatisk verifiering pågår.",
    "Automatic verification passed.": "Automatisk verifiering godkänd.",
    "Automatic verification failed.": "Automatisk verifiering misslyckades.",
    "Automatic verification could not run because no checks executed.":
      "Automatisk verifiering kunde inte köras eftersom inga kontroller kördes.",
    "Automatic verification could not run (verify lane unavailable). Retry shortly.":
      "Automatisk verifiering kunde inte köras eftersom verify-lane inte var tillgänglig. Försök igen strax.",
    "Server-side repair in progress.": "Serverreparation pågår.",
    "Server repair completed. Waiting for acceptance.":
      "Serverreparation klar. Väntar på godkännande.",
    "Server repair accepted.": "Serverreparation accepterad.",
    "Pending repair could not be verified against the current files; please re-run repair.":
      "Väntande reparation kunde inte verifieras mot de aktuella filerna. Kör reparationen igen.",
    "Superseded by repaired version.": "Ersatt av reparerad version.",
    "Verifier skipped under heavy load.": "Verifier hoppades över på grund av hög belastning.",
  };
  if (exact[summary]) return exact[summary];

  const automaticFailedPrefix = "Automatic verification failed:";
  if (summary.startsWith(automaticFailedPrefix)) {
    return `Automatisk verifiering misslyckades:${summary.slice(automaticFailedPrefix.length)}`;
  }

  const supersededPrefix = "Superseded by repaired version ";
  if (summary.startsWith(supersededPrefix)) {
    return `Ersatt av reparerad version ${summary.slice(supersededPrefix.length)}`;
  }

  return summary;
}

/**
 * Map a `VersionStatusDisplay` (from `mapVersionStatusToDisplay`) to the
 * version-history lifecycle badge. The mapping keys off `display.status`
 * only; the separate `display.degraded` flag is surfaced via the summary
 * helper below and the diagnostics dialog.
 */
export function versionHistoryStatusBadge(
  display: VersionStatusDisplay,
): VersionHistoryStatusBadge {
  return BADGES[display.status] ?? BADGES.idle;
}

/**
 * Fallback summary line shown under the badge. Prefers the DB
 * `verificationSummary` when present, otherwise synthesizes copy for the
 * states where an explanation is most useful (superseded / degraded).
 * Returns `null` when there is nothing worth showing.
 */
export function resolveVersionHistorySummary(
  display: VersionStatusDisplay,
  verificationSummary: string | null | undefined,
): string | null {
  const summary = localizeVerificationSummary(verificationSummary);

  if (display.status === "retrying") {
    return summary || "Ersatt av en nyare version innan denna hann bli klar.";
  }
  if (display.status === "degraded") {
    return (
      summary ||
      localizeVerificationSummary(display.degradations[0]?.message) ||
      "Klar men verifier/produkt-postcheck hoppades över eller hittade blockerande fel."
    );
  }
  return summary;
}

/**
 * False-green guard (B09 / område 6+7): the emerald "Verifierad" verification
 * badge — driven by DB release/verification state via
 * `resolveEngineVersionVerificationSurfaceStatus` — must NOT render when the
 * canonical bus lifecycle is degraded. Otherwise a promoted+passed row whose
 * bus carries `degradations[]` (e.g. `product_postcheck_skipped`) would show a
 * clean emerald "Verifierad" right next to the amber "Degraderad" lifecycle
 * badge — exactly the split false-green Område 7 forbids. When degraded, the
 * lifecycle badge speaks and the verification badge stays suppressed.
 */
export function shouldShowVerifiedBadge(
  verificationSurfaceStatus: string | null | undefined,
  lifecycleDegraded: boolean,
): boolean {
  return verificationSurfaceStatus === "verified" && !lifecycleDegraded;
}
