# Storstädning: repo, kod, databas (aktiv plan)

**Ägare / process:** Denna fil styr *hur* storstädningen görs; den ersätter inte `[PROJECT-STATE-AND-DIRECTION.md](./PROJECT-STATE-AND-DIRECTION.md)` som kanonisk backlog, men **länkas därifrån** när städspåret pågår.  
**Status:** aktiv tills exit-kriterierna nedan är uppfyllda; därefter flytta till `docs/plans/avklarat/` (eller ersätt med kort rad i `avklarat/README.md`) och uppdatera `[../README.md](../README.md)`.

**Mål:** färre filer och mindre kodvägar som inte används, tydligare struktur, **utan** att tappa kanon (preview/own-engine, `src/lib/env.ts`, migreringar, tester som skyddar beteende).

**Icke-mål:** lägga backlog eller planfulltext *i* Postgres (operativ sanning för planer = **git**, se § Databas).

**Var planen hör hemma:** denna fil ligger under `docs/plans/active/` som **städ- och DB-fas-process**. Kanonisk produktbacklogg och arkitekturbeslut förblir [`PROJECT-STATE-AND-DIRECTION.md`](./PROJECT-STATE-AND-DIRECTION.md) och `docs/architecture/*`.

---

## Två spår (viktigt — blanda inte ihop)

| Spår | Syfte | Typisk fråga |
|------|--------|----------------|
| **A — Städ (denna fil)** | Minska död kod, dubbla sanningar, dokumentbrus, uppenbart legacy utan reach; DB-data sist och med backup. | “Importeras detta? Finns det dubbel doc? Kan vi ta bort detta utan att bryta CI?” |
| **B — Own-engine / generation** | Vad LLM:en får för **kuraterat** material (dossiers, style packs, section packs, scaffold-metadata, promptkontext); sandbox/preview-strategi. | “Får modellen rätt signal/noise? Behöver vi bättre metadata, inte fler råfiler?” |

**Gemensam grund från extern review:** `RUNTIME_LIBRARY_MINIMUMS.localUiComponents` (t.ex. 55) i `src/lib/builder/runtime-library-audit.ts` är ett **CI-skydd för builderns lokala, kuraterade yta** (`src/components/ui/*` m.m.) — så att den ytan inte **krymper av misstag** vid refaktor. Det är **inte** ett mått på hur mycket material LLM:en har totalt, hur bra genererade sajter blir, eller hur mycket UI sandlådan kan installera via `npm`.

