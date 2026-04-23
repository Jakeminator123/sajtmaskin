# 05 — Körplan (rekommenderad exekveringsordning)

> Tre vågor + en strategisk satsning. Varje våg är **parallell-säker** internt och ger leverabel verifierbar nytta.
>
> Bygger på samma wave-modell som `docs/plans/active/parallel-execution-2026-04.md`.

---

## Faktisk progress sedan rapport-datum (2026-04-20)

**Tier S = 7/7 KLART, Tier A = 8/12 KLART** (4 deferrerade på telemetri-/A-B-infra). Sammanställning över 8 etapper levererade 2026-04-20:

| Etapp | Commit | Vad |
|---|---|---|
| W1-W4 (annan agent) | `13bf8a3b7`, `b639c33f5` | LLM-flöde Fas 2/3 (struct-drops SSE, verifier→fixer, validate-merge, auto-repair) |
| Hygien + bug-fix | `057b9bd0b`, `6c9b20b25`, `72837c500`, `ccb92a3e5`, `9ad682fab` | validate-loop fix, deterministic block-pick, P19 ingress 1, Tier S städning, docs |
| **A** | `b2d073cd0` | F2 quality-gate `build`-check |
| **B+C** | `560a788ef`, `594ad6c1c` | P29 Fas 1A (18 testlösa v0-routes) + docs |
| **D+E** | `8136324a0`, `44a9c9eeb` | P29 Fas 1B (10 routes med tester migrerade) + stale-ref cleanup |
| **F** | `14feacb50`, `3266ac4fe` | P29 Fas 2 + audit-städning (P29 helt stängd) |
| **G** | `425108b58` | Tier A #8 verifierat non-issue + 04-kostnadsmatris status-kolumn |

**Vågorna nedan är delvis obsoleta** efter denna leverans — Våg 1 i princip klar (master grön, hygien-paket levererat), Våg 2 sub-våg 2A (telemetri-grund) återstår och blockerar bl.a. Tier A #16. Strategisk satsning #38 (WebContainers) återstår som single-largest-ROI och är nästa stora arbetsspår.

---

## Total översikt

```
┌─────────────────────────────────────────────────────────────────┐
│  VÅG 1 (vecka 1) — Hygien + master grön                        │
│  Tier S + utvalda Tier A (Tid: ~1 vecka, parallell-säker)      │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  VÅG 2 (vecka 2-4) — Pipeline-konsolidering                    │
│  Tier A + utvalda Tier B (Tid: ~3 veckor)                      │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  VÅG 3 (vecka 5-6) — Kvalitetshöjningar                        │
│  Tier B + utvalda Tier C (Tid: ~2 veckor)                      │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  STRATEGISK SATSNING (mån 2-3) — WebContainers (Tier D #38)    │
│  Den enskilt största user-experience-förbättringen             │
└─────────────────────────────────────────────────────────────────┘
```

---

## VÅG 1 — Hygien + master grön (vecka 1)

**Mål:** Master grön. `git status` ren. Alla pre-existing failures borta.

**Parallellt körbart:** Ja, alla åtgärder rör olika filer.

### Plan-filer att skapa

Skapa följande i `docs/plans/active/`:

- **P29** — Hygien-städ (P28 + lint + .gitignore + filnamn-typo)
- **P30** — Manifest-schema sync + ÅÄÖ-pre-commit hook
- **P31** — Quality-gate `build` på F2 (kan göras separat eftersom det rör manifest)

### Innehåll och ordning

