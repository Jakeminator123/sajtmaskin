import {
  buildUnsplashSearchCandidates,
  inferUnsplashOrientationFromUrl,
} from "@/lib/images/unsplash-query-fallback";
import { debugLog } from "@/lib/utils/debug";

/**
 * Image URL Validator
 * ═══════════════════════════════════════════════════════════════
 *
 * Validates image URLs in generated files and finds replacements
 * for broken/hallucinated URLs (e.g., non-existent Unsplash photos).
 *
 * Used by:
 * - POST /api/engine/chats/[chatId]/validate-images (auto-fix)
 * - runPostGenerationChecks (reporting)
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface TextFile {
  name: string;
  content: string;
}

export interface ImageRef {
  url: string;
  alt: string;
  file: string;
}

export interface BrokenImage {
  url: string;
  alt: string;
  file: string;
  status: number | "error";
  replacementUrl: string | null;
}

export interface ImageValidationResult {
  total: number;
  broken: BrokenImage[];
  replacedCount: number;
  files: TextFile[];
  warnings: string[];
}

export const KNOWN_IMAGE_REPLACEMENTS_SNAPSHOT_KEY = "knownBrokenImageReplacements";

export type KnownImageReplacementMap = Record<string, string>;

function isPersistableImageReplacementUrl(url: string): boolean {
  if (!url || url.length > 2_000) return false;
  if (url.startsWith("/api/placeholder")) return true;
  return isExternalImageUrl(url);
}

export function coerceKnownImageReplacementMap(input: unknown): KnownImageReplacementMap {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: KnownImageReplacementMap = {};
  for (const [deadUrl, replacementUrl] of Object.entries(input)) {
    if (!isExternalImageUrl(deadUrl) || typeof replacementUrl !== "string") continue;
    if (!isPersistableImageReplacementUrl(replacementUrl)) continue;
    out[deadUrl] = replacementUrl;
  }
  return out;
}

export function buildKnownImageReplacementMap(
  broken: BrokenImage[],
): KnownImageReplacementMap {
  const out: KnownImageReplacementMap = {};
  for (const entry of broken) {
    if (!entry.replacementUrl || entry.replacementUrl === entry.url) continue;
    if (!isExternalImageUrl(entry.url)) continue;
    if (!isPersistableImageReplacementUrl(entry.replacementUrl)) continue;
    out[entry.url] = entry.replacementUrl;
  }
  return out;
}

const TOPIC_SPECIFIC_IMAGE_KEYWORDS = [
  "jul",
  "christmas",
  "holiday",
  "festive",
  "vinter",
  "winter",
  "gran",
  "granar",
  "tree",
  "trees",
  "julmarknad",
  "market",
  "tyskland",
  "germany",
  "forest",
  "skog",
  "snow",
  "dekor",
  "ornament",
] as const;

function hasTopicSpecificAltText(alt: string): boolean {
  const lower = alt.toLowerCase();
  return TOPIC_SPECIFIC_IMAGE_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function findSemanticImageWarnings(refs: ImageRef[]): string[] {
  const warnings: string[] = [];
  for (const ref of refs) {
    if (!isUnsplashUrl(ref.url)) continue;
    if (!ref.alt || !hasTopicSpecificAltText(ref.alt)) continue;
    warnings.push(
      `[semantic-image] Kontrollera att bilden verkligen matchar motivet i ${ref.file}: "${ref.alt}" använder extern Unsplash-bild som kan vara semantiskt fel trots giltig URL.`,
    );
  }

  const altCounts = new Map<string, number>();
  for (const ref of refs) {
    const norm = ref.alt.toLowerCase().trim();
    if (norm.length < 10) continue;
    altCounts.set(norm, (altCounts.get(norm) ?? 0) + 1);
  }
  for (const [alt, count] of altCounts) {
    if (count > 1) {
      warnings.push(
        `[duplicate_alt] Alt-text "${alt}" repeats ${count} times — gallery items should be unique`,
      );
    }
  }

  return warnings;
}

// ═══════════════════════════════════════════════════════════════
// URL EXTRACTION
// ═══════════════════════════════════════════════════════════════

const IMG_SRC_RE =
  /<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["'][^>]*?\balt\s*=\s*["']([^"']*)["']|<img\b[^>]*?\balt\s*=\s*["']([^"']*)["'][^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi;

const NEXT_IMAGE_RE =
  /<Image\b[^>]*?\bsrc\s*=\s*["'{]+"?([^"'}]+)["'}]+[^>]*?\balt\s*=\s*["']([^"']*)["']|<Image\b[^>]*?\balt\s*=\s*["']([^"']*)["'][^>]*?\bsrc\s*=\s*["'{]+"?([^"'}]+)["'}]+/gi;

// Intentionally case-sensitive: CSS uses `url(...)`, while generated TS/JS metadata
// often contains `new URL("https://...")`, which should not be treated as an image ref.
const BG_IMAGE_RE = /url\(\s*["']?(https?:\/\/[^"')]+)["']?\s*\)/g;

function isExternalImageUrl(url: string): boolean {
  if (!url || url.startsWith("data:") || url.startsWith("/") || url.startsWith(".")) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") return false;
    if (host.includes(".blob.vercel-storage.com")) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract all external image URLs with their alt text context from files.
 */
