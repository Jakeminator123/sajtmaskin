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
 * render with a solid-success look (`default`/"Godkänd" or a green
 * fill). It surfaces as an amber warning badge so "green but missing X"
 * is visible instead of pretending the run was clean.
 *
 * Plain Swedish on the card (V-11, rig test 2026-11-11): the card showed
 * "Degraderad", "Ej verifierad", "F2 Product Postcheck skipped
 * (product_postcheck_skipped:…" and a raw preview URL. Labels, tooltips and
 * the summary line now say what it means for the user; reason codes, raw
 * summaries, VM state and the URL live in {@link versionHistoryTechnicalDetails}
 * behind "Tekniska detaljer". Presentation only — no status logic here.
 *
 * Legacy ↔ bus differences (documented intentionally — see PR):
 *   - `generating` and `blocked` are NEW lifecycle-badge states the bus
 *     surfaces that the legacy DB resolver folded into "Draft".
 *   - Superseded versions (2026-07): the DB writes terminal-neutral
 *     `verification_state = "superseded"` (never `failed`), so an abandoned
 *     mid-verify version renders amber "Ersatt" — via the derived `retrying`
 *     token (non-latest + non-terminal bus) and the "Ersatt" verification
 *     badge — never the red "Fel". Rows superseded before 2026-07 keep their
 *     historical `failed`.
 *   - "Fix redo" (repair-available) is no longer a lifecycle-badge state;
 *     it is surfaced by the dedicated verification badge
 *     (`resolveEngineVersionVerificationSurfaceStatus`) + the
 *     "Acceptera fix" action, which `VersionHistory` keeps unchanged.
 */

import {
  formatRepairPassProgress,
  type VersionDisplayStatus,
  type VersionStatusDisplay,
} from "./version-status-display";
import { productPostcheckSkipReasonFromMessage } from "@/lib/gen/verify/product-postcheck-skip";
import { PRODUCT_POSTCHECK_ADVISORY_META_KEY } from "@/lib/db/services/reported-quality-gate";

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

const PRODUCT_POSTCHECK_SKIP_REASON_SV: Record<string, string> = {
  preview_not_running: "förhandsvisningen var inte igång för den här versionen",
  preview_not_ready: "förhandsvisningen var inte redo för den här versionen",
  capture_failed: "skärmbilderna kunde inte tas",
  missing_preview_url: "förhandsvisningens adress saknades",
  url_not_allowed: "förhandsvisningens adress var inte tillåten",
  navigation_failed: "förhandsvisningen gick inte att öppna",
  playwright_unavailable: "kontrollens webbläsare saknades",
  timeout: "kontrollen tog för lång tid",
  browser_crashed: "kontrollens webbläsare stängdes innan sidan hann läsas",
  runtime_error: "kontrollen kraschade",
  log_read_error: "kontrollens logg gick inte att läsa",
  feature_disabled: "produktkontrollen är avstängd",
};

export function productPostcheckSkipReasonFromDegradations(
  degradations: VersionStatusDisplay["degradations"],
): string | null {
  for (const item of degradations) {
    if (item.kind !== "product_postcheck_skipped") continue;
    // Infrastruktur-skips har en egen, icke-anklagande yta längre ner.
    if (item.meta?.[PRODUCT_POSTCHECK_ADVISORY_META_KEY] === true) continue;
    const metaReason =
      item.meta && typeof item.meta.skippedReason === "string"
        ? item.meta.skippedReason.trim()
        : "";
    if (metaReason) return metaReason;
    const fromMessage = productPostcheckSkipReasonFromMessage(item.message);
    if (fromMessage) return fromMessage;
  }
  return null;
}

/** User text for a product-postcheck skip. The machine reason stays in the technical details. */
export function formatProductPostcheckSkipTooltip(reason: string): string {
  const detail = PRODUCT_POSTCHECK_SKIP_REASON_SV[reason];
  return detail
    ? `Produktkontrollen hoppades över: ${detail}.`
    : "Produktkontrollen hoppades över.";
}

/**
 * Texten för en skip som berodde på kontrollkedjan. Den säger uttryckligen att
 * utfallet inte handlar om sajten — annars läser användaren "kontrollen dog"
 * som "min sajt är trasig", vilket är exakt felet `SM-072` orsakade i prod.
 */
export function formatProductPostcheckAdvisoryTooltip(reason: string): string {
  const detail = PRODUCT_POSTCHECK_SKIP_REASON_SV[reason];
  return `Produktkontrollen kunde inte köras${detail ? ` (${detail})` : ""}. Det är ett fel i kontrollen, inte i sajten; inga produktfel hittades.`;
}

/** Första advisory-orsaken bland noteringarna, om någon. */
export function productPostcheckAdvisoryReasonFromDegradations(
  degradations: VersionStatusDisplay["degradations"],
): string | null {
  for (const item of degradations) {
    if (item.kind !== "product_postcheck_skipped") continue;
    if (item.meta?.[PRODUCT_POSTCHECK_ADVISORY_META_KEY] !== true) continue;
    const metaReason =
      typeof item.meta?.skippedReason === "string" ? item.meta.skippedReason.trim() : "";
    if (metaReason) return metaReason;
    const fromMessage = productPostcheckSkipReasonFromMessage(item.message);
    if (fromMessage) return fromMessage;
    return "unknown";
  }
  return null;
}

const BADGES: Record<VersionDisplayStatus, VersionHistoryStatusBadge> = {
  promoted: {
    // `release_state = promoted` is the verify gate, not a deploy. Publishing
    // status lives in the portal/header (prod 2026-11-11: "Publicerad" on
    // versions of a site that was never published).
    label: "Godkänd",
    variant: "default",
    tooltip: "Godkänd av kontrollerna och klar att publicera. Säger inte att sajten är publicerad.",
    spinner: false,
    retryIcon: false,
  },
  ready: {
    label: "Klar",
    variant: "secondary",
    tooltip: "Versionen är klar och sparad.",
    spinner: false,
    retryIcon: false,
  },
  degraded: {
    label: "Klar med anmärkning",
    variant: "outline",
    className: AMBER,
    tooltip:
      "Versionen är sparad, men en kontroll hoppades över eller hittade problem. Se Tekniska detaljer eller Visa diagnostik.",
    spinner: false,
    retryIcon: false,
  },
  verifying: {
    label: "Kontrolleras",
    variant: "secondary",
    tooltip: "Vi kontrollerar att sajten bygger utan fel. Slutar som 'Godkänd' eller 'Fel'.",
    spinner: true,
    retryIcon: false,
  },
  generating: {
    label: "Skapas",
    variant: "secondary",
    tooltip: "Sajten skapas just nu.",
    spinner: true,
    retryIcon: false,
  },
  autofixing: {
    label: "Rättar fel",
    variant: "secondary",
    tooltip: "Små fel i koden rättas automatiskt.",
    spinner: true,
    retryIcon: false,
  },
  validating: {
    label: "Kontrollerar koden",
    variant: "secondary",
    tooltip: "Koden kontrolleras innan versionen sparas.",
    spinner: true,
    retryIcon: false,
  },
  preflighting: {
    label: "Sparar",
    variant: "secondary",
    tooltip: "Versionen sparas.",
    spinner: true,
    retryIcon: false,
  },
  repairing: {
    label: "Reparerar",
    variant: "outline",
    className: ORANGE,
    tooltip: "Vi försöker rätta felen automatiskt. Slutar som 'Klar' eller 'Fel'.",
    spinner: true,
    retryIcon: false,
  },
  retrying: {
    label: "Ersatt",
    variant: "outline",
    className: AMBER,
    tooltip: "En nyare version tog över innan den här hann kontrolleras klart.",
    spinner: false,
    retryIcon: true,
  },
  blocked: {
    label: "Blockerad",
    variant: "outline",
    className: ORANGE,
    tooltip: "Förhandsvisningen eller kontrollen stoppades av ett problem. Se Visa diagnostik.",
    spinner: false,
    retryIcon: false,
  },
  failed: {
    label: "Fel",
    variant: "destructive",
    tooltip: "Kontrollen hittade fel som måste rättas innan publicering. Se Visa diagnostik.",
    spinner: false,
    retryIcon: false,
  },
  idle: {
    label: "Utkast",
    variant: "secondary",
    tooltip: "Utkast. Inte kontrollerat eller publicerat än.",
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
    "Automatic server verification passed.": "Automatisk serververifiering godkänd.",
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
 * User-facing summary for the card: only strings we know how to say in plain
 * Swedish. Unknown or detail-bearing machine strings give their plain prefix
 * or `null`; the raw text stays in {@link versionHistoryTechnicalDetails}.
 */
export function userFacingVerificationSummary(
  verificationSummary: string | null | undefined,
): string | null {
  const summary =
    typeof verificationSummary === "string" && verificationSummary.trim()
      ? verificationSummary.trim()
      : null;
  if (!summary) return null;
  if (summary.startsWith("Automatic verification failed:")) {
    return "Automatisk verifiering misslyckades.";
  }
  if (summary.startsWith("Superseded by repaired version")) {
    return "Ersatt av en reparerad version.";
  }
  const localized = localizeVerificationSummary(summary);
  return localized && localized !== summary ? localized : null;
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
  const badge = BADGES[display.status] ?? BADGES.idle;
  // Show bounded repair progress ("Reparerar 1/2") so a running repair reads as
  // finite. Falls back to the plain label before the first pass index arrives.
  if (display.status === "repairing") {
    const progress = formatRepairPassProgress(display.repairPassIndex);
    if (progress) {
      return { ...badge, label: `${badge.label} ${progress}` };
    }
  }
  if (display.status === "degraded") {
    const skipReason = productPostcheckSkipReasonFromDegradations(display.degradations);
    if (skipReason) {
      return { ...badge, tooltip: formatProductPostcheckSkipTooltip(skipReason) };
    }
    return badge;
  }
  // Kontrollen dog men versionen är hel: behåll etiketten och färgen, men säg
  // rakt ut i tooltipen att produktkontrollen saknas.
  const advisoryReason = productPostcheckAdvisoryReasonFromDegradations(display.degradations);
  if (advisoryReason) {
    return {
      ...badge,
      tooltip: `${badge.tooltip} ${formatProductPostcheckAdvisoryTooltip(advisoryReason)}`,
    };
  }
  return badge;
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
  const summary = userFacingVerificationSummary(verificationSummary);

  if (display.status === "retrying") {
    return summary || "Ersatt av en nyare version innan den här hann bli klar.";
  }
  if (display.status === "degraded") {
    const skipReason = productPostcheckSkipReasonFromDegradations(display.degradations);
    if (skipReason) {
      return formatProductPostcheckSkipTooltip(skipReason);
    }
    return summary || "Versionen är sparad, men alla kontroller kunde inte köras klart.";
  }
  const advisoryReason = productPostcheckAdvisoryReasonFromDegradations(display.degradations);
  if (advisoryReason) {
    return formatProductPostcheckAdvisoryTooltip(advisoryReason);
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

/** A small extra badge on the version card. */
export interface VersionHistoryChip {
  label: string;
  title: string;
  className: string;
}

const EMERALD = "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
const SKY = "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300";
const SLATE = "border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300";
const INDIGO = "border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300";
const RED = "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300";

/**
 * Lifecycle badge for a `ready` row whose checks are not complete or that has
 * no preview yet: honest, never green (false-green guard).
 */
export function versionHistoryUncheckedReadyBadge(
  base: VersionHistoryStatusBadge,
  hasPreviewSurface: boolean,
): VersionHistoryStatusBadge {
  return hasPreviewSurface
    ? {
        ...base,
        label: "Sparad",
        variant: "outline",
        className: SKY,
        tooltip: "Förhandsvisningen är igång, men versionen är inte helt kontrollerad än.",
      }
    : {
        ...base,
        label: "Sparad, ingen förhandsvisning",
        variant: "outline",
        className: SLATE,
        tooltip: "Versionen är sparad, men det finns ingen förhandsvisning av den än.",
      };
}

/**
 * Verification chip from the DB surface status. A design version that has not
 * been server-checked yet is the normal state, so it gets no chip on the card
 * (it stays in the technical details); "Ej verifierad" read as an error.
 */
export function versionHistoryVerificationChip(
  verificationSurfaceStatus: string | null | undefined,
  verified: boolean,
): VersionHistoryChip | null {
  if (verified) {
    return {
      label: "Kontrollerad",
      title: "Versionen har klarat kontrollerna.",
      className: EMERALD,
    };
  }
  switch (verificationSurfaceStatus) {
    case "verifying":
      return {
        label: "Kontrolleras",
        title: "Kontrollen av versionen pågår.",
        className: SKY,
      };
    case "repair_available":
      return {
        label: "Fix redo",
        title: "En automatisk rättning är klar. Granska och acceptera den.",
        className: INDIGO,
      };
    case "failed":
      return {
        label: "Kontroll misslyckades",
        title: "Kontrollen hittade fel som måste rättas. Se Visa diagnostik.",
        className: RED,
      };
    case "superseded":
      return {
        label: "Ersatt",
        title:
          "En nyare version tog över innan kontrollen hann bli klar. Inte ett fel — den nyare versionen gäller.",
        className: AMBER,
      };
    default:
      return null;
  }
}

/**
 * Preview chip for the selected row. A running preview is the normal case and
 * needs no chip; only states the user may act on are shown.
 */
export function versionHistoryPreviewChip(
  runtimeStatus: string | null | undefined,
): VersionHistoryChip | null {
  switch (runtimeStatus) {
    case "starting":
      return {
        label: "Förhandsvisning startar",
        title: "Förhandsvisningen startar. Det tar oftast 30–90 sekunder.",
        className: SKY,
      };
    case "stopped":
      return {
        label: "Förhandsvisning pausad",
        title: "Förhandsvisningen är pausad. Starta den igen från knappraden för att se versionen.",
        className: AMBER,
      };
    case "version_mismatch":
      return {
        label: "Annan version visas",
        title:
          "Förhandsvisningen visar en annan version än den du valt. Vänta en stund eller öppna förhandsvisningen för att se läget.",
        className: ORANGE,
      };
    case "missing":
      return {
        label: "Förhandsvisning inte igång",
        title: "Förhandsvisningen för den här versionen är inte igång. Starta den från knappraden.",
        className: SLATE,
      };
    case "build_error":
      return {
        label: "Fel på sidan",
        title:
          "Förhandsvisningen startade, men sidan har ett fel som gör att den inte kan visas. En omstart hjälper inte – be om en rättning i chatten.",
        className: RED,
      };
    default:
      return null;
  }
}

export interface VersionHistoryTechnicalDetailsInput {
  display: VersionStatusDisplay;
  verificationSummary?: string | null;
  releaseState?: string | null;
  verificationState?: string | null;
  verificationSurfaceStatus?: string | null;
  runtimeStatus?: string | null;
  qualityTier?: string | null;
  previewUrl?: string | null;
}

/**
 * Everything the card no longer says out loud, for troubleshooting: status
 * tokens, reason codes, the raw verification summary, VM state and the URL.
 * Empty values are left out.
 */
export function versionHistoryTechnicalDetails(
  input: VersionHistoryTechnicalDetailsInput,
): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  const add = (label: string, value: string | null | undefined) => {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (trimmed) rows.push({ label, value: trimmed });
  };
  add(
    "Status",
    input.display.degraded && input.display.status !== "degraded"
      ? `${input.display.status} (degraded)`
      : input.display.status,
  );
  const states = [input.releaseState, input.verificationState].filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
  add("Release/verify", states.join(" / "));
  add("Kontrollyta", input.verificationSurfaceStatus);
  const previewParts = [input.runtimeStatus, input.qualityTier].filter(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0 && value !== "none",
  );
  add("Förhandsvisning", previewParts.join(" · "));
  for (const item of input.display.degradations) {
    const reason =
      typeof item.meta?.skippedReason === "string" ? item.meta.skippedReason.trim() : "";
    const code = reason ? `${item.kind}: ${reason}` : item.kind;
    add("Anmärkning", item.message && item.message !== code ? `${code} — ${item.message}` : code);
  }
  add("Sammanfattning", input.verificationSummary);
  add("Preview-URL", input.previewUrl);
  return rows;
}
