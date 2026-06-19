---
id: gm-akt-A7-2
status: in-progress
parent: gm-omrade-07-false-green-hardning
blocked_by: []
owner_files:
  - src/lib/config.ts (ny FEATURES.refuseDossierStubs, default-off)
  - src/lib/gen/autofix/rules/cross-file-import-checker.ts (flag-gated degrade/blocker)
  - (ny) src/lib/gen/autofix/rules/refuse-dossier-stubs.stability.test.ts
risk: medel
---

# A7-2 — autofix vägrar dossier-stub (flag-gated, default-OFF)

## Bakgrund (kod = sanning)
`cross-file-import-checker.ts:651-665` skapar idag en tyst null-render-stub för
dossier-exponerade importer + `console.warn`. In-code TODO säger uttryckligen:
*"gate stub creation behind `FEATURES.refuseDossierStubs` and throw a loud error"*.
BUG-SWARM N#1: att vägra/degradera dossier-stubbar **kan flippa version-status röd och
bryta generering** → flag-gated P5+ policy, **default-off**.

## Mål (smalt, default-OFF)
Implementera kapabiliteten **bakom flagga, avstängd som default** så att master-beteendet
är **oförändrat**: när `FEATURES.refuseDossierStubs` är PÅ markeras en dossier-exponerad
stub som degraded/blocker (inte tyst warning); när AV → exakt dagens beteende.
Leverans-bias: bygg förmågan, ändra inte default-runtime.

## Inte scope
- Flippa default till PÅ (separat beslut när område 5/6 landat).
- Röra icke-dossier-stubbar (vanliga cross-file-stubbar förblir warning-only — dokumenterat avsiktligt i `generation-stream-post-finalize.ts:229-232`).
- #149:s filer (promote-guard, quality-gate-route, chat-repository, generation-telemetry).

## Owner-yta
- `src/lib/config.ts`: `refuseDossierStubs: isAffirmativeEnvValue(env.SAJTMASKIN_REFUSE_DOSSIER_STUBS)` (default-off, samma mönster som `f2ProductPostcheck`).
- `cross-file-import-checker.ts`: gate dossier-stub-grenen på flaggan.
- Ny `*.stability.test.ts`: flagga AV → stub skapas som idag (oförändrat); flagga PÅ → degrade/blocker-signal, ingen tyst stub.

## Verifiering
- `npm run test:stability` grön (båda flagg-lägen).
- `npm run typecheck` 0 fel. Default-runtime oförändrat (flagga av).

## Risk
Medel — runtime-pipeline-yta även om default-off. **Öppnas som DRAFT** för Jakes review
(PR-mergaren rör den ej: protected path). Mergas inte autonomt.
