import { SECRETS, FEATURES } from "@/lib/config";
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

function chooseOrientation(
  w: number,
  h: number,
): "landscape" | "portrait" | "squarish" {
  const ratio = w / h;
  if (ratio > 1.3) return "landscape";
  if (ratio < 0.77) return "portrait";
  return "squarish";
}

const FILLER_WORDS = new Set([
  "och", "i", "med", "som", "en", "ett", "den", "det", "av", "på", "för",
  "pa", "for",
  "till", "från", "om", "att", "är", "var", "har", "kan", "ska", "vill",
  "the", "a", "an", "of", "in", "with", "and", "for", "on", "at", "from",
  "that", "is", "are", "was", "has", "very", "really", "also", "some",
]);

function normalizeSearchQuery(raw: string, maxWords = 6): string {
  const words = raw
    .replace(/[+_-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !FILLER_WORDS.has(w.toLowerCase()));
  return words.slice(0, maxWords).join(" ");
}

function shortenQuery(normalized: string, maxWords = 3): string {
  return normalized.split(/\s+/).slice(0, maxWords).join(" ");
}

const STYLE_WORDS = new Set([
  "dramatic",
  "dramatiskt",
  "dramatiska",
  "futuristic",
  "futuristisk",
  "futuristiska",
  "cinematic",
  "cinematisk",
  "cinematiska",
  "neon",
  "neonaktiga",
  "intelligent",
  "nyfiket",
  "nyfikna",
  "family",
  "friendly",
  "familjevanlig",
  "familjevänlig",
  "adventure",
  "adventurous",
  "upptackarkansla",
  "upptäckarkänsla",
  "high",
  "contrast",
  "kontrast",
  "future",
  "framtid",
  "framtidskansla",
  "framtidskänsla",
]);

const QUERY_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bzelda\b/giu, "girl"],
  [/\bblanka\b/giu, "girl"],
  [/\b\d+\s*år\b/giu, "child"],
  [/\b\d+\s*ar\b/giu, "child"],
  [/\bapor\b/giu, "monkeys"],
  [/\bapa\b/giu, "monkey"],
  [/\bglad\b/giu, "happy"],
  [/\bstolt\b/giu, "proud"],
  [/\blekfull\b/giu, "playful"],
  [/\bfargstark\b/giu, "colorful"],
  [/\bfärgstark\b/giu, "colorful"],
  [/\bsommarportratt\b/giu, "summer portrait"],
  [/\bsommarporträtt\b/giu, "summer portrait"],
  [/\bportratt\b/giu, "portrait"],
  [/\bporträtt\b/giu, "portrait"],
  [/\bsommarvarme\b/giu, "summer warmth"],
  [/\bsommarvärme\b/giu, "summer warmth"],
  [/\bfamiljekansla\b/giu, "family moment"],
  [/\bfamiljekänsla\b/giu, "family moment"],
  [/\butomhus\b/giu, "outdoor"],
  [/\bskrattar\b/giu, "laughing"],
  [/\bvardagsstund\b/giu, "everyday moment"],
  [/\bnärbild\b/giu, "close up"],
  [/\buttryck\b/giu, "expression"],
  [/\brörelse\b/giu, "movement"],
  [/\brorelse\b/giu, "movement"],
  [/\bfotboll\b/giu, "soccer"],
  [/\bplan\b/giu, "field"],
  [/\bsoligt\b/giu, "sunny"],
  [/\bglatt\b/giu, "joyful"],
  [/\bsommarkvall\b/giu, "summer evening"],
  [/\bsommarkväll\b/giu, "summer evening"],
  [/\bhamn\b/giu, "harbor"],
  [/\bgyllene\b/giu, "golden"],
  [/\bsolnedgang\b/giu, "sunset"],
  [/\bsolnedgång\b/giu, "sunset"],
  [/\bhavet\b/giu, "sea"],
  [/\bvarmt ljus\b/giu, "warm light"],
  [/\bnaturligt ljus\b/giu, "natural light"],
  [/\bvarma farger\b/giu, "warm colors"],
  [/\bvarma färger\b/giu, "warm colors"],
  [/\bpalma\b/giu, "palma mallorca"],
  [/\bnaturmiljö\b/giu, "nature"],
  [/\bnaturlandskap\b/giu, "nature landscape"],
  [/\bmallorca-liknande\b/giu, "mallorca"],
  [/\bmedelhav(?:s)?\b/giu, "mediterranean"],
  [/\bklippmiljö\b/giu, "cliffs"],
  [/\bklippor\b/giu, "cliffs"],
  [/\bgrönska\b/giu, "greenery"],
  [/\bgrönt\b/giu, "green"],
  [/\bgröna\b/giu, "green"],
  [/\bgult\b/giu, "yellow"],
  [/\bgula\b/giu, "yellow"],
  [/\bljusdetaljer\b/giu, "light details"],
  [/\bneonreflexer\b/giu, "neon reflections"],
  [/\bdramatiskt\b/giu, "dramatic"],
  [/\bdramatiska\b/giu, "dramatic"],
  [/\bfamiljevänlig\b/giu, "family friendly"],
  [/\bupptäckarkänsla\b/giu, "adventure"],
  [/\bskymningen\b/giu, "twilight"],
];

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripLeadingProperName(raw: string): string {
  const words = raw.trim().split(/\s+/).filter(Boolean);
  if (words.length < 3) return raw;
  const first = words[0] ?? "";
  if (!/^[A-ZÅÄÖ][A-Za-zÅÄÖåäö-]+$/.test(first)) {
    return raw;
  }
  return words.slice(1).join(" ");
}

