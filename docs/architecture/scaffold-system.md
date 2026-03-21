# Scaffold-systemet

Hur en användares prompt blir en färdig sajt.

## Översikt

```
Användaren skriver:
"Jag vill ha en hemsida för min konsultbyrå"

    |
    v
+---------------------+     +-------------------+
| 1. SCAFFOLD-MATCHNING|     | 10 scaffolds      |
| Nyckelord + embedding|---->| Varje har:        |
|                     |     | - layout.tsx      |
| "konsultbyrå"       |     | - page.tsx        |
| = landing-page      |     | - header/footer   |
+---------------------+     | - CSS-tema        |
    |                        +-------------------+
    v
+---------------------+     +-------------------+
| 2. RESEARCH-ARTEFAKT |     | Dossiers          |
| Scaffold-research    |---->| (build-time)      |
| ger quality checklist|     | Matar genererade  |
| + referensmaterial   |     | artefakter        |
+---------------------+     +-------------------+
    |
    v
+---------------------+
| 3. SYSTEMPROMPT      |
| Byggs av:           |
| - Scaffoldkod       |
| - Research-artefakter|
| - Quality checklist  |
| - Custom instructions|
| - Route plan         |
+---------------------+
    |
    v
+---------------------+
| 4. AI-GENERERING     |
| OpenAI skriver koden |
| baserat på allt ovan |
+---------------------+
    |
    v
  Färdig sajt i preview
```

## De 10 scaffoldsen

| Scaffold | Typ | Svenska triggers | Exempel |
|---|---|---|---|
| `landing-page` | Företagssajt | hemsida, företag, byrå | Städfirma, konsultbyrå |
| `saas-landing` | SaaS-produkt | mjukvara, prisplaner, plattform | Projektverktyg |
| `portfolio` | Portfolio | fotograf, designer, kreatör | Fotografportfölj |
| `blog` | Blogg | blogg, artiklar, recept | Matblogg |
| `ecommerce` | E-handel | webshop, butik, varukorg | Smyckesbutik |
| `dashboard` | Dashboard | statistik, rapport, nyckeltal | Analysverktyg |
| `app-shell` | App-skal | CRM, verktyg, admin | Kontakthantering |
| `auth-pages` | Inloggning | login, registrera, lösenord | OAuth-flöde |
| `content-site` | Innehållssajt | dokumentation, undersidor | Kommunsajt |
| `base-nextjs` | Generisk | *(fallback)* | Enkel startsida |

## Matchningslogiken

```
Prompt → Nyckelord först (snabbt, deterministiskt)
           |
           ├─ Specifik match? → Använd den scaffolden
           |
           └─ Generisk match (landing-page/base-nextjs)?
                  |
                  └─ Embedding-sökning (semantisk)
                       |
                       ├─ Hög likhet (>0.35)? → Använd den
                       └─ Låg likhet? → Behåll generisk
```

## Vad användaren aldrig behöver göra

- Köra pipeline-skript
- Välja scaffold manuellt (auto är default)
- Veta att scaffolds eller dossiers existerar

Allt sker automatiskt. Användaren skriver sin prompt, systemet väljer rätt scaffold
och referensmaterial, och AI-modellen genererar koden.

## Vad utvecklaren kan göra

| Uppgift | Kommando |
|---|---|
| Normalisera råskrapning → mellanprodukt | `npm run research:normalize -- --input <dir>` |
| Bygg template-library från mellanprodukt | `npm run template-library:build` |
| Bygg template-library + embeddings (referenskatalog; ej v0-galleri) | `npm run template-library:rebuild` |
| Valfritt: samma + v0 gallery-embeddings | `npm run template-library:rebuild:with-v0-gallery` |
| Validera manifester | `npm run scaffolds:validate` |
| Regenerera scaffold-embeddings | `npm run scaffolds:embeddings` |
| Bygga research-artefakt från dossiers | `npm run scaffolds:research` |
| Allt ovan (research+embed+validate) | `npm run scaffolds:build` |
| Verifiera genererade JSON-vägar | `npm run verify:generated-paths` |

## Filstruktur (lane model)

```
<utanför repo>                   <-- Zone 1: Raw scrape output, kloner (aldrig committed)
research/normalized-catalog.json <-- Zone 2: Normaliserad mellanprodukt (committed, cursorignored)
research/dossiers/               <-- Zone 2: Build-time dossiers som matar scaffold-research (ej runtime)
src/lib/gen/template-library/    <-- Zone 2→3: Referenskatalog + embeddings för prompten
src/lib/gen/scaffolds/           <-- Zone 3: Runtime scaffolds (manifests, matchning, serialisering)
```

