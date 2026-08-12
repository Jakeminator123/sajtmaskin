/**
 * Innehållsrevision — steg 3: läsarna jämför.
 *
 * Steg 1–2 (migration `add-files-revision.sql`) gav primitiven:
 * `engine_versions.files_revision` är en DB-genererad `md5(files_json)` och
 * `generation_telemetry.files_revision` bär den revision verdiktet bedömde.
 * Ingen läsare jämförde dem — det är den här modulens jobb att göra möjligt.
 *
 * Modulen är avsiktligt beroendefri (ingen DB, ingen prom-client, inga
 * Next-importer) så både den rena bus-projektionen (`stale-verification.ts`)
 * och DB-tjänsterna kan använda samma klassificering. Räknaren för hur ofta
 * känd mismatch inträffar bor i `@/lib/observability/metrics`
 * (`incContentRevisionMismatch`) — anropas av respektive yta, inte härifrån.
 *
 * Två regler är hela kontraktet:
 *
 * 1. **Symmetri** (planens beslut 1a): ett verdikt beskriver revision N och kan
 *    inte uttala sig om N+1 — varken `passed` eller `failed`. Ett mismatchat
 *    `failed` kastas alltså precis som ett mismatchat `passed`.
 * 2. **Okänt är inte mismatch** (beslut 1b): saknas revisionen (rad skriven före
 *    steg 2, eller versionslös rad) är läget `unknown` och läsaren behåller
 *    dagens fail-open. Bara **känd** mismatch får blockera något.
 */

/** Env-flaggan som slår på jämförande läsning. Default: av (ägarbeslut att släppa). */
export const CONTENT_REVISION_GATE_ENV_KEY = "SAJTMASKIN_CONTENT_REVISION_GATE";

/**
 * `"current"` — verdiktet bär en revision och den är innehållets nuvarande.
 * `"unknown"` — verdiktet (eller innehållet) saknar revision → dagens fail-open.
 * `"stale"`   — båda revisionerna är kända och skiljer sig → **känd mismatch**.
 */
export type RevisionMatch = "current" | "unknown" | "stale";

/** Ytorna som kan observera en känd mismatch (räknarens `surface`-label). */
export type ContentRevisionSurface =
  | "promote_guard"
  | "preview_receipt"
  | "status_projection"
  | "versions_list";

/**
 * Läses vid varje anrop (ingen modul-nivå-cache) så en flaggändring i en
 * långlivad serverless-instans slår igenom utan omstart, och tester kan sätta
 * env per case.
 */
export function isContentRevisionGateEnabled(): boolean {
  return (process.env[CONTENT_REVISION_GATE_ENV_KEY] ?? "").trim() === "true";
}

function normalizeRevision(revision: string | null | undefined): string | null {
  if (typeof revision !== "string") return null;
  const trimmed = revision.trim();
  return trimmed ? trimmed : null;
}

/**
 * Jämför den revision ett verdikt/kvitto bär mot den revision innehållet har.
 *
 * Ordningen på grenarna ÄR beslut 1b: `unknown` kontrolleras före olikhet, så en
 * saknad revision aldrig kan klassas som mismatch och därmed aldrig blockera.
 */
export function classifyRevisionMatch(
  verdictRevision: string | null | undefined,
  contentRevision: string | null | undefined,
): RevisionMatch {
  const verdict = normalizeRevision(verdictRevision);
  const content = normalizeRevision(contentRevision);
  if (!verdict || !content) return "unknown";
  return verdict === content ? "current" : "stale";
}

/** Sant bara för känd mismatch — den enda klass som får vara blockerande. */
export function isKnownRevisionMismatch(
  verdictRevision: string | null | undefined,
  contentRevision: string | null | undefined,
): boolean {
  return classifyRevisionMatch(verdictRevision, contentRevision) === "stale";
}

/** Kort revisionsprefix för logg/UI-copy — hela md5:an säger inget för en läsare. */
export function shortRevision(revision: string | null | undefined): string {
  const normalized = normalizeRevision(revision);
  return normalized ? normalized.slice(0, 8) : "okänd";
}
