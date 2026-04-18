/**
 * Stock media providers — server-side fallback for when the user hasn't
 * uploaded enough of their own images/videos in the wizard.
 *
 * Scope: pure fetch helpers. No LLM context, no mediaCatalog assembly.
 * The call-site (create-chat-stream-post) decides when to invoke these and
 * how many assets to request, then merges them into the mediaCatalog under
 * STOCK_IMG_ / STOCK_VID_ aliases.
 *
 * Attribution: every returned StockAsset carries the rights holder + source
 * link. The generation system prompt surfaces the credit via
 * MediaCatalogItem.credit (see system-prompt.ts).
 */

import { FEATURES, SECRETS } from "@/lib/config";
import { debugLog, warnLog } from "@/lib/utils/debug";

export interface StockCredit {
  name: string;
  profileUrl?: string;
  sourceUrl?: string;
  provider: "Unsplash" | "Pexels";
}

export interface StockAsset {
  kind: "image" | "video";
  url: string;
  alt: string;
  width: number;
  height: number;
  credit: StockCredit;
}

export type StockImagePurpose = "hero-image" | "about-image" | "gallery-image" | "product-photo";

export interface StockQuery {
  /** Short English query, e.g. "organic skincare product flatlay" */
  query: string;
  /** Unsplash supports landscape/portrait/squarish. */
  orientation?: "landscape" | "portrait" | "squarish";
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; assets: StockAsset[] }>();

function cacheKey(provider: string, q: StockQuery, count: number): string {
  return `${provider}|${q.query}|${q.orientation ?? "landscape"}|${count}`;
}

// ── Unsplash (images) ────────────────────────────────────────────────────

interface UnsplashPhoto {
  urls: { regular: string };
  width: number;
  height: number;
  alt_description: string | null;
  description: string | null;
  user: { name: string; links: { html: string } };
  links: { html: string };
}

export async function fetchStockImages(q: StockQuery, count: number): Promise<StockAsset[]> {
  if (!FEATURES.useUnsplash || count <= 0) return [];

  const key = cacheKey("unsplash", q, count);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.assets;

  const orientation = q.orientation ?? "landscape";
  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q.query)}&per_page=${count}&orientation=${orientation}`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Client-ID ${SECRETS.unsplashAccessKey}`,
        "Accept-Version": "v1",
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      warnLog("stock-providers", `Unsplash ${res.status} for "${q.query}"`);
      return [];
    }
    const data = (await res.json()) as { results?: UnsplashPhoto[] };
    const assets: StockAsset[] = (data.results ?? []).slice(0, count).map((photo) => ({
      kind: "image" as const,
      url: photo.urls.regular,
      alt: photo.alt_description ?? photo.description ?? q.query,
      width: photo.width,
      height: photo.height,
      credit: {
        name: photo.user.name,
        profileUrl: photo.user.links.html,
        sourceUrl: photo.links.html,
        provider: "Unsplash",
      },
    }));
    cache.set(key, { at: Date.now(), assets });
    debugLog("stock-providers", `Unsplash "${q.query}" → ${assets.length} asset(s)`);
    return assets;
  } catch (err) {
    warnLog("stock-providers", `Unsplash fetch failed for "${q.query}"`, { err: String(err) });
    return [];
  }
}

// ── Pexels (videos) ──────────────────────────────────────────────────────

interface PexelsVideoFile {
  link: string;
  width: number;
  height: number;
}

interface PexelsVideo {
  width: number;
  height: number;
  url: string;
  user: { name: string; url: string };
  video_files: PexelsVideoFile[];
}

export async function fetchStockVideos(q: StockQuery, count: number): Promise<StockAsset[]> {
  // Pexels is gated behind the existing ENABLE_PEXELS flag + API key.
  if (!FEATURES.usePexels || count <= 0) return [];

  const key = cacheKey("pexels", q, count);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.assets;

  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(q.query)}&per_page=${count}&orientation=landscape`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: SECRETS.pexelsApiKey },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      warnLog("stock-providers", `Pexels ${res.status} for "${q.query}"`);
      return [];
    }
    const data = (await res.json()) as { videos?: PexelsVideo[] };
    const assets: StockAsset[] = [];
    for (const v of (data.videos ?? []).slice(0, count)) {
      const best = [...v.video_files]
        .filter((f) => f.link.endsWith(".mp4"))
        .sort((a, b) => Math.abs(1920 - a.width) - Math.abs(1920 - b.width))[0];
      if (!best) continue;
      assets.push({
        kind: "video",
        url: best.link,
        alt: q.query,
        width: best.width,
        height: best.height,
        credit: {
          name: v.user.name,
          profileUrl: v.user.url,
          sourceUrl: v.url,
          provider: "Pexels",
        },
      });
    }
    cache.set(key, { at: Date.now(), assets });
    debugLog("stock-providers", `Pexels "${q.query}" → ${assets.length} asset(s)`);
    return assets;
  } catch (err) {
    warnLog("stock-providers", `Pexels fetch failed for "${q.query}"`, { err: String(err) });
    return [];
  }
}

// ── Query builder ────────────────────────────────────────────────────────

const CATEGORY_BASE_QUERY: Record<string, string> = {
  ecommerce: "product photography minimal",
  restaurant: "restaurant interior food plating",
  cafe: "coffee shop latte art",
  salon: "spa wellness treatment",
  fitness: "gym workout training",
  healthcare: "medical clinic healthcare",
  portfolio: "creative workspace designer",
  photo: "photography studio camera",
  music: "music studio recording",
  hotel: "boutique hotel room",
  travel: "travel destination landscape",
  construction: "construction worker team",
  auto: "modern car workshop",
  education: "classroom learning students",
  event: "event venue stage",
  legal: "law office professional",
  accounting: "modern office desk",
  realestate: "modern architecture home",
  nonprofit: "community volunteers helping",
  consulting: "business meeting team",
  tech: "startup team technology",
  blog: "minimal desk reading",
  landing: "minimal workspace clean",
  other: "modern workspace professional",
};

const STOP_WORDS = new Set([
  "vi", "och", "som", "med", "för", "till", "men", "har", "att", "det", "den", "dem", "oss", "våra", "vår",
  "the", "and", "with", "for", "our", "your", "from", "this", "that", "are", "was", "were", "have", "has",
  "about", "also", "more", "very", "just", "like", "than", "then", "them", "into",
]);

export function buildStockImageQueries(input: {
  categoryId?: string | null;
  industry?: string | null;
  offer?: string | null;
  purposes: StockImagePurpose[];
}): Array<{ purpose: StockImagePurpose; query: StockQuery }> {
  const base =
    CATEGORY_BASE_QUERY[(input.categoryId ?? "").toLowerCase()] ??
    CATEGORY_BASE_QUERY[(input.industry ?? "").toLowerCase()] ??
    CATEGORY_BASE_QUERY.other;

  const offerTokens = (input.offer ?? "")
    .toLowerCase()
    .replace(/[^a-zåäö0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w))
    .slice(0, 2);
  const extra = offerTokens.length ? ` ${offerTokens.join(" ")}` : "";

  const perPurpose: Record<StockImagePurpose, string> = {
    "hero-image": `${base}${extra} hero banner`,
    "about-image": `${base}${extra} team portrait`,
    "gallery-image": `${base}${extra} detail`,
    "product-photo": `${base}${extra} product`,
  };

  return input.purposes.map((purpose) => ({
    purpose,
    query: {
      query: perPurpose[purpose].trim().replace(/\s+/g, " "),
      orientation: "landscape",
    },
  }));
}
