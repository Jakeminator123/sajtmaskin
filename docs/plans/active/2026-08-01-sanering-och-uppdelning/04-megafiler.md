---
status: active
owner: unassigned
topic: Uppdelning av megafiler ansvar för ansvar — nio kärnfiler + fyra backoffice-filer från GPT-rapporten, plus tretton egna hotspot-fynd. En fil per PR, beteendebevarande, befintliga tester orörda.
created: 2026-08-01
source: Master-planens steg 5–6. Radantal räknade på master `c3a9273d0` 2026-08-01 (något lägre än GPT-rapportens, som mätte en annan checkout).
---

# Steg 5–6: megafiler

## Regler

- **En fil per PR.** Extrahera moduler efter ansvar; ändra inte beteende.
- Befintliga tester ska vara **orörda och gröna** (bara import-paths får
  justeras). Ny modul med egen yta får gärna eget riktat test.
- Stryk `export`-modifierare som inte behövs vid extraktionen
  (kopplar till [`02-dod-kod.md`](02-dod-kod.md) spår C).
- `npm run typecheck` + riktade vitest per PR; backoffice-filer dessutom
  `backoffice-tests`-lanen.
- Filer som rörs av #706/#707 (`BuilderShellContent.tsx`, deploy-routen)
  delas **först efter** att de PR:arna är mergade.

## Prioritetsordning (rapportens lista, verifierade radantal)

| Ordning | Fil | Rader | Snittytor (ansvar per extraktion) |
|---|---|---|---|
| 1 | `src/app/builder/useBuilderPageController.ts` | 1 896 | entry-hydrering · generation-preferenser · version/preview-synk · projekt/deploy-hydrering |
| 2 | `src/components/builder/preview-panel/PreviewPanel.tsx` | 1 610 | composer-actions · sid-actions · inspector-actions · surface/overlays |
| 3 | `preview-host/src/runtime.js` | 3 444 | package-install · verify-jobs · processlivscykel · proxy/inspect · workspace/storage-cleanup |
| 4 | `src/lib/logging/generation-log-writer.ts` | 2 011 | filsystem/routing · statusprojektion · fault-fix-index · observability · summaries |
| 5 | `src/lib/gen/stream/finalize-preflight.ts` | 1 596 | home-routeanalys/recovery · Tier-2-hygien · route shells/contracts · pass-runner |
| 6 | `src/components/builder/BuilderMessageTooling.tsx` | 1 542 | UI-kort · agentlogg · pending replies/env · outputparsers |
| 7 | `src/lib/gen/verify/server-verify.ts` | 1 492 | lease · verifiering · build-error-trigger · repair-exekvering |
| 8 | `src/app/builder/BuilderShellContent.tsx` (efter #706/#707) | 1 338 | deploy/domän · F3/readiness · registry-insert · preview-layout |
| 9 | `src/lib/gen/verify/repair-loop.ts` | 1 157 | types · targeting · context · deterministisk prepass · LLM-pass · final gate |

Backoffice (samma regler, `backoffice/pages/` har redan modulmönster):

| Fil | Rader |
|---|---|
| `backoffice/pages/scaffold_lifecycle.py` | 2 462 |
| `backoffice/pages/dossiers.py` | 1 848 |
| `backoffice/shared.py` | 1 574 |
| `backoffice/pages/scaffold_wizard.py` | 1 137 |

## Egna hotspot-fynd (saknades i GPT-rapporten)

Kandidater att ta efter listan ovan — samma regler. Datafiler undantagna
(`src/lib/gen/data/lucide-icons.ts` 2 048 rader och
`src/lib/templates/template-data.ts` 1 096 är genererade listor, inte
refaktormål).

| Fil | Rader | Notering |
|---|---|---|
| `src/app/api/audit/route.ts` | 1 623 | En API-route på 1 600+ rader — dela handler/analys/persistens |
| `src/components/builder/preview-panel/PreviewPanelCodeSectionEditors.tsx` | 1 498 | |
| `src/lib/hooks/chat/stream-handlers.ts` | 1 395 | |
| `src/lib/gen/autofix/pipeline.ts` | 1 372 | Rör false-green-ytan — ta efter steg 1 |
| `src/app/api/v0/deployments/route.ts` | 1 352 | Efter #706 (deploy-överlapp) |
| `src/lib/hooks/chat/helpers.ts` | 1 324 | "helpers" = ansvarslös samlingsyta |
| `src/lib/backoffice/template-generator.ts` | 1 272 | |
| `src/components/builder/VersionHistory.tsx` | 1 271 | |
| `preview-host/src/server.js` | 1 201 | Ta ihop med runtime.js-serien |
| `src/components/builder/preview-panel/PreviewPanelDossiers.tsx` | 1 191 | |
| `src/lib/gen/autofix/import-validator.ts` | 1 187 | Rör false-green-ytan |
| `src/components/modals/audit-modal.tsx` | 1 127 | |
| `src/lib/api/engine/chats/create-chat-stream-post.ts` | 1 065 | Rörs av false-green-fix 2 — synka |

## Status 2026-08-01

Levererat: **#1 `useBuilderPageController`** (PR #724 — 2 041 → 917 rader,
14 ansvarshooks, hook-ordningen mekaniskt verifierad),
**#3 `runtime.js`** (PR #727 — fasad + 7 moduler; agenten dog på API-limit
efter push, PR öppnades från branchen), och
**#4 `generation-log-writer`** (PR #722 — fasad på 25 rader + 12 moduler,
artefakt-diff mot master: 67/67 identiska loggfiler). Övriga ej påbörjade.

## Klart-kriterium

Ingen fil i `src/`, `preview-host/` eller `backoffice/` över ~1 200 rader
(exkl. genererade datafiler), utan att någon befintlig test ändrat semantik.
Bocka av per fil i denna tabell.
