# When to use

Use this dossier when the brief declares the `gallery-lightbox` capability — the site shows a set of images that the user should be able to enlarge.

Best fit:

- A portfolio or creative site showcasing work as a grid of thumbnails.
- A product or interior/real-estate page with photo galleries.
- A restaurant, hotel, or event site with a photo wall.

Do not use it for:

- A single hero image (use a plain image).
- A carousel/slider as the primary layout (use the `carousel` dossier).
- Logos for social proof (use the `logo-cloud` dossier).

# How to integrate

Import the component and pass an `items` array of images. Each item has `src`, `alt`, and an optional `caption`.

```tsx
import { GalleryLightbox } from "@/components/gallery-lightbox";

export default function Section() {
  return (
    <GalleryLightbox
      title="Selected work"
      items={[
        { src: "https://images.unsplash.com/photo-a", alt: "Brand identity for Acme", caption: "Acme — 2025" },
        { src: "https://images.unsplash.com/photo-b", alt: "Packaging design" },
        { src: "https://images.unsplash.com/photo-c", alt: "Web redesign" },
      ]}
    />
  );
}
```

- Thumbnails render in a responsive grid (2 columns on mobile, up to 4 on desktop).
- Clicking a thumbnail opens the lightbox; Escape closes it; arrow keys move between images.
- Every image needs a meaningful `alt` — it is used as the thumbnail label and the dialog title.

# UX rules

- Provide descriptive `alt` text for accessibility; do not leave it empty or generic ("image1").
- Use consistent aspect-ratio source images where possible; thumbnails crop to 4:3 via `object-cover`.
- Keep captions short (a title or year), not paragraphs.
- 6–12 images is a comfortable gallery size; beyond that, paginate or split into albums.

# Avoid

- Do not use `next/image` inside this dossier — it would require the consuming project to allowlist each remote host in `next.config.ts`; the component uses a plain `<img>` on purpose.
- Do not autoplay or auto-advance the lightbox.
- Do not put non-image content (videos, embeds) through this component.
- Do not disable the Escape-to-close or the visible close button.

# Verification

- Click a thumbnail — the lightbox opens centered over a dimmed backdrop and page scrolling is locked.
- Press ArrowRight/ArrowLeft — the image advances and wraps around at the ends.
- Press Escape or click the close button — the lightbox closes and scrolling is restored.
- Tab to a thumbnail and press Enter — it opens (thumbnails are real buttons).
- Inspect: controls use `bg-background`/`text-foreground` and focus rings use `ring-ring`, so it follows the active theme.