Se `docs/architecture/scaffold-lane-model.md` för den fullständiga tre-zone-modellen.

## Promotion-pipeline (Zone 2 → Zone 3)

Varje entry i `normalized-catalog.json` får en `promotionDecision`:

| Decision | Vad det innebär |
|----------|----------------|
| `runtime_scaffold_candidate` | Hög kvalitet, tydlig scaffold-fit. Kandidat till nytt internt manifest i `src/lib/gen/scaffolds/`. |
| `dossier_only` | Bra referens, men passar befintlig scaffold. Blir dossier i `research/dossiers/`. |
| `template_library_only` | Användbar som prompt-referens men utan tillräcklig scaffold-signal. Matar `template-library.generated.json`. |
| `ignore` | Inte Next/React, saknar repo, eller för låg kvalitet. Tas inte med alls. |

### Regler (implementerade i `config/scripts/normalize-raw-catalog.ts`)

1. Inget framework-match → `ignore`.
2. Ingen repo-URL → `template_library_only` (kan fortfarande vara prompt-referens).
3. Repo-typ `design_reference_only` → `template_library_only`.
4. qualityScore >= 75 **och** minst en matchande scaffold-familj → `runtime_scaffold_candidate`.
5. qualityScore >= 50 → `dossier_only`.
6. Annars → `template_library_only`.

### Promotion till runtime-scaffold (manuell)

En entry med `runtime_scaffold_candidate` blir **inte** automatiskt ett runtime-scaffold. Promotion kräver:

1. Manuell granskning av repot (struktur, routes, komponenter).
2. Bedömning: motiverar layoutskillnaden ett eget scaffold, eller räcker en dossier?
3. Om ja: skapa `src/lib/gen/scaffolds/<id>/manifest.ts`, registrera i `registry.ts`, lägg nyckelord i `matcher.ts`.
4. Kör `npm run scaffolds:build`.

När du fyller `template-library.generated.json` igen: kör `npm run template-library:build` och sedan `npm run verify:generated-paths`.

## När ska en idé bli runtime-scaffold vs dossier?

### Ny runtime-scaffold — när layout, routes och komponentmix verkligen ändras

Lägg till ett nytt scaffold i `src/lib/gen/scaffolds/` när:

- Sidans informationsarkitektur (IA) skiljer sig tydligt från befintliga scaffolds
  (t.ex. en meny/pristabell-layout vs en hero+features-landing).
- Antalet och typen av routes är annorlunda (t.ex. `/menu`, `/reservations` vs `/pricing`, `/features`).
- Specifika UI-komponenter krävs som inte finns i andra scaffolds
  (t.ex. tidsbokningswidget, produktgalleri med varukorg, menysektion).

Exempel på kandidater som motiverar eget scaffold:
- `hospitality` — meny, öppettider, bordbokning, karta
- `professional-firm` — team, tjänster, prislista, kundcase
- `real-estate` — objektlistning, sökfilter, bildgalleri, kontaktformulär

### Ny dossier — när du främst vill ge tonalitet, stil eller domänkunskap

Lägg till en dossier i `research/dossiers/` i stället för en ny scaffold när:

- Verksamhetstypen skiljer sig i *tonalitet och copy* men inte i layout/routes
  (t.ex. en städfirma vs en konsultbyrå — båda behöver `landing-page`).
- Du vill ge AI:n bättre referensmaterial utan att skapa en helt ny filstruktur.
- Domänen är smal nog att den inte motiverar en egen embedding-vektor.

Exempel som bör vara dossiers, inte scaffolds:
- Bygg/hantverk, städ/flytt/transport (använd `landing-page`)
- Utbildning/kurs (använd `content-site`)
- Event/konferens (använd `landing-page` eller `content-site`)
- Lokal handel utan e-handel (använd `landing-page`)

### Tumregel

> Om det enda som skiljer är *vilka ord som står på sidan*, gör en dossier.
> Om det som skiljer är *hur sidan ser ut och fungerar*, gör ett scaffold.

### Arbetsflöde för nya scaffolds

1. Skapa manifest i `src/lib/gen/scaffolds/<id>/manifest.ts`.
2. Registrera i `registry.ts`.
3. Lägg till nyckelord i `matcher.ts`.
4. Kör `npm run scaffolds:build` för att regenerera embeddings + research.
5. Kör `npm run scaffolds:validate` för att verifiera.
