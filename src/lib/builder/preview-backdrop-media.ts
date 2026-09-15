/**
 * Moving Background 2 — media for the builder preview backdrop.
 *
 * Platform decoration, not customer content: the three files live under a
 * versioned `platform/builder/preview/moving-background-v2/` prefix on the
 * project's public Vercel Blob store — the same store that already serves the
 * kostnadsfri intro film (`src/lib/kostnadsfri/media.ts`). They are never
 * committed: the two encodes are 0.8 MB (webm) and 1.9 MB (mp4). A versioned
 * platform prefix also keeps them outside any user project that a retention
 * job may delete.
 *
 * The URLs below are the exact values the upload returned — Blob appends a
 * random suffix, so they can never be reconstructed from the filename. The
 * upload run fetched each one back publicly without redirects and compared MIME
 * type, byte length and SHA-256 against the source manifest before writing them
 * here; that was a one-off operator step and is not re-checked by any test or
 * CI job. Replacing a URL means re-running that verification by hand.
 *
 * CSP needs no new entry: `src/proxy.ts` already allows
 * `https://*.public.blob.vercel-storage.com` on `media-src` and
 * `*.blob.vercel-storage.com` on `img-src`.
 */

/** Single 35 KB frame from ~2 s in. Renders instantly and is the only layer
 *  that ever loads under `prefers-reduced-motion` or data-saver. */
export const PREVIEW_BACKDROP_POSTER_URL =
  "https://nhrq4gu42kcujmov.public.blob.vercel-storage.com/platform/builder/preview/moving-background-v2/cc422159de45758d-preview-moving-background-v2-poster-tHNij1r9HpgR2sup0w8zDU57MDytNB.webp";

/**
 * 1280×720, 24 fps, 24 s, no audio. VP9 first because it is 60 % smaller;
 * h264 is the Safari fallback. Only one is ever downloaded — the browser picks
 * the first source it can decode.
 */
export const PREVIEW_BACKDROP_VIDEO_SOURCES = [
  {
    src: "https://nhrq4gu42kcujmov.public.blob.vercel-storage.com/platform/builder/preview/moving-background-v2/346e74999476d1a4-preview-moving-background-v2-QtSzZrCj5O2BFn1kfVo0sq3mgyFLQr.webm",
    type: "video/webm",
  },
  {
    src: "https://nhrq4gu42kcujmov.public.blob.vercel-storage.com/platform/builder/preview/moving-background-v2/093bf98c6fc6f87e-preview-moving-background-v2-DBuP6S8h2OTIUKTaHymDvvIetMftPx.mp4",
    type: "video/mp4",
  },
] as const;
