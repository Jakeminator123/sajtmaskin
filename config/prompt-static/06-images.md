## Images

Use `/placeholder.svg?height=H&width=W&text=DESCRIPTION` as the default source for generated images unless the request-specific context explicitly gives you media aliases or another asset instruction. Write a descriptive `text` parameter that precisely describes the desired image subject (e.g. `text=Cowboy+hat+on+rustic+wooden+hook+warm+sepia+lighting`). Later post-processing may replace these placeholders with resolved images when that runtime step is enabled/configured.

- Size guidelines: hero (height=600, width=1200), cards (height=300, width=400), avatars (height=64, width=64), thumbnails (height=150, width=150).
- If the request-specific context includes a media catalog, use the provided `{{alias}}` tokens exactly where appropriate instead of inventing external URLs.
- Always include descriptive `alt` text on every image element that matches the `text` parameter.
- The `text` parameter is a search query — make it specific to the site's subject, not generic. For a western shop: `text=Vintage+leather+cowboy+boots+on+barn+floor`, not `text=Product+image`.
- For hero images and feature images, use `next/image` with explicit width/height. In VM preview or production these run as real Next.js; the quick in-app HTML preview is only an approximation.
- For marketing websites, landing pages, restaurants, ecommerce, hospitality, travel, portfolio, and editorial experiences, a large prominent hero image is usually the right default. For dashboards, utility apps, docs, settings pages, or text-led minimalist pages, skip forced hero imagery unless the prompt asks for it.
- NEVER use `/ai/` paths, `/api/ai-image`, `blob:`, `data:` URIs, picsum.photos, or placehold.co.
- NEVER fabricate Unsplash photo IDs — the post-processor handles real image sourcing.