export function extractImageRefs(files: TextFile[]): ImageRef[] {
  const refs: ImageRef[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    const { name, content } = file;

    // <img src="..." alt="..."> (both orderings)
    for (const re of [IMG_SRC_RE, NEXT_IMAGE_RE]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(content)) !== null) {
        const url = m[1] || m[4] || "";
        const alt = m[2] || m[3] || "";
        if (isExternalImageUrl(url) && !seen.has(url)) {
          seen.add(url);
          refs.push({ url, alt, file: name });
        }
      }
    }

    // CSS url() — no alt text available, derive from context
    BG_IMAGE_RE.lastIndex = 0;
    let bgMatch: RegExpExecArray | null;
    while ((bgMatch = BG_IMAGE_RE.exec(content)) !== null) {
      const url = bgMatch[1];
      if (isExternalImageUrl(url) && !seen.has(url)) {
        seen.add(url);
        refs.push({ url, alt: "", file: name });
      }
    }
  }

  return refs;
}

// ═══════════════════════════════════════════════════════════════
// URL VALIDATION (server-side HEAD check)
// ═══════════════════════════════════════════════════════════════

const HEAD_TIMEOUT_MS = 3_000;
const GET_FALLBACK_TIMEOUT_MS = 5_000;
const HEAD_RETRY_COUNT = 1;
const MAX_CONCURRENT_CHECKS = 6;

async function fetchStatusOnce(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<number | "error"> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    // Avbryt body-streamen direkt så vi inte buffrar hela svaret i minne
    // när servern ignorerar Range-headern på GET-fallback (vissa CDN gör det
    // och returnerar full bild på 200KB-2MB istället för 1KB). Vi behöver
    // bara status-koden.
    try {
      await res.body?.cancel();
    } catch {
      // ignore — vi har redan vad vi behöver
    }
    return res.status;
  } catch {
    return "error";
  } finally {
    clearTimeout(timer);
  }
}

async function headCheckOnce(url: string): Promise<number | "error"> {
  const headStatus = await fetchStatusOnce(
    url,
    {
      method: "HEAD",
      redirect: "follow",
      headers: { "User-Agent": "sajtmaskin/1.0 image-check" },
    },
    HEAD_TIMEOUT_MS,
  );

  if (headStatus === 405 || headStatus === 501) {
    return fetchStatusOnce(
      url,
      {
        method: "GET",
        redirect: "follow",
        headers: {
          "User-Agent": "sajtmaskin/1.0 image-check",
          Range: "bytes=0-1023",
        },
      },
      GET_FALLBACK_TIMEOUT_MS,
    );
  }

  return headStatus;
}

