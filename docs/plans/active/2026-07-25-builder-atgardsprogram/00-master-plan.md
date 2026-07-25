---
status: active
owner: unassigned
created: 2026-07-25
topic: Styrdokument för åtgärdsprogrammet efter observationssessionen 2026-07-25 — integrationstrohet, reparationsärlighet, statusärlighet, previewyta och direktmanipulation i buildern
source: Live prod-session `/logg-internet` 2026-07-25 02:44–03:50 (chat `84979fd3-1a19-4916-bc36-fdc21ad7392e`, projekt `BCLRCefYDKA3vIeAtQQoU`). Observationslogg: `.cursor/logg-internet/runs/2026-07-25_0302.md`. Alla rotorsaker kodverifierade mot master `57416834`.
---

# Åtgärdsprogram: builder efter observationssessionen 2026-07-25

## TL;DR

En vanlig svensk uppföljningsprompt — *"koppla på nyhetsbrev via Mailchimp, lägg
till en /personal-sida där bara personalen kan sköta det"* — gav **ingen
preview, blockerad deploy och tre misslyckade genereringsvarv på fem minuter.**
Ingen del av felet berodde på en ny deploy av Sajtmaskin.

Sessionen gav 10 verifierade defekter (F1–F10) och 11 önskemål (Ö1–Ö11). Den här
filen är styrdokumentet: syfte, mål, spårindelning, körordning och när
programmet är klart. Sex delplaner äger detaljerna.

**Detta är plan, ingen implementation.**

## Utesluten hypotes: det var inte en deploy

Frågan ställdes uttryckligen, så den är avgjord först.

| Fråga | Svar |
|---|---|
| Senaste prod-deploy före den trasiga körningen | `dpl_5coRdhA7tHqgvCRUJLvxLcBWrty3`, skapad 01:05:56 UTC |
| Prompten skickades | 01:36:52 UTC — **31 minuter senare** |
| Deploy under körningen (01:37–01:42 UTC) | ingen |
| Vad den deployen innehöll | commit `57416834`, **docs-only**: `BUG-SWARM-BACKLOG.md`, en planfil, `docs/plans/active/README.md` |
| Deployer före den lyckade körningen 00:46 UTC | `21736835` (00:34), `1cd8f547` (00:24) — båda **före** den körning som fungerade |

Ingen runtime-kod ändrades mellan den lyckade och den misslyckade körningen.
Skillnaden ligger i **prompten**: den lyckade bad om en designsajt (25 filer,
inga server-routes), den misslyckade bad om en namngiven integration plus en
skyddad sida (31 filer, 2 API-routes). Server-kod i F2 är den nya ytan, och
det är den ytan som saknar skydd.

Slutsats: **promptberoende, inte deployberoende.** Programmet nedan behandlar
det som ett systemfel, inte ett driftfel.

## Syfte

Sajtmaskin ska klara en normalt formulerad uppföljningsprompt som nämner en
namngiven tjänst och en skyddad sida, och leverera en preview som fungerar —
utan att användaren behöver känna till F2/F3, dossiers, preflight eller
capabilities.

I dag läcker den interna modellen ut som symptom: en muted capability blir
frihandskod, en falsk beroendevarning blir ett påhittat npm-paket, ett
preview-transform hamnar i den sparade sajten, och kontraktspanelen lovar
integrationer som ingen fil infriar.

## Mål

Fem måltillstånd. Varje delplan äger ett eller två av dem.

| # | Mål | Mätbart som |
|---|---|---|
| M1 | **Integrationstrohet** — en namngiven integration leder antingen till dossiern eller till ett tydligt "det gör vi i nästa steg". Aldrig till frihandsbyggd, trasig eller låtsas-fungerande kod. | Prompt med `mailchimp`/`resend` ger antingen dossierfiler eller noll integrationskod + synlig förklaring. Inget tredje utfall. |
| M2 | **Reparationsärlighet** — en reparation gör aldrig artefakten sämre, och en falsk gate blir aldrig en instruktion till modellen. | Ingen reparation får introducera en ny blockerare. Node-builtins flaggas inte som npm-paket. |
| M3 | **Statusärlighet** — kontrakt, capabilities, byggblock och banners speglar filerna i versionen. | Varje påstående i UI kan härledas till en fil eller ett env-värde. Inga falsk-positiva "kopplad". |
| M4 | **Yta åt previewen** — chrome ligger där användaren redan tittar, inte i en rad som äter previewbredd. | Previewpanelen har ingen egen verktygsrad. Chattens utdata kan fällas ned. |
| M5 | **Direktmanipulation** — ändra text, byta bild och ta bort element utan att öppna kodvyn. | Inspektera → meny vid muspekaren → ändringen syns i previewen. |

## Vad programmet omfattar

### Defekter (F) — från observationsloggen

