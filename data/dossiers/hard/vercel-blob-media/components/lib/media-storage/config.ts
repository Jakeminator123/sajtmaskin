/**
 * Shared (server + client safe) contract for the media library backed by
 * Vercel Blob. No SDK import here — this module only knows the env-gate and
 * the item shape, so client components can import the type without pulling
 * `@vercel/blob` into the browser bundle.
 */

export type MediaKind = "image" | "video";

export interface MediaItem {
  /** Stable id (blob pathname, or the seed id in demo mode). */
  id: string;
  kind: MediaKind;
  /** Public URL served by the storage CDN (or the seed sample URL). */
  url: string;
  /** Short human title derived from the filename or seed entry. */
  title: string;
  /** Alt text for images; ignored for videos. */
  alt?: string;
  /** Optional poster frame for videos. */
  posterUrl?: string;
}

/** Folder inside the Blob store that the gallery reads. Keep files under it. */
export const MEDIA_PREFIX = "media/";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "m4v"]);

/**
 * F2/preview injects a stub token (e.g. `blob_read_write_token_placeholder_preview_not_real`);
 * Vercel rejects it, so any placeholder-marked value counts as NOT configured.
 * Mirrors the stub vocabulary used by the other hard dossiers.
 */
export function isPlaceholderValue(value: string | undefined | null): boolean {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return true;
  return /placeholder|not[_-]?a?[_-]?real|dummy|changeme|^your[_-]/i.test(trimmed);
}

/**
 * True when a REAL Blob read/write token is configured. Real tokens are issued
 * as `vercel_blob_rw_<store>_<secret>`; anything else (missing, preview stub,
 * wrong prefix) keeps the site in seed/demo mode so it never crashes.
 */
export function isMediaStorageConfigured(): boolean {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (isPlaceholderValue(token)) return false;
  return typeof token === "string" && token.trim().startsWith("vercel_blob_rw_");
}

/** Classify a pathname/URL by extension; `null` for anything that is not media. */
export function mediaKindFromPath(pathname: string): MediaKind | null {
  const clean = pathname.split("?")[0].split("#")[0];
  const ext = clean.slice(clean.lastIndexOf(".") + 1).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  return null;
}

/** "media/vara-arbeten/kok-2024.jpg" → "Kok 2024" — a readable default title. */
export function titleFromPath(pathname: string): string {
  const file = pathname.split("/").pop() ?? pathname;
  const base = file.replace(/\.[a-z0-9]+$/i, "");
  // Vercel Blob appends a random suffix ("-a1B2c3D4") when addRandomSuffix is on.
  const withoutSuffix = base.replace(/-[A-Za-z0-9]{8,}$/, "");
  const words = withoutSuffix.replace(/[-_]+/g, " ").trim();
  if (!words) return "Media";
  return words.charAt(0).toUpperCase() + words.slice(1);
}
