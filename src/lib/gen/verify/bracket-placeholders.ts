/**
 * Leftover scaffold copy written as `[Token]` / `[Längre instruktion.]`.
 * Shared by eval checks and Visual QA so new token families cannot drift
 * past one lane while the other stays on the old allowlist.
 */

const CODE_LIKE_INNER =
  /\b(?:in keyof|extends |typeof |infer )\b/;

const ENGLISH_ALIASES =
  /^(?:Your (?:Company|Brand|Product)|Company Name|Product Name|Brand Name)$/i;

const LOWERCASE_SCAFFOLD_TOKENS = new Set(["produkttyp"]);

const TITLE_CASE_OR_PHRASE =
  /^[A-ZÅÄÖ][A-Za-zÅÄÖåäö0-9-]*(?:[ \t]+[^[\]]+)?$/;

export function isScaffoldBracketPlaceholder(inner: string): boolean {
  const token = inner.trim();
  if (!token || CODE_LIKE_INNER.test(token)) return false;
  if (ENGLISH_ALIASES.test(token)) return true;
  if (LOWERCASE_SCAFFOLD_TOKENS.has(token.toLowerCase())) return true;
  return TITLE_CASE_OR_PHRASE.test(token);
}

export function countBracketPlaceholders(content: string): number {
  let total = 0;
  for (const match of content.matchAll(/\[([^[\]]+)\]/g)) {
    if (isScaffoldBracketPlaceholder(match[1] ?? "")) total += 1;
  }
  return total;
}
