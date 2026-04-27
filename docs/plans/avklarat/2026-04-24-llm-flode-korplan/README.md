---
status: active
created: 2026-04-24
revised: 2026-04-24 (efter deep-prefab feedback + 4-agents verifieringspass)
revised2: 2026-04-24 (status-uppdatering efter 7 waves levererade; backoffice + strict schemas tillagda)
revised3: 2026-04-24 (final review-fixes: selectedDossiers trådning + schema-enum + glossary-precision)
revised4: 2026-04-26 (repo-hygien efter mergade PR #101 och #103; framtida spår kvar aktiva)
finalCommit: c538d89a0
totalCommits: 11 (på llm-flode över master)
verification: npx tsc --noEmit src/ + backoffice/ = 0 fel; 98+ vitest tester pass
branch: llm-flode
trigger: långbänk efter user-rapport om körning eb152443-2660-4042-a2a0-e5c156b928ed + deep-prefab review (sparat i `svar_gpt`)
---

# Körplan — LLM-flöde 2026-04-24 (REVIDERAD)

## Status efter exekvering (2026-04-24)

**7 waves levererade och mergade via PR #101. F2 Product Postcheck MVP är
levererad via PR #103, med feature flag default OFF.**

### Waves och täckning

| Wave | Innehåll | Spår | Test-coverage |
|------|----------|------|---------------|
| Wave 1 | `llm_fixer_aborted`-event + AbortError-separation | Spår 0 + 5 | llm-fixer.test.ts |
| Wave 2 | Variant-snapshot sanitize-allowlist MAX_KEYS=80 + merge-skydd | Spår 1 | orchestration-snapshot.test.ts |
| Wave 3 | HEAD GET-fallback + `imageMaterializationMs`-rename + dup-alt-warning | Spår 3 | image-validator.test.ts |
| Wave 3b | F2/F3-kontrakt doc-fix + UI-badges + previewBlocked-rensning + soft-assert | Spår 0 | — |
| Wave 5 | Lucide-checklist + recurring-patterns-flag + shrink-telemetri | Spår 5 | llm-fixer.test.ts |
| Wave 6 | Verbatim-restore i merge + cross-file-stub-telemetri + förstärkt prompt | Spår 4 | verbatim-policy.test.ts |
| Wave 7 | Skip dubbel tsc (`warmTscSkipped`) + Fly pre-warm bakom flagga | Spår 6 (säkra vinster) | finalize-version.test.ts, validate-and-fix.test.ts, preview-prewarm.test.ts |
| Wave 8 | Backoffice telemetri-sida + 5 strikta event-schemas + glossary | Cross-cutting | python -m ast OK |
| Review-fix | `selectedDossiers` trådning från orchestration → merge + schema-enum + glossary-precision | Spår 4 + 6 | full vitest passar |

### Vad som INTE levererades (framtida)

- **Spår 2 — F2 Product Postcheck:** MVP levererad via PR #103
  (`f2-product-postcheck`), feature flag default OFF.
  Kvar utanför MVP: eventuellt worker-extraktion, SLO-aggregator (spår 7) och hårdare
  policy efter observationstid.
- **Spår 6 D–F (riskabla latens):** Reasoning-budget-byte, scaffold-delta, prompt-cache — bakom eval-gate.
- **Spår 7 — F2 UX SLO:** Framtida. Kräver observation/aggregator ovanpå
  Product Postcheck-primitiverna; inte levererad av PR #103.
- **Spår 8 — Recovery-lane collapse:** Framtida. Kräver minst 30 dagars
  SLO-data och separat design; inte del av PR #101/#103.
- **`f2TimeMs` / `f3TimeMs`:** Markerade TODO i `generation-stream-post-finalize.ts`. Emitteras som null idag.
- **`image_replaced_with_placeholder` → devLog:** Fortfarande via `debugLog` (console). Kräver portering.
- **`dossier_stub_created` som standalone devLog-event:** Emitteras via DB-warnings idag.

### Backoffice + schemas (denna leverans)

- `backoffice/pages/llm_flode_telemetry.py` — ny observability-sida för wave-telemetri
- `docs/schemas/strict/llm-fixer-aborted.schema.json`
- `docs/schemas/strict/dossier-verbatim-restored.schema.json`
- `docs/schemas/strict/image-replaced-with-placeholder.schema.json` (forward-deklaration)
- `docs/schemas/strict/llm-fixer-partial-response.schema.json`
- `docs/schemas/strict/dossier-stub-created.schema.json` (forward-deklaration)
- `docs/schemas/strict/README.md` — uppdaterad med tabell för nya schemas
- `docs/architecture/glossary.md` — nya termer: `verbatim_content_drift`, `warmTscSkipped`, `f2TimeMs`, `f3TimeMs`, `previewPreWarm`, `recurringPatternsInCreatePrompt`

Konsoliderad körplan från **9 audit-pass totalt** (5 första + 4 verifierings-passes efter deep-prefab feedback) över en single-shot create-körning som tog **7 min 7 sek** wall-clock + auto-repair-loop. Original-planen 5 spår omprioriterades till **7 spår** efter att deep-prefab-agenten påpekade att P0 (F2/F3-kontrakt) saknades och att tidigare spår hade fel filsökväg/MAX_KEYS-värde.

## Vad ändrades sedan v1?

| v1-namn | v2-namn | Ändring |
|---|---|---|
| (saknas) | **`00-f2-f3-kontrakt.md`** | **NYTT P0** — lås om målbilden innan resten löses |
| `01-variant-snapshot-persistens.md` | `01-variant-snapshot-persistens.md` | **KORRIGERAT** — fel filsökväg + MAX_KEYS=10-11 var fel; faktisk är `src/lib/gen/orchestration-snapshot.ts` med MAX_KEYS=80. Dessutom test-driven verifiering FÖRST. |
| `02-llm-tid-scaffold-delta.md` | `06-latens-och-scaffold-delta.md` | **DEPRIORITERAT** till P6, uppdelad i säkra vinster (gör direkt) vs riskabla (bakom eval) |
| (saknas) | **`02-product-postcheck.md`** | **NYTT P2** — F2 Product Postcheck (bilder, anchors, mobil, CTA) — saknas helt idag |
| `03-dossier-kompatibilitet.md` | `04-dossier-hard-soft-enforcement.md` | **REFOKUSERAD** — verifiering visade att merge inte enforcer verbatim, LLM vinner alltid. Större risk än bara manifest-validering. |
| `04-bildflode.md` | `03-bildminimum.md` | **DELAD** — minimum (HEAD-fix, placeholder, telemetri-rename) i denna runda. AI-bildgen/`[image_prompt:]` flyttas till framtida spår. |
| `05-autofix-gating.md` | `05-autofix-gating.md` | **OFÖRÄNDRAD** — fortfarande P5, mestadels rätt i v1 |

## Vad raderades

- **Zip i `~/Downloads/llm-flode-nasta-omgang-2026-04-24.zip`** — raderad (innehöll v1-planer som var felaktiga)
- **Gamla `02-llm-tid-scaffold-delta.md`** — ersatt av nya `06-latens-och-scaffold-delta.md`
- **Gamla `03-dossier-kompatibilitet.md`** — ersatt av nya `04-dossier-hard-soft-enforcement.md`
- **Gamla `04-bildflode.md`** — ersatt av nya `03-bildminimum.md`

## Spår (router, ny ordning)

| # | Fil | Spår | Status | Levererat |
|---|-----|------|--------|-----------|
| **0** | [`00-f2-f3-kontrakt.md`](./00-f2-f3-kontrakt.md) | **F2/F3-kontrakt** | ✅ KLART (waves 1+3b) | doc-fix + UI-badges + previewBlocked-rensning + soft-assert |
| **1** | [`01-variant-snapshot-persistens.md`](./01-variant-snapshot-persistens.md) | **Variant-snapshot** | ✅ KLART (wave 2) | testdriven; MAX_KEYS=80 sanitize-allowlist + merge-protection |
| **2** | [`02-product-postcheck.md`](./02-product-postcheck.md) | **F2 Product Postcheck** | ✅ MVP levererad (PR #103, flag default OFF) | server-only runner + API route + feature flag + warnings i befintlig Versionsdiagnostik |
| **3** | [`03-bildminimum.md`](./03-bildminimum.md) | **Bildminimum** | ✅ KLART (wave 3) | HEAD GET-fallback + placeholder + dup-alt + prompt-regel |
| **4** | [`04-dossier-hard-soft-enforcement.md`](./04-dossier-hard-soft-enforcement.md) | **Dossier hard/soft** | ✅ KLART (wave 6) | verbatim-restore + cross-file-stub-telemetri + förstärkt prompt |
| **5** | [`05-autofix-gating.md`](./05-autofix-gating.md) | **Autofix-gating** | ✅ KLART (waves 1+5) | abort-event + retry + Lucide-checklist + recurring-flag + shrink-telemetri |
| **6** | [`06-latens-och-scaffold-delta.md`](./06-latens-och-scaffold-delta.md) | **Latens** | ✅ SÄKRA KLART (wave 7) / ⏸ RISKABLA DELAR FRAMTIDA | skip dubbel tsc + Fly pre-warm bakom flagga; D-F kräver eval-gate |
| **7** | [`07-f2-ux-slo-matbarhet.md`](./07-f2-ux-slo-matbarhet.md) | **F2 UX SLO + dashboard** *(GPT-5-rapport komplement)* | ⏸ FRAMTIDA — efter spår 02 MVP/observation | aggregator + dashboard + veckovis CI ovanpå spår 02s primitiver |
| **8** | [`08-future-recovery-lane-collapse.md`](./08-future-recovery-lane-collapse.md) | **Recovery-lane collapse** *(GPT-5-rapport komplement)* | ⏸ FRAMTIDA — efter 30 dagars wave 1-8 SLO-data | konsolidera 3 repair-paths till EN; trigger-villkor dokumenterat |

## Prioritetsordning (deep-prefab-agentens förslag, validerad + GPT-5-komplement)

1. **P0 spår 0** — Kontraktet. Gör resten begripligt. ✅
2. **P1 spår 1** — Variant-bug. Glasklar kvalitetsfix. ✅
3. **P2 spår 2** — Product Postcheck. Största user-impact-vinst. ✅ MVP via PR #103
4. **P2.5 spår 7** — F2-UX SLO. Aggregator ovanpå P2 (GPT-5-komplement). ⏸ framtida
5. **P3 spår 3** — Bildminimum. Synligt för user direkt. ✅
6. **P4 spår 4** — Dossier hard/soft. Preventiv kvalitet. ✅
7. **P5 spår 5** — Autofix-gating. Sparar auto-repair-tid. ✅
8. **P6 spår 6** — Latens. Säkra vinster nu, riskabla bakom eval. ✅/⏸ framtida riskdelar
9. **P7 spår 8** — Recovery-lane collapse. Framtida — efter ≥ 30 dagars SLO-data (GPT-5-komplement). ⏸

## Glasklara fynd som kan göras direkt (utan dialog)

Dessa kan plockas i en första PR utan att vänta på hela körplanen:

> **Status 2026-04-24:** Alla glasklara fynd från första passet är levererade.

- **Spår 3:** `imageMaterialization` → `imageMaterializationMs` (telemetri-rename)
- **Spår 5:** `AbortError`-skiljd från övriga fel + `llm_fixer_aborted`-event
- **Spår 4:** Manifest import-closure-validering
- **Spår 6:** Skip dubbel tsc när quality-gate kommer köra det ändå

## Större spår — kräver dialog/eval

- **Spår 0 D2:** assertion mot F2 + build-kombination (kan låsa befintliga callsites om någon)
- **Spår 1 A1:** PROTECTED-keys allowlist i sanitize (efter T1 bevisat hypotes A)
- **Spår 2 (post-MVP):** Worker-extraktion/hårdare policy efter observationstid om
  Playwright cold-start eller flake-rate kräver det.
- **Spår 4 A1:** Verbatim-restore i merge (kan stoppa berättigade LLM-anpassningar)
- **Spår 5 A2:** Heavy-load tröskel ≥20 → regen-loop (kan dubbla wall-clock)
- **Spår 6 D-F:** Reasoning-budget-byte, scaffold-delta, prompt-cache (kräver eval-pipeline)

## Vad denna körplan INTE täcker

- 3D-kvalitet (orb istället för stylized-personer) — dossier-design
- Quality-gate-tid på Fly-VM (66s) — infra-arbete
- Brief-tid (25s) — `gpt-5.4` med vision
- Sora/DALL-E faktisk integration — separat scope (kostnad, säkerhet, kvalitetsgate)
- PromptKit, unified repair mega-refactor — paus enligt deep-agent

## Källor (audit-output bevarad)

**Första pass (5 agenter):** alla `claude-4.6-sonnet-medium-thinking`, `readonly: true`. Råsvar bevarade i konversation:
1. Variant-rotorsak
2. LLM-tid + scaffold-delta
3. Dossier-kompatibilitet
4. Bildflöde
5. Autofix-gating

**Verifierings-pass (4 agenter):** alla `claude-4.6-sonnet-medium-thinking`, `readonly: true`. Råsvar bevarade i konversation:
- V1: F2/F3-kontrakt — bekräftade kommentar-drift, avfärdade nuvarande build-i-F2
- V2: Variant-rotorsak — upptäckte fel filsökväg + MAX_KEYS=80
- V3: F2 Product Postcheck — bekräftade saknad
- V4: Hard/soft dossier — bekräftade merge-enforcement-gap

**Deep-prefab-agentens feedback:** sparat lokalt i `svar_gpt` (root). Inspirerade hela P0-omprioritering + spår 02 + delningen av spår 03 + deprioriteringen av spår 06.

## Exekvering — föreslaget upplägg

Efter att den här revisionen är committad och pushad föreslår jag följande **execution model**:

**Sequential (en agent åt gången på `llm-flode`):**
- P0 (spår 0) FÖRST — alla andra spår berör Versionsdiagnostik UI eller telemetri-separation som P0 sätter

**Parallellt (best-of-n-runner med isolerade worktrees):**
Efter P0 landat, lansera 3-4 parallella worktree-agenter:
- Worktree 1: Spår 1 (variant) — gpt-5.3-codex-high-fast (kod + tester)
- Worktree 2: Spår 3 (bildminimum) — composer-2-fast (mestadels enkla edits)
- Worktree 3: Spår 5 (autofix-gating) — gpt-5.3-codex-high-fast
- Worktree 4: Spår 4 (dossier) — claude-4.6-sonnet (kräver kvalitativt resonemang)

**Sekventiellt efter dessa landat:**
- Spår 2 (Product Postcheck, 3-4 dagar) — egen runda
- Spår 6 (latens) — säkra vinster i en runda, riskabla bakom eval i framtida runda

Vänta dock på din input innan exekvering.
