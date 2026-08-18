# Dossier-/Byggblock-sanering och UX — styrdokument

Status: Active
Startad: 2026-08-15
Ägarbeslut: 2026-08-15 (riktnings-OK i chatt; detalj-OK per aktivitet, se § Beslut)

## Kärnprincip

**Buggar, dubbletter och legacy-arv bort — utan nya parallella lager.
En sanning per sak: en nyckelyta, en statuskälla, en materialiseringsväg.**

Nära MVP gäller stabilitet före coolhet (`mvp-scope-freeze.mdc`). Spåret tar
bort friktion och falska signaler i Byggblock-/integrationsflödet. Varje ny
mekanism ska ersätta en gammal — aldrig läggas bredvid.

## Bevisunderlag

Read-only-granskning 2026-08-15 (worktree `chore/dossier-logic-review`,
master @ `1695a8e`), korsverifierad mot ägarens externa granskningsmaterial
(lokalt, gitignorerat: `övrigt/dossier-logik/v2/`). Kodspårade huvudfynd:

| # | Fynd | Kanonisk ägare |
|---|---|---|
| 1 | Katalogklick på ett Byggblock skickar direkt en F2-follow-up (`Lägg till byggblocket "…" (id: …)`) → sajten byggs om innan nyckel/placering kan anges | `src/components/builder/preview-panel/dossiers/usePreviewPanelDossiersController.ts`, `src/lib/builder/dossier-id-request.ts` |
| 2 | «Bygg integrationer» = `POST …/finalize-design` + syntetisk chattprompt `"Bygg integrationer nu utifrån den finaliserade designversionen."` med `meta.lifecycleStage: "integrations"`. Ingen Deep Brief körs i F3 (init/clear-redesign-only) | `PreviewPanelF3Trigger.tsx`, `src/app/builder/builder-shell-content/use-preview-layout.ts` |
| 3 | Multi-hit/negation i providerval kan tyst välja capability-defaulten med reason `relevance-keyword` — ser ut som ett explicit val och kan persisteras | `src/lib/gen/dossiers/select.ts` `pickForCapability` |
| 4 | `configured` faller tillbaka till plattformens `process.env` när projektset saknas | `src/lib/gen/dossiers/select.ts` `isConfigured` |
| 5 | F3-prompten kan bära två integrationsauktoriteter i approval-only-rundor (`SM-005`) | `src/lib/gen/system-prompt/build-dynamic-context.ts` ~308–323 |
| 6 | Tre env-närliggande ytor, status på fyra ställen, död copy («Integrationspanelen»), vilseledande copy («Spara och aktivera», «Deep brief: på» ekas på follow-ups) | se aktivitetsfiler |
| 7 | Placering av ett blocks UI är LLM:ns fria val («Place `<ChatPanel />` somewhere…») — inget användarval, inget placeringskontrakt | `data/dossiers/hard/openai-chat/instructions.md` |

Defektsanning bor i [`BUG-SWARM-BACKLOG.md`](../../../../BUG-SWARM-BACKLOG.md)
(`SM-005`, `SM-008`, `SM-009` refereras härifrån — kön kopieras inte hit).
Nya kodbekräftade defekter utan rad (fynd 3 och 4) får backlograd när
respektive aktivitet landar, om de inte fixas direkt.

## Beslut (ägaren, 2026-08-15)

| # | Fråga | Beslut |
|---|---|---|
| D1 | Scope nära MVP | Buggar, dubbla/onödiga element och legacy-arv tas bort. Inga breda nya features |
| D2 | Dubbla ytor/sanningsytor | Konsolideras till **en** yta per sak. Riktnings-OK; detaljer per aktivitet |
| D3 | Byggblock-ytan | «För liten, ful» — görs större och snyggare (ersätter popovern, ingen ny parallell yta) |
| D4 | «Bygg integrationer»-knappen | Ska bli **bärande eller bort**. Avgörs i M1 — rekommendation: bort som separat knapp, åtgärden flyttar in i Byggblock-ytan |
| D5 | F2/F3 som begrepp | Fasas ut medvetet ur användarytor, docs och regler. Regler FÅR ändras. Kodidentifierare (`fidelity2/3`, `lifecycleStage`) behålls per `terminology.mdc` |
| D6 | `materialize_integration` | Välkommet att utreda/bygga. Arkitekturbeslut → `/818` före implementation |

## Vågor

Varje aktivitet är en egen PR i eget worktree. Våg 1 är ren buggfix/städ
(default-OK enligt MVP-biasen). Våg 2–3 har riktnings-OK ovan men kräver en
mening till ägaren före implementation om scopet växer.

### Våg 1 — buggar och lögner (inga nya beslut behövs)

