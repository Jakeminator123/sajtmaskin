# OMTAG — explicit parkerat tills efter fas 2

Guldrapporten 2026-04-23 (`gpt_review/filer/repo_assessment_2026-04-23.md`) säger rakt: *"Det där är rätt senare, men fel precis nu. Det skär tvärs över för många filer, ökar merge-risk och gör det svårare att veta om du verkligen blev bättre eller bara mer ombyggd."*

Följande är **explicit parkerat** — agenter som plockar något härifrån utan godkännande ska stoppas.

| Spår | Plan-fil | Varför parkerat | Gatekeeper |
|---|---|---|---|
| **L1 — Unified repair-call** | `docs/plans/active/L1-unified-repair-call.md` | Slår ihop 4 LLM-fixer-anrop → 1 `runUnifiedRepair()`. Skär tvärs över verifier, autofix, finalize, server-verify. Merge-risk hög utan telemetri-data. | Telemetri-data efter fas 2 + stabilt repo |
| **L2 — PromptKit** | `docs/plans/active/L2-prompt-kit.md` | Canonical `composePrompt()` över alla 4 LLM-callsites. Kräver att OMTAG 03 (system-prompt-split) och Fas 2·A (follow-up-predicate) landat + settled. | Fas 2 helt klar + OMTAG 06 igång |
| **L3 — Dossier variants** | `docs/plans/active/L3-dossier-variants.md` | Introducerar "varianter" per dossier. Kräver att dossier-kontraktet är stenhårt (Fas 2·D Paket B) + empirisk bas (M2, också parkerat). | Fas 2·D + ≥ 1 vecka observationstid |
| **M2 — 5–10 nya dossiers** | `docs/plans/active/M-medium-hard-layer.md` M2 | Guldrapporten: *"Först måste kontraktet bli hårt, annars fyller du bara på ett system som ännu inte är tillräckligt självkonsistent."* | Fas 2·D Paket B landad + validerad |
| **P32 Fas B–F** | `docs/plans/active/P32-request-type-taxonomy.md` | Q&A-shortcut, micro-edit-pipeline, multi-change wrap, external-fetch-tool, LLM-fallback. Fas A klar. B–F behöver stabil follow-up-semantik (Fas 2·A). | Fas 2·A + eval-baseline som visar stabil init/followup-latens |
| **M3 — konsolidera 5 cross-file-import-fixers** | `docs/plans/active/M-medium-hard-layer.md` M3 | Kräver telemetri-data om vilka fixers som faktiskt triggar. | ≥ 1 vecka telemetri efter Fas 2·C |
| **P33 — shadcn ecosystem expansion** | `docs/plans/active/P33-shadcn-ecosystem-expansion.md` | Feature-breddning, inte kärnkonsolidering. | Fas 2 klar + produktbeslut |
| **Audit §3.2 — slå ihop server-verify + quality-gate + accept-repair** | `Kvarvarande-uppgifter.md` #11 | 1 veckas effort. Stor refaktor i verifier-kedjan. Bäst efter event-bus (OMTAG 06). | OMTAG 06 klar |
| **Audit §3.1 + §3.3 — verifier asynk/bort + partial-file-repair-removal** | Samma | Kräver 1 v telemetri via `sajtmaskin_verifier_blocking_total` + `sajtmaskin_partial_file_repair_total{outcome}`. | Telemetri |
| **WebContainers-migration (Audit Tier D #38)** | `STATUS-2026-04-20.md` | 2–3 veckor, dedikerad session. 50–60× boot-speedup. Single-largest UX-win men inte en "i-kväll"-sak. | Dedikerad session |
| **F3-toggle + dossier stor expansion** | diverse | Rör capability-mapping som Fas 2·D härdar. Vänta tills kontraktet sitter. | Fas 2·D |

## Om en agent ändå vill börja på något härifrån

1. Stoppa. Bekräfta mot den här listan.
2. Om agenten har starkt case: skriv `OMTAG/UNPARK-<spår>.md` med (a) vad som skulle triggas tidigare än väntat, (b) vilka gatekeepers som är uppfyllda, (c) varför merge-risken är acceptabel nu. Lämna till mänsklig review.
3. Rör inget tills klartecken givits.

## Varför denna lista finns

Tre rapporter (fatigue-agenten, gpt-guldrapporten, OMTAG-analysen) är eniga om en sak: repot lider av **lager-multiplikation, inte funktionsbrist**. Varje nytt stort spår som startas innan de befintliga lagren är konsoliderade = en extra dimension att halvköra.

Mål är att hela OMTAG + Fas 2 går i mål som **reduktion** (färre lager, färre begrepp, färre flaggor), inte som tilläggsarbete. Den här parker-listan skyddar det målet.
