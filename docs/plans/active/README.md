# Aktiva planer — koncentrat (en källa)

Senast uppdaterad: 2026-06-17 (plansystem-konsolidering). **Denna fil är den enda aktiva planytan.** All verbos plan-detalj ligger i [`../archived/`](../archived/) (vilande/skrotade spår, filnamn bevarade) och [`../avklarat/`](../avklarat/) (mergad historik). Git-historiken bevarar allt — länka hit, duplicera inte. Buggstatus ägs av [`../../../BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md); den här filen destillerar bara fortfarande öppna P1/P2.

Lifecycle-kontrakt: [`.cursor/rules/plan-lifecycle.mdc`](../../../.cursor/rules/plan-lifecycle.mdc).

---

## Aktiv drivlinje (2026-06-18): Grandmaster-plan — stabilitet, kontrakt, städning

Den konsoliderade körplanen ligger i **[`grandmaster/00-master-plan.md`](grandmaster/00-master-plan.md)** (nivå 1) med 8 områden (nivå 2) i samma mapp; nivå 3-aktiviteter skapas just-in-time. Den slår ihop deep-research-rapporten, cleanup-handoffen och "Controlled Aggression" till en lättviktig plan (stabilitetstester, kontraktslager [`docs/contracts/`](../../contracts/README.md), gemensam städning). Plan-nivåmodellen är kodad i [`plan-lifecycle.mdc`](../../../.cursor/rules/plan-lifecycle.mdc). Den ersätter repo-tvätt som drivlinje; **repo-tvätt blev term-check light i [`område 1`](grandmaster/01-kontrakt-och-regler.md)**, resten är historik.

---

## Aktivt initiativ (infällt i drivlinjen ovan som lane S3): Repo-tvätt — terminologi + kontraktsägarskap

Full plan: [`../archived/2026-06-17-repo-tvatt-terminologi-kontrakt.md`](../archived/2026-06-17-repo-tvatt-terminologi-kontrakt.md).

Appen fungerar. Vi bygger **inte** om den och flyttar **inte** mappar i stor skala. Grundtes: namnöverlappning är symptom — flera ord blandar produkt-/pipeline-/UI-/runtime-/legacy-nivå. Repot har router + ordlista + signal-ägarmatris, men de är inte **mekaniskt enforced**. Vi gör dem det, i tre steg: (1) bestäm betydelse + ägare per term, (2) sätt en automatisk vakt, (3) fixa false-green-buggar + död kod tryggt bakom vakten. **En regel:** varje domänterm har exakt en owner, ett syfte, ett input-kontrakt, ett output-kontrakt.

### Operating model

```
Scout (read-only)  ─►  term/kontrakt-karta  ─►  Jake godkänner PR-prompt
        │                                              │
        └──────────── foundation för PR0/PR1 ──────────┘
                                                        ▼
   Builder-agent per PR ─► egen branch/worktree ─► GATE ─► PR → master
                                                        ▼
                                       Jake + orchestrator granskar → merge
```

Isolering obligatorisk: egen branch/`git worktree`, aldrig dela HEAD ([`agent-worktree.mdc`](../../../.cursor/rules/agent-worktree.mdc)). Ingen builder öppnar `/builder` eller engine-endpoints under aktiv gen-session ([`builder-coexistence.mdc`](../../../.cursor/rules/builder-coexistence.mdc)).

### PR-kö

| PR | Mål | Typ | Risk | Knyter an till |
|---|---|---|---|---|
| **PR0** | `docs/architecture/terms-and-owners.md` (term → ägare → input/output-kontrakt → förbjudna alias) | Docs | Låg | nytt |
| **PR1** | `naming-dictionary.json` + `scripts/dev/check-term-coverage.mjs` inkopplad i preflight/CI | Verktyg | Låg · **keystone** | nytt |
| **PR2** | `FollowUpContract`-typ (snapshot-brief + låst scaffold/variant + route-freeze → kompileringsgaranti init↔follow-up) | Struktur | Låg–medel | spår O |
| **PR3** | UI/docs-term-pass ("Variant" ej "Scaffold Variant"; "Design Preview"/"Integration Build"; `backoffice` ej `dashboard`) | UI/docs | Låg | spår Q |
| **PR4** | "lane" begränsas till fixer/repair (verifiera serialiserade `FixLane`-värden först) | Kod | Medel | spår N |
| **PR5** | False-green-härdning: dossier-stubbar, F2 product-postcheck/warm-verify fail-closed, F3 readiness — eval-gated | Beteende | Medel | öppna P1/P2 nedan |

Beteende-neutrala PR0–PR3 kan köras autonoma i cloud; beteende-ändrande PR4–PR5 får tightast granskning.

### Gate per PR (innan merge)

`npm run typecheck` 0 · `npm run lint` 0 · `npx vitest run` befintliga gröna · `check-term-coverage` (efter PR1) inga nya förbjudna alias · deterministisk eval (beteende-PR) ingen regression mot baseline.

### Regression-track (förutsättning, inte sidospår)

| Del | Vad | Var |
|---|---|---|
| Term-coverage | Mekanisk vakt mot namnskuggor (PR1) | `scripts/dev/check-term-coverage.mjs` |
| Deterministisk golden-path-eval | 3–4 branschcases, nyckelfri, baseline-json — billig CI-gate för scaffold/route/copy + follow-up-läckage | nytt, t.ex. `npm run eval:deterministic` |
| Riktade router/follow-up-regressioner | ~30–50 prompt→intent + `core`-testlane | Vitest, befintlig svit |

### Status / nästa beslut

- [x] Scout (read-only): term → ägare → kontrakt-karta + forbidden-alias-seed.
- [ ] **Jake:** godkänn PR-kö + gate-modell (eller ändra ordning/scope).
- [ ] **Jake:** skriv builder-prompt för **PR0+PR1 ihop** (beteende-neutral) för signoff innan körning.
- [ ] Kör gated builder per godkänd PR → granska → merge.

---

## Övriga aktiva spår

Repo-tvätt-initiativet **äger inte** dessa — det lägger en terminologi/kontrakt-lins ovanpå. Varje spår bor nu i `../archived/` med full text; nästa steg sammanfattat här.

| ID | Spår + nästa steg | Arkiverad källa |
|---|---|---|
| **O** | **LLM-masterplan (startlinje).** Kvar: P0d abort→retry/fallback, P1a–e init/follow-up-konsistens (`generationMode` split-brain, `briefSummary`-null, follow-up `app/page.tsx`-guard, status-från-DB-flag), P2 latency/parallellisering, P3 prompt-kvalitet, P4 docs/status. Läs först vid LLM-flöde-arbete. | [`2026-04-28-llm-flode-startlinje.md`](../archived/2026-04-28-llm-flode-startlinje.md) |
| **R** | **Builder follow-up/preview-incident.** Spår A–D + F levererade (basversion-pinning, tool-only output, F2/F3-deps, preview-session, loggkorrelation). Kvar: E UX/status-copy + end-to-end-verifiering. | [`2026-05-02-builder-followup-preview-incident.md`](../archived/2026-05-02-builder-followup-preview-incident.md) |
| **P** | **Prompt-slim (child till O).** Kvar: Core Rules <35k och normal follow-up <45k utan nytt promptlager; kör om `eval:smoke` före stängning. | [`prompt-slim-systemprompt.md`](../archived/prompt-slim-systemprompt.md) |
| **A** | **P34 blocking lint.** Kvar: Fas C aktivera `SAJTMASKIN_BLOCKING_ESLINT=true` i Vercel Preview (Dashboard) + mät latens; Fas D prod; Fas E ta bort lint ur bakgrundsgate. | [`P34-blocking-lint-in-validate-and-fix.md`](../archived/P34-blocking-lint-in-validate-and-fix.md) |
| **B** | **Dossier v1→v2 doc-rewrite (cloudagent).** Kvar: D3/D5/D7 — arkivera/omskriv tre stale docs-sektioner. Docs-only, redo för cloudagent. | [`cloudagent-paket-A-doc-rewrite.md`](../archived/cloudagent-paket-A-doc-rewrite.md) |
| **Q** | **F2/F3 UX-copy (spår B).** Kvar: ett kanoniskt ordval för "Bygg integrationer"/F3 per UI-yta; `sandbox`→`preview`/`VM`. Ingen status-/signallogik. | [`2026-05-01-f2-f3-ux-copy-konsolidering.md`](../archived/2026-05-01-f2-f3-ux-copy-konsolidering.md) |
| **L** | **Kräver-dialog (databas/Redis observability).** Kvar: 7 ägarbeslut — mega-cleanup ordering, TOCTOU-race, `CONCURRENTLY`-regex, NDJSON tail, helper-flytt, fler strict schemas. | [`KRAVER-DIALOG-2026-04-24.md`](../archived/KRAVER-DIALOG-2026-04-24.md) |
| **M** | **Öppna scaffold-trådar.** Kvar: SAJ-37/42 retry brief-context, SAJ-44 kwNorm, SAJ-55 scoring wire/keep/delete, SAJ-57 `scaffoldRetryUsed`, sv-locale-routing, latency-mätning. | [`OPEN-THREADS-SCAFFOLDS-2026-04-24.md`](../archived/OPEN-THREADS-SCAFFOLDS-2026-04-24.md) |
| **N** | **Follow-up vs auto-repair lane-kollision.** Kvar: gate som kör repair först och replay:ar user-follow-up på reparerad version (P1d i O → PR4). | [`2026-04-27-followup-vs-autorepair-lane-collision.md`](../archived/2026-04-27-followup-vs-autorepair-lane-collision.md) |
| **T** | **LLM-tools för builder (scope).** Kvar: bekräfta Wave 1 (`removeCapability` + `addRoute`) innan implementation. | [`llm-tools-builder-spar.md`](../archived/llm-tools-builder-spar.md) |

**Parkerat (väntar på gate)** — i [`../archived/parked/`](../archived/parked/):

| Spår | Gate |
|---|---|
| [`L1-unified-repair-call.md`](../archived/parked/L1-unified-repair-call.md) | Telemetri-data + stabilt repo |
| [`L2-prompt-kit.md`](../archived/parked/L2-prompt-kit.md) | system-prompt-split settle:ad |
| [`L3-dossier-variants.md`](../archived/parked/L3-dossier-variants.md) | M2 + observationstid |
| [`P32-request-type-taxonomy.md`](../archived/parked/P32-request-type-taxonomy.md) Fas B–F | Stabil follow-up-semantik + bredare eval-surface |
| [`2026-04-28-pixelkallaren-eval-och-uppfoljning.md`](../archived/parked/2026-04-28-pixelkallaren-eval-och-uppfoljning.md) | Konkret eval-runner/baseline eller gaming-variant/F2-3D/form-a11y-PR |

---

## Öppna buggar/uppgifter (koncentrat)

Endast fortfarande öppna P1/P2 (destillerat ur [`../../../BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md) + arkiverad [`Kvarvarande-uppgifter.md`](../archived/Kvarvarande-uppgifter.md)). `[x]`-rader och avskrivna fynd utelämnade. Källkolumnen pekar på backloggens `G#/N#/R#/E#`-id.