function buildPlaceholderReplacementUrl(alt: string): string {
  const label = alt.trim() || "Missing image";
  return `/api/placeholder?w=1200&h=800&label=${encodeURIComponent(label)}`;
}

async function headCheck(url: string): Promise<number | "error"> {
  let result = await headCheckOnce(url);
  if (result === "error" || (typeof result === "number" && result >= 500)) {
    for (let attempt = 0; attempt < HEAD_RETRY_COUNT; attempt++) {
      await new Promise((r) => setTimeout(r, 800));
      result = await headCheckOnce(url);
      if (typeof result === "number" && result >= 200 && result < 400) break;
    }
  }
  if (result === "error" || (typeof result === "number" && result >= 400)) {
    console.warn(`[image-validator] Broken image: ${url} (status: ${result})`);
  }
  return result;
}

/**
 * Check which image URLs are broken (non-2xx status).
 * Runs checks in parallel with a concurrency limit.
 * @param skipUrls URLs known to be valid (e.g. freshly materialized from Unsplash)
 */
async function findBrokenImages(
  refs: ImageRef[],
  skipUrls?: Set<string>,
): Promise<BrokenImage[]> {
  const refsToCheck = skipUrls?.size
    ? refs.filter((ref) => !skipUrls.has(ref.url))
    : refs;

  const broken: BrokenImage[] = [];

  // Fast-path: source.unsplash.com is permanently dead (shut down mid-2024).
  // No HEAD round-trip — mark as 410 Gone and let findReplacements rewrite
  // them via the Unsplash search API.
  const headRefs: ImageRef[] = [];
  for (const ref of refsToCheck) {
    if (isDeadUnsplashSourceUrl(ref.url)) {
      broken.push({
        url: ref.url,
        alt: ref.alt,
        file: ref.file,
        status: 410,
        replacementUrl: null,
      });
    } else {
      headRefs.push(ref);
    }
  }

  const batches: ImageRef[][] = [];

  for (let i = 0; i < headRefs.length; i += MAX_CONCURRENT_CHECKS) {
    batches.push(headRefs.slice(i, i + MAX_CONCURRENT_CHECKS));
  }

  for (const batch of batches) {
    const results = await Promise.all(
      batch.map(async (ref) => {
        const status = await headCheck(ref.url);
        return { ref, status };
      }),
    );
    for (const { ref, status } of results) {
      const ok = typeof status === "number" && status >= 200 && status < 400;
      if (!ok) {
        broken.push({
          url: ref.url,
          alt: ref.alt,
          file: ref.file,
          status,
          replacementUrl: null,
        });
      }
    }
  }

  return broken;
}

// ═══════════════════════════════════════════════════════════════
// UNSPLASH REPLACEMENT
// ═══════════════════════════════════════════════════════════════

function isUnsplashUrl(url: string): boolean {
  try {
    return new URL(url).hostname === "images.unsplash.com";
  } catch {
    return false;
  }
}

/**
 * source.unsplash.com was Unsplash's "random photo" CDN — fully shut down
 * mid-2024. URLs return 502/connection-error and never recover. We detect
 * them up-front so they get the Unsplash-replacement codepath even when
 * a HEAD check would have already failed (HEAD is slow and the 410 is
 * a known-dead signal).
 *
 * See SAJ-18 / handoff A3.
 */
function isDeadUnsplashSourceUrl(url: string): boolean {
  try {
    return new URL(url).hostname === "source.unsplash.com";
  } catch {
    return false;
  }
}

