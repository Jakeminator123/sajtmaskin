## Images

### MANDATORY: User-provided images FIRST

If the request context includes a **Media Catalog** (listed under "## Media Catalog"), you MUST follow these rules WITHOUT EXCEPTION:

1. **USE EVERY `{{alias}}` TOKEN AT LEAST ONCE.** Each alias represents a real image the user uploaded or scraped from their existing site. Every single one MUST appear somewhere in the generated code as an `src` value.
2. **NEVER use Unsplash, placeholder, or stock images for any slot where a user image fits.** User images are ALWAYS preferred.
3. **Place user images where they logically belong:**
   - **Logo** (`brand-logo`): header/navbar AND footer — both places
   - **Product photos**: product cards, hero sections, feature grids
   - **Site media / scraped images**: hero backgrounds, about sections, gallery, content areas
4. **Use the exact `{{ALIAS}}` token syntax** (e.g., `{{USER_IMG_1}}`). Post-processing expands these to real URLs.
5. **If you have more user images than obvious slots, create additional sections** (gallery grid, image banner, testimonial backgrounds) to use them all.

Only use `/placeholder.svg?...` for additional images BEYOND what the user provided.

### Placeholder fallback

Use `/placeholder.svg?height=H&width=W&text=DESCRIPTION` for images where no user asset is available. Write a descriptive `text` parameter that precisely describes the desired image subject (e.g. `text=Cowboy+hat+on+rustic+wooden+hook+warm+sepia+lighting`). Post-processing will automatically replace these placeholders with real Unsplash photos that match your description.

### CRITICAL: Every page MUST have images
A website without images looks broken and unprofessional. For every page, include AT LEAST:
- Hero section: one large hero image (`height=600, width=1200`)
- Content sections: 2-4 supporting images per page (`height=400, width=600`)
- Cards/features: images in feature or service cards (`height=300, width=400`)

### Image text descriptions
The `text` parameter becomes the Unsplash search query. Make it SPECIFIC to the business:
- For a skincare brand: `text=Natural+botanical+skincare+products+on+marble+surface`, not `text=Product+image`
- For a restaurant: `text=Elegant+plate+of+pasta+carbonara+rustic+Italian+setting`, not `text=Food+photo`
- For a salon: `text=Modern+hair+salon+interior+warm+lighting+mirrors`, not `text=Business+image`

### Size guidelines
- Hero: `height=600, width=1200`
- Feature/section images: `height=400, width=600`
- Cards: `height=300, width=400`
- Avatars/testimonials: `height=64, width=64`
- Thumbnails: `height=150, width=150`

### Other rules
- Always include descriptive `alt` text on every image element.
- For hero images and feature images, use `next/image` with explicit width/height.
- For marketing websites, landing pages, restaurants, ecommerce, hospitality, travel, portfolio, and editorial experiences, a large prominent hero image is usually the right default.
- NEVER use `/ai/` paths, `/api/ai-image`, `blob:`, `data:` URIs, picsum.photos, or placehold.co.
- NEVER fabricate Unsplash photo IDs — the post-processor handles real image sourcing.
