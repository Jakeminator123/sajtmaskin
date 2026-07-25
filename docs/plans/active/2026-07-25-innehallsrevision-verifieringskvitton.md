---
status: active
owner: unassigned
created: 2026-07-25
topic: Innehållsrevision på `engine_versions` — så att varje verdikt/kvitto (quality gate, promote-guard, runtime-ready, statusbadge) kan säga VILKET innehåll det gäller i stället för bara vilket versionId
source: Re-triage 2026-07-25 av tre backlog-rader (Codex P1/P2 på #352 + M#pv4) — kodverifierat mot master `6b459ede`, PR #607
---

# Innehållsrevision för verifieringskvitton

## TL;DR

`engine_versions` har **ingen** `updated_at` och **ingen** hash av `files_json`
(`src/lib/db/schema.ts:609-650`). Därför kan inget lager i systemet svara på frågan:

> "Gäller det här verdiktet/kvittot det innehåll som ligger i `files_json` **nu**?"

Alla verdikt hängs i stället på `versionId` — men `versionId` är **inte** en
innehållsidentitet: samma rad kan skrivas om av user-edit (`/files`), av
server-repair (`targetVersionId`-rewrite) och av autofix. Det gör att en
verdikt-läsare kan få ett svar som beskriver ett *tidigare* innehåll utan att
kunna upptäcka det.

Detta är **plan, ingen implementation.** Kräver ägarbeslut: additiv migration +
ändrat statuskontrakt.

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

## Skiss (för beslut, ej beslutad)

**Steg 1 — primitiven (additiv migration).**
`engine_versions` får `files_revision text` (stabil hash av `files_json`) och
`files_updated_at timestamptz`. Sätts av **varje** `files_json`-skrivare:
`updateVersionFiles`, `saveRepairedFiles`, finalize-runnern. Additivt +
`IF NOT EXISTS` enligt repots prod-migrationsmönster; gamla rader får `null`
och ska behandlas som "okänd revision" → nuvarande fail-open-beteende
(back-compat: template-import, rollback, legacy).

**Steg 2 — stämpla verdikten.**
`generation_telemetry` får `files_revision` på raden gate:n faktiskt bedömde.
Preview-sessionen bär revisionen den bootat. Bus-events bär den vid emit.

**Steg 3 — läsarna jämför.**
`getLatestQualityGateResultForVersion` → hämta senaste rad **för aktuell
revision**; ingen matchning = `null` (= "ingen gate körd för detta innehåll").
`recordPreviewRuntimeOutcomeForVersion` stämplar bara rader vars revision
matchar det VM:en servar. `confirmedPreviewReadyVersionIds` nycklas på revision.
`reconcileTerminalDbState` får revisionen och kan degradera ett terminalt
bus-verdikt som gäller en äldre revision — utan att röra det normala
render-first-fönstret.

## Risker

| Risk | Hantering |
|---|---|
| Hash-kostnad på varje files-skrivning (~120 KB) | Billig jämfört med skrivningen själv; mät innan/efter |
| `null`-revision på gamla rader tolkas som mismatch → blockerar legitima promotes | Explicit regel: `null` = okänd = nuvarande fail-open, aldrig blockerande |
| Steg 3 gör tidigare fail-open-vägar strikta → nya false-red | Leverera steg 1–2 först (rent additivt, inget beteende ändras), steg 3 bakom flagga med telemetri på hur ofta mismatch inträffar |
| Hash-instabilitet (nyckelordning i JSON) | Hasha normaliserad form, inte rå sträng; testlås determinismen |

## Verifiering

`npm run typecheck` · `npm run db:schema-drift` · riktade vitest för
`promote-guard`, `generation-telemetry`, `stale-verification`,
`version-status-display` · nytt test som visar att ett verdikt för revision N
inte längre besvarar en fråga om revision N+1 · docs-sync mot
`docs/schemas/orchestration-signal-contract.md`.

## Beslutspunkter (ägaren)

1. Ska steg 3 ändra fail-open till fail-closed vid **mismatch**, eller bara vid
   mismatch *plus* ett explicit blockerande verdikt? (Avgör om detta kan ge nya
   false-red.)
2. Ska `files_revision` vara en hash av innehållet eller en monoton räknare?
   (Hash upptäcker även "ändrad och återställd"; räknare är billigare.)
3. Levereras steg 1–2 separat från steg 3? (Rekommendation: ja — steg 1–2 är
   rent additiva och kan mätas i prod innan något beteende ändras.)
