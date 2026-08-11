# Dossier: färre sanningsytor, tydligare status (master-plan)

**Startad:** 2026-08-11 · **Ägare:** Jakeminator123 · **Status:** planerad, inget bygge startat.
**Byggs av:** separata agenter per delplan. **Reviewas av:** ägaren + granskande agent (bugbot-pass per PR).

## Målbild (ägarens krav, destillerade)

1. Allt ska bli **enklare** — färre rörliga delar, inte fler.
2. **Begreppen får inte bli fler.** Helst färre. Inga nya termer utan glossary-registrering.
3. **Sanningsytorna ska bli färre** där det går: en ägare per fakta, projektioner i stället för kopior.
4. Backoffice ska **visualisera** alla dossiers och alla lägen de kan vara i, och de ska kunna **editeras** därifrån.
5. Builder-UI:t ska göra det begripligt **vad som hände, vilken status allt är i, och när saker byggts och fungerar eller inte**.
6. Gammalt skit får raderas — men varje radering listas explicit i PR-beskrivningen.

## Utgångsläge (verifierat 2026-08-11)

- Pool på disk: 18 dossiers (9 hard + 9 soft), 17 capabilities. `capability-map.json` matchar disk.
- Verifierad docs-drift: `dossier-selection-flow.md:187` (27/23), `dossier-system.md:245` ("10 av 11"),
  `dossier-system.md:149+173` (vercel-analytics påstås ha warn-only-nyckel; manifestet har `envVars: []`),
  filpekare `:179-180` (etiketterna bor i `dossiers_lib/`, inte `dossiers.py`).
- Python speglar TS-ordlistor/regler med text-parsnings-paritetstester; `CLASS_LABELS` saknar helt grind.
- Strandad checkpoint finns: branch `agent/dossier-truth-map-c731d541`, commit `d7caf4cf` (10 filer).
  Granskad — se § Checkpoint-dom nedan. Den fulla 65-filsversionen (`c768c783`) finns INTE på GitHub
  och måste återskapas ur handoff-beskrivningen, inte antas.

## Checkpoint-dom (granskning 2026-08-11)

Arkitekturen är **rätt och tas över**: generatorn läser den validerade runtime-registryn
(`getAllDossiers()`) i stället för att parsa manifest själv; projektionen får en `dossiers`-truth-view
med separata axlar (`f2Disposition` ≠ `buildServerRequirement` — Analytics-kontrollfallet);
`sourceFiles` med sha256-fingerprints låter Python avgöra färskhet utan att förstå TypeScript;
Python-lagret är ren projektionsläsare utan businessregler.

Kända brister som delplan 01 äger:

| # | Fynd | Hantering |
|---|---|---|
| 1 | Inga tester följde med (låg i opublicerade `c768c783`) | Återskapa: `test_dossier_truth_map.py` + vitest för generatorn |
| 2 | `CAPABILITY_MAP_FIXED_SOURCES` (Python) är en NY spegling av TS-listan `FIXED_SOURCE_PATHS` | Fail-loud i dag (permanent stale-varning vid drift) — grinda med paritetstest eller läs vägarna ur projektionen |
| 3 | Idempotens är designad (tidig retur i `--write` vid sync) men obevisad | Dubbelkörning + `git diff --exit-code` i CI |
| 4 | Generatorn importerar `getF2MutedIntegrationCapabilities` ur orchestrate | Verifiera att tsx-körningen inte drar in server-only/env-krävande moduler |
| 5 | `summarySv` i projektionen faller tyst tillbaka till engelska `summary` | Acceptera + dokumentera i fältkommentar, eller döp om |
| 6 | Flash/rerun-helpers (`_rerun_after_dossier_mutation`) finns i io.py men är inte inkopplade i edit/create | Delplan 04 |
| 7 | Branchen är ~25 commits efter master; genererade filer skiljer | Rebase = **regenerera** projektionerna, aldrig handmerga dem |

## Delplaner, beroenden och parallellitet

```text
01 (fundament) ──► 02 (radera Python-kopior)   ─┐
              └──► 03 (docs-sanering)          ─┼─► klart
              └──► 04 (backoffice Systemkarta) ─┘
05 (builder-statussanning) — helt parallell med allt
```

| Plan | Fil | Kör efter | Parallell med | Modell (bygge) |
|---|---|---|---|---|
| 01 Projektionen blir kanonisk brygga | [`01-projektion-kanonisk.md`](01-projektion-kanonisk.md) | — | 05 | **Hög**: `gpt-5.6-sol` eller `claude-sonnet-5-thinking-high` |
| 02 Radera Python-kopiorna | [`02-python-avspegling.md`](02-python-avspegling.md) | 01 | 03, 05 | **Medel**: `cursor-grok-4.5` |
| 03 Docs-sanering | [`03-docs-sanering.md`](03-docs-sanering.md) | 01 | 02, 05 | **Billig**: `cursor-grok-4.5` |
| 04 Backoffice Systemkarta + editering | [`04-backoffice-systemkarta.md`](04-backoffice-systemkarta.md) | 01 (+02 om klar) | 05 | **Medel-hög**: `claude-sonnet-5-thinking-high` |
| 05 Builder-statussanning | [`05-builder-statussanning.md`](05-builder-statussanning.md) | — (design kräver ägar-OK) | alla | Design: stark tänkande modell efter ägar-OK; implementation: `cursor-grok-4.5`/sonnet |

Review när byggda (alla planer): bugbot-subagent (`readonly: true`, `model: <grok-4.5>`) på varje PR-diff
+ ägargranskning. Delplanerna byggs som **separata PR:er mot master**, en per plan.

## Begrepps- och ytbokslut (ska stämma när allt är mergat)

| Mått | Före | Efter (mål) |
|---|---|---|
| Nya begrepp | — | **0** ("Systemkarta" är en flik, inte ett begrepp; alla axlar finns redan) |
| Python-kopior av TS-regler/ordlistor | 4 (CLASS_LABELS, MOCK_LABELS, requires_f3, MOCKLESS-listan) | **0** |
| Text-parsnings-paritetstester | 3 | **0** (ersatta av CI-grindad färsk projektion) |
| Ogrindade genererade projektioner | 1 (capability-map) | **0** (CI blockerar stale) |
| Handskriven antalsprosa i docs | ≥3 ställen | **0** (pekare/genererat) |
| Backoffice-flikar under Byggblock | 5 | **≤5** inkl. Systemkarta (konsolidering, inte addition) |

## Grundregler för alla byggen

- Kanonisk ägarordning: runtimekod äger beteende; manifest/registry/schema/policy äger deklarativa beslut;
  `capability-map.json` och `docs/generated/*` är projektioner; handskrivna docs är mental modell.
- Genererad output regenereras, handredigeras aldrig.
- Raderingar är tillåtna och önskade, men listas explicit i PR-beskrivningen.
- Per-PR-klart enligt `AGENTS.md` (typecheck, lint, vitest, hygiene, docs-gates).
- Terminologi enligt `docs/architecture/glossary.md`; noll nya termer.
