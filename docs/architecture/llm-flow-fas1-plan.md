# LLM-flöde — Fas 1-plan

> **Skapat:** 2026-04-18 efter Vercel-template-research + dossier-pipeline-genomgång.
>
> **Syfte:** levande planeringsdokument för fas 1 (Brief → Scaffold → Variant → Dossier → Compose).
> Läs detta som målbild medan agenten bygger ingestion-pipen.

---

## Vad fas 1 är

Fas 1 = **förberedande** lager mellan användarens fritext-prompt och codegen-LLM:en.
Slut-resultatet är en **dynamisk systemprompt** som kombineras med statiska Core Rules.

```
USER PROMPT
    │
    ▼
┌──────────────────────────────────────────┐
│ FAS 1 — Smart förberedning               │
│                                          │
│ 1. Deep Brief expanderar + nominerar     │
│ 2. Scaffold pickas (embedding-driven)    │
│ 3. Variant pickas inom scaffold          │
│ 4. Dossiers (1-3 st) pickas              │
│ 5. Dynamic prompt komponeras             │
└──────────────────────────────────────────┘
    │
    ▼
FAS 2 — Codegen LLM bygger sajten
```

---

## Avgränsning — vad fas 1 INTE är

| Inte fas 1 | Tillhör | Vem äger |
|---|---|---|
| Själva kodgenereringen | Fas 2 | Codegen-LLM (egen agent/runtime) |
| Verifiering, autofix, repairs | **Fas 3** | **Annan agent — rör inte** |
| Beslut om version skickas till preview-VM | **Fas 3** | **Annan agent — rör inte** |
| Deploy till preview-VM | Fas 4 | Fly.io-runtime |
| Scrape Vercel-mallar för dossier-kandidater | Ingestion-pipeline (offline) | Denna agent |
| Bygga embeddings | Ingestion-pipeline (offline) | Denna agent |

**Vår gränsdragning mot Fas 3-agenten:** vi rör inte `verify/`, `repair/`, `quality-gate*`, `autofix*`, `useAutoFix*`, `preview-quality-gate*`, `version-manager*`, `finalize-version*`, eller VM-dispatch-kod. Om vi behöver signaler från fas 3 (t.ex. "förra versionen failed") läser vi via välkänd kontrakt-fil eller event, inte direkt i koden.

## Init vs followUp — påverkan

| Aspekt | `init` (första prompten i en chatt) | `followUp` (efterföljande prompts) |
|---|---|---|
| Brief genereras? | Ja, med Deep Brief LLM | Nej — använder lagrad brief från init |
| Scaffold-pick | Embedding + brief.nomination | Lagrad scaffold används (`persistedScaffoldId`) — ingen ny pick |
| Variant-pick | Embedding + brief.nomination | Lagrad variant används (`persistedVariantId`) |
| Dossier-pick | Full embedding-pass | Full embedding-pass (kan ändras per follow-up) |
| Drift-detection | Loggas normalt | Loggas med `mode: "followUp"` så det kan filtreras |
| Brief-nominerings-fält | Färska från LLM | Kan vara stale (från init) — drift-loggar märker upp `mode` |

**Konsekvens för fas 1.0:**
- Brief-nominerings-fält fylls i bara på `init`. På `followUp` är de antingen tomma eller stale.
- Drift-loggar inkluderar nu `mode` så stale-drift på followUp kan filtreras bort.
- Dossier-pick körs båda lägen — det är OK att follow-up byter dossier-set om användaren ändrar feature-scope ("lägg till stripe" mitt i en chatt).

---

## Designprinciper

| Princip | Innebörd |
|---|---|
| Statisk prompt aldrig bryts | `Core Rules` (= statisk prompt; `prompt-core/*.md` listade i `codegen-core-manifest.json`) är spelregler för LLM:n. Inget i fas 1 får motsäga dem. Båda namnen är OK — samma sak. |
| Deep Brief är expansion + nominering, inget annat | Deep Brief returnerar Brief-JSON med (a) utbyggd intent, (b) `scaffoldNomination`, `variantNomination`, `dossierNominations`. Inget mer. |
| Embedding är källa till sanning vid tvetydighet | Brief-nomineringen är en hint. Embedding-pick i orchestrate kan **bekräfta eller överrösta** med drift-logg. |
| Scaffold = struktur. Variant = visuell signatur. Dossier = integration. | Inga ovanlappande ansvar. |
| Per-Request Signal Cascade | EXPLICIT (Brief-fält) > INDICATED (Brief-LLM tolkning) > INFERRED (heuristik i `guidance-resolvers.ts`) > DEFAULT (variant) > FALLBACK (statiska defaults i `prompt-core/`). Tidigare termen "Directive Cascade" + `prompt-directives/`-katalogen är borttagna 2026-04-18. |
| Dossier som riktig kod, inte bara prompt-instruktion | När dossier väljs ska dess `components/`-filer faktiskt levereras till output-projektet, inte bara beskrivas för LLM:n. |

