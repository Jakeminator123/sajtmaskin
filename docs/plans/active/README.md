# Aktiva planer

Router till arbete som fortfarande kan styra nya ändringar. Levererat →
[`../avklarat/`](../avklarat/); parkerat → [`../archived/`](../archived/);
full historik → git. Livscykel:
[`plan-lifecycle.mdc`](../../../.cursor/rules/plan-lifecycle.mdc).
Buggar/beslut → [`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md) —
kopiera inte kön hit.

## Pågående spår

| Spår | Plan | Nästa steg |
| --- | --- | --- |
| Null-scaffold-kohort + Scaffold: Av | [`2026-08-12-null-scaffold-kohort/00-master-plan.md`](2026-08-12-null-scaffold-kohort/00-master-plan.md) | A: prod SELECT kohort×tri-state · parallellt: ägare bygger bas-stomme för Av · sedan B/C |
| Restlista: builder-UI, F3-scope, env | [`2026-07-27-restlista-builder-f3-env.md`](2026-07-27-restlista-builder-f3-env.md) | Öppna: **R8** aktiverings-E2E · **R5** (blockerad) · **R12** (kräver beslut) · **R13** (prod-observation) |
| React hooks-refaktor (builder, utan disable) | [`2026-08-11-react-hooks-refaktor/00-master-plan.md`](2026-08-11-react-hooks-refaktor/00-master-plan.md) | Efter #889: ta bort medvetna `eslint-disable` yta för yta; pekare i backlog-skuld |
| Prodkörning 2026-08-11: vad går snett | [`2026-08-11-prodkorning-observability/00-master-plan.md`](2026-08-11-prodkorning-observability/00-master-plan.md) | Kö 1–2 (F3 `package.json`, AI-sidans attrapp) är obehandlade · mät `/tmp` före ändring · beslut om `REFUSE_DOSSIER_STUBS` i prod |

Prod-körningens dossier-spår (2026-08-05) är **parkerat** — levererat i
[`../avklarat/README.md`](../avklarat/README.md). Resterna A5 och `SM-025` lever
i [`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md). Ägarens UX-punkter
(U1–U8) är **inte** backloggförda — de väntar på go per punkt och ligger kvar i
plantexten:
[`../archived/2026-08-05-prodkorning-dossiers/`](../archived/2026-08-05-prodkorning-dossiers/).

## Ägarbeslut

Fattade: [`docs/decisions/README.md`](../../decisions/README.md).
Öppna: [`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md).

## När en plan är klar

Väv in en rad i [`../avklarat/README.md`](../avklarat/README.md) och radera
detaljfilen (git = arkiv). Behåll egen fil bara om kod, contract eller
`*.stability.test.ts` citerar den. Svansar → restlistan eller backlog — aldrig
kvar som “pågående” huvudspår.
