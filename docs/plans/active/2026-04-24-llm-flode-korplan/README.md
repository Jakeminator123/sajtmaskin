---
status: active
created: 2026-04-24
branch: llm-flode
trigger: långbänk efter user-rapport om körning eb152443-2660-4042-a2a0-e5c156b928ed
---

# Körplan — LLM-flöde 2026-04-24

Konsoliderad körplan från 5 parallella audits + egen telemetri-analys av en single-shot create-körning som tog **7 min 7 sek** wall-clock (4 min reasoning + auto-repair-loop som triggades av en LLM-fixer-buggg). Dokumenterar 5 distinkta spår med konkreta fil-radnivå-fynd och **patch-riktningar** (inte färdig kod — den lämnas till nästa pass när vi vet vilka spår vi prioriterar).

## Bakgrund

User skapade en landing-page om "Emilia & Jakob" via builder. Resultat: bra estetik, men:

- **7:07 wall-clock** (4 min av det = `gpt-5.3-codex thinking=true reasoning`)
- **31 deterministiska autofixar** triggade `autofix.heavy_load` — som bara loggades, inte åtgärdades
- **`[llm-fixer] failed: This operation was aborted`** tystades — felet (`LucideIcon` TS2749) upptäcktes 5 min senare av server-verify och triggade auto-repair (~4 min extra)
- **Variant `editorial-lux`** valdes vid create men flippades till **`corporate-grid`** vid auto-repair pga `variant_lock_fallback: missing_prior_variant_id` — `orchestration.snapshot.persisted` skriver alltid `variantId: null`
- **`https://images.unsplash.com/photo-1541544181051-e46607d3d8a4`** blev röd 404 i nätverkspanelen — `validate-images` returnerade 200 utan att HEAD-pinga
- **`imageGenerations: true`** men 0 AI-bilder skapades — flaggan styr inget i prompten

Lineage-källa: `logs/generationslogg/{20260424-131916-website,20260424-133001-website}/` + `logs/site-observability/eb152443-.../`.

## Spår (router)

| # | Fil | Spår | Estimerad insats |
|---|-----|------|---|
| 1 | [`01-variant-snapshot-persistens.md`](./01-variant-snapshot-persistens.md) | **Variant-lock-bug** — `variantId: null` i snapshot leder till variant-flips mellan create och followup | 1–2 dagar |
| 2 | [`02-llm-tid-scaffold-delta.md`](./02-llm-tid-scaffold-delta.md) | **Reducera LLM-tid** — scaffold som "given context"-delta + reasoning-budget + dubbelkörd tsc | 3–5 dagar (mer arkitektur) |
| 3 | [`03-dossier-kompatibilitet.md`](./03-dossier-kompatibilitet.md) | **Dossier-kompat-test** — säkerställ att alla 17 dossiers fungerar med alla scaffolds | 2–3 dagar |
| 4 | [`04-bildflode.md`](./04-bildflode.md) | **Bilder** — HEAD-validering, `[image_prompt:]`-implementation, deduplicering, telemetri-rename | 2 dagar |
| 5 | [`05-autofix-gating.md`](./05-autofix-gating.md) | **Autofix-gating** — heavy_load triggar åtgärd; LLM-fixer abort eskalerar; Lucide i checklist | 2 dagar |

## Prioritetsordning (förslag)

1. **Spår 1 (variant-bug)** — glasklar bugg, liten yta, hög effekt på user-perception av "mitt design ändrades plötsligt".
2. **Spår 5 (autofix-gating)** — sparar 4 min auto-repair-tid per problemfall + ger telemetri vi sedan kan använda för spår 2-priorisering.
3. **Spår 4 (bilder)** — användaren såg redan röda 404:or; stock-foto-personer mot "Emilia & Jakob" är ett tydligt kvalitetsproblem.
4. **Spår 3 (dossiers)** — preventiv kvalitet; spelar mer roll när dossier-poolen växer.
5. **Spår 2 (LLM-tid)** — största potentiella vinst (3-4 min per körning) men störst designändring; gör efter att 1+5 stabiliserat telemetrin.

## Glasklara fynd som kan göras direkt (utan diskussion)

Dessa kan plockas i en första PR utan att vänta på hela körplanen:

- **Spår 4: rename `imageMaterialization` → `imageMaterializationMs`** i `src/lib/gen/stream/finalize-version/runner.ts` rad 486–496. Mätarvärdet är millisekunder, inte antal bilder. Förvirrar.
- **Spår 5: utöka `dossier_stub_created` telemetri** i `src/lib/providers/own-engine/generation-stream-post-finalize.ts` rad 235–240 med `dossierId` + `capability`. Nytt fält i existerande logg-rad.
- **Spår 5: skilj `AbortError` från övriga fel** i `src/lib/gen/autofix/llm-fixer.ts` rad 250–264 + lägg till `llm_fixer_aborted`-event med `durationMs` (redan i scope).

## Glasklara — kräver lite tankearbete men ej arkitekturdiskussion

- **Spår 3: utöka `validate-manifest.ts`** med import-closure-validering. Dossier-manifestet ska validera att alla `@/`-imports i `files[]`-koden antingen finns i samma `files[]` eller i scaffold-fröet eller är en runtime-provided import. Förslag: ny `validateDossierImportClosure(manifest, scaffoldFileSet)` i samma modul, anropad från `scripts/dossiers/validate-all.ts`.
- **Spår 5: lägg Lucide-checklist i prompten**. Ny sektion bredvid `renderRequiredImportsChecklistBlock` i `src/lib/gen/system-prompt/sections/`. Ca 50 vanligaste Lucide-ikoner grupperade per usecase (UI-controls, navigation, status, social, brands).

## Kräver dialog (innan PR)

- **Spår 2: ändra `pro.generator` reasoningEffort `high` → `medium`** i `config/ai_models/manifest.json` rad 189. Det här är *defaulten* för alla create-pro-körningar. Stor effekt på allt.
- **Spår 2: scaffold-as-delta** är en hel arkitekturändring av prompt-strategi. Behöver designdoc + opt-in-flagga + A/B-eval innan default-byte.

## Avgränsningar (vad denna körplan INTE täcker)

- 3D-kvalitet (orb istället för stylized-personer) — det är dossier-design, inte pipeline-bug. Kan tas i separat dossier-uplift.
- Quality-gate-tid (66 s) — det är mestadels Fly-VM cold start + `npm install`. Kräver infra-arbete (min-instances), inte kod.
- Brief-tid (25 s) — `gpt-5.4` med vision på en attached bild. Acceptabelt för det den gör (extraherar struktur från bild).
- Sora/DALL-E faktisk integration — kräver separat scope (kostnad, säkerhet, kvalitetsgate). Spår 4 stoppar bara vid att *trigga* mekanismen.

## Källor (audit-output bevarad)

5 audit-agenter kördes parallellt på `claude-4.6-sonnet-medium-thinking` 2026-04-24. Råsvar finns i samtals-historik (chat-uuid sparad i `.cursor/projects/`). Sammanfattningar inarbetade i respektive spår-fil.
