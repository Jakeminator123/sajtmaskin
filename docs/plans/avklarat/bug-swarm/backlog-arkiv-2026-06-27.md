# Bug-backlog — arkiv (2026-06-27)

> Flyttade `[x]`-rader från [`BUG-SWARM-BACKLOG.md`](../../../../BUG-SWARM-BACKLOG.md) efter triage mot master 2026-06-27. Äldre historik: [`backlog-arkiv-2026-06-24.md`](backlog-arkiv-2026-06-24.md).

## Fixar flyttade från Aktiv kö

| Klar | Status | Prio | Fynd | Källa | Fix-referens |
| --- | --- | --- | --- | --- | --- |
| [x] | Fixad | P2 | Control-plane registry: `#fragment`-källreferenser valideras inte (strippade efter `#`, kollade bara att basfilen finns) → false-green i self-validating-kartan | #202 | `scripts/control-plane/check-registry.mjs` `resolveSource()` resolvar nu JSON-fragment och failar på saknad nyckel; positivt regressionstest i `src/lib/control-plane/registry.test.ts`. Branch `fix/bug-quickwins`. |
| [x] | Fixad | P2 | Nya sektions-capabilities (`logo-cloud`, `stats-counter`, `feature-grid`, `cta-section`, `gallery-lightbox`, `stepper`) exponeras bara via Deep Brief → korta init + follow-ups missar dem | #242 | Follow-up-vokabulär + detektion (#250). Init lämnar fast lane vid sektionsord (#253). `promptInstructionMode` i dossiers (#254). Residual (capability-inference-brygga saknar sektions-id:n) följs nu via G#25/G#26 i Aktiv kö. |
| [x] | Fixad | P3 | Brief-drift-detektion läste `scaffoldNomination`/`variantNomination` från briefen, men brief-strict-schemat producerar dem aldrig → `scaffold_drift`/`variant_drift`-loggningen var död kod (fyrade aldrig) | G#56 | Tog bort de döda läsarna i `orchestrate.ts` (scaffold- + variant-drift-blocken), den nu oanvända `getScaffoldIds`-importen, och `scaffoldNomination`/`variantNomination`-fälten i `system-prompt/types.ts`. `emitFollowUpFreezeDrift` (live freeze-drift-signal) orörd; inga tester refererade loggnycklarna. Stale-verifierad av scout-svärm 2026-06-28. Branch `chore/remove-dead-scaffold-variant-drift`. |

## Avfärdat / by-design (verifierat 2026-06-27)

| Fynd | Källa | Varför inte aktiv bugg |
| --- | --- | --- |
| `simpleWebsitePath` blockar `CTA-knapp` från fast lane (bredare `cta`-match än follow-up-vocabulary) | M#1 (EGEN-05) | By-design för init: en namngiven sektions-capability ska gå full dossier-pipeline (#242 Alt A). Testet `simple-website-path.test.ts:134` asserterar blockeringen avsiktligt. Skillnaden mot follow-up (som exkluderar `CTA-knapp` som styling-tweak) är medveten. → flyttad till Beslut & policy. |

## Stale "Behöver repro"-rader (kodfixade, verifierade 2026-06-28)

| Fynd | Källa | Varför arkiverad |
| --- | --- | --- |
| B01-klient: `fetchPreviewHostStatus` versionId-blind polling (re-pin saknades) | B01 | Klient-sidan re-pinnar redan på `versionId`: `fetchPreviewHostStatus` (`preview-host-client.ts`) har en `expectedVersionId`-guard som vägrar resume vid mismatch, callers trådar sessionens `versionId` (`tier2-resume.ts` → `preview-status`/`preview-session`), och host `/status` returnerar `versionId` (`preview-host/src/server.js`). Täckt av version-pinning-tester i `preview-host-client.test.ts`. Stale-verifierad av scout-svärm 2026-06-28 (radens påstående `preview-host-client.ts:134 kollar bara running` matchar inte längre koden). |
