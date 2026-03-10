# `_template_refs/` — externa referenser för hemsidemallar/scaffolds

Den här mappen innehåller **referensrepon**, inte kod som körs i sajtmaskin.

Syftet är att:
- studera struktur
- analysera sektioner och layoutmönster
- bygga egna interna `hemsidemallar` / `scaffolds`

Detta material ska **inte** användas live i generationer.

## Innehåll

### `vercel-vercel/`

Källa: `vercel/vercel/examples/nextjs`

Roll:
- teknisk bas
- minimal App Router-referens
- kandidat för `base-nextjs`

Behåll om du vill kunna diffa mot en ren Next.js-start. Annars kan den raderas när `base-nextjs` scaffold är byggd.

### `vercel-commerce/`

Källa: `vercel/commerce`

Roll:
- strukturreferens för `ecommerce` scaffold
- bra för nav, collections, product cards, detail pages, App Router patterns

Använd inte direkt som scaffold. Destillera till mindre intern version.

### `vercel-platforms/`

Källa: `vercel/platforms`

Roll:
- plattformsreferens för sajtmaskin själv
- multi-tenant/middleware/subdomain/admin patterns

Detta repo ska informera hur sajtmaskin hostas/drivs, inte hur användarsajter scaffoldas.

### `vercel-examples/`

Källa: `vercel/examples` med sparse checkout av `solutions/blog`

Roll:
- primär referens för `portfolio`
- sekundär referens för `blog`
- bra hybrid mellan personlig sajt, portfolio och content

Varför sparad:
- bra hero/content-struktur
- bra personlig/grundar-/byrå-sajt-känsla
- bra kombination av portfolio + blog

Användning:
- destillera till intern `portfolio`-scaffold
- plocka eventuellt sektioner till `blog`-scaffold

### `nextjs-examples/`

Källa: `vercel/next.js` med sparse checkout av `examples/blog-starter`

Roll:
- primär referens för `blog`
- enkel, ren content-first bloggstruktur

Varför sparad:
- låg komplexitet
- lätt att normalisera till vår stack
- bra kandidat för första interna `blog`-scaffold

Användning:
- destillera till intern `blog`-scaffold
- använd som referens för postlista, article page, metadataflöde

## Nya referenser att hämta/synka

Dessa kan hämtas med:

```bash
node scripts/sync-scaffold-refs.mjs
```

### SaaS / auth / app-referenser

- `nextjs-saas-starter/`
  - källa: `nextjs/saas-starter`
  - roll: primär strukturreferens för `saas-landing`, `dashboard`, `auth-pages`

- `auth0-b2b-saas-starter/`
  - källa: `auth0-developer-hub/auth0-b2b-saas-starter`
  - roll: auth- och B2B-flödesreferens, inte direkt scaffold

- `stripe-supabase-saas-template/`
  - källa: `dzlau/stripe-supabase-saas-template`
  - roll: betalning/auth/database-referens för framtida SaaS-appflöden

- `saasfly/`
  - källa: `nextify-limited/saasfly` (`apps/nextjs`)
  - roll: SaaS marketing/app-referens

- `next-enterprise/`
  - källa: `Blazity/next-enterprise`
  - roll: engineering reference, inte hemsidemall

### Portfolio / media / content-referenser

- `ibelick-nim/`
  - källa: `ibelick/nim`
  - roll: minimalistisk portfolio-referens

- `nextjs-with-cloudinary/`
  - källa: `vercel/next.js` (`examples/with-cloudinary`)
  - roll: bildtung portfolio/galleri-referens

- `payload-website-starter/`
  - källa: `payloadcms/payload` (`templates/with-vercel-website`)
  - roll: CMS-/contentreferens för blog/portfolio, för tung som direkt scaffold

### Övriga referenser

- `next-email-client/`
  - källa: `leerob/next-email-client`
  - roll: app layout/master-detail-referens

- `makeswift-basic-typescript/`
  - källa: `makeswift/makeswift` (`examples/basic-typescript`)
  - roll: builder-/editorintegrationsreferens

- `vercel-labs-slacker/`
  - källa: `vercel-labs/slacker`
  - roll: integrationsreferens, inte scaffoldkandidat för första vågen

## Relaterad dokumentation

- `LLM/egen-motor/scaffold-candidates.md`
- `LLM/egen-motor/README.md`
- `NEXT-STEPS.md`