---

## Komponenter i fas 1

### 1. Deep Brief

| Aspekt | Idag | Mål |
|---|---|---|
| Modell | Brief-LLM (gpt-5.4 default) | Samma |
| Input | userPrompt + (optional) prevBrief | Samma |
| Output | Fri JSON med ~15 fält | **Strikt JSON** med scaffoldNomination + variantNomination + dossierNominations som tillägg |
| Schema-validering | Zod (`.optional()` → `.nullable()` enligt K1) | Skärpas: scaffoldNomination required om buildIntent=website/template |

**Två jobb (din intuition):**
1. **Expansion**: ta vag/fåordig prompt och utveckla den till en rik beskrivning. Inte hallucination — bara strukturering av implicita signaler.
2. **Nominering**: gissa scaffold + variant + 1-3 dossiers + skäl. Hjälper både drift-loggning och senare embedding-pick.

### 2. Scaffold-pick

| Steg | Vad | Var det sker |
|---|---|---|
| Pre-match (snabb keyword) | För Brief-hint, <1ms | `create-chat-stream-post.ts` |
| Final pick (embedding-driven) | För codegen | `orchestrate.ts` (`pickScaffoldVariantAsync`) |
| **Drift-detection** *(nytt)* | Om brief.scaffoldNomination ≠ embedding-pick → logga + bias mot brief om confidence låg | `orchestrate.ts` (att lägga till) |

### 3. Variant-pick

Sker **efter** scaffold-pick (variants är 1:N under scaffold).

**Sedan 2026-04-18:** create-chat-flödet låser den keyword-baserade
pre-match-varianten via `OrchestrationInput.persistedVariantId`. Brief-LLM
får hint från samma variant som codegen senare använder — ingen drift
mellan brief och kod. Embedding-pickaren (`pickScaffoldVariantAsync`)
används som fallback (ej i normalflödet) och i plan-mode/eval.

### 4. Dossier-pick

| Steg | Idag | Mål |
|---|---|---|
| Query-byggning | `prompt + oneSentencePitch + targetAudience + primaryCallToAction + toneAndVoice + scaffoldContext` | + `pages`, `mustHave`, `routePlan`, `capabilities`, `uiNotes` (fix A) |
| Källa | `data/dossiers/_index/master.json` | Samma |
| Filter | active-status + cap per kategori + max total | + **GitHub-health** (`source-archived` skip) |
| Ranking | Embedding cosine + alwaysInclude + boost från recommendations | + bias mot dossiers vars `frameworkVersion` matchar Next 16 |
| Output | DossierSelectionResult | + `injectionPlan` (vilka filer ska kopieras direkt vs bara nämnas i prompt) |

### 5. Dynamic prompt-komposition

Idag finns redan `composeEngineSystemPrompt()` som limmar `prompt-core/` + dynamic context. Tillägg:

| Block | Status | Förändring |
|---|---|---|
| `## Available Dossiers` | Finns | Behåll |
| `## Selected Dossier Instructions` | Finns | Behåll |
| `## Dossier Files To Copy` *(nytt)* | Saknas | Lägg till — listar filer LLM:n ska behålla från dossier |
| ~~Substitutionsmotor för directive-placeholders~~ | **Borttagen 2026-04-18** — directive cascade raderad, signal-cascaden lever via brief + guidance-resolvers + statiska defaults i `prompt-core/`. |

---

## Vad som behöver byggas (i prioritetsordning)

| # | Komponent | Storlek | Beroende |
|---|---|---|---|
| 1 | Brief-LLM Zod-schema utökat med scaffold/variant/dossier-nominering | Liten (1h) | — |
| 2 | Drift-detection mellan brief-nominering och embedding-pick (loggning) | Liten (1h) | #1 |
| 3 | `buildQueryText` i `dossiers/select.ts` utvidgad med `pages`/`mustHave`/`routePlan`/`capabilities` | Liten (30min) | — |
| 4 | GitHub-health filter i dossier-selection (skip `_status: source-archived`) | Liten (1h) | Beror på ingestion-pipeline (compat-test + github-enrich) |
| 5 | `injectionPlan` i DossierSelectionResult + `## Dossier Files To Copy`-block | Medel (2-3h) | — |
| 6 | LLM-instruktion: "behåll dossier-filer enligt injection-plan" i prompt-core | Liten (30min) | #5 |
| 7 | Dossier-filer faktiskt skickas till codegen som file-context, inte bara prompt-text | Stor (4-6h) | #5, #6 |

---

## Vad som behöver tas bort

