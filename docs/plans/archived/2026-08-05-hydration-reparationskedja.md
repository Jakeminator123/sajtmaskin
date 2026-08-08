---
status: archived
owner: unassigned
topic: Hydration-/browser-fel på genererade sajter — sluta lära ut mönstret, och koppla browser-runtime-fel till den befintliga signalytan i stället för att bygga en ny reparations-grej. Fem steg i beviskravsordning.
created: 2026-08-05
source: Prod-observation chat 9cdb3e31 (2026-08-05) + förundersökning i två agentpass — kod friad med filbevis (logs/hydration-9cdb3e31/), detektor/scaffold/prompt-luckor filverifierade mot master samma natt. Ägarbegäran 2026-08-05: "koppla ihop med befintlig reparations-fix på ett smart sätt" — steg 3 är därmed uttryckligen beställt, inte fryst.
---

> Status: Archived
> Not current architecture.
> Do not use as runtime guidance.
> Replaced by: [BUG-SWARM-BACKLOG § Behöver repro](../../../BUG-SWARM-BACKLOG.md)
>
> Parkerad 2026-08-08: steg 1–3 levererade (#777, #778). Steg 4 (RepairGate-koppling)
> och steg 5 (patch-lane settle) är datablockerade och bor nu som rader i backloggens
> repro-sektion — de aktiveras av data, inte av mer plantext.

# Master-plan: hydration-fel och reparationskedjan

## TL;DR

Genererade sajter visar återkommande Next-dev-overlay-"Issues" i builderns
preview. Förundersökningen (2026-08-05) delade rotorsaken i två: ett äkta
kodmönster (icke-deterministisk render, t.ex. `new Date()` i footern) som
plattformen **själv lär ut** och vars detektor är Advisory-only utan
lyssnare, samt en trolig men **obevisad** transient miljöskevhet vid quick
edit (Fast Edit Lane utan HMR). Browser-fel når i dag aldrig DB:n — bara
användaren ser dem.

Planen: sluta lära ut mönstret (steg 1–2, billigast), koppla in den saknade
felkällan i **befintlig** signalyta (steg 3), och först därefter — med data —
besluta om reparationskoppling (steg 4) och patch-lane-fix (steg 5).
Ingen ny reparationsyta byggs: konsolideringssvaret är att alla fixar redan
konvergerar i `engine_version_error_logs` + `generation_telemetry`; det som
saknas är en källa, inte en sammanslagning.

## Verifierad baseline (2026-08-05, natten)

| Fakta | Bevis |
|---|---|
| Detektorn finns, Advisory-only, ingen fixer/prompt äger den | `src/lib/gen/validation/hydration-preflight.ts` + `finalize-preflight.ts` ("Always non-blocking") |
| Ecommerce-scaffolden skeppar mönstret | `src/lib/gen/scaffolds/ecommerce/files/components/site-footer.tsx:42` — `new Date().getFullYear()`; detektorn skannar alla `.tsx/.jsx` utan server/klient-skillnad |
| Prompt-kontraktet saknar determinism-regel | grep i `src/lib/gen/system-prompt/` — inga träffar |
| Volym i prod | 13 chattar / 28 advisory-rader senaste 7 dagarna (agent 2:s DB-svep, ej omkört) |
| Koden för 9cdb3e31 friad | `logs/hydration-9cdb3e31/{v1,v2}` + lokal SSR-verifiering (agent 2) |
| Befintlig räls för browser-fel | `POST /api/engine/chats/[chatId]/versions/[versionId]/error-log` |
| Quick edit-skevheten | **Hypotes (75 %), ej livebevisad** — Fast Edit Lane patchar körande dev-server med HMR bortkopplad (`SAJTMASKIN_PREVIEW_DISABLE_HMR`) |

Relaterat, redan levererat separat: inspektorns bridge→map-återvändsgränd
fixas i PR #774 (eget spår, rör inte denna plan).

## Steg (beviskravsordning)

| # | Steg | Ägare | Status / villkor |
|---|---|---|---|
| 1 | Prompt-regel: förbjud icke-deterministiska värden i render-scope | `src/lib/gen/system-prompt/` | **Levererad** — PR #777 (mergad 2026-08-05); eget required budget-block (bugbot-fynd åtgärdat) + kontraktstest `render-determinism-contract.test.ts` |
| 2 | Scaffold-fix: statiskt årtal i ecommerce-footern | `src/lib/gen/scaffolds/ecommerce/files/components/site-footer.tsx` | **Levererad** — samma PR #777. Rätt förväntan: tystar advisory-bruset och slutar lära ut mönstret; släcker inte i sig veckans overlays |
| 3 | Browser-fel → befintlig error-log: bridge-scriptet fångar hydration-/konsolfel, **buildern (parent) POST:ar** till versionens error-log med Advisory-semantik (`preview:client-error`), dedupe + tak 5/version. Noll ny UI — syns automatiskt i `/logg`, backoffice, OpenClaw-timeline | `src/lib/builder/inspect-bridge-script.ts` + `preview-client-error-report.ts` + befintlig error-log-route | **Mergad** — PR #778 (`feat/preview-client-error-log`). Bugbot: transient POST-miss släpper gaten (fixad); attribuering vid versionsbyte är accepterad best-effort-begränsning (dokumenterad i modulen) |
| 4 | RepairGate-koppling: bekräftat browser-fel + detektor-varning för samma version ⇒ repairable in i befintliga repair-loopen. Ingen ny fixer, ingen ny LLM-ingång | RepairGate | **Blockerad** på steg 3-data — kräver att bekräftade par faktiskt förekommer. Pipeline-regeln "färre LLM-fix-ingångar" gäller |
| 5 | Patch-lane settle: låt patch-svaret invänta recompile innan iframe-reload | `preview-host` Fast Edit Lane | **Blockerad** på live-repro av skevheten på Fly (gör en quick edit i prod och försök reproducera mismatchen). Utan repro: rör inte |

## Relaterat: Product Postcheck (2026-08-05)

Product Postcheck (`SAJTMASKIN_F2_PRODUCT_POSTCHECK`) **körde aldrig i produktion**
före denna gren: den importerade `playwright` rakt av (devDependency) så Chromium
saknades på Vercel → tyst `playwright_unavailable` / fail-open grönt. Den här
PR-grenen (`fix/product-postcheck-runtime-errors`) byter till
`launchCaptureBrowser`, lägger till advisory console/network/hydration-capture,
bounded desktop-crawl (`routesChecked`) och sätter flaggan default-på med
`false`-kill-switch. Advisory-only — ingen RepairGate-koppling (steg 4).

## Utanför scope

- Ändringar i detektorns regler (`hydration-preflight.ts`) — den fungerar.
- Sammanslagning av reparationsytorna (Normalize, autofix, RepairGate,
  scaffold-aware retry, preflight, RenderGate, OpenClaw, RAG) — avvisad;
  de delar redan signalyta.
- Overlayn i previewn ska fortsatt synas — ägarens princip är att felen är
  ärliga; steg 3 speglar dem, döljer dem inte.

## När planen är klar

Steg 1–3 mergade + beslut fattat på 4 och 5 (gör/skippa med skäl) ⇒ väv in som
rad i `../avklarat/README.md` och radera mappen. Uppdatera routern i samma PR.
