/**
 * Image URL Validator
 * ═══════════════════════════════════════════════════════════════
 *
 * Validates image URLs in generated files and finds replacements
 * for broken/hallucinated URLs (e.g., non-existent Unsplash photos).
 *
 * Used by:
 * - POST /api/v0/chats/[chatId]/validate-images (auto-fix)
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

// ═══════════════════════════════════════════════════════════════
// URL EXTRACTION
// ═══════════════════════════════════════════════════════════════

const IMG_SRC_RE =
  /<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["'][^>]*?\balt\s*=\s*["']([^"']*)["']|<img\b[^>]*?\balt\s*=\s*["']([^"']*)["'][^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi;

const NEXT_IMAGE_RE =
  /<Image\b[^>]*?\bsrc\s*=\s*["'{]+"?([^"'}]+)["'}]+[^>]*?\balt\s*=\s*["']([^"']*)["']|<Image\b[^>]*?\balt\s*=\s*["']([^"']*)["'][^>]*?\bsrc\s*=\s*["'{]+"?([^"'}]+)["'}]+/gi;

const BG_IMAGE_RE = /url\(\s*["']?(https?:\/\/[^"')]+)["']?\s*\)/gi;

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

const HEAD_TIMEOUT_MS = 5_000;
const MAX_CONCURRENT_CHECKS = 6;

async function headCheck(url: string): Promise<number | "error"> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEAD_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "sajtmaskin/1.0 image-check" },
    });
    return res.status;
  } catch {
    return "error";
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Check which image URLs are broken (non-2xx status).
 * Runs checks in parallel with a concurrency limit.
 */
export async function findBrokenImages(
  refs: ImageRef[],
): Promise<BrokenImage[]> {
  const broken: BrokenImage[] = [];
  const batches: ImageRef[][] = [];

  for (let i = 0; i < refs.length; i += MAX_CONCURRENT_CHECKS) {
    batches.push(refs.slice(i, i + MAX_CONCURRENT_CHECKS));
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
): Promise<string | null> {
  if (!query.trim() || !accessKey) return null;
  try {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
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
export async function findReplacements(
  broken: BrokenImage[],
  unsplashAccessKey: string | null,
): Promise<BrokenImage[]> {
  if (!unsplashAccessKey) return broken;

  const updated = [...broken];
  for (const entry of updated) {
    if (!isUnsplashUrl(entry.url)) continue;
    const query = entry.alt || "nature landscape";
    const photoPath = await searchUnsplashReplacement(query, unsplashAccessKey);
    if (photoPath) {
      entry.replacementUrl = preserveUnsplashParams(entry.url, photoPath);
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
export function applyReplacements(
  files: TextFile[],
  broken: BrokenImage[],
): { files: TextFile[]; replacedCount: number } {
  const replacements = broken.filter((b) => b.replacementUrl);
  if (replacements.length === 0) return { files, replacedCount: 0 };

  // Sort longest URL first to prevent shorter URLs from corrupting longer ones
  // e.g., "photo-abc" must not match inside "photo-abc?w=400"
  const sorted = [...replacements].sort((a, b) => b.url.length - a.url.length);

  let replacedCount = 0;
  const updatedFiles = files.map((f) => {
    let content = f.content;
    for (const entry of sorted) {
      if (entry.replacementUrl) {
        const parts = content.split(entry.url);
        const occurrences = parts.length - 1;
        if (occurrences > 0) {
          content = parts.join(entry.replacementUrl);
          replacedCount += occurrences;
        }
      }
    }
    return { ...f, content };
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
}): Promise<ImageValidationResult> {
  const { files, autoFix, unsplashAccessKey } = params;
  const warnings: string[] = [];

  const refs = extractImageRefs(files);
  if (refs.length === 0) {
    return { total: 0, broken: [], replacedCount: 0, files, warnings };
  }

  let broken = await findBrokenImages(refs);
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
      `Ersatte ${replacedCount} trasig(a) bild-URL:er med Unsplash-alternativ.`,
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
