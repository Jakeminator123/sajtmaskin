# When to use

- Use when the brief declares the `cms` capability — the site's content (pages, posts, marketing copy, portfolio entries, reusable sections) should be editable in Sanity without code changes.
- Best for blogs, editorial sites, portfolios, marketing sites, and content-backed landing pages.
- Use when editors need draft preview / Sanity Presentation Tool / Visual Editing on top of an existing frontend.
- This dossier is CMS plumbing only: env config, a lazy client factory, a query helper, and draft-mode routes. It assumes Sanity Studio and the content schemas live elsewhere (a separate Studio app), and it never ships example schemas or demo content.

# How to integrate

1. Install `next-sanity` and `server-only`.
2. Add the Sanity env vars: `NEXT_PUBLIC_SANITY_PROJECT_ID` and `NEXT_PUBLIC_SANITY_DATASET` (required for any read), plus `SANITY_API_READ_TOKEN` (server-only, required for draft preview / private datasets) and the optional `NEXT_PUBLIC_SANITY_API_VERSION` / `NEXT_PUBLIC_SANITY_STUDIO_URL`.
3. Emit the helpers under `lib/sanity/*` and import them via `@/lib/sanity/*`. Do NOT use the upstream `@/sanity/lib/*` layout.
4. Read published content from server components / route handlers / metadata + sitemap loaders with `sanityFetch({ query, params })`. It queries the public CDN client (no token).
5. SEED FALLBACK CONTRACT (required, mock: seed): every page/section that shows Sanity content must branch on `isSanityConfigured()` from `@/lib/sanity/api` (placeholder-aware — preview stubs count as NOT configured). Configured → query via `sanityFetch()`. Not configured → render `seedContent` from `@/lib/sanity/seed-content` and mount a discreet `<SanityConfigNotice />` from `@/components/sanity-config-notice` near that section. Rewrite `seedContent` to mirror the app's real document types (same shape as the GROQ results). The site must render fully without any Sanity env vars — never crash and never surface a raw error.
6. For draft preview, mount the `/api/draft-mode/enable` and `/api/draft-mode/disable` routes and point the Sanity Presentation Tool `previewMode.enable` at `/api/draft-mode/enable`. Use `sanityFetch({ query, perspective: "drafts" })` only inside `draftMode().isEnabled` branches; gate it on `isSanityDraftTokenConfigured()`.
7. Add `<VisualEditing />` (from `next-sanity`) conditionally inside the host app's EXISTING root layout — render it only when `(await draftMode()).isEnabled` is true. Do NOT let this dossier own, replace, or introduce a root `app/layout.tsx`; the host scaffold owns layout, navigation, and fonts.

# UX rules

- Normal visitors must see published content only; draft/unpublished content appears only after draft mode is enabled.
- Keep preview controls invisible in public browsing sessions.
- Missing CMS documents should render a 404, empty state, or fallback — not crash the UI.
- When `seedContent` is shown because the CMS is unconfigured, the notice must be subtle (small muted banner) so the design preview still looks like the finished site.
- Give editors a clear way to leave preview mode (link to `/api/draft-mode/disable`).
- Use a correct per-environment Studio URL so edit-intent links open the right Studio.

# Avoid

- Do not put `SANITY_API_READ_TOKEN` in a `NEXT_PUBLIC_*` variable, and never import `@/lib/sanity/token` or `@/lib/sanity/client` from a client component — both are `server-only`.
- Do not construct a Sanity client at module scope; always go through `getSanityClient()` / `getDraftSanityClient()` after the `isSanityConfigured()` guard.
- Do not attach the read token to the public client — published reads use the CDN client without a token; only the draft client carries the token.
- Do not let this dossier replace the site's root layout, navigation, fonts, or page structure, and do not add a root `app/layout.tsx`.
- Do not ship template demo pages, branded layouts, sample schemas, or unrelated routes.
- Do not use a floating API version such as `new Date()`; keep the pinned date.
- Do not skip the `isSanityConfigured()` branch: an unconfigured CMS must show `seedContent`, not a crash or raw error.
- Do not keep the generic seed articles if they do not match the app — `seed-content.ts` is a rewrite target.

# Verification

- Start the app WITHOUT any Sanity env vars (or with F2 preview stubs): Sanity-backed pages must render `seedContent` with the config notice, and `/api/draft-mode/enable` must answer 503 — no crash, no raw error.
- Set `NEXT_PUBLIC_SANITY_PROJECT_ID` + `NEXT_PUBLIC_SANITY_DATASET` and confirm a server-side `sanityFetch(...)` returns published content with no token exposed in the browser bundle.
- Set `SANITY_API_READ_TOKEN`, open the configured Presentation Tool preview URL, and confirm draft mode enables and draft content appears only in draft mode.
- Visit `/api/draft-mode/disable` and confirm the app returns to published content.
- Confirm `<VisualEditing />` renders only while draft mode is enabled.
- If using cached queries, add a secret-protected webhook and verify `revalidateTag('sanity')` after publishing.
