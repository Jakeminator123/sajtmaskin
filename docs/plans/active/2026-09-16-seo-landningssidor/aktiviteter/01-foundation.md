# Foundation / referensarkitektur

## Uppdrag

Skapa minsta säkra standard för SEO-landningssidor i befintlig app.

## Status

Kodkontrakt i #1437 mot `preview`:
register, metadatahjälpare, sitemap-grind, tio placeholder-routes
(`noindex`, inte i sitemap), plus fail-closed så
`SeoLandingPlaceholder` inte kan rendera en `ready`-rad.
Referensfil: `src/app/skapa-hemsida-med-ai/page.tsx`.

## Kvar

Unikt innehåll är **inte** den här PR:ns jobb. Efter merge av #1437:
[`05-forsta-riktiga-sidan.md`](05-forsta-riktiga-sidan.md). Sätt inte
`ready` förrän [`../03-seo-qa-checklist.md`](../03-seo-qa-checklist.md)
är uppfylld och placeholdern är borta.
