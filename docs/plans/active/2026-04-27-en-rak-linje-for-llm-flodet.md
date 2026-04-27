---
id: 2026-04-27-en-rak-linje-for-llm-flodet
status: scope
created: 2026-04-27
linear: null
trigger: Eval baseline-after-revert + placeholder-fix-gate visar att SCAFFOLD_PROTECTED_PATHS inte räcker. 2/15 pass kvarstår. Diagnosen pekar på fyra felklasser i pipeline-glapp.
---

# En rak linje för LLM-flödet

**Mål:** sluta lappa enskilda symptom. Bygg systemet så det **alltid blir bra**, inte ibland. Fyra felklasser, fyra deterministiska kontrakt, en disciplin.

## Verklighet 2026-04-27

| Eval-körning | Pass | Avg score | Topp-blockers |
|---|---|---|---|
| Baseline 2026-03-18 | 14/15 | 95.36% | — |
| Baseline-after-revert | 2/15 | 76% | tier2-readiness, syntax, project-sanity, required-files |
| Placeholder-fix-gate (vår fix aktiv i kod) | 2/15 | 76% | **Identiska kluster — fixen träffar inte i pipeline** |

**SCAFFOLD_PROTECTED_PATHS-fixen kompilerar och har enhetstester gröna, men i live-eval kvarstår `Expected ">" but found "style"` i `app/api/placeholder/route.ts` i 6 prompts.** Något i pipelinen åter-introducerar filen efter merge eller går runt `mergeGeneratedProjectFiles` helt.

## Strategisk princip

> Fienden är inte modellen. Fienden är kontraktet mellan modellen och systemet.

Vi har redan tillräckligt med modell-magi (dossiers, scaffold-variants, prompt-tuning, repair-loop). Vad som saknas är **fyra hårda kontrakt** — gates som inte kan kringgås av LLM-stokastik.

| Felklass | Hårt kontrakt vi behöver |
|---|---|
| 1. Fel filtyp / trasig syntax | **Path-allowlist** (vad LLM får skriva) — utvidgad och *verifierad i alla generation-paths* |
| 2. Imports till filer som inte finns | **Import-validator** — drop okända imports (inte stubba) |
| 3. Missing required files | **Re-emission gate** — LLM får exakt en chans till att emittera saknad file |
| 4. Externa deps utan package.json-stöd | **Dependency materializer** — scanna imports → skriv saknade deps till package.json |

Dessa fyra kontrakt **tillsammans** ger en rak linje. Var för sig löser de inte mycket; tillsammans stänger de pipeline-glappet.

## Anti-mönster — vi gör INTE

- Ny scaffold-variant
- Ny dossier
- Bredare prompt-omskrivning
- Mer brief-information till codegen
- "Mer modell-magi"
- Halv-färdiga planer som ligger kvar utan progress
- Lokala bug-rapporter som ligger kvar efter fix
- Worktree-experiment som inte städas

Allt som inte är en av de fyra hårda kontrakten är scope-creep i denna runda.

## Sex parallella spår (P0)

Varje spår är **eget commit**, **egen test FÖRST**, **egen smal eval**.

### Spår A — Diagnostisera SCAFFOLD_PROTECTED_PATHS-misslyckandet

Innan vi utvidgar — varför fungerar det inte? Vår fix har enhetstester gröna men live-eval visar samma fel.

**Hypoteser att verifiera:**

1. `mergeGeneratedProjectFiles` används inte i den aktiva eval-pathen — finns en annan code-path
2. LLM-fixern (`runLlmFixer`, `validate-and-fix`) skriver tillbaka filen efter merge
3. `partial-file-repair`-flödet bypass:ar partition
4. Server-side-repair (`/api/engine/chats/[id]/repair`) går egen väg
5. `applyDossierVerbatimPolicy` återställer från en dossier-version som har JSX

**Klart när:** rotorsaken identifierad + tracerbar via dev-log eller test som reproducerar.

### Spår B — Path-allowlist (utvidgad SCAFFOLD_PROTECTED_PATHS)

Efter A: lägg in *alla* utility-filer som LLM:n inte ska röra. Kandidater att verifiera:

- `app/api/placeholder/route.ts` (redan)
- `app/sitemap.ts`
- `app/robots.ts`
- `app/opengraph-image.tsx`
- `next.config.ts` (möjligen)
- `tailwind.config.ts`
- `postcss.config.mjs`

**Test FÖRST**: eval-prompt som kan emittera fil med JSX-fel; assert att final files_json har scaffold-versionen.

**Klart när:** smal eval på 6 syntax-fall (1 prompt per kluster) → 6/6 grön.

### Spår C — Import-validator (hårt kontrakt #2)

