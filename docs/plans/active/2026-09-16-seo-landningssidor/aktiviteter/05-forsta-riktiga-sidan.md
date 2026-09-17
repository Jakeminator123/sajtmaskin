# Handover — första riktiga SEO-sidan

Detta är uppdraget **efter** att foundation-PR #1437 är **granskad och
mergad till `preview`**. Merga inte #1437 här. Fyll inte #1437 med
riktigt sidinnehåll. Skapa en **ny branch och ny PR** mot `preview`.

## Vad som redan är klart i #1437

- Runtime-ägare: `src/lib/seo-landing-pages/registry.ts`
- Metadata: `src/lib/seo-landing-pages/metadata.ts` (`createSeoLandingMetadata`)
- Blå testsida: `src/components/seo-landing-pages/seo-landing-placeholder.tsx`
- Tio App Router-routes, alla `status: "placeholder"` (`noindex`, inte i sitemap)
- CTA: `/builder?new=1` (`SEO_LANDING_CTA_HREF`)
- Fail-closed: `assertSeoLandingPlaceholderAllowed` — en `ready`-rad som
  fortfarande mountar `SeoLandingPlaceholder` faller i test/build
- Referensroute att byta ut: `src/app/skapa-hemsida-med-ai/page.tsx`
- Brief: [`../pages/02-skapa-hemsida-med-ai.md`](../pages/02-skapa-hemsida-med-ai.md)
- QA: [`../03-seo-qa-checklist.md`](../03-seo-qa-checklist.md)
- Arkitektur: [`../01-architecture.md`](../01-architecture.md)

## Enda sidans scope

**`/skapa-hemsida-med-ai`**. Inga andra slugs. Inget batch.

## Ordning (måste hållas)

1. Vänta tills #1437 är mergad. Hämta `origin/preview` och brancha därifrån.
2. Ersätt `SeoLandingPlaceholder` i
   `src/app/skapa-hemsida-med-ai/page.tsx` med extraherad design/copy.
3. Behåll `createSeoLandingMetadata("skapa-hemsida-med-ai")`.
   Skriv inte `| Sajtmaskin` i title — root-layoutens template lägger till det.
4. Lämna `status: "placeholder"` medan du bygger och QA:ar.
5. Kör [`../03-seo-qa-checklist.md`](../03-seo-qa-checklist.md) mot den
   färdiga sidan (HTTP 200, unik H1/title/description, self-canonical,
   internlänkar, mobil, inga globala CSS-läckor).
6. **Sist:** sätt `status: "ready"` i registret. Sitemap och index följer.
7. Om du sätter `ready` medan placeholdern fortfarande är kvar faller
   testerna med
   `SeoLandingPlaceholder cannot render a registry entry with status "ready"`.
   Det är avsiktligt.

## Extrahera, bädda inte in

Om underlaget är en färdig sida/ZIP/Vite/Next-demo:

- ta ut komponenter, copy, bilder och CSS
- konvertera till Sajtmaskins App Router
- scope:a CSS (wrapper-klass eller CSS-modul)
- dumpa inte importerad global reset i `src/app/globals.css`
- ingen iframe, ingen nested app, ingen subdomain, ingen ny databas

## Internlänkar och CTA

- Ut: `/ai-hemsidebyggare`, `/skapa-hemsida`, `/hemsida-utan-kod`
  (de andra är fortfarande placeholders — länka naturligt, lova inte
  indexerat innehåll där).
- CTA: `/builder?new=1`. Ändra inte builder-/auth-/deploy-ytor.

## Filer som typiskt rörs

- `src/app/skapa-hemsida-med-ai/page.tsx` (och ev. lokale komponenter)
- `src/lib/seo-landing-pages/registry.ts` — bara den här radens copy/status
- ev. `public/marketing/skapa-hemsida-med-ai/`
- tester som idag antar att *alla* sidor är placeholders
  (`registry.test.ts`, `metadata.test.ts`, `routes.test.ts`,
  `seo-landing-placeholder.test.tsx`, `sitemap.test.ts`).
  Uppdatera dem så att **bara** `/skapa-hemsida-med-ai` blir `ready`
  och indexeras; övriga nio ska fortsätta vara placeholders.

Rör inte de andra nio `src/app/<slug>/page.tsx` utöver ev. internlänk
som redan finns i briefen.

## Verifiering

- `npm run verify:pr -- --plan`
- `npm run typecheck`
- riktad Vitest för `src/lib/seo-landing-pages` och
  `src/components/seo-landing-pages` plus `src/app/sitemap.test.ts`
- `npm run build` om planen kräver runtime-profil
- browser/curl mot `/skapa-hemsida-med-ai`: 200, riktig H1, CTA,
  `robots` index när `ready`
- `/sitemap.xml` ska innehålla sidan först efter `ready`

## Utanför uppdraget

- Merga inte #1437 och inte din egen PR
- Fyll inte de övriga nio sidorna
- Sätt inte `ready` före QA
- Ändra inte `STATIC_SITEMAP_REL_PATHS` manuellt för den här slugen
- Ingen promote till `master`

## När den här PR:n är granskad

Därefter kan flera agenter parallellt ta övriga briefs under
[`../pages/`](../pages/) — en slug per PR, samma kontrakt.
