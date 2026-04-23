---
id: omtag-03-wave-split-heatspots
title: Wave-rest — splittra de 4 monoliter som Wave 2026-04-21 hoppade
phase: 1
priority: P1
parallell_med: [05-scaffold-default-removal]
blockerad_av: [02-eval-baseline]
estimat: "1–2 dagar"
owner_files:
  - src/lib/gen/system-prompt.ts
  - src/lib/gen/build-spec.ts
  - src/lib/builder/promptAssist.ts
  - src/lib/gen/stream/finalize-version.ts
  - src/lib/gen/system-prompt/** (ny undermapp)
  - src/lib/gen/build-spec/** (ny undermapp)
  - src/lib/builder/prompt-assist/** (ny undermapp)
  - src/lib/gen/stream/finalize-version/** (ny undermapp)
  - tests för ovanstående
---

# 03 — Wave-split heat-spots

## Mål

Landa de 24 commits från Wave 2026-04-21 som PR #83 medvetet skippade — specifikt de som splittrar upp de fyra monoliterna där LLM-kvaliteten genereras. Efter detta slår inga fler audit-vågor ned i 1000–1700-radersfiler utan i fokuserade moduler.

## Varför det här

| Fil | Rader idag | Varför hoppad i #83 | Konsekvens att den ligger kvar |
|---|---|---|---|
| `src/lib/gen/system-prompt.ts` | 1 469 | P7 / R2 skippade — heat-spot | Varje prompt-tweak, dossier-tillägg och audit-fix ska sammanstämmas i en monolit |
| `src/lib/gen/build-spec.ts` | 1 103 | S1 / T2 skippade | Samma — alla BuildSpec-regler ligger ihop med derived-fields och patterns |
| `src/lib/builder/promptAssist.ts` | 877 | U1 / U2 skippade | Guidance-helpers + prompt-assist-models + dedupe i en fil |
| `src/lib/gen/stream/finalize-version.ts` | 1 733 | R3 skippade | Finalize-fel + policy + partial-file + step-telemetry + errors i en monolit |

De 24 commits från wave `cursor/wave-2026-04-21-cleanup` (PR #81, CLOSED) är *exakt* dessa splits. Eftersom grenen är två dagar gammal: cherry-plocka idéerna, tillämpa på dagens master.

## Scope

| In | Ut |
|---|---|
| Splittra i undermappar enligt "Föreslagen split" nedan | Ändra publikt API (samma exports från gamla stigar) |
| Uppdatera imports ALLA konsumenter | Ändra beteende — enbart refaktor |
| Alla tester ska fortsätta passa oförändrade | Lägga till nya features / regler |
| Byte-för-byte `tsc --noEmit` + `vitest` | Inlines nya lager / nya guards |

## Föreslagen split (från PR #81-body + egen analys)

### 3a. `src/lib/gen/system-prompt.ts` → `src/lib/gen/system-prompt/`

```
system-prompt/
  index.ts              (behåll publika exports — re-export barrel)
  types.ts              (alla SystemPromptOptions, SectionFn, etc.)
  budget.ts             (token-/char-budget + truncation)
  compose.ts            (huvud-compose-funktionen)
  theme-token.ts        (stylePack / theme-injection)
  sections/             (en fil per sektion om det är tydligt)
```

### 3b. `src/lib/gen/build-spec.ts` → `src/lib/gen/build-spec/`

```
build-spec/
  index.ts
  types.ts
  prompt-patterns.ts
  derived-fields.ts
  builder.ts            (huvud-byggaren)
```

### 3c. `src/lib/builder/promptAssist.ts` → `src/lib/builder/prompt-assist/`

```
prompt-assist/
  index.ts
  guidance-helpers.ts   (dedupe + formatters)
  models.ts             (prompt-assist-specifika modellväljare)
  runner.ts             (huvud-funktionen)
```

### 3d. `src/lib/gen/stream/finalize-version.ts` → `src/lib/gen/stream/finalize-version/`

```
finalize-version/
  index.ts
  errors.ts             (custom errors + klassning)
  policy.ts             (persist-policy + retries)
  failure-log.ts        (felrader + rensning)
  partial-file.ts       (partial-file-repair)
  step-telemetry.ts     (fas-timings + emit)
  runner.ts             (huvud-pipelinen)
```

## Inputs

1. `gh pr view 81 --json body,commits` för att läsa PR #81-bodyn och commit-listan
2. Ursprungliga Wave-grenen om den finns kvar: `git log cursor/wave-2026-04-21-cleanup` (om lokal/remote-ref finns)
3. `.cursor/rules/gen-pipeline-simplicity.mdc` — läs innan du splittar så att du inte adderar indirection
4. `.cursor/rules/file-structure-conventions.mdc`

## Exekveringssteg (per fil)

1. Läs hela monoliten.
2. Identifiera 4–6 naturliga grupperingar (följ wave-förslaget som utgångspunkt).
3. Skapa undermapp + `index.ts` som re-exporterar publikt API.
4. Flytta kod med **`git mv` där möjligt** så blame bevaras.
5. Uppdatera imports i konsumenter (`rg "from .*system-prompt[^-/]" src` etc.).
6. Kör `npm run typecheck` + `npx vitest run <relevant>` efter *varje* fil.
7. Commit per fil: `refactor(omtag): split system-prompt.ts into system-prompt/`.

## Får INTE göras

- Ingen beteendeändring (ingen ny logik, ingen tog-bort-logik, ingen förändring av default-värden).
- Inga nya tester (bara befintliga ska fortsätta passa).
- Ingen ändring av exports-signaturer.
- Rör inte `serialize.ts` eller `finalize-merge.ts` — det ägs av 05.
- Rör inte autofix-pipelinen — inte owner.

## Acceptance criteria

- [ ] De 4 gamla filerna finns kvar **endast som barrel-re-exports** eller är borttagna (konsumenter uppdaterade).
- [ ] Ingen enskild ny fil > 400 rader.
- [ ] `npm run typecheck` grönt.
- [ ] `npm run lint` grönt.
- [ ] `npx vitest run` — samma pass/fail som master HEAD (`51751bd30` eller aktuell) — inga nya fails.
- [ ] `node scripts/evals/run-baseline.mjs` (från 02) körd på branchen, diff mot `evals/results/baseline-master/` visar **inga regressions** > 10 % på någon prompt (autofix-fixes / preflight issues / duration).
- [ ] `docs/architecture/glossary.md` uppdaterad om några begrepp flyttats/bytt ägarfil.

## Branch

`omtag/03-wave-split-heatspots`