Idag: `checkScaffoldImports` auto-stubbar tomma komponenter. Det är cover-up.

Skarpaste alternativet:

```ts
// Pseudo-kontrakt
function validateImports(files): { kept, dropped, warnings }
- För varje import till @/components/X eller relativ path
- Om X inte finns i files → DROP raden (inte stub)
- Logga `import-validation-blocked` med fil + import
- LLM:n får felet i nästa repair-pass och kan rätta
```

Alternativ: **import-allowlist per scaffold** (lista av tillåtna `@/components/*` per scaffold-id).

**Test FÖRST**: eval-prompt med fake-import; assert att import är borta från final.

**Klart när:** `Unresolved local component imports` försvinner från eval-blockers.

### Spår D — Required-files re-emission (hårt kontrakt #3)

Idag: `LLM_ONLY_PATHS` blockerar versionen om page.tsx saknas. Det är ärligt men ger ingen recovery.

Förslag:

```
init-merge → om page.tsx saknas:
  → kör ETT extra LLM-anrop med smal prompt: "Write app/page.tsx for this brief"
  → om fortfarande saknas → blockera (som idag)
```

Det är **inte** repair-loop-utvidgning — det är **deterministisk re-emission** på en specifik pre-villkorad path.

**Test FÖRST**: prompt där LLM "glömmer" page.tsx; assert re-emission triggas och filen kommer.

**Klart när:** ecommerce + settings + auth → page.tsx finns konsekvent.

### Spår E — Dependency materializer (hårt kontrakt #4)

Idag: ingen automatisk hantering när LLM importerar paket utan att lägga till i package.json.

Förslag:

```ts
// Pseudo
function materializeDependencies(files):
- Scanna alla imports från every fil
- Om import är ett paketnamn (inte relativ, inte @/)
- Om paketet inte är i scaffoldens package.json
- Lägg till med konservativ version (latest stable från dep-catalog)
- Logga `dependency-materialized` event
```

Använd en kuraterad **dependency-catalog** med pinned versions för vanliga paket (next, react, lucide-react, framer-motion, mdx, @vercel/analytics, etc).

**Test FÖRST**: prompt med `import { Analytics } from '@vercel/analytics/react'`; assert package.json får `@vercel/analytics`.

**Klart när:** `Dependency readiness failures` försvinner från eval-blockers.

### Spår F — Smal eval per felklass

Hela 15-prompt suite tar 45 min och blandar alla klasser. Bygg fyra **fokuserade evals**:

| Eval | Antal prompts | Tid | Mäter |
|---|---|---|---|
| `eval:syntax` | 3 | ~5 min | Felklass 1 (placeholder-route, sitemap, etc) |
| `eval:imports` | 3 | ~5 min | Felklass 2 (unresolved local components) |
| `eval:required-files` | 3 | ~5 min | Felklass 3 (missing page.tsx, package.json) |
| `eval:deps` | 3 | ~5 min | Felklass 4 (unpinned third-party deps) |
| `eval:gate` | 15 (befintlig) | ~45 min | Helhets-baseline, körs sista |

Varje smal eval körs **PER PR**. Helhets-eval körs en gång per dag eller veckan.

**Klart när:** smala evals existerar + dokumenterade i `src/lib/gen/eval/README.md`.

## Disciplin (gäller alla spår)

| Regel | Innebörd |
|---|---|
| Plan-lifecycle | Följ `.cursor/rules/plan-lifecycle.mdc` — frontmatter, mappar, status |
| Test FÖRST | Skriv regression-test som failar **innan** fixen, sen fixen |
| Smal eval per PR | Kör motsvarande smal eval före commit; helhets-eval bara vid milestone |
| En spår per commit | Inga blandade fixar |
| Origin sync `0 0` | Innan commit, alltid |
| Linear-issue per spår | Frontmatter `linear: SAJ-<n>`; uppdatera när PR mergat |
| Bug-rapport raderas vid fix | `.cursor/bugs/` rensas; Linear behåller historik |

## Definition of done — "en rak linje"

Vi kallar det klart när **alla** uppfylls:

- [ ] `eval:gate` ≥ 13/15 pass (1-2 stokastik-toleranse)
- [ ] Avg score ≥ 90%
- [ ] **Inga** av de fyra felklasserna återkommer på 3 körningar i rad
- [ ] Alla smala evals (A-D) gröna
- [ ] Master är ärlig (ingen "tillbaka"-revert kvar att städa)
- [ ] Aktiva planer har commit-progress senaste 14 dagar
- [ ] `.cursor/bugs/` har inga fixade rapporter

## Super-prompt (kopiera till agent)