function preserveUnsplashParams(originalUrl: string, newPhotoPath: string): string {
  try {
    const orig = new URL(originalUrl);
    const params = new URLSearchParams();
    for (const key of ["w", "h", "fit", "crop", "q"]) {
      const val = orig.searchParams.get(key);
      if (val) params.set(key, val);
    }
    const qs = params.toString();
    return `https://images.unsplash.com/${newPhotoPath}${qs ? `?${qs}` : ""}`;
  } catch {
    return `https://images.unsplash.com/${newPhotoPath}?w=400&h=300&fit=crop`;
  }
}

interface UnsplashSearchResult {
  id: string;
  urls: { raw: string };
  alt_description: string | null;
}

/**
 * Search Unsplash API for a replacement image based on alt text.
 * Returns the photo path segment (e.g., "photo-xxx") or null.
 */
async function searchUnsplashReplacement(
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
        signal: AbortSignal.timeout(6_000),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: UnsplashSearchResult[] };
    const photo = data.results?.[0];
    if (!photo?.urls?.raw) return null;
    // Extract photo path: "https://images.unsplash.com/photo-xxx?ixid=..." → "photo-xxx"
    const rawUrl = new URL(photo.urls.raw);
    return rawUrl.pathname.replace(/^\//, "");
  } catch {
    return null;
  }
}

/**
 * Attempt to find Unsplash replacements for broken images.
 * Only replaces broken Unsplash URLs (not other hosts).
 */
async function findReplacements(
  broken: BrokenImage[],
  unsplashAccessKey: string | null,
): Promise<BrokenImage[]> {
  if (!unsplashAccessKey) return broken;

  const updated = [...broken];
  for (const entry of updated) {
    // Replace both live-but-broken images.unsplash.com and the dead
    // source.unsplash.com domain (SAJ-18 / A3).
    if (!isUnsplashUrl(entry.url) && !isDeadUnsplashSourceUrl(entry.url)) continue;
    const orientation = inferUnsplashOrientationFromUrl(entry.url);
    const candidates = buildUnsplashSearchCandidates(entry.alt || "nature landscape");
    for (const query of candidates) {
      const photoPath = await searchUnsplashReplacement(query, unsplashAccessKey, orientation);
      if (!photoPath) continue;
      entry.replacementUrl = preserveUnsplashParams(entry.url, photoPath);
      break;
    }
  }
  return updated;
}

// ═══════════════════════════════════════════════════════════════
// APPLY REPLACEMENTS
// ═══════════════════════════════════════════════════════════════

/**
 * Replace broken image URLs in file contents with their replacements.
 * Returns updated files and count of replacements made.
 */
function applyReplacements(
  files: TextFile[],
  broken: BrokenImage[],
): { files: TextFile[]; replacedCount: number } {
  const replacements = broken
    .map((entry) => {
      const isPlaceholder = !entry.replacementUrl;
      return {
        ...entry,
        replacementUrl: entry.replacementUrl ?? buildPlaceholderReplacementUrl(entry.alt),
        isPlaceholder,
      };
    })
    .filter((entry): entry is BrokenImage & { replacementUrl: string; isPlaceholder: boolean } =>
      Boolean(entry.replacementUrl),
    );
  if (replacements.length === 0) return { files, replacedCount: 0 };

  // Sort longest URL first to prevent shorter URLs from corrupting longer ones
  // e.g., "photo-abc" must not match inside "photo-abc?w=400"
  const sorted = [...replacements].sort((a, b) => b.url.length - a.url.length);

  let replacedCount = 0;
  const emittedPlaceholderTelemetry = new Set<string>();
  const updatedFiles = files.map((f) => {
    let content = f.content;
    for (const entry of sorted) {
      const parts = content.split(entry.url);
      const occurrences = parts.length - 1;
      if (occurrences > 0) {
        content = parts.join(entry.replacementUrl);
        replacedCount += occurrences;
        if (entry.isPlaceholder && !emittedPlaceholderTelemetry.has(entry.url)) {
          debugLog("images", "image_replaced_with_placeholder", {
            originalUrl: entry.url,
            alt: entry.alt,
          });
          emittedPlaceholderTelemetry.add(entry.url);
        }
      }
    }
    return { ...f, content };
  });

  return { files: updatedFiles, replacedCount };
}

