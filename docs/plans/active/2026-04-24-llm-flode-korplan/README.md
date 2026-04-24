---
status: active
created: 2026-04-24
revised: 2026-04-24 (efter deep-prefab feedback + 4-agents verifieringspass)
branch: llm-flode
trigger: långbänk efter user-rapport om körning eb152443-2660-4042-a2a0-e5c156b928ed + deep-prefab review (sparat i `svar_gpt`)
---

# Körplan — LLM-flöde 2026-04-24 (REVIDERAD)

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

| # | Fil | Spår | Estimerad insats | Beroenden |
|---|-----|------|---|---|
| **0** | [`00-f2-f3-kontrakt.md`](./00-f2-f3-kontrakt.md) | **F2/F3-kontrakt** — kommentar-drift, separera Runtime/Product/Build, telemetri-uppdelning | 1–2 dagar | INGA — gör först |
| **1** | [`01-variant-snapshot-persistens.md`](./01-variant-snapshot-persistens.md) | **Variant-snapshot** — testdriven rotorsak + sanitize-allowlist + merge-skydd + failsafe i call-site | 1–2 dagar | INGA — kan parallellt med P0 |
| **2** | [`02-product-postcheck.md`](./02-product-postcheck.md) | **F2 Product Postcheck** — Playwright DOM-checks (anchors, naturalWidth, CTA, mobil, fake forms) | 3–4 dagar | P0 (för Versionsdiagnostik UI) |
| **3** | [`03-bildminimum.md`](./03-bildminimum.md) | **Bildminimum** — HEAD GET-fallback, placeholder, telemetri-rename, dup-alt-warning | 2 dagar | INGA — kan parallellt |
| **4** | [`04-dossier-hard-soft-enforcement.md`](./04-dossier-hard-soft-enforcement.md) | **Dossier hard/soft** — verbatim restore i merge + refuse-stub + manifest-closure + compat-matrix | 2–3 dagar | INGA — kan parallellt |
| **5** | [`05-autofix-gating.md`](./05-autofix-gating.md) | **Autofix-gating** — LLM-fixer abort-event, Lucide-checklist, recurring-patterns, repair-adaptive | 2 dagar | INGA — kan parallellt |
| **6** | [`06-latens-och-scaffold-delta.md`](./06-latens-och-scaffold-delta.md) | **Latens** — säkra vinster nu (skip dubbel tsc, pre-warm, streaming-validation) + riskabla bakom eval | Säkra: 1-2 dagar / Riskabla: 5-7 dagar | Ev. P0 (telemetri-separation) |

## Prioritetsordning (deep-prefab-agentens förslag, validerad)

1. **P0 spår 0** — Kontraktet. Gör resten begripligt.
2. **P1 spår 1** — Variant-bug. Glasklar kvalitetsfix.
3. **P2 spår 2** — Product Postcheck. Största user-impact-vinst.
4. **P3 spår 3** — Bildminimum. Synligt för user direkt (Unsplash-404).
5. **P4 spår 4** — Dossier hard/soft. Preventiv kvalitet, säkerhetsrisk för Stripe/Clerk.
6. **P5 spår 5** — Autofix-gating. Sparar 4 min auto-repair per problemfall.
7. **P6 spår 6** — Latens. Säkra vinster nu, riskabla bakom eval.

## Glasklara fynd som kan göras direkt (utan dialog)

Dessa kan plockas i en första PR utan att vänta på hela körplanen:

- **Spår 0:** doc-kommentar i `preview-quality-gate.ts` L3-6 säger fel om F2 default
- **Spår 3:** `imageMaterialization` → `imageMaterializationMs` (telemetri-rename)
- **Spår 5:** `AbortError`-skiljd från övriga fel + `llm_fixer_aborted`-event
- **Spår 4:** Manifest import-closure-validering
- **Spår 6:** Skip dubbel tsc när quality-gate kommer köra det ändå

## Större spår — kräver dialog/eval

- **Spår 0 D2:** assertion mot F2 + build-kombination (kan låsa befintliga callsites om någon)
- **Spår 1 A1:** PROTECTED-keys allowlist i sanitize (efter T1 bevisat hypotes A)
- **Spår 2:** Hela Playwright-postcheck (3-4 dagar, ny verifieringsnivå)
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
