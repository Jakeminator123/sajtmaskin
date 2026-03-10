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

## Relaterad dokumentation

- `LLM/egen-motor/scaffold-candidates.md`
- `LLM/egen-motor/README.md`
- `NEXT-STEPS.md`
