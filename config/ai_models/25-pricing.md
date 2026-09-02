# Modellpriser (USD) — referens

Pris- och kapacitetsreferens för modellerna i `manifest.json`. **Detta är en
ögonblicksbild (referens), inte en runtime-källa** — koden läser aldrig den här
filen. Verifiera alltid mot leverantörens pris-sida innan budgetbeslut.
Kanonisk siffertabell för cost-scripts: [`pricing.json`](pricing.json).

- **Senast verifierad:** 2026-09-02
- **Källor:**
  - OpenAI: <https://developers.openai.com/api/docs/models/gpt-5.6-sol> + pricing-sidan
  - Anthropic: <https://platform.claude.com/docs/en/about-claude/models/whats-new-claude-4-8> + <https://www.anthropic.com/claude/opus>

## Policy (viktigt)

| Regel                                                                         | Varför                                                                                      |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Låg / Mellan / Hög använder `gpt-5.6-sol`, inte ett separat `-pro`-modell-ID.** | Längre resonemang styrs med `reasoningEffort` (medium / high / xhigh) i `reasoningMode: "standard"`. |
| **`reasoningMode: "pro"` är inte längre default.**                            | Valbart i backoffice. Prod `llm_usage` 28 jul–1 sep 2026 visade ~6× fakturerad input (142k vs 22k p50) när Premium körde pro-läge. |
| **Alla GPT-5.6-effortnivåer är tillåtna.**                                    | `none`, `low`, `medium`, `high`, `xhigh`, `max` finns i schema, runtime och backoffice.     |
| Små/utility-anrop hålls på `gpt-5-mini` / `gpt-5-nano` eller 5.6-syskon.      | Vision/live-review/wizard kör Terra/Luna/Sol. `gpt-5.4-mini` är pensionerad (alias → Sol). |

## OpenAI (per 1M tokens, standardnivå)

| Modell            | Input  | Cached input | Output | Status                                                                 |
| ----------------- | ------ | ------------ | ------ | ---------------------------------------------------------------------- |
| `gpt-5.6-sol`     | $4.00  | $0.40        | $20.00 | **Byggmodell** för Låg/Mellan/Hög (kampanjpris t.o.m. 2026-11-21)      |
| `gpt-5.6-terra`   | $2.00  | $0.20        | $12.00 | Sidofas (Låg fixer/deploy, Mellan/Hög verifier) + vision/brief Låg     |
| `gpt-5.6-luna`    | $0.20  | $0.02        | $1.20  | Låg verifier + billig fallback                                         |
| `gpt-5.5`         | $5.00  | $0.50        | $30.00 | Bara persisterade rader / env-overrides — inte en byggprofil-default   |
| `gpt-5.4`         | $2.50  | $0.25        | $15.00 | Legacy (kvar för persisterad data)                                     |
| `gpt-5.4-mini`    | $0.75  | $0.075       | $4.50  | Pensionerad; aliasas till `gpt-5.6-sol`                                |
| `gpt-5.4-nano`    | $0.20  | $0.02        | $1.25  | (ej i bruk i manifest)                                                 |
| `gpt-5.3-codex`   | ~$2.50 | ~$0.25       | ~$15   | Bara persisterade rader. Uppskattat (Codex credit-kort, `estimated`)   |
| `gpt-5.5-pro`     | ~$15–30| –            | ~$90–180 | **Använd ej** (policy)                                               |

`gpt-5.5` är ~2× `gpt-5.4` (in och ut) och lever kvar för gamla rader.
Kontextfönster för GPT-5.6: **1 050 000** tokens, 128k max output.
Requests över 272k input debiteras 2× input / 1,5× output.

## Anthropic (per 1M tokens, standardnivå)

| Modell              | Input                | Output               | Fast mode (in/ut) | Status                                                                                  |
| ------------------- | -------------------- | -------------------- | ----------------- | --------------------------------------------------------------------------------------- |
| `claude-opus-4.8`   | $5.00                | $25.00               | $10 / $50         | **Opus-default** (`anthropic`-profilens byggmodell + alla faser)                        |
| `claude-opus-4.6`   | $5.00                | $25.00               | —                 | Legacy (kvar för persisterad data)                                                      |
| `claude-sonnet-4.6` | se Anthropic pricing | se Anthropic pricing | —                 | Pensionerad 2026-06-28 → aliasas till `claude-opus-4.8` (endast historisk pris/display) |

`claude-opus-4.8` släpptes 2026-05-28, samma pris som 4.7, **1M kontext default**
(var 200k), 128k max output, `effort` default `high`. API-ID: `claude-opus-4-8`
(koden normaliserar `4.8` → `4-8`).

## Sajtmaskin-användning → modell

| Yta (manifest)                                                                  | Modell                                 | Prisklass  |
| ------------------------------------------------------------------------------- | -------------------------------------- | ---------- |
| `buildProfiles.defaults.pro` / `.max` / `.premium` / `.codex`                   | `gpt-5.6-sol`                          | hög (kampanj) |
| `qualityToOwnEngineModel.*`                                                     | `gpt-5.6-sol`                          | hög (kampanj) |
| `phaseRouting` Låg fixer/deploy; Mellan/Hög verifier                            | `gpt-5.6-terra`                        | medel      |
| `phaseRouting` Låg verifier                                                     | `gpt-5.6-luna`                         | låg        |
| `perTierBriefing.pro`                                                           | `openai/gpt-5.6-terra`                 | medel      |
| `perTierBriefing` max / premium / codex + `briefing.defaults.*`                 | `openai/gpt-5.6-sol`                   | hög        |
| `analyze_presentation_vision` / `backoffice_scaffold_wizard_persona` / `live_review` | `gpt-5.6-terra` (+ 5.6 visionModels) | medel      |
| `backoffice_scaffold_wizard_guide`                                              | `gpt-5.6-luna`                         | låg        |
| `backoffice_dossier_curation`                                                   | `gpt-5.6-sol`                          | hög        |
| `phaseRouting.anthropic`                                                        | `claude-opus-4.8`                      | hög        |
| `audit_structured` / `domain_suggestions`                                       | `openai/gpt-5.2`                       | medel      |
| utility (`project_analyze`, `wizard_*`, `inspector_ai_match`, `analyze_*`)      | `gpt-5-mini` / `gpt-5-nano`            | låg        |
| embeddings                                                                      | `text-embedding-3-small`               | mycket låg |

> **Budget-not:** Alla GPT-5.6-varianter har 1,05M-fönster. `modelBudgetScale()`
> klampar därför Premium till takvärdet 3.0×. Requests över 272k input debiteras
> dessutom med 2× input och 1,5× output.
> Justera `src/lib/models/context-window.ts` om du vill kapa det.