| Dag | Åtgärd | Plan | Källa | Verifier |
|-----|--------|------|-------|----------|
| 1.1 | `prefer-const` lint | P29 | `01-buggar.md` §1.1 | `npm run lint` exit 0 |
| 1.2 | `.gitignore` Turbopack | P29 | `01-buggar.md` §1.2 | `git status` <10 rader |
| 1.3 | Filnamn typo (`övergipande`) | P29 | `01-buggar.md` §1.4 | filen omdöpt |
| 1.4 | Manifest-schema sync | P30 | `01-buggar.md` §1.6 | `manifest-parity.test` grön |
| 1.5 | ÅÄÖ-pre-commit hook | P30 | `01-buggar.md` §1.3 | testa med dummy-strippad fil |
| 1.6 | ESLint `--cache` | P29 | `02-forbattringar.md` §1.2 | `npm run lint` 5–10× snabbare |
| 1.7 | `tsc --build` projektrefs | P29 | `02-forbattringar.md` §1.3 | `npm run typecheck` snabbare |
| 1.8 | `.editorconfig` | P29 | `02-forbattringar.md` §1.8 | filen finns |
| 2.1–2.4 | P28 — 7 pre-existing failures | P29 (eller P28 som redan finns) | `01-buggar.md` §2.1 | `npm run test:ci` exit 0 |
| 3.1 | Quality-gate `build` på F2 | P31 | `01-buggar.md` §1.5 / `02-forbattringar.md` §1.4 | tre testgenereringar med olika scaffold visar att Next-build-fel fångas |

**Slutkriterium VÅG 1:**
- `npm run typecheck` exit 0
- `npm run lint` exit 0 (0 errors, ≤5 warnings)
- `npm run test:ci` exit 0
- `git status` ren
- Schema parity-test grön

---

## VÅG 2 — Pipeline-konsolidering (vecka 2-4)

**Mål:** -1 pipeline-fas, -50 % API-yta, mätbart snabbare P50.

**Parallellt körbart:** Vissa, andra serial. Se sub-vågor nedan.

### Sub-våg 2A (vecka 2) — Setup för datadriven beslutsbas

| Dag | Åtgärd | Källa | Notera |
|-----|--------|-------|--------|
| V2.1 | Prometheus/OTel-export | `02-forbattringar.md` §1.1 | **Måste först** — många konsoliderings-beslut behöver telemetri |
| V2.2 | P50 prompt → preview metric | `02-forbattringar.md` §2.1 | **Måste först** — sätter top-line-OKR |
| V2.3 | Inventera early-stop-flaggor | `03-konsolidering-pipeline.md` §1.2 | Mät 1 vecka |
| V2.4 | Counter-telemetri på `FORCE_BLOCKING_IDS` (verifier) | `03-konsolidering-pipeline.md` §3.1 | Mät 1 vecka |
| V2.5 | Counter-telemetri på `partial-file-repair.outcome` | `03-konsolidering-pipeline.md` §3.3 | Mät 1 vecka |

> **Nyckelinsikt:** Konsolideringar i vecka 3-4 baseras på data från vecka 2. Hoppar du V2.1-V2.5 så famlar du blint i §3.1/§3.3.

### Sub-våg 2B (vecka 3) — Direkta konsolideringar

Ingen blockerande databehov, kör parallellt med insamlingen i 2A.

| Dag | Åtgärd | Källa | Berörda filer |
|-----|--------|-------|---------------|
| V3.1 | Slå ihop `predev`/`prebuild` | `02-forbattringar.md` §1.5 | `package.json` |
| V3.2 | FEATURES-flagga rensning | `03-konsolidering-pipeline.md` §3.7 | `src/lib/config.ts` |
| V3.3 | Konsolidera `promptAssist.allowed` | `02-forbattringar.md` §2.3 | `config/ai_models/manifest.json` |
| V3.4 | Slå ihop `pre_vm_typecheck` + `validate_syntax` | `03-konsolidering-pipeline.md` §2.1 | `src/lib/gen/preview/warm-typecheck.ts`, `src/lib/gen/autofix/validate-and-fix.ts` |
| V3.5 | Mekaniska autofixers → deklarativ tabell | `03-konsolidering-pipeline.md` §2.3 | `src/lib/gen/autofix/pipeline.ts` |
| V3.6 | P22b stream-route follow-up | `01-buggar.md` §2.2 | `src/lib/api/engine/chats/chat-message-stream-post.ts` |

