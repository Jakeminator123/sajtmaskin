import type { MediaItem } from "./config";

/**
 * Sample media shown when the Blob store is NOT connected (design preview or
 * missing BLOB_READ_WRITE_TOKEN). `listMedia()` returns this list with
 * `demo: true`, and the gallery mounts a discreet <MediaConfigNotice />.
 *
 * REWRITE TARGET: swap titles/alt texts (and, if the brief supplies real
 * assets, the URLs) so the preview matches the site's domain. Keep the shape.
 * The sample sources are public, licence-free and hot-linkable.
 */
export const seedMedia: MediaItem[] = [
  {
    id: "seed/arbete-1",
    kind: "image",
    url: "https://picsum.photos/seed/sajtmaskin-media-1/1200/800.jpg",
    title: "Exempelbild ett",
    alt: "Exempelbild som visas tills mediabiblioteket är kopplat",
  },
  {
    id: "seed/arbete-2",
    kind: "image",
    url: "https://picsum.photos/seed/sajtmaskin-media-2/1200/800.jpg",
    title: "Exempelbild två",
    alt: "Exempelbild som visas tills mediabiblioteket är kopplat",
  },
  {
    id: "seed/arbete-3",
    kind: "image",
    url: "https://picsum.photos/seed/sajtmaskin-media-3/1200/800.jpg",
    title: "Exempelbild tre",
    alt: "Exempelbild som visas tills mediabiblioteket är kopplat",
  },
  {
    id: "seed/film-1",
    kind: "video",
    url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
    title: "Exempelfilm",
  },
];