| Id | Uppgift | Kanonisk ägare |
|---|---|---|
| B1 | Providerval: negation/multi-hit/okänd provider får inte tyst ge defaulten | `src/lib/gen/dossiers/select.ts` |
| B2 | En F3-promptauktoritet (`SM-005`) | `src/lib/gen/system-prompt/build-dynamic-context.ts`, `session-contracts.ts` |
| B3 | Ta bort plattforms-`process.env`-fallbacken för `configured` | `src/lib/gen/dossiers/select.ts` |
| B4 | Copy-/docs-städ: död «Integrationspanelen», «Deep brief: på»-ekot, «Spara och aktivera», analytics-driften | `tool-parts.tsx`, `helpers-model-info.ts`, `DossiersPopoverView.tsx`, `docs/contracts/dossier-system.md` |
| B5 | F3-marker persisterar env-nycklar + detaljkort räknar om post-merge (`SM-008`, `SM-009`) | `src/lib/gen/stream/f3-continuation.ts` (+ skrivaren i `generation-stream.ts`) |

### Våg 2 — konsolidering (efter våg 1)

| Id | Uppgift | Kanonisk ägare |
|---|---|---|
| K1 | En nyckel-/statusyta: Byggblock-ytan enda env-skrivplatsen; 412-ytan och LaunchReadinessCard pekar dit; en statuskälla | `preview-panel/dossiers/`, `readiness/` |
| K2 | Katalogklick regenererar inte direkt: valet stage:as med placering + nycklar → EN bekräftelseåtgärd | `usePreviewPanelDossiersController.ts`, `use-registry-insert.ts` |

### Våg 3 — kräver ägaren närvarande

| Id | Uppgift | Varför den väntar |
|---|---|---|
| U1 | Byggblock-ytans lyft: större yta, tydlig per-block-info (status, nycklar, demoläge, placering) | Designval — ägaren vill se förslag |
| M1 | Strukturerad materialisering (`materialize_integration`) ersätter syntetisk prompt; knappens öde enligt D4 | Arkitekturbeslut → `/818` |
| F1 | F2/F3-begreppsutfasning i användarytor, docs och regler | Rör regler + många ytor; körs sist så nya ord landar på konsoliderade ytor |

## Vad varje agent måste leverera (housekeeping-kontraktet)

Ingen PR i spåret är klar utan alla sju:

1. **Ändra kanonisk ägare**, inte konsumenter (`pipeline-rules.mdc`).
2. **Test som låser fixen** — ett test som hade fångat defekten.
3. **Docs speglar runtime.** Ersätt gammal text. Genererade ytor:
   `npm run docs:generate` + `npm run docs:check` + `npm run docs:links`.
   Terminologibyte: glossary + `config/naming-dictionary.json` i samma PR.
4. **Backoffice-paritet** vid dossier-/axel-/statusändringar
   (`backoffice/pages/dossiers.py`, paritetsgrindade speglingar).
5. **Schema-/policy-synk:** `docs/schemas/strict/*` vid kontraktändring;
   `config/env-policy.json` + `docs/ENV.md` vid env-nycklar;
   `npm run dossiers:validate-all` + `npm run dossiers:capability-map:write`
   när manifest rörs.
6. **Backlog och beslut ajour:** bocka av/lägg till `SM`-rader; registrera
   ägarbeslut i beslutsloggen (`docs/decisions/`) när de implementerats.
7. **Radera det som ersätts** — ingen gammal väg kvar bakom flagga; knip ren.

Verifieringsminimum per ändringstyp: se `workflow.mdc`. Alltid
`npm run typecheck` + riktad vitest på det som rörts.

## Arbetssätt

- **Eget worktree per aktivitet** (`git worktree add ..\sajtmaskin-<id> -b fix/<id> origin/master`
  — basen är inte valfri, se `agent-worktree.mdc`), aldrig huvudcheckouten.
  Städa med `npm run worktree:remove -- <sökväg>`.
- Buggarna i våg 1 kan köras via `/kedja` (en bugg per körning).
- M1 startar med `/818`-svärm på beslutsfrågan.
- Subagenter (även bugbot): Grok enligt `subagent-models.mdc` — slå upp aktuell
  slug i sessionens modellista (2026-08-15: `cursor-grok-4.6-xhigh`).
- Merge-grind: kanonisk i `pr-merge.mdc`. Det mesta rör protected paths
  (`src/lib/gen`, `src/app/api`, `src/components/builder`) → oberoende
  bugbot-pass per PR.

## Framsteg

| Batch | Punkter | Status |
|---|---|---|
| Förarbete | Granskning + plan skriven | Klar |
| Våg 1 | B1–B5 | **Klar** (PR #1023, 2026-08-17) |
| Våg 2 | K1–K2 | **Klar** (PR #1023) |
| Våg 3 | U1, M1, F1 | **Klar** (PR #1023; M1 i /818-avgjord minimal form — beslut D4/D6 i `docs/decisions/README.md`; U1-design godkänns via PR-skärmdumpar) |

Körlogg: [`LOGBOOK.md`](LOGBOOK.md).

## Related

- Aktivitetsfiler: [`aktiviteter/`](aktiviteter/)
- Buggsanning: [`BUG-SWARM-BACKLOG.md`](../../../../BUG-SWARM-BACKLOG.md)
- Dossier-kontraktet: [`docs/contracts/dossier-system.md`](../../../contracts/dossier-system.md)
- F2/F3-semantiken (skrivs om i F1): [`docs/concepts/f2-and-f3.md`](../../../concepts/f2-and-f3.md)
- Fusklapp: [`FUSKLAPP-BYGGBLOCK.md`](../../../../FUSKLAPP-BYGGBLOCK.md)
