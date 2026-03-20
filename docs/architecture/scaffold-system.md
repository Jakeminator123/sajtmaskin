# Scaffold-systemet

Hur en användares prompt blir en färdig sajt.

## Översikt

```
Användaren skriver:
"Jag vill ha en hemsida för min restaurang i Malmö"

    |
    v
+---------------------+     +-------------------+
| 1. SCAFFOLD-MATCHNING|     | 13 scaffolds      |
| Nyckelord + embedding|---->| Varje har:        |
|                     |     | - layout.tsx      |
| "restaurang" + "meny"|     | - page.tsx        |
| = restaurant scaffold|     | - header/footer   |
+---------------------+     | - CSS-tema        |
    |                        +-------------------+
    v
+---------------------+     +-------------------+
| 2. REFERENSSÖKNING   |     | 53 dossiers       |
| Embedding mot prompt |---->| Varje har:        |
|                     |     | - manifest.json   |
| Hittar 3 liknande   |     | - summary.md      |
| externa projekt     |     | - kodexempel      |
+---------------------+     +-------------------+
    |
    v
+---------------------+
| 3. SYSTEMPROMPT      |
| Byggs av:           |
| - Scaffoldkod       |
| - Dossier-referenser |
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

## De 13 scaffoldsen

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
| `restaurant` | Restaurang/tjänst | restaurang, café, meny, öppettider | Restaurangsajt |
| `booking` | Bokning | boka tid, tidsbokning, behandling | Frisörsalong |
| `association` | Förening | förening, klubb, styrelse, evenemang | Idrottsklubb |

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
| Kör hela pipelinen | `npm run scaffold-pipeline` |
| Kör med ny skrapning | `npm run scaffold-pipeline:full` |
| Testa matchning | `npm run scaffolds:test-matching` |
| Befordra dossier | `npm run scaffolds:promote <dossier-id>` |
| Validera manifester | `npm run scaffolds:validate` |
| Interaktiv meny | `python scaffold-pipeline/scripts/scaffold-pipeline.py` |

## Filstruktur

```
src/lib/gen/scaffolds/           <-- Runtime (13 scaffolds, matchning, serialisering)
src/lib/gen/template-library/    <-- Genererade artefakter (embeddings, referensdata)
scaffold-pipeline/               <-- Pipeline (discovery, dossiers, katalog, skript)
```

Se `scaffold-pipeline/README.md` för detaljer om pipeline-strukturen.
