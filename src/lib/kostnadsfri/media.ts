/**
 * Kostnadsfri intro film — media sources.
 *
 * The mp4 is 24 MB and lives on the project's public Vercel Blob store, never
 * in git: commit 245cf16b1 replaced `public/video/intro.mp4` with a 2.9 KB
 * placeholder precisely to keep mp4 binaries out of the repository.
 *
 * CSP: the Blob host has its own entry on `media-src` in `src/proxy.ts`. The
 * `blob:` source already listed there is the URL *scheme* and does not cover
 * this domain.
 */

/** Talking-avatar film (1920x1080, h264/aac) explaining the kostnadsfri offer. */
export const KOSTNADSFRI_INTRO_VIDEO_URL =
  "https://nhrq4gu42kcujmov.public.blob.vercel-storage.com/kostnadsfri/intro.mp4";

/**
 * Single 16 KB webp frame lifted from the film itself, so the hero renders
 * instantly instead of waiting for `preload="metadata"`. D-ID's own share-page
 * poster is presigned S3 and expires after an hour — it must not be linked.
 */
export const KOSTNADSFRI_INTRO_POSTER_URL = "/video/kostnadsfri-intro-poster.webp";

/** 216 s. Shown next to the play affordance so nobody starts it blind. */
export const KOSTNADSFRI_INTRO_DURATION_LABEL = "3 min 36 sek";
