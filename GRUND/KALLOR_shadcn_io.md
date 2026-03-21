# Externa källor: shadcn.io (kategorier)

Dokumentet samlar de fyra kategorisidorna på shadcn.io och hur de ska prioriteras för Sajtmaskin.

## Länkar

| Prioritet | Kategori   | URL |
|----------:|------------|-----|
| 1 | Next.js  | https://www.shadcn.io/template/category/nextjs |
| 2 | React    | https://www.shadcn.io/template/category/react |
| 3 | Tailwind | https://www.shadcn.io/template/category/tailwind |
| 4 | Radix UI | https://www.shadcn.io/template/category/radix-ui |

## Varför denna ordning?

Kategorin beskriver *vad mallen handlar om*, inte att den automatiskt passar Sajtmaskins stack eller scaffold-format. Next.js-sidan ligger oftast närmast (Next + React + Tailwind). Tailwind- och React-sidorna innehåller mer spretigt (t.ex. Vite-baserade mallar) och kräver mer filtrering.

## Hur varje kategori används

### 1. Next.js — bäst för scaffold-struktur

- Fokus: hela appar, route-struktur, nav, auth-flöden, dashboard, pricing, settings, CRUD.
- Koppling till interna scaffold-familjer: `saas-landing`, `app-shell`, `dashboard`, `auth-pages`, `content-site`, `ecommerce`.
- **Användning:** primär källa när du ska stärka eller skapa dossiers för hela layouter och flöden.

### 2. React — komponentmönster

- Fokus: byggblock, formulär, tabeller, dashboards, tillgängliga primitives.
- **Användning:** komponentlager och interaktionsmönster — inte förstahandsval för *hela* scaffold-strukturer.

### 3. Tailwind — yta, block, polish

- Fokus: sektioner, kort, hero, feature grids, visuell variation.
- **Varning:** många mallar kan vara tekniskt annorlunda (t.ex. inte Next.js).
- **Användning:** inspiration och utplockade block — alltid verifiera stack innan något påverkar runtime-scaffolds.

### 4. Radix UI — kvalitet och primitives

- Fokus: tillgänglighet, dialoger, popovers, dropdowns, menyer, command palettes.
- **Användning:** referens för interaktion och a11y — svagare som källa för kompletta sajt-scaffolds.

## Kort regel

| Källa     | Roll |
|-----------|------|
| Next.js   | Scaffold-struktur |
| React     | Komponentmönster |
| Tailwind  | Visuella block / polish |
| Radix UI  | Primitives / tillgänglighet |

## Intake-flöde (översikt)

1. Skrapa/upptäck mest från **Next.js** först.  
2. Lägg **React** / **Tailwind** som sekundär discovery.  
3. Använd **Radix** som kvalitets- och komponentreferens.  
4. Promota till runtime-scaffold bara det som tydligt stärker en befintlig scaffold-familj.

Se `WORKFLOW_nedladdning_mappar.md` för *install vs dossier vs tillfällig klon*.
