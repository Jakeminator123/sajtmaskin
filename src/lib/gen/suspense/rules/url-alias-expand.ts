import type { SuspenseRule, StreamContext } from "../transform";

/**
 * Expands URL aliases injected into the prompt before the LLM call.
 *
 * Matches any `{{alias}}` pattern — e.g. `{{MEDIA_1}}`, `{{URL_2}}`,
 * `{{hero-image}}`, `{{company-logo}}` — and replaces them with the
 * full URL from `context.urlMap`.
 *
 * The urlMap keys should be the full alias WITHOUT braces:
 *   { "MEDIA_1": "https://blob.vercel-storage.com/abc.png", "hero-image": "..." }
 */

const ALIAS_RE = /\{\{([A-Za-z][A-Za-z0-9_-]*(?:_\d+)?)\}\}/g;

export const urlAliasExpand: SuspenseRule = {
  name: "url-alias-expand",

  transform(line: string, context: StreamContext): string {
    if (!context.urlMap) return line;
    if (!line.includes("{{")) return line;

    return line.replace(ALIAS_RE, (full, key: string) => {
      return context.urlMap?.[key] ?? full;
    });
  },
};
