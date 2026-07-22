# When to use

- The brief declares the `site-search` capability — visitors should be able to SEARCH the site's own content: pages, products, articles, FAQ entries, menu items.
- Zero backend and zero keys: the MiniSearch index is built in the browser from the items you pass in, so search is fully live in F2 preview and in production.

Do not use it for:

- A cmd+k command palette for app navigation/actions — that is the `command-palette` capability.
- Chat-style questions answered from documents — that is `rag-chat`.
- Huge datasets (thousands of records) or server-side filtering — that needs an external search provider (future hard sibling under this capability).

# How to integrate

1. Emit the verbatim `components/site-search.tsx` exactly as provided (its keyboard/ARIA combobox machinery is load-bearing).
2. Add `minisearch` to `package.json` dependencies.
3. Mount `SiteSearch` (header, hero or a dedicated section) and pass REAL site content as items — every searchable page/product the site actually has:

```tsx
import { SiteSearch } from "@/components/site-search";

<SiteSearch
  label="Sök på sajten"
  items={[
    { id: "/", title: "Start", description: "Startsidan", href: "/" },
    { id: "/meny", title: "Meny", description: "Vår meny med priser", href: "/meny", keywords: ["mat", "priser", "lunch"] },
    { id: "/kontakt", title: "Kontakt", description: "Öppettider och adress", href: "/kontakt", keywords: ["öppettider", "adress", "telefon"] },
  ]}
/>
```

- Derive `items` from the routes/content you are actually generating — never invent links that do not exist on the site.
- Use `keywords` for synonyms and Swedish inflections so fuzzy matching hits common phrasings.
- Keep the item list in a small data module (e.g. `lib/search-items.ts`) if several pages mount the search.

# UX rules

- Results appear from 2 typed characters; keep titles short and descriptions one line.
- The component is a proper combobox: ArrowUp/ArrowDown move, Enter navigates, Escape closes — do not replace it with a bare filtered `<ul>` without the keyboard handling.
- Place it where visitors expect search (header right side, or above long list content).
- Match the site's language in `label`, `placeholder` and `emptyText`.

# Avoid

- Do not fetch the index from an API route — this capability is deliberately client-local; an external provider is a separate hard dossier under the same capability.
- Do not pass hundreds of KB of content into `items`; index titles/summaries, not full page bodies.
- Do not remove the `aria-*` wiring or the outside-click close handler.
- Do not use `next/router` imports inside the verbatim file — it navigates with `window.location.assign` on purpose so it works in any App Router project.

# Verification

- Type two letters of a known page title — matching results render while typing.
- Introduce a typo ("kontkt") — the right page still matches (fuzzy).
- ArrowDown + Enter navigates to the highlighted result's `href`.
- Escape and outside-click both close the result list.
- All `href`s in `items` resolve to real routes on the generated site.
