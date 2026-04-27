---
status: active
created: 2026-04-24
spår: 0 av 7 (LLM-flöde-körplan, P0 — INSPÄRRA FÖRST)
prio: P0 (gör resten begripligt)
estimat: 1–2 dagar
revision: 2026-04-24 (ersatte gamla 02-llm-tid; lyfter F2/F3-kontrakt till P0 efter deep-prefab feedback)
---

# Spår 0 — F2/F3-kontrakt (lås om målbilden innan resten löses)

## Bakgrund

En deep-prefab-agent läste loggarna + min tidigare körplan och påpekade:

> "Just nu verkar systemet ha byggt ett nät av kontroller där validate_syntax, warm tsc, server verify, quality gate, build, autofix, LLM-fix, auto-repair, postchecks, version diagnostics — alla delvis försöker svara på samma fråga: 'är sidan okej?'. Det är fel fråga. De ska svara på olika frågor."

Verifiering med 4 parallella audits **bekräftade delvis** men **avfärdade också delvis**:

| Påstående | Bevisat? | Bevis |
|---|---|---|
| F2 har `["typecheck", "build"]` i quality-gate | **AVFÄRDAT** för aktuell kod | `config/ai_models/manifest.json` L347-350: `qualityGateTiers.designPreview = ["typecheck"]` (build är i F3) |
| Föråldrade kommentarer säger F2 default = `build` | **BEKRÄFTAT** | `src/lib/gen/verify/preview-quality-gate.ts` L3-6 motsäger `quality-gate-checks.ts` L44-65 |
| F2/`design_preview_skip_verify` skips async server-verify | **BEKRÄFTAT** | `src/lib/gen/stream/post-finalize-policies.ts` L101-104 |
| Bredare påstående om "semantisk gate-blandning" | **DELVIS BEKRÄFTAT** | Flera lager (preflight, warm tsc, verify-lane typecheck, F3 build+lint, statisk visual QA, repair) bidrar till en sammanslagen kvalitetsbild |

**Konsekvens av nuläget:** En F2-version som "ser ut" att rendera kan ändå markeras röd i Versionsdiagnostik pga ett build-fel som F2 egentligen inte ska bry sig om, och tvärtom — en F2-version som verkligen är trasig (bilder 404, nav-anchors saknas, mobil-meny döljer länkar) kan bli grön bara för att tsc passerar.

## Föreslaget kontrakt (deep-agentens delning, validerad)

| Nivå | Fråga den svarar på | Får blocka F2? | Kör idag? |
|---|---|---|---|
| **Mechanical parse** | Filer parser, importer löses | Ja | Ja (`validate_syntax`, `cross-file-import-checker`) |
| **F2 Runtime** | Kommer sidan upp i iframe utan fatal runtime? | Ja | Ja (preview-host start + readiness probe) |
| **F2 Product Postcheck** | Synliga nav/CTA/mobil/anchor/bilder/form fungerar | Bör ge **warning** (ej hård block) | **NEJ — saknas** (se spår 02) |
| **F3 Type/Build** | tsc, build, lint, export/publish | NEJ för F2, JA för publish | Delvis (typecheck körs i F2, build körs i F3) |
| **Repair** | Kan vi automatiskt laga ett konkret fel? | Bara om felet hör till rätt nivå | Ja (`repair-loop`, `llm-fixer`) |
| **Quality Gate** | Samlat betyg/diagnostik | Ska inte vara diffus catch-all | Är det idag — blandar F2- och F3-frågor |

## Konkreta åtgärder (i ordning)

### A. Doc-drift — kommentarer säger fel saker

**A1.** `src/lib/gen/verify/preview-quality-gate.ts` rad 3-6: kommentaren säger att F2-default inkluderar `build`. Detta motsäger faktisk manifest-konfiguration. **Uppdatera kommentaren** till: "F2 (`designPreview`) körs typecheck-only; build är reserverat för F3 (`integrationsBuild`). Manifest L347-354 är källan."

**A2.** `docs/architecture/fas2-orchestration-and-build.md` L89 — verifiera att F2 = `fidelity2` definieras tydligt. Lägg till en sektion "**Vad F2 INTE är**: F2 är inte 'kod är produktionsklar'. F2 är 'sidan kommer upp i iframe utan fatal runtime'."

**A3.** `docs/architecture/fas3-preview-and-deploy.md` — säkerställ att build-gaten dokumenteras som F3-only.

### B. Versionsdiagnostik UI — visa nivåer separat

**B1.** `src/components/builder/VersionDiagnosticsDialog.tsx` rad 203-244:
Idag visas `Loggar: N | Fel: N | Varningar: N | Info: N` — en enda flat lista grupperad per `category`.

