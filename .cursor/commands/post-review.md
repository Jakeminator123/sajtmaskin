# Post-review

Smart eftergranskning av ett genomfört ändringssvep. Målet är att hitta verkliga buggar, docs/schema/backoffice-drift och städbehov utan att skapa agentbrus.

## När den ska köras

Kör efter ett riskigt svep eller före commit/push, särskilt om diffen rör:

- `src/lib/gen/**`
- `src/lib/api/engine/**`
- `src/lib/providers/own-engine/**`
- `src/lib/builder/**`
- `data/dossiers/**`
- `config/**`
- `docs/schemas/**`, `docs/schemas/strict/**` eller `docs/architecture/**`
- `backoffice/**`, `sajtmaskin_backoffice.py`
- `scripts/**`

Kör inte automatiskt efter varje liten ändring. För små, isolerade fixar räcker riktade tester + egen review.

## Grundidé

Parent-agenten äger beslutet. Subagenter ger korta risksignaler, inte facit.

```text
ändringssvep klart
  -> parent avgränsar review-window
  -> klassar ändrade filer
  -> startar bara relevanta read-only agenter
  -> parent verifierar/avfärdar fynd
  -> parent fixar små bekräftade fynd
  -> minsta relevanta verifiering
```

## Arbetsordning

1. Kör `git status --short --branch --untracked-files=all`, `git diff --stat`, `git diff --name-status`.
2. Avgränsa vad som faktiskt ska granskas:
   - Om `/post-review` redan körts tidigare i chatten: granska bara ändringar sedan dess, plus filer som påverkats av nya ändringar.
   - Exkludera tydligt orelaterade användar-/agentfiler. Nämn dem i slutsvaret.
   - Rör inte planfilen om inte användaren explicit bett om planändring.
3. Klassificera diffen:
   - **Buggrisk:** TS/JS/Python runtime, API-routes, prompt-/pipelinekod, verifier/fixers, env, preview.
   - **Docs/schema/backoffice-risk:** `docs/`, `docs/schemas/`, `docs/schemas/strict/`, `config/`, `data/dossiers/`, `backoffice/`, `scripts/`.
   - **Städrisk:** stor diff, cleanup, rename, många docs, otrackade filer, dubbla sanningar, namnskuggor.
4. Starta read-only subagenter sparsamt:
   - Default vid riskdiff: **max 2 agenter**.
   - `bugagent` om kod/pipeline/API/runtime ändrats.
   - `docs-backoffice-schema-agent` om docs/schemas/backoffice/config/dossiers/scripts kan ha driftat.
   - `städagent` bara vid stor/stökig diff, cleanup/rename, eller många otrackade filer.
   - Använd modell `composer-2-fast` om en explicit modell väljs.
5. Subagenternas format ska vara kort:

```text
Fynd: <kort titel>
Typ: bug | docs/schema | backoffice | städ
Sannolikhet: <0-100%>
Impact: <1-10>
Fil(er): <paths>
Kommentar: <1 mening>
Minimal fix: <1 mening>
```

6. Parent-agenten ska inte blint acceptera fynd:
   - Verifiera mot kod/diff.
   - Avfärda falska positiva kort.
   - Fixa bara små, tydliga, bekräftade fynd inom scope.
   - Större arkitekturbeslut rapporteras som nästa steg.
7. **Backlog-avstämning** ([`BUG-SWARM-BACKLOG.md`](../../BUG-SWARM-BACKLOG.md) — håll den sann i samma svep):
   - **Fixade i svepet:** om en rad i `## Aktiv kö` adresserades → **flytta** den till arkivet (`docs/plans/avklarat/bug-swarm/backlog-arkiv-*.md`) som `[x]` med commit/PR-ref. Bocka inte av på plats.
   - **Nya bekräftade defekter:** lägg en `[ ]`-rad i `## Aktiv kö` (källa `M#<n>`) med fil-ankare, per `/buggrapport`-formatet.
   - **Visade sig vara val/repro:** flytta till `## Beslut & policy` eller `## Behöver repro` i stället.
   - Skriv aldrig "FIXAD" i prosan på en `[ ]`-rad (preflighten `check-bug-backlog.mjs` failar på motsägelsen).
   - Detta är den löpande sanningsmekanismen — backloggen får aldrig driva ur fas med koden.
8. Verifiera med minsta relevanta set:
   - Alltid vid TS-kod: `npm run typecheck`
   - Pipeline/gen: relevanta `vitest`
   - Regex/prompt-regex: `node scripts/dev/check-unicode-regex.mjs`
   - Dossiers: `npm run dossiers:validate-all`
   - Scaffolds: `npm run scaffolds:validate`
   - Backoffice: `python -m pytest backoffice/test_pages_import_smoke.py -q`
   - Slut: `git diff --check`
9. Svara kort:
   - bekräftade fynd + fixar
   - avfärdade viktiga fynd
   - filer medvetet lämnade utanför scope
   - verifiering
   - om diffen är redo för `/avslutning`

## Stopplinjer

- Commit/push bara om användaren uttryckligen ber om det.
- Ingen `git add -A` om working tree innehåller orelaterade/oägda filer.
- Rör inte andra agenters ändringar utanför scope.
- Ersätt gammal docs-text när runtime ändras; lägg inte en parallell sanning bredvid.
- Bugbot/PR-review ersätter inte denna lokala sync-check. Bugbot är extra lager.
