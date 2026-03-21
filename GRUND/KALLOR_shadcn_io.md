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

---

## Ska du “ladda ner” från dessa fyra sidor?

**Inte som en enda handling.** Sidorna är en **katalog** över projekt (ofta med länk till demo + GitHub). Samma namn dyker upp i flera kategorier (t.ex. shadcn/ui, Magic UI), och kategorierna skiljer mer i *hur du ska läsa listan* än i att varje kategori skulle vara en separat “nedladdningszon”.

| Vad du vill åstadkomma | Typiskt nästa steg (inte “ladda hem hela katalogen”) |
|------------------------|-----------------------------------------------------|
| **Officiell shadcn/ui i Sajtmaskin-appen** | `npx shadcn@latest add …` enligt `components.json` — se `ROLLER_app_motor_användarsajt.md` och spår A i `WORKFLOW_nedladdning_mappar.md`. |
| **Discovery / shortlist** | Bara bokmärken, anteckningar eller poster i research-lane — ingen klon nödvändig. |
| **Komponent-/blockbibliotek** (Magic UI, Origin m.fl.) | Oftast **dossier + utplock**, ev. kopiera enstaka filer om stacken stämmer — spår B. |
| **Hela starters / “fulla appar”** (t.ex. SaaS starter, SaaS boilerplate, större demos) | **Tillfällig klon utanför repo** för att läsa struktur och mönster — spår C; sedan dossier och eventuellt promotion — *inte* att checka in hela repot. |
| **Primitives / a11y** | Radix-kategorin (få poster, ~30) lämpar sig för **referens och regler**, inte som massnedladdning av sajter. |

Ungefärlig liststorlek per kategori (växer över tid): Next.js ~158, React ~179, Tailwind ~194, Radix UI ~31 — alltså är **Radix-listan** medvetet smalare och mer “bibliotek/primitives” än “alla typer av hela templates”.

---

## Fler användningsområden (inkl. “hela templates”)

Uttrycket **templates** på shadcn.io täcker **både** (a) copy-paste-bibliotek och (b) **kompletta repon / produktdemos**. Det motiverar flera roller i ert system — samma idé som i `KOMPONENTER.txt` (runtime scaffold, palette, section pack, reference layer):

| Roll | Exempel från katalogen | Vart det hör hemma hos er |
|------|-------------------------|----------------------------|
| **Struktur & hela flöden** | Next.js SaaS Starter, tyngre SaaS-boilerplates | Dossier + ev. tillfällig klon → mönster till interna scaffolds (`saas-landing`, `app-shell`, …). |
| **Komponent- & interaktionsmönster** | shadcn/ui, Origin UI, del av React-listan | Palette / motor-promptar; officiellt shadcn via CLI i appen där det behövs. |
| **Visuella block / motion** | Magic UI m.fl. i Tailwind/Next-listor | Section packs, tema — ofta **referens** först (spår B). |
| **Tillgänglighet & primitives** | Radix UI Primitives, shadcn ovanpå Radix | Regler och kvalitet — inte primärt “hämta hela sajt”. |

**Koppling till integrationer** (jfr `INTEGRATIONER.txt`): många poster under Next.js är **fullstack** (auth, DB, betalning). De är fortfarande värdefulla som **arkitektur- och filstruktur-inspiration** i preview/research, men real OAuth/DB ska inte vara första steget för slutanvändaren — “visa först, koppla vid publicering” passar bättre.

---

## Kort checklista

1. **Läs katalogen** för att hitta *enskilda* repos — inte som zip av hela shadcn.io.  
2. **Matcha handling** mot `WORKFLOW_nedladdning_mappar.md`: install (A) vs dossier (B) vs tillfällig klon (C).  
3. **“Hela mallar”** = ja som **kandidater** i research och kurering; **nej** som direkt dump i runtime utan promotion-pipeline.  
4. **Vercel-template / extern scaffold-lane** (stora dataset, kloner) följer `docs/architecture/scaffold-lane-model.md` — parallellt med detta, inte istället för punkt 1–3.  
5. **Många GitHub-kloner från de fyra kategorisidorna** — frivilligt skript: [`scripts/mirror_shadcn_io_templates.py`](../scripts/README.md) (standardmapp `_template_refs/shadcn-io-mirror/`, redan gitignored; kan pekas om med `SHADCN_IO_MIRROR_DIR`; kör med `python scripts/mirror_shadcn_io_templates.py --interactive`).
