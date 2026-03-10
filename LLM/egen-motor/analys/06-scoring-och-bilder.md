# Scoring, flöden och visuella sammanfattningar

> 2026-03-06 — Poäng, procent och diagram som sammanfattar v0 vs sajtmaskin.

---

## Bilder

Alla bilder finns i `bilder/`-mappen:

| Fil | Visar |
|-----|-------|
| `v0-fyra-lager.png` | v0:s fyra instruktionslager: systemprompt, dynamisk injektion, användarens prompt, thinking-steg |
| `sajtmaskin-vs-v0-hela-kedjan.png` | Hela promptkedjan sida vid sida: sajtmaskins 7 steg (FÖRE LLM) vs v0:s 6 steg (EFTER LLM) |
| `scorecard-sajtmaskin-vs-v0.png` | Kapabilitetsscoring: 12 dimensioner med poäng per system |
| `v0-vs-sajtmaskin-architecture.png` | Arkitekturöversikt: vem äger vilket lager, var sitter luckorna |
| `sajtmaskin-utan-v0-roadmap.png` | Byggroadmap: vad som behövs om v0 tas bort (21-41 veckor) |

---

## Scoring per kapabilitet

| # | Kapabilitet | v0 | sajtmaskin | Vikt | v0 viktat | sajtmaskin viktat |
|---|-------------|-----|-----------|------|-----------|-------------------|
| 1 | Promptspecifikation | 9 | 8 | 12% | 1.08 | 0.96 |
| 2 | Dynamisk kontextinjektion | 9 | 4 | 10% | 0.90 | 0.40 |
| 3 | Modellrouting | 8 | 7 | 6% | 0.48 | 0.42 |
| 4 | Ny chatt vs fortsättning | 9 | 7 | 8% | 0.72 | 0.56 |
| 5 | Streaming-fixar | 9 | **0** | 14% | 1.26 | **0.00** |
| 6 | Post-gen autofix | 8 | 2 | 14% | 1.12 | 0.28 |
| 7 | Eval / observability | 7 | 5 | 8% | 0.56 | 0.40 |
| 8 | Säkerhet / guardrails | 8 | 5 | 5% | 0.40 | 0.25 |
| 9 | Kostnadskontroll | 7 | 7 | 5% | 0.35 | 0.35 |
| 10 | Felåterhämtning | 8 | 4 | 8% | 0.64 | 0.32 |
| 11 | Prompt-orkestrering | 7 | **8** | 5% | 0.35 | **0.40** |
| 12 | Visuell identitet | 6 | **8** | 5% | 0.30 | **0.40** |
| | **TOTALT** | | | 100% | **8.16** | **4.74** |

---

## Fyra totalscorer

| Score | Formel | Värde | Vad det betyder |
|-------|--------|-------|-----------------|
| ParityScore | sajtmaskin viktat / v0 viktat | **58%** | sajtmaskin gör 58% av det v0 gör totalt |
| SelfBuildScore | andel kapabiliteter som KAN byggas internt | **72%** | 72% av v0:s funktioner kan replikeras |
| ReliabilityScore | uppskattad success-rate utan post-fix | **45%** | ~10% trasiga generationer som ej fångas |
| StrategicFitScore | relevans för sajtmaskins målgrupp | **75%** | styrkor matchar kunderna |
| **Sammanvägt** | medelvärde | **62.5%** | confidence: 55-70% |

---

## Var sajtmaskin leder v0

| Kapabilitet | sajtmaskin | v0 | Fördel |
|-------------|-----------|-----|--------|
| Prompt-orkestrering (budget/fasning) | **8** | 7 | +14% |
| Visuell identitet (motion, palette, quality bar) | **8** | 6 | +33% |
| Kostnadskontroll (credits, per-modell-pricing) | 7 | 7 | paritet |

---

## Var sajtmaskin halkar efter

| Kapabilitet | sajtmaskin | v0 | Gap | Byggtid |
|-------------|-----------|-----|-----|---------|
| Streaming-fixar (LLM Suspense) | **0** | 9 | -100% | 4-6v |
| Post-gen autofix (AST + modell) | 2 | 8 | -75% | 3-5v |
| Dynamisk kontextinjektion | 4 | 9 | -56% | 3-5v |
| Felåterhämtning (retry-loop) | 4 | 8 | -50% | 1-2v |

---

## Nyckelinsikt i en mening

sajtmaskin är stark FÖRE LLM:en (prompt-berikning, visuell identitet,
orkestrering) men svag EFTER LLM:en (ingen streaming-fix, ingen autofix,
ingen eval-loop). v0 är tvärtom: enkel FÖRE men massiv EFTER.

Den optimala strategin är att behålla bådas styrkor: sajtmaskins pre-processing
+ v0:s post-processing — och gradvis bygga egen post-processing för att
minska beroendet.
