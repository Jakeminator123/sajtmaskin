# Modellpriser (USD) — referens

Pris- och kapacitetsreferens för modellerna i `manifest.json`. **Detta är en
ögonblicksbild (referens), inte en runtime-källa** — koden läser aldrig den här
filen. Verifiera alltid mot leverantörens pris-sida innan budgetbeslut.
Kanonisk siffertabell för cost-scripts: [`pricing.json`](pricing.json).

- **Nya OpenAI-modeller verifierade:** 2026-11-27
- **Källor:**
  - OpenAI: <https://developers.openai.com/api/docs/models/gpt-6.2-sol>, <https://developers.openai.com/api/docs/pricing>
  - Anthropic: <https://platform.claude.com/docs/en/about-claude/models/whats-new-claude-4-8> + <https://www.anthropic.com/claude/opus>

## Policy (viktigt)

| Regel                                                                         | Varför                                                                                      |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Låg / Mellan / Hög använder `gpt-6.2-sol`, inte ett separat `-pro`-modell-ID.** | Längre resonemang styrs med `reasoningEffort` (medium / high / xhigh) i `reasoningMode: "standard"`. |
| **`reasoningMode: "pro"` är inte längre default.**                            | Valbart i backoffice. Prod `llm_usage` 28 jul–1 sep 2026 visade ~6× fakturerad input (142k vs 22k p50) när Premium körde pro-läge. |
| **GPT-6.2 Sol och GPT-6.2 Astra saknar `none`.**                                | Runtime klampar begärd effort per modell (`openai-capabilities.ts`); Luna och GPT-5.6 har hela `none` … `max`. |
| Små matchnings- och extraktionsuppgifter kör `gpt-6.2-sol` med `low`. | Versionsgranskning använder `gpt-6.2-sol` med `medium`. Presentationsanalys och scaffoldguidens bildtolkning använder `gpt-6.1-terra` med `medium`. |

## OpenAI (per 1M tokens, standardnivå)

| Modell            | Input  | Cached input | Output | Status                                                                 |
| ----------------- | ------ | ------------ | ------ | ---------------------------------------------------------------------- |
| `gpt-6.2-sol`     | $2.00  | $0.10        | $10.00 | **Byggmodell** för Låg/Mellan/Hög + fixer, verifier, brief, SEO, wizard och små textflöden |
| `gpt-6.1-terra` | $1.00 | $0.05 | $5.00 | Bildgranskning |
| `gpt-6.1-sol` | $2.00 | $0.10 | $10.00 | Tidigare byggmodell |
| `gpt-6-astra` | $10.00 | $1.00 | $50.00 | Tidigare Ultra-byggmodell |
| `gpt-6-luna`      | $0.10  | $0.01        | $0.50  | Historisk prisrad   |
| `gpt-6.2-astra`     | $8.00  | $0.40        | $40.00 | **Byggmodell** för Extra hög (`ultra`), planner + generator            |
| `gpt-5.6-sol`     | $4.00  | $0.40        | $20.00 | Tidigare byggmodell; audit Avancerad-reserv och persisterade rader     |
| `gpt-5.6-terra`   | $2.00  | $0.20        | $12.00 | Persisterade rader / env-overrides           |
| `gpt-5.6-luna`    | $0.20  | $0.02        | $1.20  | Historisk prisrad och persisterade rader; inte aktiv audit-reserv      |
| `gpt-5.5`         | $5.00  | $0.50        | $30.00 | Bara persisterade rader / env-overrides — inte en byggprofil-default   |
| `gpt-5.4`         | $2.50  | $0.25        | $15.00 | Legacy (kvar för persisterad data)                                     |
| `gpt-5.4-mini`    | $0.75  | $0.075       | $4.50  | Pensionerad; aliasas till `gpt-6.2-sol`                                |
| `gpt-5.4-nano`    | $0.20  | $0.02        | $1.25  | (ej i bruk i manifest)                                                 |
| `gpt-5.3-codex`   | ~$2.50 | ~$0.25       | ~$15   | Deprecerad av OpenAI; aliasas till `gpt-6.2-sol`. Pris kvar för historik |
| `gpt-5.5-pro`     | ~$15–30| –            | ~$90–180 | **Använd ej** (policy)                                               |

`gpt-5.5` är ~2× `gpt-5.4` (in och ut) och lever kvar för gamla rader.
Kontextfönster för GPT-6.2 Sol, GPT-6 Luna och GPT-5.6: **1 050 000** tokens, 128k max output.
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
| `buildProfiles.defaults.pro` / `.max` / `.premium` / `.codex`                   | `gpt-6.2-sol`                          | medel      |
| `buildProfiles.defaults.ultra` (Extra hög)                                      | `gpt-6.2-astra`                          | hög        |
| Extra hög förhandsgrind (skapa / förfina)                                       | 50 / 30 krediter                       | grind      |
| `qualityToOwnEngineModel.*`                                                     | `gpt-6.2-sol`                          | medel      |
| `phaseRouting` fixer, deploy-assistant, verifier (alla OpenAI-nivåer; verifier och Låg deploy-assistant `medium`) | `gpt-6.2-sol` | medel |
| `perTierBriefing` pro / max / premium / codex / ultra + `briefing.defaults.*`   | `openai/gpt-6.2-sol`                   | medel      |
| `seo_publish_copy` (SEO-switchen vid publicering, `medium`)                     | `openai/gpt-6.2-sol`                   | medel      |
| `wizard_enrich_competitors` / `company_lookup` (byggarens wizard, `medium`)     | `openai/gpt-6.2-sol`                   | medel      |
| `analyze_presentation_vision` / `backoffice_scaffold_wizard_persona` / `live_review` (`medium`) | `gpt-6.1-terra` | medel |
| `backoffice_scaffold_wizard_guide` (`low`)                                   | `gpt-6.2-sol`                          | medel      |
| `backoffice_dossier_curation` (`medium`)                                        | `gpt-6.2-sol`                          | medel      |
| `phaseRouting.anthropic`                                                        | `claude-opus-4.8`                      | hög        |
| `audit_structured` (inloggad Avancerad)                                         | `openai/gpt-6.2-sol` (reserv `gpt-5.6-sol`) | medel |
| `audit_structured_public` (gratis `/analys` + betald Vanlig, `medium`, ingen Luna-reserv) | `openai/gpt-6.2-sol` | medel |
| utility (`project_analyze`, `text_analyze`, `inspector_ai_match`, `analyze_*`, `domain_suggestions`, `match_classifier`, `prompt_rewrite`, effort enligt arbetsuppgift) | `gpt-6.2-sol` | medel |
| `prompt_rewrite` outputtak                                                      | 8192 tokens, inkl. reasoning           | maxgräns, inte uppmätt förbrukning |
| embeddings                                                                      | `text-embedding-3-small`               | mycket låg |

> **Budget-not:** GPT-6.2 Sol, GPT-6 Luna och GPT-5.6 har 1,05M-fönster. `modelBudgetScale()`
> klampar därför Premium till takvärdet 3.0×. Requests över 272k input debiteras
> dessutom med 2× input och 1,5× output.
> Justera `src/lib/models/context-window.ts` om du vill kapa det.