### P1

| Tema | Vad | Källa |
|---|---|---|
| F2 false-green | F2 quality-gate fångar inte runtime/UI-fel; Product Postcheck default-off/fail-open. Produktifiera runtime-smoke, inte bara typecheck. | G#10, N#4, N#H3, R#6 |
| Autofix-stubbar | `cross-file-import-checker` skapar null-render/dossier-stubbar → kan bli tyst success. Vägra dossier-stubbar eller markera blocker/degraded. | N#1 |
| Brief-degradering | Simplified brief-fallback sänker premium/3D. Begränsa eller markera degraded mode explicit. | G#13 |
| Eval merge-syntax | `arcade-with-klarna`-eval failar på merged syntax (`Expected '(' / 'from'`), LLM-fixer abortar. Kör `eval:weird-smoke:dump`, jämför raw/fixed/merged. | E#1, R#10 |

### P2 (tematiskt)

| Tema | Öppna fynd | Källa |
|---|---|---|
| Verify-gates fail-open | Preview visas trots verifier-blocked draft; warm tsc/eslint fail-open vid kall cache; verifier ser snippets, inte hela filer. | G#31, G#32, G#33, N#4 |
| F3 readiness/integration | F3 build-plan tappas när follow-up inte återinfererar integration; `/finalize-design` kan säga ready utan krav; hard dossiers ger placeholder-UI i stället för blocker. | G#20, G#21, G#22, N#H2, R#7 |
| Capability single-source | Init och follow-up har olika capability-universum; dossier/capability-threading svagt vissa paths. | G#25, G#26, N#2 |
| Env-sanning/precedence | `process.env`-drift utanför `env.ts`; dubbla env-docs; generated `.env.local` kan vinna över user-env; `allowPlaceholdersInF3` kan släppa stub-secrets. | G#16, G#17, G#18, G#19, N#H4 |
| Status/degraded UX | Event-bus statusprojektion (`selectVersionStatus`) inte fullt inkopplad i builder-UI (spår A / Kvarvarande #11); placeholder-bild maskerar trasigt original; recurring verifier-fynd saknas i nästa prompt (E3); follow-up context-budget saknar regression-gate. | N#6, G#35, N#5, N#3 |
| Säkerhet/policy | Inspector SSRF-edge (publik DNS → privat IP); publik PDF-parse-yta / 10MB-input CPU-policy. | G#40, G#38, R#12 |

### Infra-förenkling + längre horisont

Från arkiverad `Kvarvarande-uppgifter.md` (ej P1/P2-buggar, men styr fortfarande): core-split v2 (`orchestrate.ts` ~965 rader, `manifest.json`-split), event-bus UI-flip spår A (#11, = N#6 ovan), VersionHistory badge/overlay visuell verifiering ([SAJ-23](https://linear.app/sajtmaskin/issue/SAJ-23)). Telemetri-blockad (vänta ~1 vecka, läs counters): early-stop-inventering, verifier asynk/bort, partial-file-repair-removal, P50/brief-A/B. Strategiskt: slå ihop server-verify + quality-gate + accept-repair (§3.2); WebContainers-migration (boot 2–5 min → ~5 s). Extern: ÅÄÖ pre-commit hook. Detaljer: [`../archived/Kvarvarande-uppgifter.md`](../archived/Kvarvarande-uppgifter.md).
