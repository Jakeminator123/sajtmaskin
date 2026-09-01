const PHOTO_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DOWNLOAD_PATH_RE = /^\/photos\/[A-Za-z0-9_-]+\/download\/?$/;

/**
 * Unsplash download tracking must hit `api.unsplash.com` only.
 * Caller-supplied `downloadLocation` is otherwise an SSRF + API-key leak.
 */
export function resolveUnsplashDownloadUrl(input: {
  downloadLocation?: unknown;
  photoId?: unknown;
}): string | null {
  if (typeof input.downloadLocation === "string" && input.downloadLocation.trim()) {
    try {
      const url = new URL(input.downloadLocation);
      if (url.protocol !== "https:") return null;
      if (url.hostname !== "api.unsplash.com") return null;
      if (!DOWNLOAD_PATH_RE.test(url.pathname)) return null;
      return url.toString();
    } catch {
      return null;
    }
  }

  if (typeof input.photoId === "string" && PHOTO_ID_RE.test(input.photoId)) {
    return `https://api.unsplash.com/photos/${input.photoId}/download`;
  }

  return null;
}
