# STATUS-10 KANDIDATLISTA — observatorie-läckage + latency-fynd

**Datum:** 2026-04-23
**Producerad av:** orkestrator-agent under plan-02-väntan
**Syfte:** Färdigställd inputlista till plan 10 (latency budgets + safe skip-rules) baserad på smoke-data + observatorie-scan.

> Kompletterar STATUS-09-CANDIDATES (legacy-rester) och STATUS-04-AUDIT (fixer-yta).

## A. Latency-fynd från smoke (Run 1–3 av plan 01)

| Mätning | Värde | Källa |
|---|---|---|
| Init stream durationMs | **378 222** (6,3 min) | Run 1, console + meta.json |
| Quality-gate POST | **91 sek** | Run 1, devlog `POST /api/.../quality-gate 200 in 92s` |
| Run 2 (3D coffee) duration | 228 sek | observability.json |
| Run 2 reasoning ms | **103 sek** | meta.json |
| Run 3 (kontaktform) duration | 128 sek | observability.json |
| Run 3 reasoning ms | 29 sek | meta.json |

**Mönster:** Quality-gate är en konsistent latens-tjuv (~90s i init, ~0s när `design_preview_skip_verify` triggas). Skip-policyn fungerar — men bara för follow-ups, inte init.

**Förslag plan 10:** Sätt latency-budget per fas. Skip-regel för quality-gate i init när vissa pre-conditions är uppfyllda (t.ex. ren mekanisk autofix-pass + 0 typecheck-fel).

## B. Observatorie-läckage — `_unrouted/` per 2026-04-23

Skansning av `logs/generationslogg/_unrouted/`:

| Bucket | Filer | Storlek | Anmärkning |
|---|---|---|---|
| `orchestration-styledirection` | 7 | **846 KB** | 50× större än näst-största. Smoke visar att event har runId; ändå unrouted. → **logger-bug**. |
| `brief-full` | 7 | 79 KB | Liknande mönster som styledirection — events som troligen har chatId men inte routas. |
| `assist-brief-request` | 7 | 17 KB | Brief-pipeline events. |
| `site-finalized` | 7 | 13 KB | Final-events utan tillräcklig kontext. |
| `assist-brief-response` | 7 | 9 KB | dito. |
| `orchestration-resolved` | 7 | 8.7 KB | dito. |
| `brief-cache-miss` | 7 | 5 KB | OK, brief-cache miss är pre-run så ofta utan runId. |
| 3 × `chat-{uuid}` | 7×3 | ~3.6 KB | Events som har chatId men ingen runId. Begripligt. |

**Total läckage:** ~980 KB över 10 buckets, dominerat av styledirection.

**Implikation:** Per-run-summary saknar style-direction-information för 100 % av runs. observability.json visar `variant` i meta-data men styledirection-event:et hamnar i unrouted istället för att skrivas in i per-run-mappens timeline.

**Förslag plan 10:**
- Fixa routing i `src/lib/logging/generation-log-writer.ts` så `orchestration.styleDirection` med runId/chatId routes till per-run-mapp.
- Sätt **maxstorlek per unrouted-bucket** med rotation/LRU. 846 KB för en bucket är overkill.
- Lägg en `_unrouted/_README.md` med policy + retention.

## C. Auto-repair-pass-as-followup_technical (delas med plan 03)

Bekräftat i smoke + observability.json: när server-repair triggas räknas det som en `followup_technical`-run i statistik. Det skevar:
- per-chat history.ndjson visar fler "follow-ups" än användaren faktiskt skickade
- duration-statistik blandar user-driven follow-ups med system-driven repairs

**Förslag plan 10:** Ta hjälp av plan 03:s discriminator (när den landar) — exkludera auto_repair-pass från follow-up-latency-statistik. Spåra dem separat under "auto-repair latency".

## D. Conditional/feature-flagged latency-handles

Från STATUS-04-AUDIT:
- `SAJTMASKIN_VISUAL_QA=1` styr `analyzeVisualQuality` — inaktiv default. Aktivera + mät om det adderar latens.

Från config.ts (kan kollas):
- `SAJTMASKIN_BLOCKING_ESLINT*` (från cleanup-vågen) styr om eslint blockar.

## E. Cross-fil-stub-warning-effekt på latency

Plan-02-agenten lägger till warning-events när cross-file-import-checker stubbar missing files. Det kan innebära ett extra event-emit per stub. Marginellt, men plan 10 bör verifiera ingen latensregression.

## Sammanfattning för plan-10-prompten

| Tier | Fynd | Effort | Värde |
|---|---|---|---|
| A | quality-gate skip-rule för init | medel | hög (90s/run) |
| B | unrouted routing-fix (styledirection) | låg | medel |
| B | unrouted bucket-rotation | låg | medel |
| C | auto-repair exkluderas från follow-up-stat | låg | hög (statistik-sanning) |
| D | mät visual-qa + blocking-eslint | låg | låg-medel |
| E | verifiera plan-02-stub-warning impact | låg | låg |

Plan 10 bör börja med Tier A (största latensvinst) och Tier B (snabb routing-fix).
