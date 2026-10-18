# When to use

Use for owner media stored in Vercel Blob.

# How to integrate

Mount `<MediaGallery />`; keep server, config, and API core plus the seed fallback.

# Mock/demo mode

`mock: seed`. No real `BLOB_READ_WRITE_TOKEN` (missing, or a stub such as `blob_read_write_token_placeholder_preview_not_real`, or anything not starting with `vercel_blob_rw_`) → `listMedia()` never touches the storage API, `/api/media` answers `200 { ok: true, demo: true, items: seedMedia }`, and the gallery shows sample media plus the discreet notice. A real token → the actual store listing, newest first, `demo: false`, no notice.

# UX rules

- Videos render with `controls`, `playsInline` and `preload="metadata"` — never autoplay with sound.
- Images use a plain `<img loading="lazy">` on purpose (no `next/image` host allowlisting needed for the storage CDN). Set `alt` from the item; the gallery already does.
- Keep the demo notice subtle (small muted banner) — the design preview should still look like the finished site.
- Show the empty state (`emptyText`) when the store is connected but has no files yet; never a blank section.
- Loading uses a skeleton grid; a fetch failure shows a calm "Försök igen" — never a raw error or HTTP status.

# Avoid

Never expose tokens or add an unauthenticated upload route.

# Verification

- Build the site WITHOUT `BLOB_READ_WRITE_TOKEN`: the gallery renders the sample media with the notice, `/api/media` answers 200 with `demo: true`, no crash.
- Set a real `vercel_blob_rw_…` token with at least one image and one video under `media/`: `/api/media` answers `demo: false` with the real items newest first; the notice disappears.
- Confirm a non-media file under `media/` (e.g. a PDF) is skipped, not rendered as a broken tile.
- Confirm there is no route that accepts uploads without authentication.
