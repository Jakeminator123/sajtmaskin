/**
 * Kort blockeringsstatus för den nedfällda chattens rad (Ö9,
 * `ChatOutputCollapseBar`). När utdata är dolt är raden det enda som syns, så
 * en versions- eller F3-spärr som annars bara lever i chattflödet blir
 * osynlig utan den här texten.
 *
 * Publiceringsspärrar (postcheck-overlay, fake_form, …) hör till error-log
 * + Versionsdiagnostik, inte till den här raden (ägare 2026-08-19).
 *
 * Ren funktion: den väljer bland värden byggaren redan har räknat fram och
 * äger ingen egen statuskälla — ingen state, inga hooks, ingen hämtning.
 */

import type { F3BuilderStatus } from "@/lib/builder/f3-status";
import type { VersionDisplayStatus } from "@/lib/builder/version-status-display";

/** Raden är tunn — längre texter kapas hellre än att tränga ut räknaren. */
export const CHAT_COLLAPSE_STATUS_MAX_CHARS = 60;

/**
 * Versionslägen som betyder "den här versionen bär dig inte vidare". De väger
 * tyngst: allt annat (F3) beskriver ett senare steg som ändå inte
 * går att nå.
 */
const VERSION_FAILURE_TEXTS: Partial<Record<VersionDisplayStatus, string>> = {
  // Display-token `failed` covers F2 diagnostic verify (typecheck/imports)
  // as well as real preview-build fails. Do not say "bygga" here — F2
  // never runs `npm run build`. Preview `build-failed` has its own copy.
  failed: "Versionen misslyckades",
  blocked: "Versionen stoppades av en kontroll",
};

/**
 * F3-utfall som inte är ett problem. Ett `info`/`success`-utfall får inte
 * ockupera raden och maskera att allt faktiskt är i sin ordning.
 */
const F3_BLOCKING_TONES = new Set<F3BuilderStatus["tone"]>(["error", "warning"]);

const VERSION_IN_PROGRESS_TEXTS: Partial<Record<VersionDisplayStatus, string>> = {
  generating: "Bygger versionen",
  autofixing: "Reparerar versionen",
  validating: "Kontrollerar versionen",
  preflighting: "Kontrollerar versionen",
  verifying: "Kontrollerar versionen",
  repairing: "Reparerar versionen",
};

export interface ChatCollapseStatusInput {
  /** `mapVersionStatusToDisplay(...).status` för den aktiva versionen. */
  activeVersionStatus: VersionDisplayStatus | null;
  /** Preferred head — a verifying newest version must still show in the bar. */
  preferredVersionStatus?: VersionDisplayStatus | null;
  /** F3-utfallet som visas i chatten, redan filtrerat på aktiv version. */
  f3Status: Pick<F3BuilderStatus, "tone" | "title"> | null;
}

function shorten(raw: string | null | undefined): string | null {
  const text = raw?.trim();
  if (!text) return null;
  if (text.length <= CHAT_COLLAPSE_STATUS_MAX_CHARS) return text;
  return `${text.slice(0, CHAT_COLLAPSE_STATUS_MAX_CHARS - 1).trimEnd()}…`;
}

/**
 * Returnerar den enda status som får plats i raden, eller `null` när inget är
 * en riktig blockerare. Strömningsläget ("Bygger …") ägs av komponenten och
 * vinner över det här när en stream är igång. Annars visas kontroll/reparation
 * här så den nedfällda raden inte tiger medan composer är låst.
 */
export function resolveChatCollapseStatusText({
  activeVersionStatus,
  preferredVersionStatus = null,
  f3Status,
}: ChatCollapseStatusInput): string | null {
  const versionFailure = activeVersionStatus
    ? VERSION_FAILURE_TEXTS[activeVersionStatus] ?? null
    : null;
  if (versionFailure) return versionFailure;

  const inProgress =
    (activeVersionStatus
      ? VERSION_IN_PROGRESS_TEXTS[activeVersionStatus] ?? null
      : null) ??
    (preferredVersionStatus
      ? VERSION_IN_PROGRESS_TEXTS[preferredVersionStatus] ?? null
      : null);
  if (inProgress) return inProgress;

  if (f3Status && F3_BLOCKING_TONES.has(f3Status.tone)) {
    return shorten(f3Status.title);
  }

  return null;
}