### Sub-våg 2C (vecka 4) — `/api/v0/*` ↔ `/api/engine/*` konsolidering

| Dag | Åtgärd | Källa | Notera |
|-----|--------|-------|--------|
| V4.1 | Inventera + klassificera v0/engine-routes | `03-konsolidering-pipeline.md` §3.4 | **Stor PR** — gör i en plan |
| V4.2 | Migrera identiska routes | (samma) | |
| V4.3 | Flytta unika v0-routes till `/api/legacy/v0/*` | (samma) | |
| V4.4 | Uppdatera klient-callsites | (samma) | |
| V4.5 | Ta bort gamla routes + tester | (samma) | |

**Slutkriterium VÅG 2:**
- `validate_syntax`-fasen heter nu `validate` och kombinerar esbuild + tsc internt
- `/api/v0/*` består bara av legacy-skyddat (mall/registry/zip/deploy)
- 4 av 7 P28 preview-status-failures är borta
- Counter-telemetri kör i prod på alla early-stop-flaggor + verifier + partial-file-repair
- P50-metriken är synlig i backoffice
- 1 mätbar vecka data finns att basera vågens 3 beslut på

---

## VÅG 3 — Kvalitetshöjningar (vecka 5-6)

**Mål:** Färre LLM-anrop, snabbare per generering, mindre kontrakts-yta.

**Förkrav:** VÅG 2 klar, telemetri-data tillgänglig.

### Datadrivna beslut baserat på vecka 2-data

| Dag | Åtgärd | Källa | Beslut baserat på |
|-----|--------|-------|---------------------|
| V5.1 | Verifier — gör asynk eller ta bort | `03-konsolidering-pipeline.md` §3.1 | `FORCE_BLOCKING_IDS` rate (om <1 % → ta bort; annars asynk) |
| V5.2 | Partial-file-repair — ta bort eller trivialisera | `03-konsolidering-pipeline.md` §3.3 | Repair success rate (om <30 % → ta bort) |
| V5.3 | Brief som optional (A/B-test) | `03-konsolidering-pipeline.md` §3.5 | Quality-eval delta < threshold → default off |

### Övriga vecka 5-6-åtgärder

| Dag | Åtgärd | Källa |
|-----|--------|-------|
| V5.4 | Förenkla `BuildSpec` till presets | `03-konsolidering-pipeline.md` §3.6 |
| V5.5 | Konsolidera 5 cross-file-import-fixers | `03-konsolidering-pipeline.md` §2.2 |
| V6.1 | Slå ihop server-verify + quality-gate + accept-repair | `03-konsolidering-pipeline.md` §3.2 |
| V6.2 | Repair-loop hård gräns 90s | `01-buggar.md` §3.2 |
| V6.3 | Strukturerad logging (JSON) | `02-forbattringar.md` §2.5 |
| V6.4 | Brief-cache (Redis) | `02-forbattringar.md` §2.7 |
| V6.5 | Eval-suite som CI-gate | `02-forbattringar.md` §2.4 |

**Slutkriterium VÅG 3:**
- Pipeline har ≤10 steg från 14
- ≤4 LLM-anrop per generering från 6
- P50 prompt → done är 30–50 % snabbare än i vecka 1
- `repair_available` lifecycle-state är borta
- Eval-suite gates merge-PRs

---

## STRATEGISK SATSNING — WebContainers (mån 2-3)

**Mål:** Boot-tid 2–5 min → 5 sekunder. Detta är åtgärden som tar produkten från **6.5 → 8** i unbiased-betyg.

### Faser

