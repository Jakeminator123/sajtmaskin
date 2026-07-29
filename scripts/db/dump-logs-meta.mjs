/**
 * Trunkering av `meta` i logg-exporten.
 *
 * `dump-logs --kinds=errors` tog in `meta`-kolumnen för R7:s skull
 * (`f3-readiness:missing-env` bär `missingByIntegration`, som `/logg` behöver).
 * Men kolumnen är delad: `quality-gate:*-tooling`-rader bär upp till 12 000
 * tecken rå build-/typecheck-output per rad (`server-verify.ts`), från ett bygge
 * som körts med användarens riktiga env-värden. Med 100 rader per kind blev
 * exporten både oläsbar och onödigt exponerad.
 *
 * Trunkeringen minskar volym och exponeringsyta — den är **inte** redaktion.
 * En logg-dump ska fortsatt behandlas som känslig.
 */

/** Längre strängvärden i `meta` kapas. Räcker för R7:s nyckelnamn med marginal. */
export const META_MAX_STRING = 500;

/** Skydd mot patologiskt djupa payloads; djupare nivåer lämnas orörda. */
export const META_MAX_DEPTH = 6;

/**
 * Kapar långa strängar var som helst i ett `meta`-värde och behåller strukturen
 * i övrigt, så små payloads (R7:s `missingByIntegration`) passerar oförändrade.
 */
export function truncateMetaStrings(value, depth = 0) {
  if (typeof value === "string") {
    if (value.length <= META_MAX_STRING) return value;
    return `${value.slice(0, META_MAX_STRING)}… [trunkerad, ${value.length} tecken]`;
  }
  if (value === null || typeof value !== "object" || depth >= META_MAX_DEPTH) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => truncateMetaStrings(entry, depth + 1));
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, truncateMetaStrings(entry, depth + 1)]),
  );
}
