# Scaffold-kandidater — validering och rekommendation

> Senast uppdaterad: 2026-03-10
> Syfte: Kurerad lista över externa referenser som ska användas för att bygga interna `hemsidemallar` / `scaffolds`.

## Beslutsprincip

Vi använder externa templates/repon på tre olika sätt:

| Status | Betyder |
|--------|---------|
| **Behåll som bas** | Bra teknisk grund som direkt kan destilleras till en intern scaffold |
| **Behåll som strukturreferens** | Bra för layout, informationsarkitektur och komponentstruktur, men för tung/specifik för att användas direkt |
| **Använd inte som scaffold** | Bra projekt i sig, men fel abstraktionsnivå för sajtmaskins första interna hemsidemallar |

## Validerade kandidater

### 1. `vercel/vercel/examples/nextjs`

- Källa: [GitHub](https://github.com/vercel/vercel/tree/main/examples/nextjs)
- Typ: minimal Next.js-bas
- Stack: Next.js App Router, Tailwind v4, ren `create-next-app`-struktur
- Status: **Behåll som bas**

**Varför:**
- Extremt ren minimal struktur
- Bra som `base-nextjs`
- Perfekt för att definiera vilka filer som alltid måste finnas:
  - `app/page.tsx`
  - `app/layout.tsx`
  - `app/globals.css`
  - `package.json`
  - `next.config.ts`
  - `postcss.config.mjs`
  - `tsconfig.json`

**Varför inte som slutlig hemsidemall:**
- För tunn
- Ingen riktig sektionstruktur
- Ingen navigation/footer/komponentsammansättning

### 2. `vercel/commerce` / `Next.js Commerce`

- Källa: [Template-sida](https://vercel.com/templates/ecommerce/nextjs-commerce), [GitHub](https://github.com/vercel/commerce)
- Typ: komplett e-commerce-applikation
- Stack: Next.js, Tailwind, Shopify-orienterad, server components, `Suspense`, `useOptimistic`
- Status: **Behåll som strukturreferens**

**Varför:**
- Mycket hög kvalitet på appstruktur
- Bra referens för:
  - product grid
  - collections
  - nav/footer
  - product detail page
  - App Router patterns i större projekt

**Varför inte som direkt scaffold:**
- För stor
- För Shopify-specifik
- Kräver env/config
- För mycket backend/commerce-logik för sajtmaskins första version av `ecommerce`-hemsidemall

**Rekommendation:**
- Använd som källa för en *avskalad* intern `ecommerce` scaffold

### 3. `medusajs/nextjs-starter-medusa`

- Källa: [Template-sida](https://vercel.com/templates/ecommerce/medusa), [GitHub](https://github.com/medusajs/nextjs-starter-medusa)
- Typ: full e-commerce storefront
- Stack: Next.js, Tailwind, Medusa backend, Stripe, Algolia
- Status: **Använd inte som första scaffold**

**Varför:**
- Kräver extern Medusa-server på port 9000
- Har tydliga backend-förutsättningar
- Är bättre som referens om vi senare bygger en *headless commerce app*, inte en första bred `ecommerce`-hemsidemall

**Rekommendation:**
- Behåll som inspirationskälla, men inte som första implementation

### 4. `Blazity/next-enterprise`

- Källa: [Template-sida](https://vercel.com/templates/saas/nextjs-enterprise-boilerplate), [GitHub](https://github.com/Blazity/next-enterprise)
- Typ: enterprise boilerplate
- Stack: Next.js 15, Tailwind v4, testing, Storybook, observability, infra tooling
- Status: **Behåll som teknik-/kvalitetsreferens**

**Varför:**
- Bra referens för:
  - package/config-kvalitet
  - TypeScript-disciplin
  - env-struktur
  - test/CI/observability

**Varför inte som scaffold:**
- Inte en hemsidemall i första hand
- För mycket plattforms-/team-/boilerplate-tyngd
- För låg direkt nytta för prompt→sajt-flödet

**Rekommendation:**
- Använd som *engineering reference*, inte som scaffold-källa för första vågen

### 5. `vercel/platforms` / Platforms Starter Kit

- Källa: [Template-sida](https://vercel.com/templates/saas/platforms-starter-kit), [GitHub](https://github.com/vercel/platforms)
- Typ: multi-tenant plattformsapp
- Stack: Next.js 15, Tailwind 4, shadcn/ui, Redis, middleware, subdomains
- Status: **Behåll som plattformsreferens**

**Varför:**
- Mycket relevant för sajtmaskin som *plattform*
- Bra referens för:
  - multi-tenant builder-arkitektur
  - wildcard/subdomain-tänk
  - middleware-routing
  - tenant administration

**Varför inte som hemsidemall:**
- Det är en plattformsapp, inte en användarsajt
- Ska inspirera sajtmaskin-appen, inte genererade kundsidor

### 6. `nextjs/saas-starter`

- Källa: [Template-sida](https://vercel.com/templates/authentication/next-js-saas-starter), [GitHub](https://github.com/nextjs/saas-starter)
- Typ: full SaaS-starter med auth, pricing och dashboard
- Stack: Next.js, shadcn/ui, Postgres, Stripe, auth, dashboard- och teamflöden
- Status: **Behåll som strukturreferens**

**Varför:**
- Mycket bra referens för:
  - `saas-landing`
  - `dashboard`
  - `auth-pages`
  - pricing och upgrade-flöden

**Varför inte som direkt scaffold:**
- För mycket backend- och betalningslogik
- Kräver env/config och flera externa tjänster
- Bättre som källa för att destillera separata interna mallar

### 7. `auth0-developer-hub/auth0-b2b-saas-starter`

- Källa: [Template-sida](https://vercel.com/templates/authentication/auth0-nextjs-saas-starter), [GitHub](https://github.com/auth0-developer-hub/auth0-b2b-saas-starter)
- Typ: B2B SaaS-starter
- Stack: Next.js, Auth0, organisations-/team-flöden
- Status: **Behåll som auth-/B2B-referens**

**Varför:**
- Bra för att förstå organisationer, B2B-auth och account-boundary patterns

**Varför inte som scaffold:**
- För identitetsleverantörsspecifik
- För tung som första intern starter

### 8. `dzlau/stripe-supabase-saas-template`

- Källa: [Template-sida](https://vercel.com/templates/next.js/stripe-supabase-saas-starter-kit), [GitHub](https://github.com/dzlau/stripe-supabase-saas-template)
- Typ: SaaS-template med auth, db och betalningar
- Stack: Stripe, Supabase, Next.js
- Status: **Behåll som strukturreferens**

**Varför:**
- Bra sekundär referens för SaaS-flöden med onboarding, billing och auth

**Varför inte som scaffold:**
- För infra-/backend-tung
- Ska inte bli intern starter rakt av

### 9. `vercel/next.js/examples/with-cloudinary`

- Källa: [Template-sida](https://vercel.com/templates/next.js/image-gallery-starter), [GitHub](https://github.com/vercel/next.js/tree/canary/examples/with-cloudinary)
- Typ: bildgalleri / media-site
- Stack: Next.js, Cloudinary, Tailwind
- Status: **Behåll som media-/gallerireferens**

**Varför:**
- Bra referens för bildgalleri, mediaflöden och bildtunga portfolioytor

**Varför inte som scaffold:**
- Kräver Cloudinary och extern setup
- För specialiserad för första vågens generella hemsidemallar

### 10. `ibelick/nim`

- Källa: [GitHub](https://github.com/ibelick/nim)
- Typ: minimalistisk personlig sajt / portfolio
- Stack: Next.js 15, React 19, Tailwind v4
- Status: **Behåll som struktur- och stilreferens**

**Varför:**
- Stark referens för en ren, modern och personlig `portfolio`
- Låg komplexitet och bra visuell riktning

**Varför inte som enda portfolio-bas:**
- Väldigt stilsmal
- Bör kombineras med `vercel/examples/solutions/blog` för bredare portfolio/blog-mappning

## Sammanfattande beslut

| Kandidat | Beslut | Roll |
|----------|--------|------|
| `vercel/examples/nextjs` | Behåll | `base-nextjs` teknisk bas |
| `vercel/commerce` | Behåll | Strukturreferens för `ecommerce` scaffold |
| `medusajs/nextjs-starter-medusa` | Delvis | Sekundär commerce-referens, ej första scaffold |
| `Blazity/next-enterprise` | Behåll | Kvalitets-/boilerplate-referens |
| `vercel/platforms` | Behåll | Plattforms-/hostingreferens för sajtmaskin |
| `nextjs/saas-starter` | Behåll | Strukturreferens för `saas-landing`, `dashboard`, `auth-pages` |
| `auth0-b2b-saas-starter` | Behåll | Auth-/B2B-referens, ej direkt scaffold |
| `stripe-supabase-saas-template` | Behåll | Sekundär SaaS-strukturreferens |
| `vercel/next.js with-cloudinary` | Behåll | Media-/gallerireferens för portfolio |
| `ibelick/nim` | Behåll | Stil-/strukturreferens för minimalistisk portfolio |

## Första scaffold-vågen (rekommenderad)

Bygg dessa 8 interna hemsidemallar:

1. `base-nextjs`
2. `landing-page`
3. `saas-landing`
4. `portfolio`
5. `blog`
6. `dashboard`
7. `auth-pages`
8. `ecommerce`

### Mappstruktur

```txt
src/lib/gen/scaffolds/
  base-nextjs/
  landing-page/
  saas-landing/
  portfolio/
  blog/
  dashboard/
  auth-pages/
  ecommerce/
```

## Rekommenderat nästa steg

1. Implementera `blog` utifrån `nextjs-examples` och `vercel-examples`
2. Implementera `dashboard` och `auth-pages` utifrån `nextjs-saas-starter`
3. Behåll `next-enterprise` som engineering reference och inte som scaffoldkälla
4. Validera matcher-logiken mot de nu implementerade:
   - `landing-page`
   - `saas-landing`
   - `portfolio`
   - `content-site`
   - `app-shell`
