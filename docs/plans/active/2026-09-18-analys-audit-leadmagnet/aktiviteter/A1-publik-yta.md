# A1 — Publik yta `/analys`

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)
SEO-underlag: [`../02-seo-routing.md`](../02-seo-routing.md)
Filkarta: [`../01-filkarta.md`](../01-filkarta.md)
Status: pågår. Egen landning + rapport-UI, inte `SiteAuditSection`.

## Uppdrag

Skapa `sajtmaskin.se/analys` som egen App Router-sida med **eget**
rapport-UI. Återanvänd motorn, inte Audit-modalen.

## Problemet

`/analys` finns inte. Lead magneten har ingen URL, ingen metadata och
ingen intern väg in. Startsidans audit-sektion är ett produktläge i
chatten (`expandedSection === "audit"` i
[`src/app/page.tsx`](../../../../../src/app/page.tsx)), inte en
indexbar landning.

Namnkrockar som sidan måste hålla isär:

| Path / läge | Vad |
|---|---|
| `/analys` | **Den här** landningen |
| `/audits` | Inloggad lista |
| `/?mode=audit` | Partneringång till startsidans audit |
| `analyserad` | Wizard (`MODE_ALIASES` + `resolveLandingRouteTarget`) |
| `src/lib/seo/audit.ts` | Källkods-SEO, annan produkt |

## Uppgift

1. `src/app/analys/page.tsx` (+ ev. `analys-content.tsx` efter
   [`src/app/teknik/page.tsx`](../../../../../src/app/teknik/page.tsx)).
2. Egen `metadata`: unik title **utan** `| Sajtmaskin` (root-template
   lägger till det), unik description, unik H1 (inte «Analysera
   webbplats»), self-canonical mot `/analys` — inte mot `/`.
3. `robots: { index: false, follow: false }` tills B2 och A2+A4 är
   sanna. Samma mönster som
   [`src/app/kostnadsfri-information/page.tsx`](../../../../../src/app/kostnadsfri-information/page.tsx).
4. Eget rapport-UI (`AnalysTool` / `AnalysReport`). Återanvänd PDF-generatorn
   vid behov. Inte `SiteAuditSection` / `AuditModal`. Gästkvot är A2.
5. Bädda inte in chat-skalet. Ingen elfte rad i `SEO_LANDING_PAGES`
   (registret låser `ctaHref` till `/builder?new=1`).
6. Sitemap: **inte** i `STATIC_SITEMAP_REL_PATHS` i den här
   aktiviteten. Rad + `src/app/sitemap.test.ts` hör till fas 3 efter B2.
7. `robots.ts` behöver normalt inte `disallow: /analys` — `noindex` i
   metadata räcker. Disallow bara om Jakob vill dölja URL:en helt.
8. Internlänk: förbered footer/nav men slå på efter B3 (samma PR eller
   A4). Utan länk finns ingen väg in. Ut: `/skapa-hemsida`, `/teknik`
   eller `/builder?new=1` — max 1–3, beskrivande ankartext.
9. Huvudtext server-renderad; widgeten får vara client. Ingen
   FAQPage-JSON-LD som trick. Ev. OG-bild under
   `public/marketing/analys/` bara om den faktiskt används.

Title/H1 får **inte** säga «gratis» förrän B1 är gratis på riktigt.
Före A2: t.ex. «Webbplatsanalys – scores och PDF».

## Gränser

- Ingen ny scrape-pipeline. Prompt-tillägg för publik yta är tillåtet.
- Ingen rewrite `/analys` → `/?mode=audit`.
- Ändra inte `analyserad`, `/audits` eller `src/lib/seo/audit.ts`.
- Kopiera inte startsidans H1. Canonical ska inte peka mot `/`.
- Partnerflytt `?mode=audit` → `/analys` är B4, inte den här fasen.

## Klart när

- `GET /analys` är 200 med unik H1 och self-canonical.
- Metadata är `noindex` tills separat ja.
- Widgeten är samma motor via `POST /api/analys` (`runWebsiteAudit`).
- `npm run typecheck` och `docs:links` gröna. Sitemap-testet oförändrat
  (ingen ny statisk rad).
- QA-punkterna on-page/technical i
  [`../../../avklarat/README.md`](../../../avklarat/README.md)
  som inte kräver `index`/sitemap.

## Stopp

Indexera inte. Lova inte gratis. Pausa om någon vill in i
SEO-landningsregistret eller byta slug till `analyserad`.
