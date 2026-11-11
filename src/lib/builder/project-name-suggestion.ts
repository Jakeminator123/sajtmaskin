/**
 * Prompt-derived project-name suggestions.
 *
 * The publish dialog prefills the project name from the user's first chat
 * message. A full free-form prompt (266 chars observed in prod 2026-08-01)
 * is not a usable name, so prompt-derived suggestions are capped here.
 * Explicitly chosen names (`pendingProjectName`) are never truncated —
 * callers only route prompt text through this helper.
 */

export const MAX_SUGGESTED_PROJECT_NAME_LENGTH = 40;

/**
 * Name the builder gives a project it creates before there is a prompt
 * (`/builder?new=1`, "Ny chatt"). It means "the user has not named this yet":
 * the first build and the publish dialog may replace it, never a real name.
 */
export const DEFAULT_PROJECT_NAME = "Namnlöst projekt";

/** True for a missing name or the builder's placeholder, never for a name the user chose. */
export function isDefaultProjectName(name: string | null | undefined): boolean {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed) return true;
  return trimmed.toLocaleLowerCase("sv-SE") === DEFAULT_PROJECT_NAME.toLocaleLowerCase("sv-SE");
}

// Longest prefix within the cap that ends at a whitespace boundary or at the
// end of the line (greedy `.` backtracks to the boundary). No `\b`/`\w`, so
// Swedish å/ä/ö are safe (see unicode-regex.mdc).
const WORD_BOUNDARY_PREFIX = new RegExp(
  `^(.{0,${MAX_SUGGESTED_PROJECT_NAME_LENGTH}})(?:\\s|$)`,
  "u",
);

// A suggestion should not end in dangling punctuation after the cut.
const TRAILING_PUNCTUATION_OR_SPACE = /[\s\p{P}]+$/u;

/**
 * Derives a short project-name suggestion from free-form prompt text:
 * first line only, capped at {@link MAX_SUGGESTED_PROJECT_NAME_LENGTH} on a
 * word boundary (no mid-word cuts) and stripped of trailing punctuation.
 * Returns "" when nothing usable remains — callers pick their own fallback.
 */
export function suggestProjectNameFromPrompt(prompt: string): string {
  const firstLine = prompt.split("\n")[0]?.trim() ?? "";
  if (!firstLine) return "";
  let cut = firstLine;
  if (firstLine.length > MAX_SUGGESTED_PROJECT_NAME_LENGTH) {
    const match = WORD_BOUNDARY_PREFIX.exec(firstLine);
    cut =
      match && match[1]
        ? match[1]
        : // Single token longer than the cap — a hard cut is the only option.
          firstLine.slice(0, MAX_SUGGESTED_PROJECT_NAME_LENGTH);
  }
  return cut.replace(TRAILING_PUNCTUATION_OR_SPACE, "");
}

// All patterns below are whitespace-delimited, no `\b`/`\w` (å/ä/ö).
const SITE_NOUN =
  "(?:hemsida|hemsidan|webbsida|webbsidan|webbplats|webbplatsen|sajt|sajten|sida|sidan|landningssida|webbshop|webbutik|e-handel|app|portfolio|portfoliosida|bokningssida|onepager)";
const DETERMINER = "(?:en|ett|min|mitt|mina|vår|vårt|våra)";
const ADJECTIVE =
  "(?:enkel|enkelt|ny|nytt|nya|modern|modernt|snygg|snyggt|liten|litet|professionell|professionellt|egen|eget|fin|fint|stilren|stilrent|responsiv|responsivt)";

// "Hej!", "Hejsan,": a greeting says nothing about the business.
const GREETING = /^(?:hej|hejsan|hallå|tjena|god\s+(?:morgon|dag|kväll))[\s!,.:]+/iu;
// "Kan du hjälpa mig att", "Jag vill ha", "Vi behöver", "Snälla": the request.
const REQUEST_LEAD_IN = new RegExp(
  "^(?:" +
    [
      "(?:kan|kunde|skulle)\\s+(?:du|ni)\\s+(?:snälla\\s+|vänligen\\s+)?(?:hjälpa\\s+(?:mig|oss)\\s+(?:att\\s+|med\\s+(?:att\\s+)?)?)?",
      "hjälp\\s+(?:mig|oss)\\s+(?:att\\s+|med\\s+(?:att\\s+)?)?",
      "(?:jag|vi)\\s+(?:vill|skulle\\s+vilja|önskar|behöver)\\s+(?:att\\s+(?:du|ni)\\s+)?(?:ha\\s+|få\\s+)?",
      "(?:snälla|vänligen|behöver)\\s+",
    ].join("|") +
    ")",
  "iu",
);
// "Bygg", "Skapa", "Gör", "Ta fram": the verb in front of the site type.
const BUILD_VERB =
  /^(?:bygg|bygga|skapa|gör|göra|designa|ta\s+fram|fixa|utveckla|sätt\s+ihop|sätta\s+ihop|generera|producera)\s+(?:mig\s+|oss\s+)?/iu;
