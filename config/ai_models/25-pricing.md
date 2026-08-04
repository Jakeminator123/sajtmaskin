# Modellpriser (USD) — referens

Pris- och kapacitetsreferens för modellerna i `manifest.json`. **Detta är en
ögonblicksbild (referens), inte en runtime-källa** — koden läser aldrig den här
filen. Verifiera alltid mot leverantörens pris-sida innan budgetbeslut.

- **Senast verifierad:** 2026-08-01
- **Källor:**
  - OpenAI: <https://developers.openai.com/api/docs/models/gpt-5.6-sol> + pricing-sidan
  - Anthropic: <https://platform.claude.com/docs/en/about-claude/models/whats-new-claude-4-8> + <https://www.anthropic.com/claude/opus>

## Policy (viktigt)

| Regel                                                                         | Varför                                                                                      |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Premium använder `gpt-5.6-sol`, inte ett separat `-pro`-modell-ID.**        | Längre resonemang styrs med Responses API `reasoningMode: "pro"`. Premium står på effort `high` sedan #751 — `xhigh`/`max` finns kvar i schemat men används inte som standard. |
| **Alla GPT-5.6-effortnivåer är tillåtna.**                                    | `none`, `low`, `medium`, `high`, `xhigh`, `max` finns i schema, runtime och backoffice.     |
| Små/utility-anrop hålls kvar på `gpt-5.4-mini` / `gpt-5-mini` / `gpt-5-nano`. | Ingen `gpt-5.5-mini`/`-nano` finns ännu.                                                    |

## OpenAI (per 1M tokens, standardnivå)

| Modell          | Input   | Cached input | Output   | Status                                       |
| --------------- | ------- | ------------ | -------- | -------------------------------------------- |
| `gpt-5.6-sol`   | $5.00   | $0.50        | $30.00   | **Premium-default** (build / assist / brief) |
| `gpt-5.6-terra` | $2.00   | $0.20        | $12.00   | Balansmodell, valbar per fas                 |
| `gpt-5.6-luna`  | $0.20   | $0.02        | $1.20    | Volymmodell, valbar per fas                  |
| `gpt-5.5`       | $5.00   | $0.50        | $30.00   | `max` / Tänker                               |
| `gpt-5.4`       | $2.50   | $0.25        | $15.00   | Legacy (kvar för persisterad data)           |
| `gpt-5.4-mini`  | $0.75   | $0.075       | $4.50    | Utility/legacy; inte byggprofil              |
| `gpt-5.4-nano`  | $0.20   | $0.02        | $1.25    | (ej i bruk i manifest)                       |
| `gpt-5.5-pro`   | ~$15–30 | –            | ~$90–180 | **Använd ej** (policy)                       |

`gpt-5.5` är alltså ~2× `gpt-5.4` (in och ut). Kontextfönster: `gpt-5.5` =
**1 050 000** tokens, 128k max output, `reasoning.effort` default `medium`.

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
| `buildProfiles.defaults.premium` / `qualityToOwnEngineModel.light` / `.premium` | `gpt-5.6-sol`                          | hög        |
| `buildProfiles.defaults.max`                                                    | `gpt-5.5`                              | hög        |
| `pro` / `codex` (build + flera faser)                                           | `gpt-5.3-codex`                        | medel      |
| `promptAssist.defaults.assist` / OpenAI `briefing.*`                            | `openai/gpt-5.6-sol`                   | hög        |
| `phaseRouting.anthropic` planner/generator                                      | `claude-opus-4.8`                      | hög        |
| `audit_structured` / `domain_suggestions`                                       | `openai/gpt-5.2`                       | medel      |
| utility (`project_analyze`, `wizard_*`, `inspector_ai_match`, `analyze_*`)      | `gpt-5-mini` / `gpt-5-nano` / `gpt-4o` | låg        |
| embeddings                                                                      | `text-embedding-3-small`               | mycket låg |

> **Budget-not:** Alla GPT-5.6-varianter har 1,05M-fönster. `modelBudgetScale()`
> klampar därför Premium till takvärdet 3.0×. Requests över 272k input debiteras
> dessutom med 2× input och 1,5× output.
> Justera `src/lib/models/context-window.ts` om du vill kapa det.
