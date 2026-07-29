---
status: active
owner: unassigned
created: 2026-07-25
topic: Innehållsrevision på `engine_versions` — så att varje verdikt/kvitto (quality gate, promote-guard, runtime-ready, statusbadge) kan säga VILKET innehåll det gäller i stället för bara vilket versionId. Steg 1–2 levererade 2026-07-29; steg 3 väntar på mätdata.
source: Re-triage 2026-07-25 av tre backlog-rader (Codex P1/P2 på #352 + M#pv4) — kodverifierat mot master `6b459ede`, PR #607. Absorberade 2026-07-27 stabiliseringsplanens PR 5 (verification-invalidation som revisionskontrakt) — samma saknade primitiv, se § "Invalidering hör hemma här".
---

# Innehållsrevision för verifieringskvitton

## TL;DR

`versionId` är **inte** en innehållsidentitet: samma rad kan skrivas om av
user-edit (`/files`), server-repair (`targetVersionId`-rewrite) och autofix.
Utan en hash av `files_json` kan ett verdikt beskriva ett *tidigare* innehåll
utan att någon läsare upptäcker det.

**Steg 1–2 levererade 2026-07-29** (migration `add-files-revision.sql`):
`engine_versions.files_revision` är DB-genererad `md5(files_json)`, och
`generation_telemetry.files_revision` stämplas via subselect vid INSERT. Inget
läsarbeteende har ändrats — det är steg 3, som väntar på mätdata om hur ofta
känd mismatch inträffar i prod.

## Vilka bugg-typer primitiven förklarar

Poängen med planen är att sex olika symptom i backloggen är **samma** lucka. De
har hittats var för sig, av olika botar, i olika filer — därför har de
triagerats som separata buggar och fått separata (och delvis omöjliga)
fixförslag.

| # | Bugg-typ | Vad som händer | Riktning | Exempel i backloggen |
|---|---|---|---|---|
| 1 | **Stale positivt verdikt** | Ett `passed`-verdikt från revision N läses som om det gällde N+1 | false-green | Stale quality-gate-telemetri efter `invalidateVerification` |
| 2 | **Stale kvitto** | Ett runtime-ready-kvitto stämplas på en telemetrirad vars innehåll aldrig bootats | false-green | M#pv4 (`recordPreviewRuntimeOutcomeForVersion`) |
| 3 | **Stale status/UI** | Badge/tooltip beskriver ett äldre innehåll än det som visas | vilseledande, ej blockerande | Stale bus-`done` efter user-edit |
| 4 | **Stale negativt verdikt** | Ett `failed` från revision N blockerar en legitim promote av N+1 | false-red / för strikt | Samma telemetri-rad, motsatt riktning |
| 5 | **Cache-nyckel på fel identitet** | In-memory-cache nycklad på `versionId` kortsluter när innehållet skrivits om under samma id | konservativ (pending) | `confirmedPreviewReadyVersionIds` |
| 6 | **TOCTOU mellan läsning och verdikt** | Innehållet avancerar mellan att det läses och att verdiktet skrivs | konsistens-race | Quick-edit läser basfiler före lease; stream-routens F3-gate läser filer utan lease |

Skillnaden mellan typerna spelar roll för *hur* man fixar:

- **1, 2, 4** löses av att verdiktet **bär** revisionen och läsaren **jämför**.
  Verdikt vars revision inte matchar nuvarande innehåll ska behandlas som
  "ingen gate körd för detta innehåll", inte som ett svar.
- **3** löses av samma jämförelse, men i projektionen (`reconcileTerminalDbState`)
  i stället för i guarden.
- **5** löses av att cachen nycklas på revision i stället för `versionId`.
- **6** *förhindras* inte av primitiven, men blir **upptäckbar**: en skrivare kan
  se att basen den läste inte längre är aktuell och avbryta i stället för att
  skriva ett verdikt om fel innehåll.

## Bevis (kodverifierat 2026-07-25)

| Påstående | Bevis |
|---|---|
| Ingen revision/tidsstämpel på innehållet | `schema.ts:609-650` — bara `created_at`, `promoted_at`, `repair_available_at` |
| User-edit nollställer verdikt men inte telemetri | `chat-repository/version-files.ts:63-70` (`invalidateVerification`-grenen) |
| Promote-guarden är allow-by-default | `promote-guard.ts:22-25,88-94` — bara `verifier_failed`/`preflight_failed` blockerar, `null` är medvetet fail-open |
| Verdikt-läsaren tar "senaste rad", oavsett innehåll | `services/generation-telemetry.ts` — `ORDER BY created_at DESC`, `rows[0]` |
| Terminal bus vinner över DB-`pending` | `stale-verification.ts:121-124` |
| Den gröna claimen är DB-härledd (och faller korrekt) | `version-status-display.ts:133,178-183` + `version-history-status-labels.ts:60-73` |

Testlåsta invarianter (PR #607): `version-status-display.test.ts` ("user edit
invalidates the promoted claim") och `promote-guard.test.ts` ("treats a stale
passed signal identically to no signal").

## Invalidering hör hemma här (absorberat 2026-07-27)

Stabiliseringsplanen 2026-07-13 hade en egen punkt "PR 5 — verification-invalidation
som ett revisionskontrakt": invalidering ska atomiskt träffa DB-state,
bus-projektion och telemetrisignal **för samma innehållsrevision**. Den planen är
i övrigt levererad (PR 1–3, #517–#519) och raderad; PR 5 flyttades hit eftersom
den beskriver exakt samma lucka från andra hållet.

Kodläget 2026-07-27: `invalidateVerification` nollställer DB-state
(`version-files.ts:63-70`) men rör varken bus-projektionen eller telemetrisignalen.
Det går inte att fixa atomiskt utan primitiven nedan — "samma innehållsrevision"
förutsätter att en innehållsrevision finns. Ägare vid genomförande:
`chat-repository-pg.ts` + `stale-verification.ts` + promote-guard-läsningen.

## Varför de tidigare per-rad-förslagen inte fungerar

Detta är den viktigaste delen av planen — tre föreslagna fixar är bevisat
verkningslösa eller skadliga, och en framtida agent ska inte bygga dem:

1. **"Skriv en superseding telemetrirad vid `invalidateVerification`"** →
   **no-op.** Guarden är allow-by-default, så en superseding `null`-rad ger exakt
   samma utfall som den stale `passed`-raden. Inget hål stängs.
2. **"Låt projektionen honorera DB draft+pending över stale terminal-`done`"** →
   **regression.** bus-`done` + DB-`pending` är *också* det normala
   render-first-läget mellan finalize och bakgrundsverify. Varje normal
   generation skulle flappa tillbaka till spinner.
3. **"Emittera en bus-event vid `invalidateVerification`"** → **når inte målet.**
   Bussen är per-instans in-memory (`readAll`), så en emit från `/files` landar
   inte nödvändigtvis i den instans som håller det stale `done`.

Gemensamt: alla tre försöker kompensera för avsaknaden av en innehållsidentitet
i ett enskilt lager. Det går inte — identiteten måste finnas i datan.

## Leveransstatus

| Steg | Status | Vad |
|---|---|---|
| 1 — primitiv | **Levererad 2026-07-29** | `engine_versions.files_revision TEXT GENERATED ALWAYS AS (md5(files_json)) STORED` via `add-files-revision.sql`. Prod-preflight: 133 rader / 48 kB heap → STORED-omskrivning OK, trigger-variant behövs inte. |
| 2 — stämpla verdikt | **Levererad 2026-07-29** | `generation_telemetry.files_revision` + subselect i `createGenerationTelemetryRecord` (anroparen kan inte glömma). Preview-session/bus-events bär **inte** revisionen ännu — det hör till steg 3:s läsare. |
| 3 — läsarna jämför | Öppen | Väntar på mätdata (beslut 3). Se skissen nedan. |

## Skiss för steg 3 (väntar på mätdata)

`getLatestQualityGateResultForVersion` → hämta senaste rad **för aktuell
revision**; ingen matchning = `null` (= "ingen gate körd för detta innehåll").
Jämförelsen är symmetrisk: ett mismatchat `failed` kastas precis som ett
mismatchat `passed` (beslut 1a).
`recordPreviewRuntimeOutcomeForVersion` stämplar bara rader vars revision
matchar det VM:en servar. `confirmedPreviewReadyVersionIds` nycklas på revision.
`reconcileTerminalDbState` får revisionen och kan degradera ett terminalt
bus-verdikt som gäller en äldre revision — utan att röra det normala
render-first-fönstret.

## Risker

| Risk | Hantering |
|---|---|
| Hash-kostnad på varje files-skrivning (~120 KB) | Billig jämfört med skrivningen själv; nu dessutom Postgres-sidig (`md5`) i stället för ett extra app-steg |
| **Tabellomskrivning** vid `ADD COLUMN … GENERATED … STORED` (`ACCESS EXCLUSIVE`) | Mät `engine_versions`-storleken i **prod** före migrationen; är den för tung → `BEFORE INSERT OR UPDATE`-trigger i stället (också oglömbar, ingen omskrivning) |
| Verdikt utan revision (rader skrivna före steg 2) tolkas som mismatch → blockerar legitima promotes | Explicit regel: revision saknas = okänd = nuvarande fail-open, aldrig blockerande. Bara **känd** mismatch blockerar (beslut 1b) |
| Steg 3 gör tidigare fail-open-vägar strikta → nya false-red | Leverera steg 1–2 först (rent additivt, inget beteende ändras), steg 3 bakom flagga med telemetri på hur ofta känd mismatch inträffar |
| Någon "förenar" `files_revision` (md5) med `hashFilesJson` (sha256) och antar lika värden | Beslut 2 säger uttryckligen att de är två mekanismer för två jobb; testlås gärna att repair-bindningen fortsatt använder sha256 |

## Verifiering

`npm run typecheck` · `npm run db:schema-drift` · riktade vitest för
`promote-guard`, `generation-telemetry`, `stale-verification`,
`version-status-display` · nytt test som visar att ett verdikt för revision N
inte längre besvarar en fråga om revision N+1 · docs-sync mot
`docs/schemas/orchestration-signal-contract.md`.

## Beslutspunkter — BESLUTADE 2026-07-28

Besluten togs av agent på ägarens uttryckliga delegation ("kör på med ditt
omdöme som beslutstagare", 2026-07-28). De är därmed arbetsbara, inte
ratificerade av ägaren i detalj — vänd dem fritt, men skriv om detta stycke då.

### 1. Ett verdikt med annan revision kastas — i båda riktningar

Frågan var felställd, vilket Codex-review på PR #637 visade. Den blandade två
saker som måste avgöras var för sig.

**1a. Är ett mismatchat verdikt ett svar? Nej — beslut: det kastas, oavsett
riktning.** Det är inte ett policyval utan definitionen av primitiven: ett
verdikt beskriver revision N och kan inte uttala sig om N+1. Det gäller symmetriskt:

- ett `passed` från N får inte grönmarkera N+1 (bugg-typ 1 och 2), och
- ett `failed` från N får inte **blockera** ett korrigerat N+1 (bugg-typ 4).

Mitt första beslut ("mismatch *plus* blockerande verdikt") bevarade av misstag
bugg-typ 4 — precis den false-red planen listar som ett fel att stänga. Det är
struket.

**1b. Vad händer när inget giltigt verdikt finns?** Här är det verkliga valet,
och det beror på om revisionen är *känd*:

| Läge | Beslut | Varför |
|---|---|---|
| **Känd mismatch** — verdiktet bär en revision, den skiljer sig från innehållets | Versionen räknas som **overifierad/pending**; gaten måste köras om innan promote | Vi *vet* att innehållet bytts och att ingen gate sett det nya. Att ändå släppa igenom är en false-green med känd orsak, och det är just vad primitiven byggs för. |
| **Okänd revision** — verdiktet saknar revision (rad skriven före steg 2) | Dagens **fail-open**, aldrig blockerande | Back-compat. Att tolka "vet inte" som "underkänt" gör varje gammal rad till en spärr. Ligger redan som explicit regel i risktabellen ovan. |

Fail-closed gäller alltså **bara känd mismatch**, vilket är en liten och
välmotiverad yta — inte en bred ny spärr (jfr `project-phase-priorities.mdc`).
Steg 2 mäter ändå hur ofta känd mismatch inträffar, så steg 3 kan uppskatta
sprängradien innan den slår på.

### 2. `files_revision` är en innehållshash — **genererad av databasen**

**Beslut: hash, och den beräknas i Postgres, inte i applikationen.**

Hash slår räknare av samma skäl som förut: en räknare kräver att varje skrivare
koordinerar ett inkrement, och en skrivare som missar det blir ett tyst fel —
exakt den klass vi försöker stänga. En hash härleds ur innehållet självt och kan
inte hamna ur fas. Den upptäcker dessutom "ändrad och återställd".

**Men själva stämplingen får inte ligga i skrivarna.** Codex-review på #637
visade att planens skrivar-inventering (`updateVersionFiles`,
`saveRepairedFiles`, finalize-runnern) är ofullständig. Kodverifierat 2026-07-28
skriver **minst fem** vägar `files_json` direkt:

| Väg | Fil |
|---|---|
| `updateVersionFiles` | `chat-repository/version-files.ts` |
| `saveRepairedFiles` | `chat-repository/repair.ts` |
| **`acceptRepair`** (saknades i planen) | `chat-repository/repair.ts` — ersätter `files_json` **samtidigt som den promotar** |
| `insertDraftVersionRow` / `createDraftVersion` | `chat-repository/versions.ts` |
| `addAssistantMessageAndUpdateVersion` | `chat-repository/versions.ts` |

Att inventera fem skrivare och lita på att nästa PR minns den sjätte är att
bygga samma buggklass en nivå upp. **Därför: `files_revision` blir en
`GENERATED ALWAYS AS (md5(files_json)) STORED`-kolumn.** Ingen skrivare ändras,
och en framtida sjätte skrivare kan inte glömma något.

Verifierat mot Postgres-katalogen (`pg_proc.provolatile`) 2026-07-28: `md5(text)`
är `IMMUTABLE` och duger i en genererad kolumn, medan `convert_to(text,name)` är
bara `STABLE` — så `sha256(convert_to(files_json,'UTF8'))` går **inte** att
använda där. Valet står alltså mellan "kan inte glömmas" (md5, DB-genererad) och
"samma värde som befintliga `hashFilesJson`" (sha256, app-sidan). Vi väljer det
förra: md5 vs sha256 spelar ingen roll för en ändringsdetektor — detta är ingen
säkerhetsgräns, och en kollision skulle ge en utebliven omkörning, inte
korruption — medan "glömbar" är precis felet vi stänger.

**Lämna `hashFilesJson` (sha256) i fred.** Den äger repair-revisionsbindningen
(`baseFilesHash`) och fortsätter göra det. De är två mekanismer för två jobb;
slå inte ihop dem och antag inte att värdena är lika.

**`files_updated_at` stryks ur steg 1.** `now()` är volatil och kan inte
genereras, så kolumnen skulle kräva antingen en trigger eller just den
per-skrivar-disciplin vi nyss avskaffade — för noll funktionell vinst, eftersom
revisionen alene svarar på frågan "gäller verdiktet det här innehållet?".
Behöver någon en tidsstämpel för felsökning senare: lägg till en trigger då.

**Preflight före migrationen:** `ADD COLUMN … GENERATED … STORED` skriver om
tabellen och tar `ACCESS EXCLUSIVE`. `engine_versions` har stora
`files_json`-rader, så mät tabellstorleken i **prod** först. Är omskrivningen
för tung: använd en `BEFORE INSERT OR UPDATE`-trigger i stället — den är också
oglömbar och kräver ingen omskrivning.

### 3. Steg 1–2 levereras separat från steg 3

**Beslut: ja.** Steg 1–2 är rent additiva: kolumner sätts och verdikt stämplas,
men ingen läsare ändrar beteende. Det ger en period där mismatch-frekvensen kan
mätas i prod utan risk, vilket är precis den mätning beslut 1 väntar på.

*Konsekvens:* steg 3 ska inte påbörjas förrän steg 1–2 legat i prod tillräckligt
länge för att svara på "hur ofta är revisionen mismatchad vid ett verdiktläsning?"
