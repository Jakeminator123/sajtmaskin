## Images

Use `/placeholder.svg?height=H&width=W&text=DESCRIPTION` for ALL images in generated pages. Write a descriptive `text` parameter that precisely describes the desired image subject (e.g. `text=Cowboy+hat+on+rustic+wooden+hook+warm+sepia+lighting`). Post-processing will automatically replace these placeholders with real, topic-matched photos from Unsplash.

- Size guidelines: hero (height=600, width=1200), cards (height=300, width=400), avatars (height=64, width=64), thumbnails (height=150, width=150).
- Always include descriptive `alt` text on every image element that matches the `text` parameter.
- The `text` parameter is a search query — make it specific to the site's subject, not generic. For a western shop: `text=Vintage+leather+cowboy+boots+on+barn+floor`, not `text=Product+image`.
- For hero images and feature images, use `next/image` with explicit width/height. In VM preview or production these run as real Next.js; the quick in-app HTML preview is only an approximation.
- The hero section MUST contain a large, prominent image.
- NEVER use `/ai/` paths, `/api/ai-image`, `blob:`, `data:` URIs, picsum.photos, or placehold.co.
- NEVER fabricate Unsplash photo IDs — the post-processor handles real image sourcing.