| ID | Kort | Allvar | Spår |
|---|---|---|---|
| F1 | Resend-dossiern används inte; genererat kontaktformulär låtsas skicka | P1 | 01 |
| F2 | `dashboard-charts` visas som "kopplad" i alla sajter (falsk positiv) | P1 | 01 |
| F3 | Reparationen pinnade npm-paketet `crypto` för att blidka en falsk preflight | P1 | 02 |
| F4 | Preview-strippad import läcker in i sparade projektfiler | P1 | 02 |
| F5 | Autofix la till fel import; `NextRequest`/`NextResponse` saknas | P1 | 02 |
| F6 | Mailchimp-dossiern används inte trots att prompten säger "Mailchimp" | P1 | 01 |
| F7 | Kontraktspanelen lovar NextAuth + SQLite som ingen fil infriar | P2 | 01 |
| F8 | Versionsbannern säger "Du redigerar v2 — inte senaste v1" när v2 *är* senaste | P2 | 06 |
| F9 | Rå kodvägg renderas som chattbubbla när en fence är oavslutad | P2 | 03 |
| F10 | Reparationsvarv skriver över samma version-id — ingen återgångspunkt | P2 | 02 |

### Önskemål (Ö) — från användaren under sessionen

| ID | Kort | Spår |
|---|---|---|
| Ö1 | Flytta "+ Lägg till" till Verktyg-raden ovanför chatinputen | 04 |
| Ö2 | Flytta "Inspektera preview" till samma rad | 04 |
| Ö3 | Döp om "+ Lägg till" till något som förklarar vad den gör | 04 |
| Ö4 | "+ Sida" ska inte kunna skapa en trasig sida | 02 |
| Ö5 | Flytta resten av previewpanelens verktygsrad upp i headern | 04 |
| Ö6 | Sajtagent-bubblan ska inte täcka "Skicka" i mobil | 04 |
| Ö7 | Ta bort etiketten "Sidor i skapad preview" och krymp sidremsan | 04 |
| Ö8 | Förklara eller ta bort "Lansering / Redo att publicera" | 06 |
| Ö9 | Chattens utdata ska kunna fällas ned till inputens överkant | 03 |
| Ö10 | Inspektera → meny vid muspekaren: snabbeditera / ta bort / byt bild | 05 |
| Ö10b | Dra en rektangel → markera flera element eller skärmbild av ytan | 05 |
| Ö11 | Ta bort eller döp om "Anthropic-jämförelse" | 06 |

## Spår och delplaner

| Spår | Plan | Mål | Rör |
|---|---|---|---|
| 01 | [`01-integrationstrohet.md`](01-integrationstrohet.md) | M1, M3 | `src/lib/gen/orchestrate/`, `src/lib/gen/dossiers/`, `data/dossiers/` |
| 02 | [`02-reparation-och-preflight.md`](02-reparation-och-preflight.md) | M2 | `src/lib/gen/validation/`, `src/lib/gen/suspense/`, `src/lib/gen/autofix/`, `src/lib/builder/preview-page-ops.ts` |
| 03 | [`03-chattens-utdata.md`](03-chattens-utdata.md) | M4 | `src/components/builder/GenerationSummary.tsx`, chattpanelen |
| 04 | [`04-verktygsrad-och-previewyta.md`](04-verktygsrad-och-previewyta.md) | M4 | `PreviewPanelChrome.tsx`, `BuilderHeader.tsx`, `ChatInterface.tsx`, `OpenClawChat.tsx` |
| 05 | [`05-inspektorsmeny-och-snabbedit.md`](05-inspektorsmeny-och-snabbedit.md) | M5 | `preview-panel/hooks/`, `src/lib/gen/quick-edit/` |
| 06 | [`06-status-copy-och-menyval.md`](06-status-copy-och-menyval.md) | M3 | readiness-route, `deploy-readiness-ui.ts`, `BuilderHeader.tsx` |

## Körordning

Spåren är byggda för att kunna delas mellan agenter. Tre saker styr ordningen:
delade filer, delad state-lyftning, och att acceptanskörningen kräver att både
01 och 02 har landat.

```text
Vecka/pass 1  ── parallellt ──┐
  01 integrationstrohet       │  (pipeline, egna filer)
  02 reparation + preflight   │  (validering/autofix, egna filer)
  06 status, copy, menyval    │  (billigt, isolerat)
                              │
Pass 2  ── sekventiellt ──────┤
  04 verktygsrad + previewyta │  (lyfter state ur PreviewPanelChrome)
     ↓ måste landa först      │
  03 chattens utdata          │  (rör ChatInterface som 04 just ändrat)
     ↓                        │
  05 inspektorsmeny           │  (bygger på Ö2:s nya hemvist för inspect-läget)
                              │
Pass 3 ───────────────────────┘
  Acceptanskörning: samma prompt som 2026-07-25 01:36
```

