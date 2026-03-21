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
| Validera manifester | `npm run scaffolds:validate` |
| Regenerera embeddings | `npm run scaffolds:embeddings` |
| Bygga research-artefakt från dossiers | `npm run scaffolds:research` |
| Allt ovan i sekvens | `npm run scaffolds:build` |
| Verifiera genererade JSON-vägar | `npm run verify:generated-paths` |

## Filstruktur

```
src/lib/gen/scaffolds/           <-- Runtime scaffolds (manifests, matchning, serialisering)
src/lib/gen/template-library/    <-- Valfri referenskatalog + embeddings för prompten (kan vara tom)
research/dossiers/               <-- Build-time dossiers som matar scaffold-research (ej runtime)
research/raw-discovery/          <-- Rå discovery-data, ej trackad i git
```

När du fyller `template-library.generated.json` igen: håll `clonePath` repo-relativt och kör `verify:generated-paths`.

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
