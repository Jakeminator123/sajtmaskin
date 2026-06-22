---
id: gm-akt-A7-1
status: in-progress
parent: gm-omrade-07-false-green-hardning
blocked_by: []
owner_files:
  - (ny) src/lib/logging/false-green-projection.stability.test.ts
risk: låg
---

# A7-1 — stabilitetstest: terminal `done` raderar inte degraderingar

## Mål
Lås den **redan sanna** invarianten i den kanoniska statusprojektionen
`selectVersionStatus` (`src/lib/logging/event-bus-projection.ts`): en version som når
`version.done` **efter** `version.degraded` måste fortfarande exponera sina
`degradations[]` — terminal `done` får aldrig läsas som "solid green". Detta är
seed-invarianten *"Placeholder/degraded visas aldrig som success"* (P1 N#1) på den nivå
som redan är implementerad på master.

## Inte scope
- Ändra projektionen eller statussemantiken (bara låsa nuvarande beteende).
- Påstå att stub/placeholder → degraded (det är **inte** sant på master än — A7-2/flagga).
- Duplicera `event-bus-projection.test.ts` (plan-02-fallen finns redan där).

## Owner-yta
En ny `*.stability.test.ts` som anropar den rena `selectVersionStatus` med en
event-sekvens (clean finalize → `verifier_skipped_by_policy` + `product_postcheck_skipped`
→ `version.done`) och asserterar: `phase==="done"`, `done===true`,
`degradations.length>0`, och att en `isSolidGreen()`-helper returnerar `false`. Ingen
live-builder/preview/DB. Oberoende av #149:s filer.

## Verifiering
- `npm run test:stability` grön (nytt case + befintliga).
- `npm run typecheck` 0 fel.

## Risk
Låg. Test-only, låser redan-sann invariant. Auto-merge-OK vid grönt.
