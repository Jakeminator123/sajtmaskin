/**
 * Unicode-aware word-boundary helpers.
 *
 * **Why this exists:** JavaScript's built-in `\b` uses ASCII word characters
 * (`[A-Za-z0-9_]`). That means `\bändra\b` never matches the word "ändra" —
 * `ä/ö/å/é/ñ/…` are all non-word in the ASCII table, so there is no
 * word↔non-word transition next to them for `\b` to fire on. Same story for
 * any pattern that starts or ends with a non-ASCII letter (`öka`, `åter…`,
 * `klippmiljö`, `École`, `naïve`, `naturmiljö`, …).
 *
 * Symptom: the regex silently returns `false` in production while unit tests
 * that happen to use English stay green. Classic invisible degradation.
 *
 * **Use these helpers for every regex that matches human-language text** —
 * Swedish, German, French, Japanese, Arabic, emoji-adjacent text, anything
 * that isn't guaranteed ASCII. No npm dependency is required: Unicode
 * property escapes (`\p{L}`, `\p{N}`) and lookbehind are native in Node ≥10.
 *
 * See also: `.cursor/rules/unicode-regex.mdc` for the team convention and
 * the 2026-04-22 audit triage in `audit-reports/2026-04-22-llm-flow/`.
 */

/**
 * Lookbehind fragment: "not preceded by a Unicode letter, digit, or
 * underscore". Equivalent to the "left half" of `\b` but Unicode-aware.
 */
export const UNICODE_WB_LEFT = String.raw`(?<![\p{L}\p{N}_])`;

/**
 * Lookahead fragment: "not followed by a Unicode letter, digit, or
 * underscore". Equivalent to the "right half" of `\b` but Unicode-aware.
 */
export const UNICODE_WB_RIGHT = String.raw`(?![\p{L}\p{N}_])`;

/**
 * Wrap an inner pattern source with Unicode word boundaries. Returns a
 * regex source string (no flags) so callers can compose it further.
 *
 * The `inner` argument is inserted as-is — pass either a plain literal
 * (`"ändra"`), an alternation (`"ändra|byt|lägg\\s+till"`), or any other
 * valid regex fragment. No escaping is applied; callers control the source.
 *
 * @example
 *   const rx = new RegExp(uWord("ändra"), "iu");
 *   rx.test("Ändra rubriken"); // → true
 *   rx.test("överändrat");     // → false
 */
export function uWord(inner: string): string {
  return `${UNICODE_WB_LEFT}(?:${inner})${UNICODE_WB_RIGHT}`;
}

/**
 * Build a compiled RegExp that matches `inner` at Unicode word boundaries.
 * Always forces the `u` flag so `\p{…}` works; callers may add more flags
 * (`"giu"`, `"iu"`, etc.).
 *
 * @example
 *   const rx = uWordRegex("ändra|byt|lägg\\s+till", "iu");
 *   rx.test("Byt rubriken"); // → true
 */
export function uWordRegex(inner: string, flags = "iu"): RegExp {
  const normalizedFlags = flags.includes("u") ? flags : `${flags}u`;
  return new RegExp(uWord(inner), normalizedFlags);
}

/**
 * Convenience matcher: does `text` contain any of `words` at a Unicode
 * boundary? Empty inputs return `false` (not a regex error).
 *
 * `words` entries are treated as regex sources joined with `|`. Escape
 * them with `escapeRegexLiteral()` below if they come from user input.
 */
export function containsUnicodeWord(
  text: string,
  words: readonly string[],
): boolean {
  if (!text || words.length === 0) return false;
  return uWordRegex(words.join("|")).test(text);
}

/**
 * Escape regex metacharacters so an arbitrary string can be dropped into a
 * pattern literally. Use this when `words` come from user input or config;
 * skip it for hand-authored patterns that already embed regex syntax.
 */
export function escapeRegexLiteral(token: string): string {
  return token.replace(/[\\^$.*+?()\[\]{}|]/g, "\\$&");
}