**Regel för städagenten:** använd **inte** `localUiComponents >= N som *huvudargument* för eller emot* own-engine:s generationskvalitet. Om en fil under `src/components/ui/` verkligen är oanvänd och ska bort, får tröskeln **justeras medvetet** i samma ändringsserie — men det beslutet är **städ/underhåll**, inte **produktstrategi för generationens korpus**.

**Regel för generationsspåret (ej denna plans ansvar ensam):** förbättring av “för lite bra material / för mycket fel kontext” drivs i **PROJECT-STATE**, builder-generation-dokument och kod under `src/lib/gen/`, `src/lib/providers/own-engine/`, scaffolds m.m. — inte genom att tolka UI-filräkning som proxy för LLM-kapacitet.

---

## Vad som ska städas respektive lämnas (översikt)

### Ska städas (inom städspåret A)

- **Död kod:** filer/barrels utan importers (grep + `tsc` + Vitest).
- **Dubbla pekare i docs:** samma sanning på fler ställen utan tydlig hierarki — konsolidera eller länka (se `documentation-lifecycle.md`).
- **`scripts/`:** entrypoints utan `package.json`-script, README eller annan dokumenterad manuell användning — ta bort eller märk deprecated.
- **Tydligt legacy med 0-reach:** efter import-graph; dokumentera i commit vad som försvann.
- **Env/policy-drift:** om en nyckel tas bort ur kod ska `env.ts` + `env-policy.json` följa med (redan princip 1).

### Ska inte städas eller kräver eget beslut (spår B eller explicit OK)

- **`src/lib/gen/scaffolds/*`, template-/reference-library, committade genererade JSON** som generationen faktiskt konsumerar — **inga** massraderingar i städpasset utan separat genomgång och tester.
- **`runtime-library-audit`-trösklar** — ändra bara som **medvetet** steg när filer faktiskt tas bort/läggs till i den kuraterade ytan; inte som surrogat för “mer LLM-material”.
- **Preview/sandbox/deploy-pipelines** — små ändringar undviks i samma svep som stor städ (se PROJECT-STATE §8).
- **Postgres-innehåll** — endast enligt [Fas D](#fas-d--databas-försiktig-synk--städ--ägs-explicit-här) med backup och miljöbesked.
- **`.cursorignore`-block** för secrets/build — inte öppna permanent “för att städa”; se befintlig § `.cursorignore` i denna fil.

### `archive/scripts-labs-testning_scarf/`

- **Git / städ:** om mappen är *tracked* och ni inte vill behålla labbet → ta bort via git/besluts-PG, inte bara ignorera.
- **`.cursorignore`:** mappen är redan avsedd att ignoreras för Cursor-index (stora outputs listas också explicit ovanför). **Behåll ignore** om ni inte aktivt vill att agenter ska semantiskt indexera labbskräp. Fixa **forward slash** i mönstret (`archive/scripts-labs-testning_scarf/`) så det följer samma stil som övriga rader.

---

## Principer

1. **En sanning per sak:** env-namn → `src/lib/env.ts`; env-klassificering → `config/env-policy.json`; arkitektur → `docs/architecture/`; backlog → `PROJECT-STATE`.
2. **Radera bara det som är verifierat oanvänt** (import-graph, grep, Vitest, ev. manuell rök i builder).
3. **Små PR:ar** i konfliktzoner (builder, stream, deploy) — se §8 i PROJECT-STATE.
4. **Databas sist i epiken** (eller i egen “release” av städen), med backup och tydlig miljö — se fas D.

---

## Tidsuppskattning — när är vi “klara nog”?

Det finns inget exakt datum: **nöjd** = när [exit-kriterierna](#exit-kriterier-epiken-klar) nedan är uppfyllda (eller medvetet nedprioriterade och antecknade här). Grov orientering:


| Spår                                                   | Ungefärlig ansträngning                                                | Kommentar                                                                                                                                                         |
| ------------------------------------------------------ | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fas B (död kod, oanvända barrels, uppenbart skräp)** | **2–4 fokuserade pass** à ca 1–2 h i samma tempo som hittills          | Många “unused”-listor från verktyg är **falska positiva** (t.ex. shadcn under `src/components/ui/`). UI-filräkning + `runtime-library-audit` = **CI-vakt för builderns lokala yta**, se [Två spår](#två-spår-viktigt--blanda-inte-ihop). |
| **Duplicerad logik**                                   | **+1–2 pass** när vi hittar tydliga par *och* kan verifiera med tester | Slå ihop bara när beteendet är säkert; annars lämna.                                                                                                              |
| **Fas C (docs / skript-nav)**                          | **ca 1 pass** om målet är pekare och en sanning per ämne               | Inte “läsa om hela docs/”.                                                                                                                                        |
| **Fas D (data i Postgres)**                            | **Separat halv–heldag + backup + miljöbeslut**                         | Kodstäd och DB-städ ska inte stressas ihop.                                                                                                                       |


**Kalender:** med **sporadiska** agent-/människopass kan B+C kännas “tillräckligt rena” på **ungefär 1–2 veckor**; med **2–3 heldagar** fokuserat arbete kan samma nivå nås snabbare. **Full “inga falska positiva kvar”** är sällan värt kostnaden — då jagar man shadcn/registyret, inte produktionsrisk.

---

## Framsteg — % klart / % kvar (checklista)

**Räknegrund:** Kryssrutor i **Fas A (4)** + **Fas B (4)** + **Fas C (3)** + **Fas D data-steg (5)** + **Exit (5)** ⇒ **N = 21**. Om du lägger till eller tar bort rutor i denna fil: uppdatera **N** och första raden i tabellen.

- **% klart** = avrundat heltal: `round(100 × bockade / N)`.
- **% kvar** = `100 − % klart`.

Kodstäd utan ny bock ändrar inte %-värdet; skriv då en rad i loggen under *Kod / notis* så spåret syns ändå.

### Pass-logg (före → efter varje pass)


| Pass                          | Datum      | Bockade | % klart | % kvar | Kod / notis                                                                                                                                                                                                      |
| ----------------------------- | ---------- | ------- | ------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inför %-spårning (retro)      | 2026-03-30 | 2/21    | 10%     | 90%    | Fas A: `typecheck` + `test:ci` redan bockade.                                                                                                                                                                    |
| **Före** pass 2026-03-31      | 2026-03-31 | 2/21    | 10%     | 90%    | —                                                                                                                                                                                                                |
| **Efter** pass 2026-03-31     | 2026-03-31 | 4/21    | 19%     | 81%    | Bock: exit “typecheck + Vitest”, Fas C skript-granskning. Kod: borttagen oanvänd barrel `src/components/ai-elements/index.ts` (importer går per-fil). Verifierat: `npm run typecheck` + `npm run test:ci` grönt. |
| **Före** pass 2026-03-31 (b)  | 2026-03-31 | 4/21    | 19%     | 81%    | —                                                                                                                                                                                                                |
| **Efter** pass 2026-03-31 (b) | 2026-03-31 | 5/21    | 24%     | 76%    | Bock: Fas B — `repo-tree.md` uppdaterad (ai-elements per-fil). Docs: ny rad i `docs/README.md` key navigation → STORDSTAD. Ingen ny kod borttagen (UI-filer = 55 st, under `runtime-library`-minimum).           |


*Nästa pass: upprepa två rader (**Före** / **Efter**) med nya siffror.*

---

## Fas A — Baseline (innan radering)

- [x] `npm run typecheck`
- [x] `npm run test:ci` (Vitest; motsvarar bred `vitest run` i CI-läge)
- [ ] Notera nuvarande `git rev-parse HEAD` i PR-beskrivning om ni gör massradering
- [ ] Bekräfta **vilken Postgres-URL** som gäller för nästa steg (lokal dev vs staging); **aldrig** anta prod utan explicit beslut

**Insyn utan skrivning:** `npm run db:rows` (`[scripts/db-row-overview.mjs](../../../scripts/db-row-overview.mjs)`) — räknar rader per utvald tabell om `POSTGRES_URL` finns i `.env.local`. Används för att avgöra om legacy-tabeller är tomma innan städ; ersätter inte backup eller manuellt miljöbeslut (fas D).

---

## Fas B — Kod och moduler (grep + import)

- [ ] Döda exports / oanvända filer *(pågår — zon-för-zon: barrels utan `@/…`-importer, oimporterade helpers; vid borttag under `src/components/ui/` justera `RUNTIME_LIBRARY_MINIMUMS` **medvetet** i samma PR om testet kräver det — det är städ/CI, inte generationsstrategi; se [Två spår](#två-spår-viktigt--blanda-inte-ihop).)*
- [ ] Duplicerade helpers: slå ihop endast när tester finns eller beteende är trivialt identiskt
- [ ] Legacy-grenar som grep/typecheck visar som 0-reach (dokumentera i commit *vad* som togs bort)
- [x] Uppdatera [`docs/architecture/repo-tree.md`](../../architecture/repo-tree.md) när toppnivåmappar försvinner eller byter roll *(2026-03-31: bygg-/importmönster för `ai-elements` dokumenterat i zontabellen; inga rotmappar borttagna)*

---

## Fas C — Dokumentation och skript

- [ ] En nav/pekare per ämne (undvik parallella “nya sanningar” i samma fil — se `documentation-lifecycle.md`)
- [ ] Arkiv: flytta färdig historik till `avklarat/`, inte duplicera i `active/`
- [x] Skript under `scripts/`: ta bort eller markera deprecated om inga `package.json`-scripts refererar dem *(2026-03-31: zon granskad; inga orphan-entrypoints som saknar `package.json`/`scripts/README`/e2e — inget att radera i detta pass)*

---

## Fas D — Databas (försiktig synk / städ) — **ägs explicit här**

**Vad “synk” *inte* är:** att skriva planmarkdown eller backlog-rader till Postgres. Appens DB håller **appdata** (projekt, chats, versioner, m.m. enligt `src/lib/db/schema.ts`).

**Vad “synk” *är* i praktiken:**

1. **Schema-läge:** `npm run db:push` / migreringar enligt teamets vanor ska matcha `[src/lib/db/schema.ts](../../../src/lib/db/schema.ts)` och Drizzle — ingen “manuell drift” utan kodändring.
2. **Data-läge (MVP / dev / staging):** om ni medvetet vill **tömma testdata**:
   - [ ] **Backup** (Supabase snapshot, `pg_dump`, eller separat dev-instans som får offras)
   - [ ] Bekräfta miljö: endast `.env.local` / staging-URL — **skriv aldrig** `TRUNCATE` mot prod i blindo
   - [ ] Dokumentera ordning (FK): antingen dedikerat skript i `scripts/` (ny fil vid behov) *eller* Supabase SQL editor med review
   - [ ] Efter tömning: `npm run db:init` om ni återskapar schema från scratch; annars bara rensad data
   - [ ] Rök: `npm run db:check` ([`scripts/check-dev-db.mjs`](../../../scripts/check-dev-db.mjs)), logga in i appen, skapa ett minimalt projekt/chat
3. **Prod:** endast schema/migrationer + observerad drift — **ingen** “rens allt” utan incident/change-protokoll.

**Leverans:** när fas D är klar ska det finnas **en commit eller PR** som nämner: miljö, backup, skript/SQL-sökväg, och verifieringssteg.

---

## `.cursorignore` — ska du kommentera ut rader?

**Kort svar:** **Nej, i regel inte** — särskilt inte för `.env*`, `node_modules`, `.next`, loggar och lokala hemligheter. Då riskerar hemligheter indexeras eller att index blir obrukbart stort.

**Bättre sätt att hjälpa agenter förstå samband:**


| Strategi                                                      | Varför                                                                                                                                                                                          |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Behåll ignore som den är**                                  | Säkerhet + prestanda för semantisk index.                                                                                                                                                       |
| **Använd denna fil + `repo-tree.md`**                         | Förklarar *vad* som finns under ignorerade träd utan att exponera innehåll.                                                                                                                     |
| **Tillfällig, smal öppning**                                  | Om du *måste* låta en agent se en viss mapp: lägg en **tillfällig** `!undantag/specifik/path` *eller* kommentera ut **en** blockrad under en **namngiven branch/PR**, återställ direkt efteråt. |
| **Lokala scratch-mappar** (`internt_jakob/`, `pot_buggs/`, …) | Ska normalt **inte** indexeras; agenter ska inte radera dem från repo om de inte är trackade — kontrollera med `git status`.                                                                    |


**Block-för-block (min tolkning av din `.cursorignore`):**

- **Build/cache, git, lockfile** — lås kvar.
- **`.env*`, token-filer** — lås kvar; agenter använder `docs/ENV.md` + `env.ts`.
- **`data/prompt-dumps`, `scraped-*`, archive script outputs** — ofta skräp/volymer; rätt att ignorera. Städ = git-tracked struktur + README, inte indexera rådump.
- **Stora genererade JSON under `src/lib/gen/…`** — ofta **committade** runtime-artefakter; de är ignorerade för att Cursor inte ska drunkna. **Radera inte** baserat på “jag ser dem inte i index” — läs `repo-tree.md`, `package.json` scripts, importer.
- **`research/external-templates/*`** — tungt; indexera bara README/SCHEMA (redan undantagna). Städ = separat beslut (research-policy).
- **Lokala rotmappar** (`old/`, `skrapning/`, …) — om de är **gitignored** syns de inte i remote; om de är **tracked**, städ via git — inte via cursorignore-hack.

**Rekommendation:** lägg **inte** in permanent kommenterad `.cursorignore` för hela block. Vid behov: kort PR med tydlig titel “Temporary: widen cursor index for audit” + återställning.

---

## Exit-kriterier (epiken klar)

- [ ] Fas A–D genomförda eller medvetet nedprioriterade (antecknat i denna fil)
- [x] `typecheck` + överenskommen Vitest-nivå grönt *(standard: `npm run typecheck` + `npm run test:ci`; senast verifierat 2026-03-31)*
- [ ] `repo-tree.md` / `docs/README.md` pekar rätt om strukturen ändrats
- [ ] Databas: schema OK + dokumenterad dataåtgärd om sådan utförts
- [ ] Flytta denna fil till `avklarat/` och uppdatera [`../README.md`](../README.md)

---

## Relaterat

- `[documentation-lifecycle.md](../../architecture/documentation-lifecycle.md)`  
- `[PROJECT-STATE-AND-DIRECTION.md](./PROJECT-STATE-AND-DIRECTION.md)` §5 (massstädning), §8 (konfliktrisk)  
- `[docs/ENV.md](../../ENV.md)`

