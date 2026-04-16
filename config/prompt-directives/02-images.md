# Images
<!-- directive: images -->
<!-- cascade: explicit > indicated > inferred > default -->

## Placeholder Format

Use `/placeholder.svg?height=H&width=W&text=DESCRIPTION` as the default source for generated images unless the request-specific context explicitly gives you media aliases or another asset instruction. Write a descriptive `text` parameter that precisely describes the desired image subject (e.g. `text=Cowboy+hat+on+rustic+wooden+hook+warm+sepia+lighting`). Later post-processing may replace these placeholders with resolved images when that runtime step is enabled/configured.

## Size Guidelines
<!-- default: standard-sizes -->
- Hero: height=600, width=1200
- Cards: height=300, width=400
- Avatars: height=64, width=64
- Thumbnails: height=150, width=150

## Media Catalog (MANDATORY when present)

When the request-specific context includes a **Media Catalog**, follow these rules WITHOUT EXCEPTION:

1. **USE EVERY `{{alias}}` TOKEN AT LEAST ONCE.** Each alias represents a real image the user uploaded or scraped. Every one MUST appear in the generated code as an `src` value.
2. **NEVER use Unsplash, placeholder, or stock images for any slot where a user image fits.** User images are ALWAYS preferred.
3. **Place user images where they logically belong:**
   - **Logo** (`brand-logo`): header/navbar AND footer
   - **Product photos**: product cards, hero sections, feature grids
   - **Site media / scraped images**: hero backgrounds, about sections, gallery, content areas
4. **Use the exact `{{ALIAS}}` token syntax** (e.g., `{{USER_IMG_1}}`). Post-processing expands these to real URLs.
5. **If you have more user images than obvious slots, create additional sections** (gallery grid, image banner) to use them all.

When no media catalog is present, use `/placeholder.svg` as described above.

### General image rules
- Always include descriptive `alt` text on every image element.
- The `text` parameter is a search query — make it specific to the site's subject, not generic. For a western shop: `text=Vintage+leather+cowboy+boots+on+barn+floor`, not `text=Product+image`.
- For hero images and feature images, use `next/image` with explicit width/height.

## Hero Strategy
<!-- default: context-dependent -->
- For marketing websites, landing pages, restaurants, ecommerce, hospitality, travel, portfolio, and editorial experiences, a large prominent hero image is usually the right default.
- For dashboards, utility apps, docs, settings pages, or text-led minimalist pages, skip forced hero imagery unless the prompt asks for it.

## Image Density
<!-- default: standard -->
- Images in hero + at least 2 additional sections.
- Consistent aspect ratios and professional cropping throughout.

## Forbidden Patterns

- NEVER use `/ai/` paths, `/api/ai-image`, `blob:`, `data:` URIs, picsum.photos, or placehold.co.
- NEVER fabricate Unsplash photo IDs — the post-processor handles real image sourcing.
