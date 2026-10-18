# When to use

Use when the Vercel dashboard is the requested analytics surface.

# How to integrate

Mount `<AnalyticsProviders />` once in the root layout.

# UX rules

- Do not surface analytics presence in the UI. Tracking should be invisible to the user.
- Respect Do Not Track / `prefers-reduced-data` if the brief calls for strict privacy. If so, swap to a self-hosted analytics dossier instead — Vercel Analytics does not honour DNT.
- For the cookie banner question: Vercel Analytics is **cookieless** by design, so EU consent banners are not required for it alone. (If the site later adds a tracker that does need consent, gate this component behind the same consent flag for consistency.)

# Avoid

Do not mount multiple copies or claim owner-visible in-site statistics.

# Verification

- Build the site locally with `npm run build` and confirm no errors from `@vercel/analytics` / `@vercel/speed-insights`.
- Deploy to a Vercel preview and visit a page — the Network tab shows a request to `/_vercel/insights/view` (or similar).
- Wait ~30 seconds and refresh the project's Vercel Analytics dashboard — the page view appears.
- In the browser console, no errors mentioning Vercel Analytics should appear in either dev or production.
