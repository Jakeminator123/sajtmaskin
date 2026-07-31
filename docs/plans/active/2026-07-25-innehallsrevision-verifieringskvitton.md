---
status: active
owner: unassigned
topic: Innehållsrevision på `engine_versions` — så att varje verdikt/kvitto (quality gate, promote-guard, runtime-ready, statusbadge) kan säga VILKET innehåll det gäller i stället för bara vilket versionId. Steg 1–2 levererade 2026-07-29, steg 3 levererat 2026-07-31 bakom flagga. Kvar: ägarbeslut att släppa flaggan + två namngivna residualer.
created: 2026-07-25
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
`generation_telemetry.files_revision` stämplas via subselect vid INSERT.

**Steg 3 levererat 2026-07-31 bakom flaggan `SAJTMASKIN_CONTENT_REVISION_GATE`**
(default av): läsarna jämför. Planen lever kvar för **ett ägarbeslut** (släppa
flaggan) och **två residualer** — se § "Kvar att göra".

## Vilka bugg-typer primitiven förklarar

Poängen med planen är att sex olika symptom i backloggen är **samma** lucka. De
har hittats var för sig, av olika botar, i olika filer — därför har de
triagerats som separata buggar och fått separata (och delvis omöjliga)
fixförslag.

| # | Bugg-typ | Vad som händer | Riktning | Stängd av steg 3? |
|---|---|---|---|---|
| 1 | **Stale positivt verdikt** | Ett `passed`-verdikt från revision N läses som om det gällde N+1 | false-green | Ja — verdiktet är inget svar (`stale`) |
| 2 | **Stale kvitto** | Ett runtime-ready-kvitto stämplas på en telemetrirad vars innehåll aldrig bootats | false-green | Ja för repro-scenariot (M#pv4); residual 2 nedan |
| 3 | **Stale status/UI** | Badge/tooltip beskriver ett äldre innehåll än det som visas | vilseledande, ej blockerande | Ja på `/version-status`; residual 1 nedan gäller `/versions` |
| 4 | **Stale negativt verdikt** | Ett `failed` från revision N blockerar en legitim promote av N+1 | false-red / för strikt | Ja — symmetriskt kastat, retrybart `indeterminate` |
| 5 | **Cache-nyckel på fel identitet** | In-memory-cache nycklad på `versionId` kortsluter när innehållet skrivits om under samma id | konservativ (pending) | Ja — cachen nycklas på revision |
| 6 | **TOCTOU mellan läsning och verdikt** | Innehållet avancerar mellan att det läses och att verdiktet skrivs | konsistens-race | Nej (per design) — men blir **upptäckbar** |

Skillnaden mellan typerna spelar roll för *hur* man fixar:

- **1, 2, 4** löses av att verdiktet **bär** revisionen och läsaren **jämför**.
  Verdikt vars revision inte matchar nuvarande innehåll behandlas som
  "ingen gate körd för detta innehåll", inte som ett svar.
- **3** löses av samma jämförelse, men i projektionen (`reconcileTerminalDbState`)
  i stället för i guarden.
- **5** löses av att cachen nycklas på revision i stället för `versionId`.
- **6** *förhindras* inte av primitiven, men blir **upptäckbar**: en skrivare kan
  se att basen den läste inte längre är aktuell och avbryta i stället för att
  skriva ett verdikt om fel innehåll.

## Invalidering hör hemma här (absorberat 2026-07-27)

Stabiliseringsplanen 2026-07-13 hade en egen punkt "PR 5 — verification-invalidation
som ett revisionskontrakt": invalidering ska atomiskt träffa DB-state,
bus-projektion och telemetrisignal **för samma innehållsrevision**.

**Steg 3 besvarar den utan att bygga en atomisk invalidering**, och det är en
medveten omformulering: när varje läsare jämför revision behöver ingen skrivare
hinna nollställa tre lager i takt. En stale bus-`done` degraderas när den läses,
och ett stale verdikt är inget svar när det läses — läsarsidan är den enda som
kan vara atomisk, eftersom bussen är per-instans in-memory och alltså inte kan
nås av en skrivare i en annan instans. `invalidateVerification`
(`chat-repository/version-files.ts`) är därför oförändrad.

## Varför de tidigare per-rad-förslagen inte fungerar

Detta är den viktigaste delen av planen — tre föreslagna fixar är bevisat
verkningslösa eller skadliga, och en framtida agent ska inte bygga dem:

1. **"Skriv en superseding telemetrirad vid `invalidateVerification`"** →
   **no-op.** Guarden är allow-by-default, så en superseding `null`-rad ger exakt
   samma utfall som den stale `passed`-raden. Inget hål stängs.
2. **"Låt projektionen honorera DB draft+pending över stale terminal-`done`"** →
   **regression.** bus-`done` + DB-`pending` är *också* det normala
   render-first-läget mellan finalize och bakgrundsverify. Varje normal
   generation skulle flappa tillbaka till spinner. **Steg 3 rör därför inte
   fasen** — den lägger en degradering (`stale_content_revision`) och låter den
   befintliga false-green-vakten göra jobbet. Testlåst i
   `stale-verification.test.ts` ("rör INTE det normala render-first-fönstret").
3. **"Emittera en bus-event vid `invalidateVerification`"** → **når inte målet.**
   Bussen är per-instans in-memory (`readAll`), så en emit från `/files` landar
   inte nödvändigtvis i den instans som håller det stale `done`.

Gemensamt: alla tre försöker kompensera för avsaknaden av en innehållsidentitet
i ett enskilt lager. Det går inte — identiteten måste finnas i datan.

## Två fällor som inte får brytas

1. **Stämpla aldrig om `files_revision` vid UPDATE av en telemetrirad.**
   `updateTelemetryRecord` rör inte kolumnen, och ska inte göra det: att stämpla
   om vid UPDATE skriver dagens innehåll över gårdagens bevis och tillverkar
   precis den falska matchning primitiven finns för att upptäcka. Kvittot bär den
   bedömda revisionen och **matchas** — mönstret är #646:s explicita
   `assessedFilesJson`, och steg 3 använder samma mönster i guarden
   (`promotedFilesJson` från `acceptRepair`). (Codex på #653.)
2. **`files_revision` (md5) är inte `hashFilesJson` (sha256).** Den senare äger
   repair-revisionsbindningen (`baseFilesHash`) och fortsätter göra det. Två
   mekanismer för två jobb; värdena är per konstruktion olika, så en jämförelse
   mellan dem skulle alltid se ut som mismatch. Testlåst i
   `repair-files-payload.test.ts` ("äger repair-bindningen med sha256").

Subselecten i steg 2 läser `files_json` vid skrivtillfället, inte vid
gate-läsningen: skrivs innehållet om i fönstret däremellan stämplas verdiktet med
en revision det aldrig såg och ser då ut att *matcha*. Files_json-leasen (#507)
täcker fönstret när ett jobb kör, men inte annars. Det är bugg-typ 6 ovan och är
medvetet inte stängd — den är numera upptäckbar, inte förhindrad.

## Leveransstatus

| Steg | Status | Vad |
|---|---|---|
| 1 — primitiv | **Levererad 2026-07-29** | `engine_versions.files_revision TEXT GENERATED ALWAYS AS (md5(files_json)) STORED` via `add-files-revision.sql`. Prod-preflight: 133 rader / 48 kB heap → STORED-omskrivning OK, trigger-variant behövs inte. |
| 2 — stämpla verdikt | **Levererad 2026-07-29** | `generation_telemetry.files_revision` + subselect i `createGenerationTelemetryRecord` (anroparen kan inte glömma). Repair-lanen skickar `assessedFilesJson` (#646). |
| 2b — grind för primitiven | **Levererad (#674)** | `scripts/db/files-revision-contract.postgres.test.ts` bevisar kontraktet mot riktig Postgres (7 assertions: kolumnen är `GENERATED ALWAYS` med `md5`, stämplas vid INSERT, räknas om vid UPDATE, kan inte skrivas manuellt, telemetrins subselect returnerar rätt värde, telemetrins revision följer INTE med när versionen skrivs om, indexet finns). Den P1 som tidigare stod som blockerare för steg 3 är därmed stängd — arkiverad i `docs/plans/avklarat/bug-swarm/backlog-arkiv-2026-07-25.md`. |
| 3 — läsarna jämför | **Levererad 2026-07-31, bakom flagga (default av)** | Se nedan. |

### Steg 3 — vad som byggdes

Allt bakom `SAJTMASKIN_CONTENT_REVISION_GATE` (default av; med flaggan av är
beteendet bit-för-bit dagens, inklusive att inga extra DB-läsningar sker).

| Yta | Beteende med flaggan på | Ägare |
|---|---|---|
| Klassificering | `current` / `unknown` / `stale` — okänd revision är aldrig mismatch (beslut 1b) | `src/lib/gen/verify/content-revision.ts` |
| Verdikt-läsare | `getLatestQualityGateSignalForVersion` väljer senaste raden för **aktuell** revision; känd mismatch = inget svar (ersätter `getLatestQualityGateResultForVersion`) | `src/lib/db/services/generation-telemetry.ts` |
| Promote-guard | Känd mismatch → `{ allowed:false, indeterminate:true, staleRevision:true }` = "kör gaten igen". Symmetriskt för `passed` och `failed`; aldrig terminalt `failed` | `src/lib/db/promote-guard.ts` |
| Repair-accept | Skickar `promotedFilesJson` (avkodad reparerad payload) så jämförelsen görs mot innehållet som promotas, inte mot basen | `src/lib/db/chat-repository/repair.ts` |
| Runtime-ready-kvitto | Revisionsgrind i **samma** UPDATE som monotoniteten; confirmed-cachen nycklas på revision (`shouldVerifyPreviewRuntimeReceipt`) | `src/lib/db/services/generation-telemetry.ts` |
| Statusprojektion | Terminalt verdikt för äldre innehåll får degraderingen `stale_content_revision` — fasen rörs inte | `src/lib/gen/verify/stale-verification.ts` + `/version-status` |
| Telemetri | `sajtmaskin_content_revision_mismatch_total{surface,verdict}` (`promote_guard` · `preview_receipt` · `status_projection`) | `src/lib/observability/metrics.ts` |

Docs: `docs/schemas/quality-gate.md` (promote-guard + `preview_success`),
`docs/schemas/orchestration-signal-contract.md` (signallager + observation 5),
`docs/architecture/glossary.md` (termen), `docs/ENV.md` (flaggan),
`docs/testing.md` (DB-lanens andra fall).

Grind för läsarsidan: `scripts/db/content-revision-readers.postgres.test.ts` kör
mot riktig Postgres i `quality`-jobbets DB-lane. Den bevisar det en mock inte kan:
att revisionsgrinden är giltig SQL som pekar på rätt rad, och att Postgres' `md5()`
och Nodes `createHash("md5")` ger samma värde — antagandet hela jämförelsen står
på. Ett av dess test dokumenterar dessutom den **buggiga** utgången med flaggan av,
så det syns exakt vad flaggan ändrar.

## Kvar att göra

### Ägarbeslut: släppa flaggan

Mätningen som beslut 3 väntade på kan nu göras av steg 3 självt. Utrullning:
sätt `SAJTMASKIN_CONTENT_REVISION_GATE=true` i **preview** först, läs
`sajtmaskin_content_revision_mismatch_total` via `/api/metrics` (kräver
`SAJTMASKIN_METRICS_TOKEN`) och se hur ofta känd mismatch faktiskt inträffar per
yta innan production. Sprängradien är strukturellt liten: rader utan revision kan
per definition inte blockera något, och den strikta vägen kan bara aktiveras på
stämplade rader.

### Residual 1 — `/versions`-listan trådar inte revisionen

`GET .../versions` kör `reconcileTerminalDbState` per version för
VersionHistory-badgen. Att läsa verdiktets revision där kostar en läsning per
version (N+1) i en pollad listväg som medvetet inte får skriva. Aktiv-versionens
yta (`/version-status`) degraderar korrekt; historikbadgen kan alltså fortfarande
visa "Klar" för en version vars innehåll skrivits om. Fix när det behövs: **en**
`DISTINCT ON (version_id)`-fråga för hela chatten (indexet
`idx_generation_telemetry_version_revision` finns) i stället för per rad.

### Residual 2 — kvittot härleder "det VM:en servar" ur versionens revision

Kvittots revisionsgrind jämför mot `engine_versions.files_revision`, inte mot ett
revisionsfält på preview-sessionen. Det stänger M#pv4:s repro (en repair-rad för
innehåll som aldrig bootats kan inte längre stämplas grön) men inte det omvända
fönstret: efter en accepterad repair håller `files_json` det reparerade innehållet
medan VM:en kan servera det gamla tills nästa update. Exakt bindning kräver att
`PreviewSessionEntry` bär revisionen och att start-/update-vägarna sätter den —
egen leverans i `src/lib/gen/preview/session-store.ts` + `preview-session.ts`.

## Risker

| Risk | Hantering |
|---|---|
| Hash-kostnad på varje files-skrivning (~120 KB) | Billig jämfört med skrivningen själv; Postgres-sidig (`md5`) i stället för ett extra app-steg |
| Verdikt utan revision (rader skrivna före steg 2) tolkas som mismatch → blockerar legitima promotes | Explicit regel: revision saknas = okänd = fail-open, aldrig blockerande. Bara **känd** mismatch blockerar (beslut 1b). Testlåst i tre sviter |
| Steg 3 gör tidigare fail-open-vägar strikta → nya false-red | Flagga med default av + telemetri på känd mismatch; känd mismatch är dessutom retrybar (`indeterminate`), aldrig terminal |
| Extra DB-läsningar med flaggan på | Verdikt-läsaren läser versionens revision först när en telemetrirad finns; kvittot bara när instansen redan bekräftat; statusytan bara när bussen är terminal (och då slutar klienten polla) |
| Någon "förenar" `files_revision` (md5) med `hashFilesJson` (sha256) och antar lika värden | Beslut 2 + testlås i `repair-files-payload.test.ts` |

## Verifiering

`npm run typecheck` · `npm run lint` · `npm run db:schema-drift` · `npx vitest run`
(riktade sviter: `promote-guard`, `generation-telemetry.content-revision`,
`generation-telemetry.record-preview`, `content-revision`, `stale-verification`,
`version-status-display`, `version-status/route`, `preview-heartbeat/route`,
`chat-repository-pg.accept-repair`, `repair-files-payload`) ·
`npm run test:postgres` för `files-revision-contract.postgres.test.ts` +
`content-revision-readers.postgres.test.ts` (kräver dev-DB; CI kör lanen mot en
efemär Postgres).

## Beslutspunkter — BESLUTADE 2026-07-28

Besluten togs av agent på ägarens uttryckliga delegation ("kör på med ditt
omdöme som beslutstagare", 2026-07-28). De är därmed arbetsbara, inte
ratificerade av ägaren i detalj — vänd dem fritt, men skriv om detta stycke då.

### 1. Ett verdikt med annan revision kastas — i båda riktningar

**1a. Är ett mismatchat verdikt ett svar? Nej — beslut: det kastas, oavsett
riktning.** Det är inte ett policyval utan definitionen av primitiven: ett
verdikt beskriver revision N och kan inte uttala sig om N+1. Det gäller symmetriskt:

- ett `passed` från N får inte grönmarkera N+1 (bugg-typ 1 och 2), och
- ett `failed` från N får inte **blockera** ett korrigerat N+1 (bugg-typ 4).

Implementationen skiljer därför "kör gaten igen" (`indeterminate`) från "raden är
underkänd" (explicit block) — annars hade bugg-typ 4 bara bytt skepnad: en
watchdog som settlar terminalt på explicit denial hade gjort mismatchen till ett
rött verdikt ingen gate producerat.

**1b. Vad händer när inget giltigt verdikt finns?** Det beror på om revisionen är
*känd*:

| Läge | Beslut | Varför |
|---|---|---|
| **Känd mismatch** — verdiktet bär en revision, den skiljer sig från innehållets | Versionen räknas som **overifierad/pending**; gaten måste köras om innan promote | Vi *vet* att innehållet bytts och att ingen gate sett det nya. Att ändå släppa igenom är en false-green med känd orsak. |
| **Okänd revision** — verdiktet saknar revision (rad skriven före steg 2) | Dagens **fail-open**, aldrig blockerande | Back-compat. Att tolka "vet inte" som "underkänt" gör varje gammal rad till en spärr. |

Fail-closed gäller alltså **bara känd mismatch**, vilket är en liten och
välmotiverad yta — inte en bred ny spärr (jfr `project-phase-priorities.mdc`).

### 2. `files_revision` är en innehållshash — genererad av databasen

**Beslut: hash, och den beräknas i Postgres, inte i applikationen.**

Hash slår räknare: en räknare kräver att varje skrivare koordinerar ett
inkrement, och en skrivare som missar det blir ett tyst fel. En hash härleds ur
innehållet självt och kan inte hamna ur fas. Den upptäcker dessutom "ändrad och
återställd".

**Men själva stämplingen får inte ligga i skrivarna.** Kodverifierat 2026-07-28
skriver **minst fem** vägar `files_json` direkt (`updateVersionFiles`,
`saveRepairedFiles`, `acceptRepair`, `insertDraftVersionRow`/`createDraftVersion`,
`addAssistantMessageAndUpdateVersion`). Att inventera fem skrivare och lita på att
nästa PR minns den sjätte är att bygga samma buggklass en nivå upp. Därför är
kolumnen `GENERATED ALWAYS AS (md5(files_json)) STORED`.

Verifierat mot Postgres-katalogen (`pg_proc.provolatile`) 2026-07-28: `md5(text)`
är `IMMUTABLE` och duger i en genererad kolumn, medan `convert_to(text,name)` är
bara `STABLE` — så `sha256(convert_to(files_json,'UTF8'))` går **inte** att
använda där. Valet stod mellan "kan inte glömmas" (md5, DB-genererad) och "samma
värde som befintliga `hashFilesJson`" (sha256, app-sidan). Vi valde det förra: md5
vs sha256 spelar ingen roll för en ändringsdetektor — detta är ingen
säkerhetsgräns, och en kollision skulle ge en utebliven omkörning, inte
korruption — medan "glömbar" är precis felet vi stänger.

**`files_updated_at` stryks.** `now()` är volatil och kan inte genereras, så
kolumnen skulle kräva antingen en trigger eller just den per-skrivar-disciplin vi
avskaffade — för noll funktionell vinst, eftersom revisionen allena svarar på
frågan "gäller verdiktet det här innehållet?".

### 3. Steg 1–2 levereras separat från steg 3

**Beslut: ja** — och det gav den mätning som visade att man inte kan vänta på en
frekvens. Mätningen 2026-07-30 (read-only mot prod, över **läsarens** rad per
version, inte över all historik): 141/141 versioner hade revision, 113 läsbara
telemetrirader varav **5 stämplade** och **0 kända mismatchar**. Fem rader är för
få för ett frekvenspåstående; vad siffran faktiskt avgör är att ett tillräckligt
underlag ligger veckor bort vid dåtidens trafik. Därför byggdes steg 3 bakom
flaggan som risktabellen ändå föreskrev, och frekvensen läses nu ur steg 3:s egen
telemetri i stället.

SQL:en som mätte (behållen så nästa mätning gör samma val som läsaren):

```sql
WITH senaste AS (
  SELECT DISTINCT ON (t.version_id)
         t.version_id, t.files_revision, t.quality_gate_result
    FROM generation_telemetry t
   WHERE t.version_id IS NOT NULL
   ORDER BY t.version_id, t.created_at DESC
)
SELECT count(*) FILTER (WHERE s.files_revision IS NOT NULL) AS stamplade,
       count(*) FILTER (
         WHERE s.files_revision IS NOT NULL
           AND s.files_revision IS DISTINCT FROM v.files_revision
       ) AS mismatch,
       count(*) FILTER (
         WHERE s.quality_gate_result IS NOT NULL
           AND s.files_revision IS DISTINCT FROM v.files_revision
       ) AS mismatch_med_verdikt
  FROM senaste s
  JOIN engine_versions v ON v.id = s.version_id;
```
