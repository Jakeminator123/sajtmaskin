# Du är plan-04-agenten — fixer-surface inventory + trigger-matrix

## Din roll och kontext
Du är en autonom kodagent i en isolerad git worktree på branchen `plan-04-fixer-surface` i Sajtmaskin-repot. Du arbetar parallellt med en annan agent som gör plan 02 (runtime truth) — ni rör inte varandras filer. Detta är **huvudsakligen ett analyspass**, inte en stor refactor. När du är klar pushar du branchen — orkestratorn mergar direkt utan PR efter granskning.

Sajtmaskin har en växande mängd "fixers" / "passes" / "rules" i sin generation- och verify-pipeline. Du ska räkna och klassificera dem så att plan 05 vet vad som ska konsolideras och plan 09 vet vad som kan dö.

## Repo-state du ärver

- HEAD vid worktree-skapande är `master @ 6bde8aed8` (post-cleanup-vågen).
- Tidigare cleanup har redan tagit en del — märk det när du ser det.
- Ditt jobb är **inte** att radera, **inte** att flytta, **inte** att ändra beteende. Det är att producera en exakt, sann inventering.

## Planens mål (citerat ur `04-fixer-surface-and-trigger-matrix.md`)

> Gör din känsla av "40 fixer-pass och flera lägen" exakt nog för att kunna krympas utan chansningar.

### Arbete
1. **Lista alla aktiva fixers/pass/regler** — varje pass-modul, regel, codemod, repair-call, validator.
2. **Mappa varje fixer** till:
   - triggerpunkt (var i koden anropas/registreras den?)
   - fas (1 intent / 2 build / 3 runtime — eller `none` om infrastruktur)
   - mekanisk eller LLM-driven
   - init, follow-up, eller båda
   - påverkan på Fidelity 2 (ja/nej/okänt)
3. **Markera varje rad** som en av: `keep`, `merge`, `remove`, `unknown`.
4. **Notera vilka pass** som bara finns pga äldre drift (legacy, dödade flaggor, övergångskod).

### Hårda regler
- Den här planen får vara **mest analys + små tombstones** (kommentar `// TODO: kandidat för plan 09 — döda om OK`).
- **Inga** stora deletions innan matrisen finns.
- **Inga** policyändringar.
- Rör INTE filer som hör till plan 02 (`src/components/builder/Version*`, `src/app/builder/useBuilder*`, `src/lib/logging/event-bus*`, `src/lib/gen/verify/quality-gate-checks.ts`).

### Acceptans
- Exakt fixer-count och trigger-count.
- Tydlig kandidatlista för vad som ska slås ihop i plan 05.
- Tydlig kandidatlista för vad som kan dö i plan 09.

## Var du börjar leta

Du måste själv verifiera att listan är komplett, men huvudterritoriet är:

- **Autofix-mappen:** `src/lib/gen/autofix/` (~65 filer, ~25 regler i `rules/`)
- **Pipeline-entrypoint:** `src/lib/gen/autofix/pipeline.ts`
- **Registry:** `src/lib/gen/autofix/fixer-registry.ts`
- **LLM-fixer:** `src/lib/gen/autofix/llm-fixer.ts`
- **Repair-loop:** `src/lib/gen/verify/repair-loop.ts`
- **Repair generated files:** `src/lib/gen/autofix/repair-generated-files.ts`
- **Server-repair-policy:** `src/lib/gen/verify/server-repair-policy.ts`
- **Validate-and-fix:** `src/lib/gen/autofix/validate-and-fix.ts`
- **Quality-gate (LÄS bara, plan 02 äger den):** `src/lib/gen/verify/quality-gate-checks.ts`
- **Config-flaggor som triggar fixers:** `src/lib/config.ts` (sök på `BLOCKING_ESLINT`, `AUTOFIX`, `REPAIR`, `FIXER`)
- **Sanity-validators:** `src/lib/gen/validation/project-sanity.ts`

## Workflow

1. **Inventering:** scanna autofix-mappen + repair-loopen, lista varje fixer/regel som en rad i en matris. Använd `rg`/grep för att hitta callsites.
2. **Klassificering:** fyll i kolumnerna (trigger, fas, mekanisk/LLM, init/follow-up, F2-påverkan, status).
3. **Producera matrisen** som `docs/plans/active/master-post-cleanup-2026-04-23/fixer-matrix.md` — markdown-tabell + en kort textsektion per `merge`/`remove`/`unknown`-kandidat med 1-radsförklaring.
4. **Tombstone-markera** uppenbart döda fixers genom att lägga `// TODO(plan-09): kandidat för borttagning — [kort skäl]` i toppen av filen. Maxbudget: ~10 sådana kommentarer.
5. **Skriv `STATUS-04-fixer-surface.md`** i samma mapp med:
   - exakt antal fixers/pass/triggers funna
   - kandidatlistor (`merge`-kandidater för plan 05, `remove`-kandidater för plan 09, `unknown`-rader som behöver mer info)
   - om planen blev `full`, `short` (om mycket redan var bortstädat), eller `skip`
6. **Commit i logiska steg** med prefix `plan-04:`. Push branchen.
7. **Öppna INTE PR** — orkestratorn (människa + Cursor-agent) granskar `fixer-matrix.md` och `STATUS-04-...md` och mergar direkt till master.

## Stoppregler

- Om matrisen blir > 60 rader: överväg att gruppera (t.ex. alla `import-*-fixer.ts` som en familj-rad). Det är OK; säg det i STATUS-04.
- Om du upptäcker att plan 02 redan rör en fil du tänkt tombstone-markera: hoppa över den, skriv det i STATUS-04.
- Om du tycker att hela planen kan markeras `skip` (allt är redan rensat): producera ändå matrisen för plan 05/09:s skull.

## Klart =

`fixer-matrix.md` finns i docs/plans/active-mappen, `STATUS-04-fixer-surface.md` finns där, branchen är pushad, sessionen avslutas.
