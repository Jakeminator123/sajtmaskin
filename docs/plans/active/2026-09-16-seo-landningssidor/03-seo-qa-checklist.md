# SEO QA före merge och publicering

## Före implementation

- [ ] Primär sökintention är tydlig.
- [ ] Sidan har egen roll jämfört med övriga SEO-sidor.
- [ ] Innehållet är faktiskt färdigt eller nära färdigt.

Routes får finnas som `noindex`-placeholders (ägarbeslut). De får **inte**
sättas till `ready` eller läggas i sitemap bara för att reservera sluggen.
`SeoLandingPlaceholder` + `status: "ready"` är fail-closed (test/build faller).

## On-page

- [ ] En tydlig H1.
- [ ] Unik title.
- [ ] Unik och sanningsenlig meta description.
- [ ] Nyckelord används naturligt.
- [ ] Intro besvarar sökintentionen snabbt.
- [ ] Konkreta exempel eller demonstrationer finns.
- [ ] Avsändaren är tydlig.
- [ ] Claims om funktion/pris är verifierade.

## Technical

- [ ] HTTP 200.
- [ ] Index/follow när klar.
- [ ] Self canonical, inte mot startsidan.
- [ ] Huvudinnehåll server-renderat.
- [ ] Mobilvy kontrollerad.
- [ ] Ingen global CSS-regression.
- [ ] Bilder rimligt optimerade.
- [ ] Ingen onödig tredjepartsscript.

## Internlänkning

- [ ] Minst en naturlig intern väg in.
- [ ] 1–3 relevanta länkar ut.
- [ ] CTA går till `/builder?new=1` eller annat dokumenterat produktflöde.
- [ ] Länktexter är beskrivande.

## Sitemap / Search Console

- [ ] `SeoLandingPlaceholder` är borta från sidans `page.tsx`.
- [ ] Sidan ligger i sitemap först när den är klar (`status: "ready"`).
- [ ] Sitemap-testet speglar det.
- [ ] Production-URL fungerar efter promote.
- [ ] URL Inspection för högprioriterade sidor.

## Efter publicering

- [ ] Search Console: impressions, queries, CTR, index/canonical.
- [ ] Vercel-trafik och CTA → produktflöde.
- [ ] Efter 2–6 veckor: förbättra utifrån riktiga queries.

## Undvik

- [ ] Ingen massproduktion av ortssidor.
- [ ] Ingen dold text.
- [ ] Ingen AI-text publiceras ogranskad.
- [ ] Ingen falsk oberoende recension.
- [ ] Ingen fabricerad konkurrentfakta.
