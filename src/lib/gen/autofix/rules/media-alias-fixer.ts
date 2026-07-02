/**
 * media-alias-fixer — replaces leaked `{{MEDIA_n}}` / `{{URL_n}}` URL-compression
 * aliases with a safe placeholder image URL (M#oc1).
 *
 * `compressUrls` (url-compress.ts) rewrites long URLs to `{{MEDIA_n}}` aliases
 * before LLM inference, and `expandUrls` restores them ONCE in finalize
 * (`pre-phases.ts`). Any LLM pass that runs AFTER that single expansion
 * (verifier-fixer, partial-file repair, server repair-loop) can re-introduce an
 * alias verbatim from its prompt context — and the alias then persists into
 * `files_json`. `next/image` cannot parse `{{MEDIA_0}}` as a `src`, so a leaked
 * alias crashes build/SSG of the page (and produces invalid OG/Twitter image
 * URLs in `layout.tsx`).
 *
 * The urlMap is stream-scoped and not available in the autofix pipeline, so a
 * leaked alias cannot be re-expanded to its original URL here. Instead we fall
 * back to the same placeholder URL `expandUrls` uses for unresolved aliases —
 * a rendering site with a placeholder image beats a build crash.
 *
 * Tolerant matching (wider than `expandUrls`): optional whitespace inside the
 * braces and `-` as separator, since LLM re-emissions drift in formatting.
 */

/** Matches `{{MEDIA_1}}`, `{{ MEDIA_1 }}`, `{{URL-2}}` etc. */
export const LEAKED_MEDIA_ALIAS_RE = /\{\{\s*((?:MEDIA|URL)[_-]\d+)\s*\}\}/g;

export function buildMediaAliasPlaceholderUrl(aliasKey: string): string {
  const normalized = aliasKey.replace(/-/g, "_");
  return `/placeholder.svg?height=400&width=600&text=${encodeURIComponent(normalized)}`;
}

export function fixLeakedMediaAliases(code: string): {
  code: string;
  count: number;
  aliases: string[];
} {
  if (!code.includes("{{")) {
    return { code, count: 0, aliases: [] };
  }

  const aliases: string[] = [];
  LEAKED_MEDIA_ALIAS_RE.lastIndex = 0;
  const fixed = code.replace(LEAKED_MEDIA_ALIAS_RE, (_full, key: string) => {
    if (!aliases.includes(key)) aliases.push(key);
    return buildMediaAliasPlaceholderUrl(key);
  });

  return { code: fixed, count: aliases.length === 0 ? 0 : countMatches(code), aliases };
}

function countMatches(code: string): number {
  LEAKED_MEDIA_ALIAS_RE.lastIndex = 0;
  let count = 0;
  while (LEAKED_MEDIA_ALIAS_RE.exec(code) !== null) count++;
  return count;
}
