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

// "En enkel hemsida för en …", "Hemsida till mitt …": the site-type lead-in
// says nothing about the business. Whitespace-delimited, no `\b` (å/ä/ö).
const LEAD_IN =
  /^(?:(?:en|ett|min|mitt|vår|vårt)\s+)?(?:(?:enkel|enkelt|ny|nytt|modern|modernt|snygg|snyggt|liten|litet|professionell|professionellt)\s+)*(?:hemsida|hemsidan|webbsida|webbplats|sajt|sida|landningssida|webbshop|app)\s+(?:för|till|åt|om)\s+(?:(?:en|ett|min|mitt|vår|vårt|mina|våra)\s+)?/iu;
const OWNER_LEAD_IN = /^(?:jag|vi)\s+(?:driver|har|äger|är)\s+(?:en|ett)\s+/iu;
const TRAILING_FILLER = /(?:\s+(?:och|i|med|för|på|av|till|som|en|ett|samt))+$/iu;

/**
 * Short project name from the first prompt: drops a generic "hemsida för en"
 * lead-in, caps on a word boundary, drops a dangling "och/i/med" and
 * capitalises. Returns "" when nothing usable remains.
 */
export function projectNameFromPrompt(prompt: string): string {
  const firstLine = prompt.split("\n")[0]?.trim() ?? "";
  const withoutLeadIn =
    firstLine.replace(LEAD_IN, "").replace(OWNER_LEAD_IN, "").trim() || firstLine;
  const cut = suggestProjectNameFromPrompt(withoutLeadIn).replace(TRAILING_FILLER, "").trim();
  if (!cut) return "";
  return cut.charAt(0).toLocaleUpperCase("sv-SE") + cut.slice(1);
}
