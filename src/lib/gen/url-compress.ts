/**
 * URL alias compression for prompts and generated content.
 *
 * Replaces long URLs (blob storage, media catalogs, etc.) with short aliases
 * before LLM inference to save tokens and latency. Aliases are expanded back
 * during streaming via the url-alias-expand suspense rule.
 *
 * Target: URLs > 50 chars from vercel-storage.com, blob storage, and similar.
 */

const MIN_URL_LENGTH = 50;

/** Matches https URLs (stops at whitespace, quotes, or angle brackets). */
const URL_RE = /https:\/\/[^\s"'<>]+/g;

export interface CompressResult {
  compressed: string;
  urlMap: Record<string, string>;
}

/**
 * Find long URLs in the prompt, replace with {{MEDIA_1}}, {{MEDIA_2}}, etc.
 * Returns the compressed string and a map from alias key (e.g. "MEDIA_1") to original URL.
 *
 * Prompts without matching URLs pass through unchanged with an empty urlMap.
 */
export function compressUrls(prompt: string): CompressResult {
  const urlMap: Record<string, string> = {};
  let index = 0;

  const compressed = prompt.replace(URL_RE, (url) => {
    if (url.length < MIN_URL_LENGTH) return url;

    const key = `MEDIA_${index}`;
    urlMap[key] = url;
    index += 1;
    return `{{${key}}}`;
  });

  if (Object.keys(urlMap).length > 0) {
    console.info(
      "[url-compress] Compressed",
      Object.keys(urlMap).length,
      "URL(s), estimated token savings:",
      estimateTokenSavings(urlMap),
    );
  }

  return { compressed, urlMap };
}

/**
 * Replace {{MEDIA_N}} aliases with original URLs.
 * Used for post-stream expansion if any aliases remain.
 */
export function expandUrls(
  content: string,
  urlMap: Record<string, string>,
): string {
  if (!content.includes("{{") || Object.keys(urlMap).length === 0) {
    return content;
  }

  const aliasRe = /\{\{((?:MEDIA|URL)_\d+)\}\}/g;
  return content.replace(aliasRe, (full, key: string) => {
    return urlMap[key] ?? full;
  });
}

function estimateTokenSavings(urlMap: Record<string, string>): number {
  let saved = 0;
  for (const [key, url] of Object.entries(urlMap)) {
    // Alias like {{MEDIA_0}} is ~4-6 tokens; URL can be 20-50+ tokens
    const urlTokens = Math.ceil(url.length / 4);
    const aliasTokens = Math.ceil((key.length + 4) / 4);
    saved += Math.max(0, urlTokens - aliasTokens);
  }
  return saved;
}
