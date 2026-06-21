# Grandmaster — deferrad backlog (B1–B7)

> **Orchestrator-artefakt, ej planfil.** Strukturerad backlog över medvetet uppskjutna
> hårdnings-/perf-/hygien-/arkitekturposter från grandmaster-PR:erna. **Inte buggar** —
> P1/P2-sanning lever i [`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md). Pekas från
> [`_loggbok.md`](_loggbok.md). Källa: read-only-utredning **verifierad mot HEAD `cccc843dd`**
> (kod = sanning). Ersätter de spridda backlog-punkterna i `_loggbok.md` (en sanning, ett ställe).
>
> **STATUS: PAUSAD (2026-06-19)** — exekvering parkerad medvetet för att spara kontext åt
> LLM-flöde-/Område 5-spåret (coachens Fas 0). Återuppta enligt § Worktree-exekveringsplan.

## Sammanfattning

| Post | Tema | Allvar | Effort | Isolerbar | Parallellt nu? |
|---|---|---|---|---|---|
| B1 | S3-lane warn-only → blockerande | Låg–medel | S | Delad lane-yta | ❌ lane-arkitekturbeslut |
| B2 | `/versions` `readAll`-per-rad dedup/perf | Medel (perf) | S–M | Delvis (dedup ja) | ⚠️ event-bus = Omr5-yta |
| B3 | Event-bus in-memory/efemär → multi-instans | Medel–hög (korrekthet) | L | Nej (arkitektur) | ❌ deploy-topologi-beslut |
| B4 | Canvas auto-PR via `GITHUB_TOKEN` → ingen CI | Låg (hygien) | S | Ja | ❌ secret-beslut + protected path |
| B5 | A7-2-flagga saknas i env-policy/docs | Medel (flipp) | S (doc-delen) | Ja (doc) | ✅ disjunkt grundhygien |
| B6 | Omr8-svans (ignore-prune, arkiv, eval-skugga, next) | Låg | S | Mestadels | ⚠️ Omr8 = gemensam, ej autonom |
| B7 | #140 öppna bot-fynd (P1/High) | Hög (säkerhet) | — | — | ❌ annans infra-spår |

---

## B1 — S3-lane-härdning (warn-only → blockerande)

- **Vad:** S3 single-writer-statusinvariant körs bara i en warn-only-lane (`continue-on-error`) → rött blockerar aldrig merge.
- **Kod:** `.github/workflows/ci.yml:74-92` (stability-jobbet, `continue-on-error: true`, `npm run test:stability`). `package.json:45-46` (`test:ci` = `vitest run` default-config; `test:stability` = `-c vitest.stability.config.ts`). `vitest.config.ts:11,43` exkluderar `**/*.stability.test.{ts,tsx}`; `vitest.stability.config.ts:24` inkluderar bara den globben. Testet: `src/lib/builder/status-resolver-single-writer.stability.test.ts:41-45,73-83,94-96` = ren fs-grep efter literalen `resolveEngineVersionDisplayStatus` (IMPORT_RE/CALL_RE) + substring-koll `useVersionStatus`/`busStatus`.
- **Gäller än:** Ja. S3 ligger uteslutande i warn-only-lanen.
- **Risk:** Namn-/substräng-ankrad vakt, **inte** beteende-vakt. Fångar: återinförd import/anrop av den raderade symbolen. Fångar **inte**: ny DB-flagg-resolver med annat namn, UI som läser DB-flaggor direkt, eller `busStatus` som beräknas men ignoreras i render.
- **Minsta åtgärd:** Testet är deterministiskt (ren fs, ingen DB/nät/flake) → kan flyttas till blockerande `test:ci` utan flake-risk. Kräver dock rename av filen (→ `.test.ts`) **eller** include-undantag, eftersom default-configen exkluderar `.stability.test.ts`-globben.
- **Isolerbar:** Rör `ci.yml` + båda vitest-configar (+ ev. rename). Smal men ett **lane-arkitekturbeslut** (bryter S1:s "hela stability-lanen är warn-only"). Medvetet deferrad (`_loggbok.md:123`) — ej blint åtgärda.

## B2 — VADE-perf: `readAll` per rad på `/versions`

- **Vad:** `/versions` (polling-yta) kör `selectVersionStatus(readAll(v.id))` per versionsrad → synkron fil-I/O + O(events²)-dedup som skalar med versioner×runs.
- **Kod:** `src/app/api/engine/chats/[chatId]/versions/route.ts:87-121` mappar alla versioner, `busStatus: selectVersionStatus(readAll(v.id))` på rad `119`. `readAll` (`src/lib/gen/event-bus.ts:168-193`): per version → in-memory Map + läs `.runs.json` + per run läs `events.ndjson` (full read + split + `JSON.parse`/rad) + dedup `merged.some(m => m.id === parsed.id)` = O(E²) + sort.
- **Gäller än:** Ja, oförändrat.
- **Risk:** Per GET ≈ O(V × (R_v filläsningar + E_v² dedup)). Synkron fs i request-handler blockerar event-loop; `/versions` pollas repetitivt under generering → kostnad växer med historik × pass-antal. Perf, ej korrekthet.
- **Minsta åtgärd:** Set-baserad dedup i `readAll` (byt `.some()` → `Set<id>`) = trivial O(n)-vinst, beteendeneutral, **helt isolerbar i `event-bus.ts`**. Ev. kort TTL-cache eller chat-scoped batch-läsare som **andra steg**.
- **Isolerbar:** Dedup-fixen ja. En cache/batch rör **alla** `readAll`-konsumenter: `versions/route.ts:119` (het), `version-status/route.ts:57-58`, + indirekt `VersionHistory.tsx` (server-`busStatus`) + projektionens devLog/backoffice-telemetri. Event-bus = Område 5:s läs-yta → reservera dit / sekvensera, smyg ej in i risk-PR.

## B3 — E2: event-bus in-memory/efemär → multi-instans

- **Vad:** Var lagras bussen, och vad händer på multi-instans (flera processer)?
- **Kod:** Lagring = in-memory Map (`src/lib/gen/event-bus.ts:63` `inMemoryEvents`) + efemär disk `process.cwd()/data/runs/<versionId>/<runId>/events.ndjson` (`event-bus.ts:46,100-103`). Header säger uttryckligen "persistence is filesystem-only … No DB migration" (`event-bus.ts:27-32`). **Skrivväg (emit):** `finalize-version/runner.ts`, `generation-stream-post-finalize.ts`, `server-verify.ts`, `product-postcheck/route.ts:39`. **Läsväg (`readAll`):** `versions/route.ts:119`, `version-status/route.ts:57`.
- **Gäller än:** Ja. Ingen durable store införd.
- **Blast-radius:** `emit()` skriver till **den instansens** Map + lokala disk. Status-GET som routas till annan instans ser tom Map + saknad `data/runs/<versionId>/` → `readAll` ger `[]` → `selectVersionStatus([])` → phase `idle` (`event-bus-projection.ts:43-56`). Dvs finalize-POST och status-GET i olika processer ⇒ UI tappar status / partiell ström. På **Vercel** är cwd read-only utom `/tmp` → disk-mirror sväljs tyst (`event-bus.ts:266-272`) → endast in-memory → cross-instans **alltid** tomt. På single-instance **Render** med persistent `/var/data` (`config.ts:91-122`) funkar disken. Samma klass: `readRunStatusForChat` (`versions/route.ts:36`).
- **Minsta durable-store (alternativ, ej implementation):** Append-bar `engine_events`-tabell i befintlig Postgres (bussen har redan DB-subscriber-vägar för `engine_version_error_logs`) **eller** Redis-lista per `versionId` (`REDIS_CONFIG` finns, `config.ts:277-284`), läst av `readAll`.
- **Isolerbar:** Nej — arkitektur, beror på deploy-topologi (1 vs N instanser). Eget initiativ/plan, ej cleanup-PR.

## B4 — Canvas auto-PR-token

- **Vad:** Auto-PR:en skapas med `GITHUB_TOKEN` → triggar ingen CI på den PR:en.
- **Kod:** `.github/workflows/llm-flow-canvas.yml:37` (checkout) + `:64` (create-pull-request) använder `secrets.GITHUB_TOKEN`. PR:en rör bara `docs/canvases/llm-flow.canvas.txt` (`:18,77-81`).
- **Gäller än:** Ja. GitHubs dokumenterade regel: events från default-`GITHUB_TOKEN` startar inga nya workflow-runs (anti-rekursion) → canvas-PR:en får ingen CI.
- **Risk:** Minimal — artefakten är en `.txt`, rör aldrig källkod/tsc/eslint.
- **Minsta åtgärd:** Dedikerad `CANVAS_PR_TOKEN` (PAT eller GitHub App-token) i checkout + create-PR-stegen. **App-token > PAT** (snävare scope, ingen personbindning, roterbar).
- **Branch protection:** Av på master (`gh api …/protection` → 404 "disabled"; #140 `mergeStateStatus: CLEAN`). Inga required checks. Reell grind = Cursor-automationen "PR-mergare" (docs-only `.txt` = risk 1 → auto-merge vid grönt, men utan checks kan den fastna i `WAITING_FOR_CHECKS`). Avvägning: token ger CI + auto-merge men inför en hemlighet att förvalta (jfr `project-phase-priorities.mdc` — ny härdning kräver scope).

## B5 — A7-2 flag-flip (`SAJTMASKIN_REFUSE_DOSSIER_STUBS`)

- **Vad:** Flagga som får autofix att vägra fabricera tyst null-render-stub för dossier-exponerad import; default-OFF.
- **Kod:** Schema `src/lib/env.ts:170`; flagga `src/lib/config.ts:356` (`refuseDossierStubs`, default-OFF). Beteende `cross-file-import-checker.ts:670-689` (ON → `refused:true`, ingen stub) vs `:691-719` (OFF → tyst stub, master). Nedströms-blocker via `runProjectSanityChecks` → `code_structure_failure` (`refuse-dossier-stubs.stability.test.ts:123-147`).
- **Saknas i policy/docs:** Ja — nyckeln finns **inte** i `config/env-policy.json` eller `docs/ENV.md`.
- **Risk:** Med flaggan **PÅ** kan en oresolvad dossier-import flippa version-status röd (poängen) — kan ge false-red om dossier-pipelinen släpper igenom legitima fall innan Område 5 stabiliserat follow-up/preview.
- **Minsta säkra åtgärd:** (a) Lägg env-nyckeln i `config/env-policy.json` + `docs/ENV.md` (**isolerbar nu**, runtime oförändrat). (b) Flippa default **först** efter att Område 5 landat (Område 6 klart per `00-master-plan.md:138`; 5 orört `:141`; flipp blockerad `_loggbok.md:112`).
- **Isolerbar:** Env-doc-PR ja. Default-flippen blockerad av Område 5.

## B6 — Område 8-svans (städ-karta, inget raderat)

| Kandidat | Nuläge i kod | Gäller än? |
|---|---|---|
| Stale ignore-mönster | `.gitignore`/`.cursorignore` pekade på borttagna `archive/dossiers-legacy-2026-04-20`, `research/_sidor`, `research/external-templates/*`, `_sidor/`, `templates_v0/*`, `blandat/` — alla `Test-Path = False`. | **Klar 2026-06-21** — `.gitignore` −51 (legacy + dedup `.vercel`/`.env*.local`), `.cursorignore` −23 (legacy). Enstaka extra döda rader kvar (frivilligt) |
| Arkivera källdokument | `_parkering/deep-research-report.md` (redan parkerad/av-indexerad), `2026-06-17-cleanup-forenkling-handoff.md` flyttad `docs/handoffs/` → `_parkering/`. "Controlled Aggression" = ingen separat fil. | **Klar 2026-06-21** |
| Eval-namnskugga | `scripts/eval/run-eval.ts` = own-engine eval-harness, skriver `./eval-output/` (`:1-7`). ~~`scripts/evals/` = OMTAG-02 baseline-probe~~. Tredje: `src/lib/gen/eval/cli.ts` (`eval:suite`). | **Löst 2026-06-21:** `scripts/evals/` + `evals/` (OMTAG-02 baseline-spår, ej npm/CI-wired, stale april-baseline) borttagna i cleanup-PR. Kvar: `scripts/eval/` (`npm run eval`) + `src/lib/gen/eval/` (`eval:suite`/CI) — inget namnskuggande par. |
| `next`-bump | `package.json:164` `next: ^16.2.9`; lockfile `16.2.9`; senaste stabila `16.2.9` (verifierat npm/Wikipedia 2026-06-21; 16.3.0 = preview). | **Stängd 2026-06-21 — inaktuell (redan senaste stabila)** |

- **Allvar/effort:** Låg / S per styck. Mestadels isolerbart; **bred ignore-prune = eget pass** (`workflow.mdc`: bred `.gitignore`-prune ≠ smyg). Radera inget utan beslut **per rad** (`08-cleanup-och-hygien.md`). Område 8 = **gemensam, ej autonom av en agent** (`00-master-plan §7`).

## B7 — #140 öppna bot-fynd (annans spår — ingen åtgärd härifrån)

PR #140 OPEN, MERGEABLE/CLEAN, 3 filer, +911/-0. Fynden i inline-kommentarer:

| Bot | Allvar | Fil:rad | Vad |
|---|---|---|---|
| Codex | **P1 säkerhet** | `.github/workflows/db-blob-sync-check.yml:47-48` | Kör PR-kontrollerad kod (`pydatabastest.py`) med produktions-Postgres/Blob-secrets injicerade på `pull_request`/`workflow_dispatch` → en branch kan modifiera skriptet och exfiltrera creds före review. Fix: begränsa secret-steget till push/protected env, släpp persisted git-creds. |
| Bugbot | **High** | `pydatabastest.py:449-468` | "EMPTY check ignores failed counts": misslyckad `COUNT(*)` lagrar `-1` + WARN, men EMPTY-restart-kollen flaggar bara `> 0` → tom tabell med misslyckad räkning behandlas som noll rader och kan PASS:a; grinden exit 0 utan att verifiera post-restart-EMPTY. |

Övrigt: 1 Bugbot Medium (saknad `v0-templates/`-prefix FAIL:ar ej) + ~14 Codex-P2 (WARN i st f FAIL, sslmode, pagination, identiska dev/prod-targets). Båda P1/High konceptuellt avgränsade, men **infra-/inspector-spåret ägs av annan agent** → ingen åtgärd, inget förslag härifrån.

---

## Parallell-säkerhet — vad får köras i eget worktree → PR

| Post | Yta | Parallellt nu? |
|---|---|---|
| **B5 env-doc** | `config/env-policy.json` + `docs/ENV.md` | ✅ Ja — disjunkt, inget beslut, runtime oförändrat |
| **B6 next-bump** | — | ✅ Stäng som inaktuell (redan 16.2.9), noll kod |
| B2 dedup | `src/lib/gen/event-bus.ts` | ⚠️ Egen liten PR, men event-bus = Område 5:s läs-yta → reservera/sekvensera |
| B6 ignore-prune + arkivera | `.gitignore`/`.cursorignore`, `_parkering/`, handoffs | ⚠️ Omr8 "gemensam, ej autonom" + bred prune = eget pass → **kräver per-rad-ok** |
| B4 canvas-token | `.github/workflows/**` | ❌ Protected path + secret-beslut |
| B1 S3-lane | `ci.yml` + 2 vitest-configar | ❌ Lane-arkitekturbeslut, medvetet deferrat |
| B3 durable bus | event-bus + finalize + status | ❌ Arkitektur (L), deploy-topologi-beslut |
| B7 #140 | annans infra-spår | ❌ Inte vårt |

## Worktree-exekveringsplan (säkra delmängden) — när vi återupptar

```
git worktree add ..\sajtmaskin-omr8-envdoc -b chore/omr8-env-doc   # bas: aktuell origin/master
owner_files: config/env-policy.json, docs/ENV.md   (disjunkt mot Omr5 + #164 + #140)
ändring:    lägg SAJTMASKIN_REFUSE_DOSSIER_STUBS (boolean, non-sensitive, default-OFF)
            i rätt array + ENV.md-rad. FLIPPA INTE default.
verifiera:  npm run typecheck (0)
PR:         risk 1, ej protected → PR-mergaren kan auto-merga vid grön (ok för ren env-doc)
```

B2-dedup (om vi tar den): eget worktree `..\sajtmaskin-perf-readall-dedup`, owner `src/lib/gen/event-bus.ts`, men **koordinera event-bus-ytan med Område 5-spåret** (gör först/snabbt eller låt Omr5 äga ytan).

## Prioriterad ordning (när pausen släpps)

| # | Post | Varför först / vänta | Effort | Isolerbar |
|---|---|---|---|---|
| 1 | B6 next-bump | Redan senaste stabila → stäng som inaktuell (noll arbete) | – | Ja |
| 2 | B2 dedup-fix | Bekräftad perf-vinst på het pollad yta; Set-dedup trivial + beteendeneutral | S | Ja (`event-bus.ts`) |
| 3 | B5 env-doc | Trivialt + grundhygien (nyckel saknas); flippen väntar på Omr5 | S | Ja |
| 4 | B6 ignore-prune + arkivera | Ren hygien, låg risk, men bred prune = eget pass + per-rad-beslut | S | Mestadels |
| 5 | B4 canvas-token | Cheap hygien men kräver secret-beslut; ingen branch-protection tvingar det | S | Ja |
| 6 | B1 S3-lane | Låg brådska (master grön, symbol redan raderad); lane-arkitekturbeslut | S | Delad lane-yta |
| 7 | B3 durable bus | Störst värde + störst effort; arkitektur, beror på deploy-topologi | L | Nej |
| — | B7 #140 | Annans spår (infra/inspector) — endast dokumenterat, ingen åtgärd | — | — |

## Pausnot

Pausad **2026-06-19** för att spara kontext åt LLM-flöde-spåret (coachens Område 5 Fas 0).
**Återuppta:** stäng B6 next-bump (inaktuell) + dispatcha B5 env-doc (rent, disjunkt). B2-dedup
först efter att event-bus-ytans ägarskap mot Område 5 är avgjort.
