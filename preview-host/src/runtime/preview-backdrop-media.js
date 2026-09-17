"use strict";

/**
 * Moving Background 2 — same three public Blob URLs as
 * `src/lib/builder/preview-backdrop-media.ts` (PR #1387).
 *
 * preview-host's Docker/build context copies only this package (`src/` + a
 * couple of scripts). It cannot import the app module. Keep the strings
 * identical; `src/lib/builder/preview-backdrop-media.parity.test.ts` compares
 * them. Do not upload a second copy of the files.
 */

const PREVIEW_BACKDROP_POSTER_URL =
  "https://nhrq4gu42kcujmov.public.blob.vercel-storage.com/platform/builder/preview/moving-background-v2/cc422159de45758d-preview-moving-background-v2-poster-tHNij1r9HpgR2sup0w8zDU57MDytNB.webp";

const PREVIEW_BACKDROP_VIDEO_SOURCES = Object.freeze([
  Object.freeze({
    src: "https://nhrq4gu42kcujmov.public.blob.vercel-storage.com/platform/builder/preview/moving-background-v2/346e74999476d1a4-preview-moving-background-v2-QtSzZrCj5O2BFn1kfVo0sq3mgyFLQr.webm",
    type: "video/webm",
  }),
  Object.freeze({
    src: "https://nhrq4gu42kcujmov.public.blob.vercel-storage.com/platform/builder/preview/moving-background-v2/093bf98c6fc6f87e-preview-moving-background-v2-DBuP6S8h2OTIUKTaHymDvvIetMftPx.mp4",
    type: "video/mp4",
  }),
]);

module.exports = {
  PREVIEW_BACKDROP_POSTER_URL,
  PREVIEW_BACKDROP_VIDEO_SOURCES,
};
