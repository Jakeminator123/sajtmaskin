import { SECRETS, FEATURES } from "@/lib/config";
import { debugLog, warnLog } from "@/lib/utils/debug";

interface UnsplashSearchResult {
  results: Array<{
    urls: { raw: string };
    alt_description: string | null;
  }>;
}

const PLACEHOLDER_RE =
  /\/placeholder\.svg\?(?:[^"'\s]*&)?text=([^&"'\s]+)(?:[^"'\s]*height=(\d+))?(?:[^"'\s]*width=(\d+))?/g;

const PLACEHOLDER_FULL_RE =
  /\/placeholder\.svg\?([^"'\s]+)/g;

function parseParams(qs: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of qs.split("&")) {
    const [k, v] = pair.split("=");
    if (k && v) out[k] = decodeURIComponent(v.replace(/\+/g, " "));
  }
  return out;
}

async function searchUnsplash(
  query: string,
  accessKey: string,
  orientation: "landscape" | "portrait" | "squarish" = "landscape",
): Promise<string | null> {
  if (!query.trim() || !accessKey) return null;
  try {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=${orientation}`,
      {
        headers: {
          Authorization: `Client-ID ${accessKey}`,
          "Accept-Version": "v1",
        },
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as UnsplashSearchResult;
    const photo = data.results?.[0];
    if (!photo?.urls?.raw) return null;
    return photo.urls.raw;
  } catch {
    return null;
  }
}

function buildUnsplashUrl(rawUrl: string, width: number, height: number): string {
  const base = rawUrl.split("?")[0];
  return `${base}?w=${width}&h=${height}&fit=crop&q=80`;
}

function chooseOrientation(
  w: number,
  h: number,
): "landscape" | "portrait" | "squarish" {
  const ratio = w / h;
  if (ratio > 1.3) return "landscape";
  if (ratio < 0.77) return "portrait";
  return "squarish";
}

export interface MaterializeResult {
  content: string;
  replacedCount: number;
  queries: string[];
}

/**
 * Scans generated code for `/placeholder.svg?...&text=DESCRIPTION` patterns
 * and replaces them with real Unsplash photos by searching with the description.
 */
export async function materializeImages(content: string): Promise<MaterializeResult> {
  const accessKey = SECRETS.unsplashAccessKey;
  if (!accessKey || !FEATURES.useUnsplash) {
    debugLog("images", "Image materialization skipped (no Unsplash key)");
    return { content, replacedCount: 0, queries: [] };
  }

  const matches: Array<{
    fullMatch: string;
    text: string;
    width: number;
    height: number;
  }> = [];

  let m: RegExpExecArray | null;
  const re = new RegExp(PLACEHOLDER_FULL_RE.source, "g");
  while ((m = re.exec(content)) !== null) {
    const params = parseParams(m[1]);
    if (!params.text) continue;
    matches.push({
      fullMatch: m[0],
      text: params.text,
      width: parseInt(params.width || "800", 10),
      height: parseInt(params.height || "600", 10),
    });
  }

  if (matches.length === 0) {
    return { content, replacedCount: 0, queries: [] };
  }

  debugLog("images", `Materializing ${matches.length} placeholder images`);

  const seen = new Map<string, string>();
  let replaced = 0;
  const queries: string[] = [];
  let result = content;

  for (const match of matches) {
    const cacheKey = `${match.text}|${match.width}|${match.height}`;
    let url = seen.get(cacheKey);

    if (!url) {
      const orientation = chooseOrientation(match.width, match.height);
      const rawUrl = await searchUnsplash(match.text, accessKey, orientation);
      if (rawUrl) {
        url = buildUnsplashUrl(rawUrl, match.width, match.height);
        seen.set(cacheKey, url);
      }
    }

    if (url) {
      result = result.replace(match.fullMatch, url);
      replaced++;
      queries.push(match.text);
    } else {
      warnLog("images", `No Unsplash result for: ${match.text}`);
    }
  }

  debugLog("images", `Materialized ${replaced}/${matches.length} images`);
  return { content: result, replacedCount: replaced, queries };
}