function sortedKnownImageReplacements(replacements: KnownImageReplacementMap) {
  return Object.entries(coerceKnownImageReplacementMap(replacements))
    .map(([deadUrl, replacementUrl]) => ({ deadUrl, replacementUrl }))
    .filter((entry) => entry.deadUrl !== entry.replacementUrl)
    .sort((a, b) => b.deadUrl.length - a.deadUrl.length);
}

export function applyKnownImageReplacementsToContent(
  content: string,
  replacements: KnownImageReplacementMap,
): { content: string; replacedCount: number } {
  const sorted = sortedKnownImageReplacements(replacements);
  if (sorted.length === 0 || !content) return { content, replacedCount: 0 };

  let nextContent = content;
  let replacedCount = 0;
  for (const entry of sorted) {
    const parts = nextContent.split(entry.deadUrl);
    const occurrences = parts.length - 1;
    if (occurrences === 0) continue;
    nextContent = parts.join(entry.replacementUrl);
    replacedCount += occurrences;
  }
  return { content: nextContent, replacedCount };
}

export function applyKnownImageReplacementsToFiles<T extends { content: string }>(
  files: T[],
  replacements: KnownImageReplacementMap,
): { files: T[]; replacedCount: number } {
  const sorted = sortedKnownImageReplacements(replacements);
  if (sorted.length === 0 || files.length === 0) return { files, replacedCount: 0 };

  let replacedCount = 0;
  const updatedFiles = files.map((file) => {
    let content = file.content;
    for (const entry of sorted) {
      const parts = content.split(entry.deadUrl);
      const occurrences = parts.length - 1;
      if (occurrences === 0) continue;
      content = parts.join(entry.replacementUrl);
      replacedCount += occurrences;
    }
    return content === file.content ? file : { ...file, content };
  });

  return { files: updatedFiles, replacedCount };
}

// ═══════════════════════════════════════════════════════════════
// FULL VALIDATION PIPELINE
// ═══════════════════════════════════════════════════════════════

/**
 * Full image validation: extract → check → replace → apply.
 */
export async function validateImages(params: {
  files: TextFile[];
  autoFix: boolean;
  unsplashAccessKey: string | null;
  /** URLs known to be valid (freshly resolved by materializer). Skipped in HEAD checks. */
  skipUrls?: Set<string>;
}): Promise<ImageValidationResult> {
  const { files, autoFix, unsplashAccessKey, skipUrls } = params;
  const warnings: string[] = [];

  const refs = extractImageRefs(files);
  if (refs.length === 0) {
    return { total: 0, broken: [], replacedCount: 0, files, warnings };
  }

  warnings.push(...findSemanticImageWarnings(refs));

  let broken = await findBrokenImages(refs, skipUrls);
  if (broken.length === 0) {
    return { total: refs.length, broken: [], replacedCount: 0, files, warnings };
  }

  // Try to find replacements for broken Unsplash URLs
  broken = await findReplacements(broken, unsplashAccessKey);

  const unreplaceable = broken.filter((b) => !b.replacementUrl);
  for (const entry of unreplaceable) {
    warnings.push(
      `Trasig bild i ${entry.file}: ${entry.alt || entry.url} (${entry.status})`,
    );
  }

  if (!autoFix) {
    return { total: refs.length, broken, replacedCount: 0, files, warnings };
  }

  const { files: updatedFiles, replacedCount } = applyReplacements(files, broken);

  if (replacedCount > 0) {
    warnings.push(
      `Ersatte ${replacedCount} trasig(a) bild-URL:er med tillgängliga ersättningar.`,
    );
  }

  return {
    total: refs.length,
    broken,
    replacedCount,
    files: updatedFiles,
    warnings,
  };
}