Nedan är prompt:en som kan klistras in till en agent som ska köra denna scope:

```
Du är systemiskagent på Sajtmaskin. Diagnos: LLM-pipelinen failar i 13/15 eval-prompts på fyra
återkommande felklasser. Tidigare punktfixar (SCAFFOLD_PROTECTED_PATHS) kompilerar men träffar
inte i live-eval — något i pipelinen kringgår dem.

Strategin: bygg fyra hårda kontrakt som tillsammans stänger glappet. Inte mer modell-magi.

LÄSORDNING:
1. docs/plans/active/2026-04-27-en-rak-linje-for-llm-flodet.md (denna scope)
2. docs/architecture/glossary.md (terminologi)
3. .cursor/rules/plan-lifecycle.mdc (planlivscykel)
4. .cursor/rules/scaffold-rules.mdc (scaffold-policy)
5. docs/architecture/scaffold-system.md § 7b (file merge policy)
6. .cursor/rules/pipeline-rules.mdc + workflow.mdc

UPPGIFT (välj ETT spår — inte alla samtidigt):
- Spår A: Diagnostisera varför SCAFFOLD_PROTECTED_PATHS-fixen inte träffar i live-eval. Hitta
  vilken pipeline-väg som åter-introducerar filen och dokumentera. Read-only först — sen mini-PR
  med spår-specifik fix.
- Spår B: Utvidga SCAFFOLD_PROTECTED_PATHS till alla utility-filer (sitemap.ts, robots.ts, etc).
  Test FÖRST: regression-test per fil. Sen fix.
- Spår C: Bygg import-validator som dropar okända @/components/*-imports. Inte stubba.
  Test FÖRST. Sen fix.
- Spår D: Bygg required-files re-emission gate. Smal LLM-call när LLM_ONLY_PATHS-fil saknas.
  Test FÖRST. Sen fix.
- Spår E: Bygg dependency-materializer som scannar imports → skriver saknade paket till
  package.json från en kuraterad catalog. Test FÖRST. Sen fix.
- Spår F: Skapa fyra smala evals (syntax, imports, required-files, deps) à 3 prompts vardera.
  Dokumentera i src/lib/gen/eval/README.md.

DISCIPLIN (icke förhandlingsbart):
- Test FÖRST. Skriv regression-test som FAILAR innan din fix, sen fixen.
- En spår per commit. Inga blandade fixar.
- Smal eval per PR. Helhets-eval bara vid milestone.
- Origin sync `0 0` innan commit.
- Plan-lifecycle.mdc styr planfilerna. Frontmatter krävs.
- En bug åtgärdad → radera `.cursor/bugs/<fil>` (Linear behåller historik).

ANTI-MÖNSTER (gör INTE):
- Ny scaffold-variant
- Ny dossier
- Bredare prompt-omskrivning
- Modell-tuning (token-limits, dossier-rebalansering, brief-padding)
- Blanda två spår i en commit
- Hoppa över test FÖRST

VERIFIERING per spår:
- npx tsc --noEmit → 0 errors
- Riktade vitest-tester gröna
- npm run lint → 0 nya errors
- Smal eval för aktuellt spår grön
- ReadLints på ändrade filer → 0 issues

LEVERANS-FORMAT:
- En commit på master (eller branch om större)
- Commit-message med spår-ID + Linear-ID
- Push till origin/master
- Rapport: vilket spår, vad fixades, vilka tester, eval-resultat

OM DU FASTNAR:
- Stoppa. Skriv vad du sett, var du fastnade, vad nästa steg är.
- Skapa eller uppdatera planfil i docs/plans/active/ enligt plan-lifecycle.mdc.
- Föreslå parka eller hand-off — inte forcera.

KLART NÄR:
- Ditt spår har grön smal eval + grön typecheck + lint
- PR mergad eller direkt-commit på master
- Linear-issue uppdaterad
- Eventuell bug-rapport raderad

NÄSTA SPÅR efter ditt:
- Avgörs av eval-resultat. Sannolikt: A → B → E → C → D → F om eval visar att
  syntax-klustret är största kvarvarande blocker.
```

## Process — när vi är klara

1. Spår A levereras → vi vet **var** SCAFFOLD_PROTECTED_PATHS missar. Eventuell mini-fix.
2. Spår B-E levereras parallellt eller sekventiellt baserat på A:s resultat.
3. Spår F kan köras parallellt med B (smala evals = enklare debug för B-E).
4. Helhets-eval körs sista; mål: 13-15/15 pass, ≥ 90% avg score.
5. När alla 5 box:ar i "Definition of done" är ifyllda → arkivera denna scope-doc till `docs/plans/avklarat/`.
