# When to use

Use this dossier when the brief declares the `media-storage` capability — the site should show the owner's OWN heavy media (MP4/WebM video, large photo collections, before/after galleries, product shots) served from hosted storage instead of files committed to the repo.

Best fit:

- A "Våra arbeten" / portfolio gallery for a tradesperson, photographer, salon or restaurant.
- A presentation or hero video the owner recorded themselves.
- Product or event photo sets that will grow over time.

Do not use it for:

- Embedding YouTube/Vimeo videos or Instagram feeds — that is an ordinary `<iframe>`/embed in page content, no storage needed.
- A handful of static images that ship with the design — put them under `public/` or use the brief's image URLs.
- Visitor uploads (user-generated content). The dossier ships no public upload route and must not be turned into one.
- A click-to-enlarge image viewer on its own — that is `gallery-lightbox`; the two can be combined by feeding `MediaGallery` items into a lightbox.

# How to integrate

1. Emit the dossier files to their project outputs (source → output):
   - `components/lib/media-storage/config.ts` → `lib/media-storage/config.ts`
   - `components/lib/media-storage/seed-media.ts` → `lib/media-storage/seed-media.ts`
   - `components/lib/media-storage/server.ts` → `lib/media-storage/server.ts`
   - `components/api/media/route.ts` → `app/api/media/route.ts`
   - `components/media-config-notice.tsx` → `components/media-config-notice.tsx`
   - `components/media-gallery.tsx` → `components/media-gallery.tsx`
2. Mount `<MediaGallery />` once per gallery surface (a section on the start page or its own page, e.g. `app/galleri/page.tsx`). Props: `folder` (sub-folder under `media/`), `columns` (2–4), `emptyText`, `className`. The component fetches `/api/media` itself.
3. Rewrite `seed-media.ts` titles/alt texts for the site's domain so the design preview looks real. Keep the item shape and keep at least one video entry.
4. SEED FALLBACK CONTRACT (`mock: seed`): `listMedia()` returns `seedMedia` with `demo: true` whenever `isMediaStorageConfigured()` is false (missing token OR a preview placeholder). `MediaGallery` renders the demo list and mounts `<MediaConfigNotice />` above it. Server Components that call `listMedia()` directly must do the same: render the items either way and show the notice when `demo` is true.
5. Files live in the Blob store under `media/` (optionally `media/<folder>/`). The owner adds files once the store is attached (F3 step); nothing in the site code needs to change when new files appear.
6. `uploadMedia()` exists for a FUTURE owner-authenticated admin route. Call it only from server code that has already verified the caller (an `auth` dossier session). It throws `MediaStorageNotConfiguredError` in demo mode — answer 503 there.

# Mock/demo mode

`mock: seed`. No real `BLOB_READ_WRITE_TOKEN` (missing, or a stub such as `blob_read_write_token_placeholder_preview_not_real`, or anything not starting with `vercel_blob_rw_`) → `listMedia()` never touches the storage API, `/api/media` answers `200 { ok: true, demo: true, items: seedMedia }`, and the gallery shows sample media plus the discreet notice. A real token → the actual store listing, newest first, `demo: false`, no notice.

# UX rules

- Videos render with `controls`, `playsInline` and `preload="metadata"` — never autoplay with sound.
- Images use a plain `<img loading="lazy">` on purpose (no `next/image` host allowlisting needed for the storage CDN). Set `alt` from the item; the gallery already does.
- Keep the demo notice subtle (small muted banner) — the design preview should still look like the finished site.
- Show the empty state (`emptyText`) when the store is connected but has no files yet; never a blank section.
- Loading uses a skeleton grid; a fetch failure shows a calm "Försök igen" — never a raw error or HTTP status.

# Avoid

- Do not paraphrase `lib/media-storage/server.ts`, `lib/media-storage/config.ts` or `app/api/media/route.ts` — the env-gate, the `media/` prefix and the seed fallback must stay byte-exact.
- Do not add a POST/upload handler to `/api/media` or any other unauthenticated route. An open upload endpoint lets anyone fill the owner's store.
- Do not import `@vercel/blob` or `@/lib/media-storage/server` in client components — read through `/api/media` (or pass items from a Server Component).
- Do not commit MP4s or large images to `public/` as a substitute — the point of the dossier is to keep heavy files out of the repo.
- Do not expose `BLOB_READ_WRITE_TOKEN` to the browser.

# Verification

- Build the site WITHOUT `BLOB_READ_WRITE_TOKEN`: the gallery renders the sample media with the notice, `/api/media` answers 200 with `demo: true`, no crash.
- Set a real `vercel_blob_rw_…` token with at least one image and one video under `media/`: `/api/media` answers `demo: false` with the real items newest first; the notice disappears.
- Confirm a non-media file under `media/` (e.g. a PDF) is skipped, not rendered as a broken tile.
- Confirm there is no route that accepts uploads without authentication.