**Föreslagen ändring:** dela upp i tre badges:
- **Runtime:** OK / Failed (från preview-readiness)
- **Product:** OK / N warnings (från postcheck — när det finns, spår 02)
- **Build:** OK / Failed / Unchecked (från quality-gate F3)

**B2.** Färgkodning: en F2-version får inte vara **röd** bara för att Build är "Unchecked" eller "Failed". Den ska vara **gul** ("F2 OK, F3 osäker") tills publish.

### C. Flytta `previewBlocked` ut ur F3-frågor

**C1.** `src/lib/gen/stream/finalize-preflight.ts` rad 527-614 + `preflight-contract.ts` L105-122: säkerställ att `previewBlocked: true` **endast** sätts för:
- `code_structure_failure` (kan inte parsa)
- `dependency_install_failure` (npm install failar)
- `shim_preview_failure` (om shim används)
- `env_config_missing` (saknar env för dossier)

**C2.** Build/lint-fel ska aldrig sätta `previewBlocked: true`. De ska sätta separat `publishBlocked: true` (nytt fält) som signalerar "F2 OK, F3 inte än".

### D. Quality-gate cleanup

**D1.** `src/app/api/engine/chats/[chatId]/quality-gate/route.ts` rad 39-45: defaulten är redan `["typecheck"]`, men callsite från `runTier2VerifyLane` (`post-checks.ts` L340) skickar `DESIGN_PREVIEW_QUALITY_GATE_CHECKS`. **Verifiera att inget callsite skickar `["typecheck", "build"]` för F2** — det skulle vara kontraktsbrott.

**D2.** Lägg till **assertion** i `runTier2VerifyLane`: om `previewPolicy === "fidelity2"` och `checks.includes("build")`, kasta felmeddelande `"F2 contract violation: build belongs to F3"`. Mjuk landning första veckan (logga warning), hård efter telemetri visar inga flaggar.

### E. Telemetri — separera F2-time från F3-time

**E1.** Ny fält i `site.done`-event: `f2TimeMs` (från `site.start` till `preview_ready`) och `f3TimeMs` (från `preview_ready` till sista `quality-gate`-resultat). Idag är allt buntat i `durationMs`.

**E2.** Lägg till `gateOutcomes` array: `[{level: "runtime", status: "ok"}, {level: "product", status: "warning", warningCount: 2}, {level: "build", status: "failed", reason: "tsc"}]`.

## Acceptanskriterier

- [ ] Inga kod-kommentarer påstår att F2 default inkluderar `build`.
- [ ] `docs/architecture/fas2-orchestration-and-build.md` har explicit "Vad F2 INTE är"-sektion.
- [ ] `VersionDiagnosticsDialog` visar Runtime / Product / Build separat.
- [ ] `previewBlocked` sätts inte av build/lint-fel.
- [ ] `runTier2VerifyLane` har assertion mot F2 + build-kombination.
- [ ] `site.done`-event har `f2TimeMs` + `f3TimeMs` + `gateOutcomes`.
- [ ] Manuell verifiering: skapa en version som tsc-passar men build-failar — visas som **gul** (F2 OK, F3 unchecked), inte röd.

## Risker

- **B1 (UI-ändring) berör user-perception** av "min sida är klar?" — koordinera språk: "Klar att förhandsgranska" vs "Klar att publicera".
- **C2 (`publishBlocked`-fält) är ny DB-yta** — behöver migration-tolerans i läs-pathen.
- **A2/A3 (docs-uppdatering)** — riskerar konflikt med pågående arbeten i andra plan-spår (P32, OPEN-THREADS-SCAFFOLDS). Synka.

## Filer att läsa innan implementation

- `config/ai_models/manifest.json` (rad 339-360 — `qualityGateTiers`)
- `src/lib/gen/verify/quality-gate-checks.ts` (rad 40-80)
- `src/lib/gen/verify/preview-quality-gate.ts` (rad 1-180)
- `src/lib/gen/stream/post-finalize-policies.ts` (rad 64-130)
- `src/lib/gen/stream/finalize-preflight.ts` (rad 500-620)
- `src/lib/gen/stream/preflight-contract.ts` (rad 100-130)
- `src/lib/hooks/chat/post-checks.ts` (rad 246-350)
- `src/components/builder/VersionDiagnosticsDialog.tsx` (rad 60-250)
- `src/lib/gen/build-spec/types.ts` (rad 40-130 — `previewPolicy`, `verificationPolicy`)
- `docs/architecture/fas2-orchestration-and-build.md` (rad 80-100)
- `docs/architecture/fas3-preview-and-deploy.md`

## Källa

- Audit-agent V1 (claude-4.6-sonnet-medium-thinking) 2026-04-24, prompt fokus: F2/F3-kontrakt-verifiering
- Deep-prefab-agentens svar (sparat i `svar_gpt`) — inspirerade hela P0-omprioritering