function translateSearchQuery(raw: string): string {
  let translated = raw.toLowerCase();
  for (const [pattern, replacement] of QUERY_REPLACEMENTS) {
    translated = translated.replace(pattern, replacement);
  }
  return normalizeWhitespace(translated);
}

function stripStyleWords(raw: string, maxWords = 6): string {
  const words = raw
    .split(/\s+/)
    .filter((word) => word.length > 0 && !STYLE_WORDS.has(word.toLowerCase()));
  return words.slice(0, maxWords).join(" ");
}

function buildBroadFallbackQuery(raw: string): string | null {
  const words = raw.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;

  const hasMonkey = words.some((word) =>
    ["monkey", "monkeys", "ape", "apes", "primate", "primates"].includes(word),
  );
  const hasPortrait = words.some((word) =>
    ["portrait", "close", "closeup", "face", "expression"].includes(word),
  );
  const hasNature = words.some((word) =>
    [
      "nature",
      "landscape",
      "cliffs",
      "coast",
      "coastline",
      "greenery",
      "forest",
      "jungle",
      "outdoor",
      "mediterranean",
    ].includes(word),
  );
  const hasAction = words.some((word) =>
    ["movement", "action", "running", "jumping", "motion"].includes(word),
  );
  const hasGirl = words.some((word) =>
    ["girl", "child", "kid", "young"].includes(word),
  );
  const hasSoccer = words.some((word) =>
    ["soccer", "football", "field", "goal"].includes(word),
  );
  const hasPiano = words.some((word) =>
    ["piano", "music", "musician"].includes(word),
  );
  const hasSunset = words.some((word) =>
    ["sunset", "golden", "harbor", "sea", "summer", "evening"].includes(word),
  );
  const hasMallorca = words.includes("mallorca") || words.includes("majorca") || words.includes("palma");

  if (hasMonkey && hasPortrait) return "monkey portrait";
  if (hasMonkey && hasAction) return "monkey in nature";
  if (hasMonkey && hasNature && hasMallorca) return "monkey mediterranean nature";
  if (hasMonkey && hasNature) return "monkey in nature";
  if (hasMonkey) return "monkey";
  if (hasGirl && hasSoccer) return "girl playing soccer";
  if (hasGirl && hasPortrait) return "happy child portrait";
  if (hasGirl && hasAction) return "playful child outdoors";
  if (hasPiano && words.includes("warm")) return "piano warm light";
  if (hasPiano) return "piano music";
  if (hasMallorca && hasSunset) return "mallorca sunset";
  if (hasMallorca && hasNature) return "mallorca coast nature";
  if (hasSunset && (hasNature || hasMallorca)) return "mediterranean sunset";
  if (hasNature) return "nature landscape";

  const singleWordFallbacks: Record<string, string> = {
    model: "fashion model", streetwear: "streetwear fashion",
    studio: "photo studio", chrome: "chrome texture", neon: "neon lights",
    portrait: "portrait photography", team: "business team",
    office: "modern office", food: "food photography", coffee: "coffee shop",
    restaurant: "restaurant interior", hotel: "luxury hotel",
    spa: "spa wellness", gym: "fitness gym", yoga: "yoga practice",
    wedding: "wedding ceremony", party: "celebration event",
    car: "luxury car", bike: "motorcycle", tech: "technology",
    code: "programming code", startup: "startup office",
    design: "graphic design", art: "modern art", music: "live music",
    city: "city skyline", beach: "tropical beach", mountain: "mountain landscape",
    forest: "forest nature", garden: "botanical garden",
  };

  for (const word of words) {
    if (singleWordFallbacks[word]) return singleWordFallbacks[word];
  }

  return words.slice(0, 2).join(" ");
}

