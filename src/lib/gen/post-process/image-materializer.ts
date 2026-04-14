import { SECRETS, FEATURES } from "@/lib/config";
import {
  buildUnsplashSearchCandidates,
  chooseUnsplashOrientation,
} from "@/lib/images/unsplash-query-fallback";
import { debugLog, warnLog } from "@/lib/utils/debug";

const _PLACEHOLDER_RE =
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

interface UnsplashSearchHit {
  rawUrl: string;
  downloadLocation: string | null;
}

async function searchUnsplash(
  query: string,
  accessKey: string,
  orientation: "landscape" | "portrait" | "squarish" = "landscape",
): Promise<UnsplashSearchHit | null> {
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
    const data = (await res.json()) as {
      results?: Array<{
        urls: { raw: string };
        alt_description: string | null;
        links?: { download_location?: string };
      }>;
    };
    const photo = data.results?.[0];
    if (!photo?.urls?.raw) return null;
    return {
      rawUrl: photo.urls.raw,
      downloadLocation: photo.links?.download_location ?? null,
    };
  } catch {
    return null;
  }
}

function trackUnsplashDownload(downloadLocation: string, accessKey: string): void {
  fetch(downloadLocation, {
    headers: {
      Authorization: `Client-ID ${accessKey}`,
      "Accept-Version": "v1",
    },
  }).catch(() => {});
}

function buildUnsplashUrl(rawUrl: string, width: number, height: number): string {
  const base = rawUrl.split("?")[0];
  return `${base}?w=${width}&h=${height}&fit=crop&q=80`;
}

const FALLBACK_PHOTOS: Record<"landscape" | "portrait" | "squarish", string> = {
  landscape: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4",
  portrait: "https://images.unsplash.com/photo-1469474968028-56623f02e42e",
  squarish: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05",
};

function buildFallbackImageUrl(width: number, height: number): string {
  const orientation = chooseOrientation(width, height);
  return `${FALLBACK_PHOTOS[orientation]}?w=${width}&h=${height}&fit=crop&q=80`;
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

function sanitizeQuery(raw: string): string {
  return raw
    .replace(/\$\{[^}]*\}/g, "")
    .replace(/`/g, "")
    .replace(/encodeURIComponent/gi, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[{}[\]<>;=]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const MIN_QUERY_WORD_CHARS = 3;

function isViableImageQuery(query: string): boolean {
  const wordChars = query.replace(/[^a-zA-Z0-9\u00C0-\u024F]/g, "");
  return wordChars.length >= MIN_QUERY_WORD_CHARS;
}

export interface MaterializeResult {
  content: string;
  replacedCount: number;
  skippedCount: number;
  queries: string[];
  /** URLs that were freshly resolved from Unsplash -- safe to skip HEAD-check. */
  resolvedUrls: Set<string>;
}

export interface MaterializeImagesOptions {
  maxReplacements?: number;
}

export const DEFAULT_IMAGE_MATERIALIZATION_LIMIT = 3;
export const IMAGE_MATERIALIZATION_CONCURRENCY = 2;

type ImageResolution = {
  url: string;
  queryUsed: string;
};

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const limit = Math.max(1, Math.floor(concurrency));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= items.length) return;
      results[current] = await worker(items[current]!, current);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => runWorker()),
  );
  return results;
}

/**
 * Scans generated code for `/placeholder.svg?...&text=DESCRIPTION` patterns
 * and replaces them with real Unsplash photos by searching with the description.
 */
export async function materializeImages(
  content: string,
  options: MaterializeImagesOptions = {},
): Promise<MaterializeResult> {
  const accessKey = SECRETS.unsplashAccessKey;
  if (!accessKey || !FEATURES.useUnsplash) {
    warnLog("images", "Image materialization skipped — UNSPLASH_ACCESS_KEY not configured. Placeholder images will remain.");
    return { content, replacedCount: 0, skippedCount: 0, queries: [], resolvedUrls: new Set() };
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
    const rawText = sanitizeQuery(params.text ?? "");
    if (!rawText || !isViableImageQuery(rawText)) continue;
    matches.push({
      fullMatch: m[0],
      text: rawText,
      width: parseInt(params.width || "800", 10),
      height: parseInt(params.height || "600", 10),
    });
  }

  if (matches.length === 0) {
    return { content, replacedCount: 0, skippedCount: 0, queries: [], resolvedUrls: new Set() };
  }

  const maxReplacements = Math.max(
    0,
    Math.floor(options.maxReplacements ?? DEFAULT_IMAGE_MATERIALIZATION_LIMIT),
  );
  const selectedMatches = maxReplacements > 0 ? matches.slice(0, maxReplacements) : [];
  const skippedCount = Math.max(0, matches.length - selectedMatches.length);

  debugLog(
    "images",
    `Materializing ${selectedMatches.length}/${matches.length} placeholder images`,
  );

  const seen = new Map<string, ImageResolution>();
  const uniqueMatches: Array<{
    cacheKey: string;
    match: (typeof selectedMatches)[number];
  }> = [];
  const uniqueKeys = new Set<string>();
  for (const match of selectedMatches) {
    const cacheKey = `${match.text}|${match.width}|${match.height}`;
    if (uniqueKeys.has(cacheKey)) continue;
    uniqueKeys.add(cacheKey);
    uniqueMatches.push({ cacheKey, match });
  }

  await mapWithConcurrency(
    uniqueMatches,
    IMAGE_MATERIALIZATION_CONCURRENCY,
    async ({ cacheKey, match }) => {
      let resolution = seen.get(cacheKey);
      if (resolution) return resolution;

      const orientation = chooseUnsplashOrientation(match.width, match.height);
      const candidates = buildUnsplashSearchCandidates(match.text);
      for (const candidate of candidates) {
        const hit = await searchUnsplash(candidate, accessKey, orientation);
        if (!hit) continue;
        resolution = {
          url: buildUnsplashUrl(hit.rawUrl, match.width, match.height),
          queryUsed: candidate,
        };
        seen.set(cacheKey, resolution);
        if (hit.downloadLocation) {
          trackUnsplashDownload(hit.downloadLocation, accessKey);
        }
        return resolution;
      }

      resolution = {
        url: buildFallbackImageUrl(match.width, match.height),
        queryUsed: match.text,
      };
      seen.set(cacheKey, resolution);
      warnLog("images", "Unsplash miss, using fallback", {
        originalQuery: match.text,
        fallbackUrl: resolution.url,
      });
      return resolution;
    },
  );

  let replaced = 0;
  const queries: string[] = [];
  let result = content;
  const appliedKeys = new Set<string>();

  for (const match of selectedMatches) {
    const cacheKey = `${match.text}|${match.width}|${match.height}`;
    const resolution = seen.get(cacheKey);
    if (!resolution) continue;

    result = result.replace(match.fullMatch, resolution.url);
    replaced++;
    queries.push(appliedKeys.has(cacheKey) ? match.text : resolution.queryUsed);
    appliedKeys.add(cacheKey);
  }

  debugLog(
    "images",
    `Materialized ${replaced}/${matches.length} images` +
      (skippedCount > 0 ? ` (skipped ${skippedCount})` : ""),
  );
  return {
    content: result,
    replacedCount: replaced,
    skippedCount,
    queries,
    resolvedUrls: new Set(Array.from(seen.values(), (resolution) => resolution.url)),
  };
}