| Kombination | Parallellt? | Varför |
|---|---|---|
| 01 + 02 | ja | olika filer i `src/lib/gen/`; ingen delad modul |
| 01 + 06 | ja | 06 är presentationslager, 01 är selektionslager |
| 02 + 06 | ja | ingen överlappning |
| 03 + 04 | **nej** | båda rör `ChatInterface.tsx`; 04 lyfter state som 03 bygger vidare på |
| 04 → 05 | **nej, sekventiellt** | 05 hänger på var inspect-läget bor efter Ö2 |
| 05 + allt annat | ja efter 04 | isolerat till inspector-hooks och quick-edit |

**Regel för flera agenter:** varje spår i egen `git worktree` enligt
[`agent-worktree.mdc`](../../../../.cursor/rules/agent-worktree.mdc). Spår 03 och
04 får inte vara aktiva samtidigt i olika worktrees.

## Definition of done

### Per spår

Varje delplan har sin egen DoD-tabell. Ett spår är klart när dess tabell är helt
grön **och** planen har flyttats till `docs/plans/avklarat/` med en rad i
indexet.

### Samlat — programmet är klart när allt nedan gäller

| # | Krav | Hur det bevisas |
|---|---|---|
| 1 | Alla sex delplaner har grön DoD | delplanerna flyttade till `avklarat/` |
| 2 | F1–F10 är antingen fixade eller medvetet nedgraderade med motivering | rad i `BUG-SWARM-BACKLOG.md` för varje |
| 3 | Ö1–Ö11 är antingen levererade eller avvisade av ägaren med motivering | rad i respektive delplan |
| 4 | **Acceptanskörningen passerar** | se nedan |
| 5 | `npm run typecheck`, `npm run lint`, `npx vitest run` gröna | CI på PR |
| 6 | Nya tester finns för varje rotorsak i F1–F10 | ett test per fynd, refererat i delplanen |

### Acceptanskörning

Samma prompt som utlöste programmet, körd i prod mot en färsk chat:

> Koppla på nyhetsbrev via Mailchimp. Lägg till en ny sida /personal där bara
> personalen kan sköta allt som rör Mailchimp: se prenumeranter, lägga till och
> ta bort adresser samt förbereda utskick. Sidan ska inte synas i huvudmenyn för
> vanliga besökare, och nyhetsbrevsanmälan i sidfoten ska skicka adressen till
> Mailchimp-listan.

Godkänt betyder allt detta samtidigt:

| Kontroll | Krav |
|---|---|
| `generation_telemetry.preview_success` | `true` på första varvet |
| Antal auto-reparationsvarv | 0 |
| `package.json` | inget påhittat beroende; inga Node-builtins som deps |
| Sparade filer | ingen `(stripped for preview compatibility)` |
| Nyhetsbrev | antingen mailchimp-dossierns filer, eller noll integrationskod + synlig förklaring i chatten |
| Byggblock-panelen | inget "kopplad" utan filbevis; ingen `dashboard-charts` utan charts-kod |
| Kontraktsraderna i slutstegen | varje rad härledbar till en fil eller ett env-värde |
| Chattbubblor | ingen rå kodvägg |

## Icke-mål

Programmet ska inte svälla. Följande är uttryckligen utanför:

- Nytt auth-lager, ny kryptering, ny rate-limit eller nytt governance-lager
  (se [`project-phase-priorities.mdc`](../../../../.cursor/rules/project-phase-priorities.mdc)).
- Ombyggnad av F2/F3-modellen som sådan. Spår 01 justerar hur mute **kommuniceras
  och kompenseras**, inte var gränsen går.
- Ny dossier-taxonomi eller nya capability-id:n.
- Playwright i serverless (spår 05 löser skärmbild i iframen eller på
  preview-hosten i stället).
- Att göra `/personal`-mönstret till en produktfunktion. Prompten var ett test,
  inte en kravspec.

## Öppna ägarbeslut

Tre saker kan inte avgöras av en agent. De blockerar respektive delplan.

| # | Beslut | Blockerar | Alternativ |
|---|---|---|---|
| B1 | Vad ska hända när en F2-prompt namnger en integration? | 01 | (a) släpp in dossierns demoläge i F2, (b) generera ingen integrationskod + förklara, (c) höj till F3 automatiskt |
| B2 | Ska "Lansering"-kortet finnas kvar? | 06 | (a) bort helt, (b) bara vid blockerare, (c) behåll men skriv om |
| B3 | Vad ska "+ Lägg till" heta? | 04 | Ö3 är öppen; namnet styr copy i tre ytor |

## Källor

- Observationslogg med alla fynd och önskemål i fulltext:
  `.cursor/logg-internet/runs/2026-07-25_0302.md`
- Defektkö: [`BUG-SWARM-BACKLOG.md`](../../../../BUG-SWARM-BACKLOG.md)
- Planlivscykel: [`plan-lifecycle.mdc`](../../../../.cursor/rules/plan-lifecycle.mdc)
