# K5 — housekeeping: scheman, policys, docs, embeddings

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)
Status: **sist** — körs när K1–K4 är mergade, så svepet ser slutläget.

## Problemet

K1–K4 (plus #1087/#1090) ändrar registerdata, variant-texter, prompt-rendering
och tar bort moduler. Repots regel är att scheman, control-plane-register,
genererade docs och Backoffice ska **spegla runtime** — det här svepet stänger
gapet i en riktad PR i stället för att smeta ut det över fyra.

## Uppgift

1. **Strikta scheman:** verifiera `docs/schemas/strict/scaffold-variant.schema.json`
   och `variant-template-addenda.schema.json` mot TS-typerna efter K1/K2.
   Ändrade fält ⇒ uppdatera schema + `docs/schemas/*.md`-motsvarigheten.
2. **Control-plane:** `config/control-plane/{schema,policy}-registry.json` —
   raderade filer (K4) får inte stå kvar som `sourceOfTruth`;
   `npm run` -kommandot i `scripts/control-plane/check-registry.mjs` ska vara
   grönt.
3. **Genererade projektioner:** `npm run docs:generate` + `docs:check` +
   `docs:links`. Kontrollera särskilt `docs/generated/scaffolds.generated.md`
   och `variants.generated.md` mot K2:s nya kompositioner samt
   `policies.generated.md` efter K4.
4. **Embeddings:** `npm run embeddings:ensure` + parity-test — variant- och
   scaffold-index ska matcha slutläget (K2 regenererar variant-index; svepet
   verifierar helheten).
5. **Handskrivna kontrakt:** `docs/contracts/scaffold-system.md` och
   `docs/schemas/scaffold-contract.md` — uppdatera hero-/variantavsnitt och
   addendum-statustext så de speglar K1–K4; ta bort döda rader/länkar.
6. **Backoffice-speglar:** kör `python -m pytest backoffice/ -q`; laga
   paritetsbrott som K1–K4 lämnat (t.ex. curator-katalogens antaganden).
7. **Backlogg-rapport (ingen fix här):** skriv in `app-shell` 0 % preview-OK
   (5 av 5, telemetri 11–19 aug) som rad i `BUG-SWARM-BACKLOG.md § Aktiv kö`
   om den inte redan finns.
8. **Planhygien:** uppdatera denna plans master-plan + B4-raderna i
   briefing-planen; flytta färdiga aktivitetsfiler enligt `plan-lifecycle.mdc`.

## Vad som INTE ingår

- Nya kontroller/CI-lanes — bara synk av befintliga.
- Kodändringar utöver vad paritetsbrotten kräver.
- App-shell-buggen (bara backloggraden).

## Verifiering

- `npm run devtest` (typecheck + scaffold/dossier/test/lint)
- `npm run docs:generate && npm run docs:check && npm run docs:links`
- `npm run embeddings:ensure`
- `python -m pytest backoffice/ -q`

## Klart när

CI-grönt svep där alla genererade ytor, scheman och register speglar koden
efter K1–K4, och app-shell-fyndet är spårat i backloggen.