| Fas | Tid | Innehåll |
|-----|-----|----------|
| **Fas 1: POC** | 1 vecka | Validera att `@webcontainer/api` kan boota Next.js 16 + en av era enklare scaffolds (`landing-page`) |
| **Fas 2: Identifiera blockers** | 1 vecka | Inventera vilka deps (`@react-three/rapier`, `pdf-parse`, `sharp`) som kräver native — märk scaffolds som "WC-compatible" eller "VM-only" |
| **Fas 3: Hybridkontrakt** | 1 vecka | Refaktorera `preview-session`-API:et så den abstraherar VM/WebContainer (samma kontrakt utåt) |
| **Fas 4: Migrera lätta scaffolds** | 1 vecka | `landing-page`, `saas-landing`, `blog` → WebContainers default |
| **Fas 5: Mätning + tuning** | 1 vecka | Mät P50, jämför mot baseline, justera fallback-policy |
| **Fas 6: Stäng Fly-VM (eller behåll bara för VM-only-scaffolds)** | (genomförs efter månadsdata) | Beroende på data |

### Plan-fil

Skapa `docs/plans/active/P50-webcontainers-migration.md` med:
- `wave: 4` (efter VÅG 3)
- `parallel_safe_with: []` (kör solo, det är en stor satsning)
- `owner_files: src/lib/preview-webcontainer/**`, `src/lib/gen/preview/preview-session.ts`, `preview-host/**` (för uthämtning)

### Slutkriterium

- 80 % av init-genereringar bootar live-preview på <10 sek
- Användare kan alltid uppgradera till VM-version om scaffold kräver native
- Fly-kostnad ≤ $20/mån (bara för VM-only-fallen)

---

## Vad du INTE ska göra

Listade åtgärder med ROI ≤4 kan **medvetet skippas** om scope-begränsning behövs:

- #36 Switch `pg` → Neon (skippa om ni inte är på Neon)
- #37 SSE → WebSocket (skippa, SSE räcker)
- #40 Egen modell-finetuning (skippa under låg volym)
- #41 Visual-QA (intressant men dyr)
- #42 Runtime-loadable scaffolds (kommer senare)
- #43 Multi-tenant (kommer senare)

Skippa dem **tills produktdata pekar att de behövs**, inte för att de "vore häftigt".

---

## Veckovis check-in-mall

För varje våg, kör efter avslutad vecka:

```
Vad blev klart?
  - [lista]

Vad blev inte klart?
  - [lista, inkl. orsak]

Telemetri / mätningar?
  - P50 prompt → done: [före → efter]
  - Antal LLM-anrop per gen: [före → efter]
  - Master-grön status: ✅/❌

Nästa vecka?
  - [topp-3 prioriteringar]

Avvikelser från planen?
  - [doc:s ändringar, scope-glidning]
```

Lägg som markdown-rapport i `docs/agent-reports/audit-vag-N.md` eller `docs/reports/audit-2026-04-20-komplexitet-vs-varde/avstamning-vag-N.md`.

---

## Sammanfattning

| Våg | Tid | Effekt | Risk |
|-----|-----|--------|------|
| 1 — Hygien | 1 vecka | Master grön, +5 USD/mån | Låg |
| 2 — Konsolidering | 3 veckor | -1 fas, -50 % API-yta, telemetri på plats | Medel |
| 3 — Kvalitetslyft | 2 veckor | -2 LLM-anrop/gen, -1 lifecycle-state | Medel |
| Strategisk — WebContainers | 6 veckor | Boot 2-5 min → 5 sek; **6.5 → 8 i betyg** | Hög (POC kan misslyckas) |
| **Totalt** | **~12 veckor** | World-class-relevant produkt | — |

---

## Referenser

- [`00-README.md`](./00-README.md) — orientering
- [`01-buggar.md`](./01-buggar.md) — buggar med beskrivning + manual
- [`02-forbattringar.md`](./02-forbattringar.md) — förbättringar
- [`03-konsolidering-pipeline.md`](./03-konsolidering-pipeline.md) — huvudfokus pipeline
- [`04-kostnadsmatris.md`](./04-kostnadsmatris.md) — ROI-tabell
- `docs/plans/active/parallel-execution-2026-04.md` — wave-modell-template
