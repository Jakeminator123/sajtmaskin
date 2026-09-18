# SEO och routing för `/analys`

Områdesunderlag. Aktiviteten som bygger sidan:
[`aktiviteter/A1-publik-yta.md`](aktiviteter/A1-publik-yta.md).
Index/nav är B2/B3 i [`00-master-plan.md`](00-master-plan.md) — inte
den här filens ja.

## Rekommendation

Egen sida på `/analys` som bäddar in `SiteAuditSection` — **inte**
rewrite mot startsidan, **inte** elfte rad i `SEO_LANDING_PAGES`
(registret låser `ctaHref` till `/builder?new=1`; magnetens handling är
URL → rapport).

## Route

- `src/app/analys/page.tsx` (+ ev. `analys-content.tsx`)
- Finns inte idag; ingen rewrite behövs

### Namnkollisioner

| Path / läge | Vad |
|---|---|
| `/analys` | Publik lead magnet (den här) |
| `/audits` | Inloggad lista |
| `/?mode=audit` | Partneringång till startsidans audit |
| `analyserad` | Wizard, inte website-audit |
| `/kostnadsfri/[slug]` | Inbjudan, `noindex` |
| `src/lib/seo/audit.ts` | Källkods-SEO, annan produkt |

## Registrering / sitemap

Indexera som `/teknik`: egen metadata + rad i `STATIC_SITEMAP_REL_PATHS`
**först när B2 är ja** och copy/API stämmer. Relaterat-länkar från t.ex.
`/skapa-hemsida` kan peka hit utan registerrad.

SEO-landningarnas kedja (jämförelse, **följ inte**):

1. Rad i `src/lib/seo-landing-pages/registry.ts`
2. `src/app/<slug>/page.tsx` med `createSeoLandingMetadata(slug)`
3. `*-content.tsx`
4. Sitemap via `getIndexableSeoLandingRelPaths()`
5. `src/lib/seo-landing-pages/routes.test.ts` importerar `page.tsx`

För `/analys`: hoppa över registret. Egen metadata. Manuell sitemap-rad
bara i fas 3.

## Metadata-checklista

- Title utan `| Sajtmaskin`. Inte ordet «gratis» förrän B1 är gratis.
  Föreslagen start: `Webbplatsanalys – scores och PDF`
- Unik description, unik H1 (inte startsidans «Analysera webbplats»)
- Self-canonical `https://sajtmaskin.se/analys` — inte mot `/`
- `noindex` tills unik copy **och** erbjudandet stämmer
- `index, follow` + sitemap först efter B2
- Explicit OG title/description; ev. bild under `public/marketing/analys/`
- Huvudtext server-renderad; widgeten får vara client
- Ingen FAQPage-JSON-LD som trick
- Internlänk in (B3) + 1–3 ut (`/skapa-hemsida`, `/teknik`)

QA: SEO-checklistan raderades med SEO-planen; residualer i
[`../../avklarat/README.md`](../../avklarat/README.md).

## CTA (detalj i A4)

- Primär på sidan: kör analys (`SiteAuditSection`)
- Efter rapport: `AuditModal` — bygg/spara/PDF enligt gästpolicy
- Sekundär: `/builder?new=1` eller `/skapa-hemsida`
- Partnerflytt `?mode=audit` → `/analys` är B4, inte A1

## Nav / footer

Landing-navbar och `LandingFooter` har ingen audit-länk. App-navbar
visar «Audits» inloggad → `/audits`. Publik `/analys` måste länkas
medvetet (B3), annars saknas intern väg in.

## Duplicering vs startsida

Samma motor. Håll isär roller:

- Startsidan = produktläge i chatten
- `/analys` = landning med copy, canonical, internlänkar

Canonical ska inte peka mot `/`. Undvik identisk H1. Kopiera inte
chat-skalet.

## Mallfiler

| Roll | Fil |
|---|---|
| Route + metadata | `src/app/skapa-hemsida/page.tsx`, `src/app/teknik/page.tsx` |
| Skal / H1 / CTA | `src/app/skapa-hemsida/skapa-hemsida-content.tsx` |
| Metadata-helper (mönster, inte importplikt) | `src/lib/seo-landing-pages/metadata.ts` |
| Widget | `src/components/layout/site-audit-section.tsx` |
| Rapport-CTA | `src/components/modals/audit-modal.tsx` |
| Sitemap | `src/app/sitemap.ts` (`STATIC_SITEMAP_REL_PATHS`) |

## Gate

Rätta «helt gratis» (A4) och besluta gästpolicy (A2) **innan** sidan
indexeras eller pitchas som gratis.
