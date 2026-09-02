import "server-only";

import { list, put } from "@vercel/blob";

import {
    MEDIA_PREFIX,
    isMediaStorageConfigured,
    mediaKindFromPath,
    titleFromPath,
    type MediaItem,
} from "./config";
import { seedMedia } from "./seed-media";

export interface ListMediaOptions {
  /** Sub-folder under `media/` (e.g. "vara-arbeten/"). Defaults to the whole library. */
  folder?: string;
  /** Max items to return (1–200). Defaults to 60. */
  limit?: number;
}

export interface ListMediaResult {
  items: MediaItem[];
  /** True when the seed list was returned because no real token is configured. */
  demo: boolean;
}

function normalizeFolder(folder: string | undefined): string {
  if (!folder) return "";
  const clean = folder.replace(/^\/+/, "").replace(/\/+$/, "");
  return clean ? `${clean}/` : "";
}

/**
 * SEED FALLBACK CONTRACT (`mock: seed`): with no real BLOB_READ_WRITE_TOKEN the
 * function resolves to the shipped `seedMedia` and `demo: true` — it never
 * throws and never calls the storage API. Pages must render the result either
 * way and mount <MediaConfigNotice /> when `demo` is true.
 */
export async function listMedia(options: ListMediaOptions = {}): Promise<ListMediaResult> {
  if (!isMediaStorageConfigured()) {
    return { items: seedMedia, demo: true };
  }
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 60), 1), 200);
  const prefix = `${MEDIA_PREFIX}${normalizeFolder(options.folder)}`;
  const result = await list({ prefix, limit });
  const items: MediaItem[] = [];
  for (const blob of result.blobs) {
    const kind = mediaKindFromPath(blob.pathname);
    if (!kind) continue;
    items.push({
      id: blob.pathname,
      kind,
      url: blob.url,
      title: titleFromPath(blob.pathname),
      alt: kind === "image" ? titleFromPath(blob.pathname) : undefined,
    });
  }
  // Newest first so a freshly added file shows up at the top of the gallery.
  const uploadedAt = new Map(result.blobs.map((blob) => [blob.pathname, blob.uploadedAt.getTime()]));
  items.sort((a, b) => (uploadedAt.get(b.id) ?? 0) - (uploadedAt.get(a.id) ?? 0));
  return { items, demo: false };
}

export interface UploadMediaOptions {
  /** Original filename incl. extension; used for the title and kind. */
  filename: string;
  /** MIME type when known (e.g. "video/mp4"). */
  contentType?: string;
  /** Sub-folder under `media/`. */
  folder?: string;
}

export class MediaStorageNotConfiguredError extends Error {
  constructor() {
    super("Media storage is not configured (missing or placeholder BLOB_READ_WRITE_TOKEN).");
    this.name = "MediaStorageNotConfiguredError";
  }
}

/**
 * Store a file in the media library. SERVER-ONLY and must be called ONLY from
 * code that has already verified the caller is the site owner (an
 * authenticated admin route). Never expose an unauthenticated upload route —
 * anyone could fill the store. Throws {@link MediaStorageNotConfiguredError}
 * when no real token is configured so callers can answer 503.
 */
export async function uploadMedia(
  file: Blob | ArrayBuffer | Buffer | ReadableStream | string,
  options: UploadMediaOptions,
): Promise<MediaItem> {
  if (!isMediaStorageConfigured()) {
    throw new MediaStorageNotConfiguredError();
  }
  const safeName = options.filename
    .split(/[\\/]/)
    .pop()!
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const kind = mediaKindFromPath(safeName);
  if (!kind) {
    throw new Error("Unsupported media type — only common image and video formats are accepted.");
  }
  const pathname = `${MEDIA_PREFIX}${normalizeFolder(options.folder)}${safeName}`;
  const blob = await put(pathname, file, {
    access: "public",
    addRandomSuffix: true,
    contentType: options.contentType,
  });
  return {
    id: blob.pathname,
    kind,
    url: blob.url,
    title: titleFromPath(blob.pathname),
    alt: kind === "image" ? titleFromPath(blob.pathname) : undefined,
  };
}
