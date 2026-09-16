# Arkitektur – minimal integration

## Grundbeslut

Sidorna är vanliga Next.js App Router-routes:

```text
src/app/<slug>/page.tsx
```

Ingen ny router, ingen `(seo)`-grupp förrän den faktiskt behövs, ingen
iframe, ingen nested Next/Vite-app, ingen databas.

Canonical owner för slugs, status och sitemap-urval:
[`src/lib/seo-landing-pages/registry.ts`](../../../../src/lib/seo-landing-pages/registry.ts).

## Metadata

Varje sida exporterar server-side metadata via
`createSeoLandingMetadata(slug)`. Placeholders är `noindex`. Ready-sidor
indexeras och får self-canonical mot `URLS.baseUrl` + slug. Root-layoutens
`metadataBase` och title-template (`%s | Sajtmaskin`) återanvänds — skriv
inte `| Sajtmaskin` i sidans title.

## CTA

Befintligt skapandeflöde: `/builder?new=1`. Ingen separat generation pipeline.

## CSS och importerad design

När en färdig demosida kommer:

1. ta ut komponenter, copy och assets,
2. konvertera till Sajtmaskins modell,
3. scope:a CSS till sidan,
4. dumpa inte global reset i `src/app/globals.css`,
5. granska externa scripts.

## Sitemap

`src/app/sitemap.ts` läser `getIndexableSeoLandingRelPaths()`. Lägg inte
placeholders i `STATIC_SITEMAP_REL_PATHS`.

## Structured data

Root-layouten har redan organisations-/software-JSON-LD. Lägg sidunik data
bara när den är korrekt och synlig. Bygg inte FAQPage-schema som SEO-trick.

## Bilder

Följ befintligt mediemönster; annars `public/marketing/<slug>/`. Ingen
keyword-stuffad alt-text.

## Repo-säkerhet

Arbetet ska inte kräva auth-, betalnings-, schema-, generation- eller
DNS-ändringar.
