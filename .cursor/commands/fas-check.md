# Fas-check

Reviewa en avslutad fas innan commit/push. Målet är smal kvalitetssäkring: buggar, docs/schemas/backoffice-sync och städ inom diffens scope.

## När den ska köras

Kör efter större agentjobb/fas, särskilt om diffen rör:

- `src/lib/gen/**`
- `src/lib/api/engine/**`
- `src/lib/providers/own-engine/**`
- `data/dossiers/**`
- `config/**`
- `docs/schemas/**` eller `docs/architecture/**`
- `backoffice/**`, `sajtmaskin_backoffice.py`
- `scripts/**`

## Stop-hook betyder

`stop` är en Cursor hook-event som kan köras när agentens svar/körning är klar. Den kan användas som påminnelse efter stora agentjobb, men är lätt att göra för brusig. I det här repo:t börjar vi därför med en säkrare `beforeShellExecution`-hook som varnar precis före `git commit` om diffen ser riskabel ut.

## Arbetsordning

1. Kör `git status --short --branch`, `git diff --stat`, `git diff --name-status`.
2. Identifiera vilka ytor som rörts: pipeline, dossiers, scaffold, preview, backoffice, scripts, docs/schemas.
3. Gör review före ändringar:
   - Buggar/regressioner/testluckor.
   - Docs/schemas/strict schemas/backoffice/scripts som måste följa runtime.
   - Död/duplicerad/halv-ersatt logik inom diffens scope.
4. Om diffen är stor eller riskig: starta read-only subagenter i stället för att gissa:
   - `bugagent`: reviewa buggar, edge cases, regressionsrisk och saknade tester.
   - `backoffice-docs-agent`: kontrollera docs, `docs/schemas/`, `docs/schemas/strict/`, `backoffice/`, `sajtmaskin_backoffice.py`, och relevanta `scripts/`.
   - `städagent`: leta efter död kod, dubbla sanningar, gamla termer, ologiska filnamn, temporära filer.
5. Gör bara små tydliga fixar. Större arkitekturbeslut rapporteras som nästa steg.
6. Verifiera med minsta relevanta set:
   - Alltid vid TS-kod: `npm run typecheck`
   - Pipeline/gen: relevanta `vitest` + `node scripts/dev/check-unicode-regex.mjs` vid prompt-regex
   - Dossiers: `npm run dossiers:validate-all`
   - Scaffolds: `npm run scaffolds:validate`
   - Backoffice: `python -m pytest backoffice/test_pages_import_smoke.py -q`
   - Slut: `git diff --check`
7. Svara med:
   - vad som hittades och fixades
   - vad som medvetet inte rördes
   - verifiering
   - om ändringen är redo för `/avslutning`

## Viktiga begränsningar

- Commit/push bara om användaren uttryckligen ber om det.
- Rör inte andra agenters ändringar utanför fasens scope.
- Ersätt gammal docs-text när runtime ändras; lägg inte en parallell sanning bredvid.
- Bugbot/PR-review ersätter inte den här lokala sync-checken. Bugbot är extra lager efter push/PR.