| Sak | Status |
|---|---|
| `config/prompt-static/` (16 filer) | ✅ Raderat 2026-04-18 |
| `backoffice/pages/prompt_static.py` | ✅ Raderat 2026-04-18 |
| Dead loader-fallback i `static-core-loader.ts` | ✅ Raderat 2026-04-18 |
| Backoffice `template_lib_json` + `scaffold_lifecycle.py` template-library-refs | ⏳ Delvis (rensning av `_ops_impl.py` Catalog-block + `app_main.py`-caption + DEPRECATED-kommentar i `shared.py` klart 2026-04-18; `scaffold_lifecycle.py` lämnad pga storlek — defensivt skrivet, kraschar inte) |
| Dossier-pipelinens nuvarande `clone-draft-repos.ts` (utan subpath-stöd) | ⏳ Utvidgas, ej raderas |

---

## Risker + mitigations

| Risk | Mitigation |
|---|---|
| Brief-LLM hallucinerar dossier-id som inte finns | Validera mot master.json + skip ogiltiga med varning |
| Embedding-pick överröstar brief utan motiv | Drift-logg med both pickar + reason → debugbar |
| Dossier-filer krockar med scaffold-filer (samma path) | Konflikt-detection före leverans → varna LLM eller ta scaffold-filen |
| Stale dossier-källa ger Next 14-mönster i Next 16-projekt | GitHub-health filter (kräver compat-test + github-enrich) |
| ~~Substitutionsmotor saknas → directives hänger löst~~ | **Borttaget 2026-04-18** — directive-katalogen är raderad; visual-design + coding-direction lever som plain core fragments. |

---

## "Done"-kriterier för fas 1

| Kriterium | Mätning |
|---|---|
| Brief-LLM returnerar nominering i 100% av init-prompts | Eval-suite check |
| Drift mellan brief-nominering och embedding-pick loggas | Telemetry-event finns |
| Dossier-query använder ≥7 brief-fält | Code review |
| 0 dossiers i selection pekar på arkiverat repo | compat-test grön |
| Dossier-filer faktiskt levereras till output-projektet | E2E-test där Stripe-dossier väljs och `components/checkout-button.tsx` finns i output |
| `prompt-static/` borta + dead loader-fallback borta | ✅ Klart |

---

## Nästa milstolpe

**Ingestion-pipen klar** (compat-test + github-enrich + scrape-vercel-catalog + utvidgningar) →
sedan **Fas 1.0**-implementation enligt prioritetstabellen ovan →
sedan **Fas 1.5** (substitutionsmotor) om vi tycker det är värt det.

---

## Aktuell health-status (2026-04-18 efter katalog-utbyggnad)

| Mätning | Värde |
|---|---|
| Totalt antal dossiers (curated) | 30 |
| Aktiva (runtime-injicerade) | 20 |
| Drafts/broken (curated, ej runtime) | 10 (1 archived, 4 stale, 2 unreachable, 3 draft) |
| **Skiss-filer (kandidater för promotion)** | **139 nya** |
| Curation-queue | 149 kandidater across 8 kategorier |
| Vercel-katalog skrapad | ✓ 419 templates |
| GitHub-health för hela katalogen | ✓ 205 ok / 8 archived / 39 stale / 13 unreachable / 154 no-source |
| Compat-test atomic write + recovery | ✓ |

**Pool-tillväxt om ALLA 139 skiss promotas till drafts:** 30 → 169 dossiers (5.6× större katalog). Behöver curation-pass per draft (auto-curate.ts hjälper).

## Ändringslogg

| Datum | Ändring |
|---|---|
| 2026-04-18 | Skapad. Cleanup av `prompt-static/` klart. Ingestion-pipen-arbete pågår. |
| 2026-04-18 | Fas 1.0 klart: Brief-LLM nominering + drift-detection + buildQueryText broadening + init/followUp-mode-tagging. |
| 2026-04-18 | Källhälsa-pass: 7 dossiers annoterade med `_deprecationReason` + `_replacementUrl`. compat-test recovery-logic + atomic write. |
| 2026-04-18 | Fas 1.5 dossier-som-kod: `DossierFile.injectionMode` + `getDossierFileContent` + `## Dossier Files To Emit Verbatim`-block + 4 nya tester. Integration-glue (api-routes/middleware/config/util) defaultas till verbatim. |
| 2026-04-18 | Vercel-katalog-utbyggnad: scrape (419 templates) + enrich (419 detail-pages) + github-enrich (205 ok / 8 archived / 39 stale / 13 unreachable / 154 no-source) + import (139 nya skiss-filer, 10 trasiga källor auto-skippade). 149 kandidater i curation-queue. |
| 2026-04-18 | Final pass: `npm run dossiers:full-pipeline` (cross-platform), `--all`-flagga på promote-skript, ny "Promotion"-flik i backoffice (granulär + bulk + storage-prognos), `dossier-promotion-flow.md` dokument, `smoke-prompt.ts` end-to-end-verifiering (12 verbatim-filer för synthetic SaaS-prompt). |