function buildSearchCandidates(raw: string): string[] {
  const nameStrippedRaw = stripLeadingProperName(raw);
  const normalized = normalizeSearchQuery(raw);
  const normalizedNameStripped =
    nameStrippedRaw !== raw ? normalizeSearchQuery(nameStrippedRaw, 8) : "";
  const translated = normalizeSearchQuery(translateSearchQuery(raw), 8);
  const translatedNameStripped =
    nameStrippedRaw !== raw ? normalizeSearchQuery(translateSearchQuery(nameStrippedRaw), 8) : "";
  const strippedTranslated = stripStyleWords(translated);
  const strippedTranslatedNameStripped = stripStyleWords(translatedNameStripped);
  const broadFallback = buildBroadFallbackQuery(
    strippedTranslatedNameStripped ||
      strippedTranslated ||
      translatedNameStripped ||
      translated ||
      normalizedNameStripped ||
      normalized,
  );

  return [
    translatedNameStripped,
    strippedTranslatedNameStripped,
    translated,
    strippedTranslated,
    normalizedNameStripped,
    normalized,
    translatedNameStripped ? shortenQuery(translatedNameStripped, 4) : "",
    translated ? shortenQuery(translated, 4) : "",
    normalizedNameStripped ? shortenQuery(normalizedNameStripped, 4) : "",
    normalized ? shortenQuery(normalized, 4) : "",
    broadFallback ?? "",
  ]
    .map((candidate) => normalizeWhitespace(candidate))
    .filter(Boolean)
    .filter((candidate, index, arr) => arr.indexOf(candidate) === index);
}

export interface MaterializeResult {
  content: string;
  replacedCount: number;
  queries: string[];
  /** URLs that were freshly resolved from Unsplash -- safe to skip HEAD-check. */
  resolvedUrls: Set<string>;
}

/**
 * Scans generated code for `/placeholder.svg?...&text=DESCRIPTION` patterns
 * and replaces them with real Unsplash photos by searching with the description.
 */
export async function materializeImages(content: string): Promise<MaterializeResult> {
  const accessKey = SECRETS.unsplashAccessKey;
  if (!accessKey || !FEATURES.useUnsplash) {
    debugLog("images", "Image materialization skipped (no Unsplash key)");
    return { content, replacedCount: 0, queries: [], resolvedUrls: new Set() };
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
    return { content, replacedCount: 0, queries: [], resolvedUrls: new Set() };
  }

  debugLog("images", `Materializing ${matches.length} placeholder images`);

  const seen = new Map<string, string>();
  let replaced = 0;
  const queries: string[] = [];
  let result = content;

  for (const match of matches) {
    const cacheKey = `${match.text}|${match.width}|${match.height}`;
    let url = seen.get(cacheKey);
    let queryUsed = match.text;

    if (!url) {
      const orientation = chooseOrientation(match.width, match.height);
      const candidates = buildSearchCandidates(match.text);
      for (const candidate of candidates) {
        const hit = await searchUnsplash(candidate, accessKey, orientation);
        if (!hit) continue;
        url = buildUnsplashUrl(hit.rawUrl, match.width, match.height);
        queryUsed = candidate;
        seen.set(cacheKey, url);
        if (hit.downloadLocation) {
          trackUnsplashDownload(hit.downloadLocation, accessKey);
        }
        break;
      }
    }

    if (url) {
      result = result.replace(match.fullMatch, url);
      replaced++;
      queries.push(queryUsed);
    } else {
      warnLog("images", "No Unsplash result", {
        originalQuery: match.text,
        attemptedQueries: buildSearchCandidates(match.text),
      });
    }
  }

  debugLog("images", `Materialized ${replaced}/${matches.length} images`);
  return { content: result, replacedCount: replaced, queries, resolvedUrls: new Set(seen.values()) };
}
