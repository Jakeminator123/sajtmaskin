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

/** Djupare nivåer ersätts av en sentinel i stället för att följas. */
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
  if (value === null || typeof value !== "object") return value;
  if (depth >= META_MAX_DEPTH) {
    // Sentinel, inte subträdet orört: annars passerar varje sträng under
    // djupgränsen okapad och ett patologiskt djupt värde når `JSON.stringify`
    // i `dump-logs.mjs` med hela sitt djup (Codex-fynd 2026-07-29).
    return Array.isArray(value)
      ? `[trunkerad array på djup ${depth} — poster: ${value.length}]`
      : `[trunkerat objekt på djup ${depth} — nycklar: ${Object.keys(value).length}]`;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => truncateMetaStrings(entry, depth + 1));
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, truncateMetaStrings(entry, depth + 1)]),
  );
}

/**
 * Fält från provider-payloaden som `recordLlmUsage.meta` kan bära.
 * `parentRunId` är valfri och tas bara med när nyckeln faktiskt finns.
 * `run_id`-kolumnen äger körningsrelationen; den här listan härleder inget.
 */
const LLM_USAGE_EXPORT_META_KEYS = [
  "requestedModelId",
  "resolvedModelId",
  "requestedReasoningEffort",
  "effectiveReasoningEffort",
  "reasoningClampReason",
  "parentRunId",
];

/** `sk-` / `sk_` och bearer-token. Matchas mot hela strängen före eventuell kapning. */
const CREDENTIAL_LIKE_VALUE = /sk[-_]|bearer\s+\S+/i;

/**
 * Strikt meta för `llmusage`-exporten.
 *
 * Behåller bara skalära null/sträng för allow-listen. Saknade nycklar fylls
 * inte i, nästlade värden och övriga nycklar (prompt, rå reasoning, feltext,
 * authorization, cookies, källinnehåll) släpps, och credential-liknande
 * strängar släpps hela. Returnerar `null` när meta saknas, inte är ett objekt,
 * eller inget tillåtet fält återstår — inte `{}` och inte defaultvärden.
 * Muterar inte indata. Anropar inte `truncateMetaStrings`.
 */
export function sanitizeLlmUsageMeta(meta) {
  if (meta === null || meta === undefined) return null;
  if (typeof meta !== "object" || Array.isArray(meta)) return null;

  const out = {};
  for (const key of LLM_USAGE_EXPORT_META_KEYS) {
    if (!Object.hasOwn(meta, key)) continue;
    const sanitized = sanitizeLlmUsageMetaValue(meta[key]);
    if (sanitized === undefined) continue;
    out[key] = sanitized;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function sanitizeLlmUsageMetaValue(value) {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  if (CREDENTIAL_LIKE_VALUE.test(value)) return undefined;
  return value.length > META_MAX_STRING ? value.slice(0, META_MAX_STRING) : value;
}

/**
 * `--chat` på en kind vars tabell saknar chatt-kolumn (`drain`, `openai`).
 *
 * Tidigare föll de kinds tyst tillbaka till de senaste OFILTRERADE raderna
 * medan exporten sa att den var chattfiltrerad. Nu hoppas de över med ett skäl
 * som hamnar i `skipped` (Logg-exporten visar det som varning).
 *
 * @param {{ chatColumn?: string | null } | null | undefined} spec
 * @param {string | null | undefined} chatId
 * @returns {string | null} skäl att hoppa över, eller `null` när kinden kan köras
 */
export function chatFilterSkipReason(spec, chatId) {
  if (!chatId || spec?.chatColumn) return null;
  return "ej chattfiltrerbar: tabellen saknar chatt-kolumn (kör utan chat-id, korrelera på tid)";
}