// "en enkel hemsida för en …", "hemsida till mitt …", "sajt: …".
const LEAD_IN = new RegExp(
  `^(?:${DETERMINER}\\s+)?(?:${ADJECTIVE}\\s+)*${SITE_NOUN}(?:\\s+(?:för|till|åt|om)\\s+|\\s*[:–—-]\\s+)(?:${DETERMINER}\\s+)?`,
  "iu",
);
// The remainder is only the site type ("en hemsida"): no name to take.
const SITE_TYPE_ONLY = new RegExp(
  `^(?:${DETERMINER}\\s+)?(?:${ADJECTIVE}\\s+)*${SITE_NOUN}$`,
  "iu",
);
const OWNER_LEAD_IN = /^(?:jag|vi)\s+(?:driver|har|äger|är)\s+(?:en|ett)\s+/iu;
// "mitt företag Nordic Fönster AB": keep the name, drop the generic noun.
const COMPANY_NOUN =
  /^(?:företag|företaget|bolag|bolaget|firma|firman|verksamhet|verksamheten)\s+(?=\p{Lu})/u;
// "… som heter Café Lindgren", "… med namnet Pälsklippet".
const NAMED = /(?:^|\s)(?:som\s+heter|vid\s+namn|med\s+namnet|kallad|kallat|kallas)\s+(.+)$/iu;
// A name in quotes right after the lead-in: "Bageri Blå".
const QUOTED_NAME = /^["“”„«»]([^"“”„«»]{1,60})["“”„«»]/u;
// First natural boundary: punctuation, a spaced dash, or a clause word.
const NATURAL_BOUNDARY =
  /[,.;:!?(]|\s[–—-]\s|\s(?:som|med|där|är|vilket|eftersom)\s/iu;
const TRAILING_FILLER = /(?:\s+(?:och|i|med|för|på|av|till|som|en|ett|samt))+$/iu;

function cutAtNaturalBoundary(text: string): string {
  const match = NATURAL_BOUNDARY.exec(text);
  return (match ? text.slice(0, match.index) : text).trim();
}

function stripLeadIns(text: string): string {
  let rest = text.replace(GREETING, "").trim();
  rest = rest.replace(REQUEST_LEAD_IN, "").trim();
  rest = rest.replace(BUILD_VERB, "").trim();
  rest = rest.replace(LEAD_IN, "").trim();
  rest = rest.replace(OWNER_LEAD_IN, "").trim();
  return rest.replace(COMPANY_NOUN, "").trim();
}

/**
 * Short project name from the first prompt. Prefers the business name
 * ("Bygg en hemsida för Café Lindgren, ett familjeägt kafé" → "Café
 * Lindgren"), otherwise a short description ("Frisörsalong i Malmö"): drops
 * the greeting/request/site-type lead-in, cuts at the first natural boundary
 * (comma, period, dash, "som/med/där/är"), caps on a word boundary and
 * capitalises. Returns "" when nothing usable remains.
 */
export function projectNameFromPrompt(prompt: string): string {
  const firstLine = prompt.split("\n").find((line) => line.trim())?.trim() ?? "";
  if (!firstLine) return "";
  const rest = stripLeadIns(firstLine);

  const quoted = QUOTED_NAME.exec(rest)?.[1]?.trim();
  const named = NAMED.exec(rest)?.[1];
  const candidate = quoted || (named ? cutAtNaturalBoundary(named) : "") || cutAtNaturalBoundary(rest);
  if (!candidate || SITE_TYPE_ONLY.test(candidate)) return "";

  const cut = suggestProjectNameFromPrompt(candidate).replace(TRAILING_FILLER, "").trim();
  if (!cut) return "";
  return cut.charAt(0).toLocaleUpperCase("sv-SE") + cut.slice(1);
}
