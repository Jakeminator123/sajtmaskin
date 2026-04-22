# 03 — Konsolidering av pipeline (HUVUDFOKUS)

> **Detta är rapportens viktigaste fil.** Den adresserar den 6/10-bedömningen om "Komplexitet ↔ värde-ratio" från `00-README.md`.

---

## Bakgrund — den nuvarande 14-stegspipelinen

Från `00-README.md`-bedömningen:

> "Pipelinen har MÅNGA lager: orchestrate → buildSpec → contracts → variant pre-match → brief → signal cascade → dynamic context → budget → autofix → validate-and-fix → image-materialize → verifier → preflight → merge → partial-file-repair → persist → server-verify → repair-loop → accept-repair → quality-gate → preview-session → …"

Här är den faktiska kedjan, kategoriserad:

### Fas 2 (orchestrate → finalize) — kanonisk källa: `src/lib/gen/stream/finalize-pipeline-contract.ts`

| # | Steg | Fil | Typ | Tid (P50) |
|---|------|-----|-----|-----------|
| 0 | Variant pre-match | `src/lib/gen/scaffold-variants/matcher.ts` | Deterministisk | ~1 ms |
| 1 | Brief generation | `src/app/api/ai/brief/route.ts` (LLM) | LLM | 2–5 sek |
| 2 | `resolveOrchestrationBase` (scaffold + route plan + contracts + buildSpec + variant) | `src/lib/gen/orchestrate.ts` | Deterministisk | ~50 ms |
| 3 | `buildDynamicContext` + budgetering | `src/lib/gen/system-prompt.ts` | Deterministisk | ~10 ms |
| 4 | Codegen-stream (huvud-LLM) | `src/lib/providers/own-engine/generation-stream.ts` | LLM | 30–120 sek |
| 5 | `url_expand` | `src/lib/gen/url-compress.ts` | Deterministisk | ~10 ms |
| 6 | `autofix` (mekanisk pipeline, ~20 fixers) | `src/lib/gen/autofix/pipeline.ts` | Deterministisk | 100–500 ms |
| 7 | `validate_syntax` (esbuild + LLM-fixer-loop) | `src/lib/gen/autofix/validate-and-fix.ts` | Deterministisk + LLM | 200 ms – 30 sek |
| 8 | `pre_vm_typecheck` (warm scaffold cache + LLM-fix om fel) | `src/lib/gen/preview/warm-typecheck.ts` | Deterministisk + LLM | 2–8 sek |
| 9 | `materialize_images` | `src/lib/gen/post-process/image-materializer.ts` | Deterministisk | 1–5 sek |
| 10 | `verifier` (read-only LLM) | `src/lib/gen/verify/verifier-pass.ts` | LLM | 5–15 sek |
| 11 | `parse_merge_preflight` | `src/lib/gen/stream/finalize-merge.ts` + `finalize-preflight.ts` | Deterministisk | 50–200 ms |
| 12 | Partial-file-repair (om preflight failar) | `src/lib/gen/stream/finalize-version.ts` | LLM | 0–60 sek |
| 13 | Persist (DB) | `src/lib/db/chat-repository-pg.ts` | DB | ~20 ms |

### Fas 3 (efter `done`)

| # | Steg | Fil | Typ |
|---|------|-----|-----|
| 14 | `preview-session` start | `src/lib/gen/preview/preview-session.ts` | HTTP |
| 15 | `server-verify` (async) | `src/lib/gen/verify/server-verify.ts` | Deterministisk + LLM |
| 16 | `repair-loop` (om verify fail) | `src/lib/gen/verify/repair-loop.ts` | Deterministisk + LLM |
| 17 | `quality-gate` (preview-host) | `src/lib/gen/verify/preview-quality-gate.ts` | Network |
| 18 | `accept-repair` (om repair pass) | `src/app/api/engine/chats/[chatId]/accept-repair/route.ts` | DB |

**Total LLM-anrop per generering (init):** 1 brief + 1 codegen + 0–1 syntax-fixer + 0–1 pre-vm-typecheck-fixer + 0–1 verifier + 0–1 partial-file-repair = **2–6 LLM-anrop**.

**Total tid (P50):** ~60 sek codegen + ~10 sek post + ~5 sek preview-bootstrap = **~75 sek till "done"** + 2-5 min till live preview.

---

## Filosofi: vad är "för mycket" pipeline?

Världsklass-konkurrenter (Lovable, Bolt) har **mycket grundare** pipelines:

```
Prompt → Codegen-LLM → WebContainer-preview
```

De litar på att modellen är så bra att de inte behöver:
- separat verifier-LLM
- separat pre-vm-typecheck-LLM-fixer
- separat partial-file-repair
- 20 mekaniska autofixers

**Deras antagande:** GPT-5.4 / Claude Sonnet 4.6 producerar 95+ % korrekt kod direkt. Varje ytterligare lager kostar mer tid än det räddar fel.

**Sajtmaskins antagande (idag):** Bättre att ha 5 säkerhetsnät — varje lager fångar 1–5 % fel som tidigare lager missade.

**Sanningen:** Båda är rätt — men **Sajtmaskins säkerhetsnät kostar 30–60 sekunder extra per generering**, vilket är just det som gör att P50-latency-mätningen aldrig kommer i närheten av Lovable.

> **Princip för konsolidering:** Behåll bara säkerhetsnät där dokumenterad fångst-rate > 5 % och alternativkostnaden är försumbar. Ta bort allt annat.

---

## §1 ENKLA konsolideringar (totalt ~1 dag)

### §1.1 Slå ihop `predev` och `prebuild`

Se [`02-forbattringar.md`](./02-forbattringar.md) §1.5.

---

### §1.2 Inventera early-stop-flaggor i `validateAndFix` + `runRepairLoop`

| Fält | Värde |
|------|-------|
| **Filer** | `src/lib/gen/autofix/validate-and-fix.ts`, `src/lib/gen/verify/repair-loop.ts` |
| **Tidsåtgång** | 2 timmar |
| **Värde** | Ser om alla 4–5 early-stop-paths faktiskt utlöses i praktiken |

**Manual:**

1. Lägg counter-telemetri (i `prom-client` om §1.1 i förbättringar är gjort) för varje `earlyStopReason`.
2. Kör i 1 vecka.
3. Dem som har <1 % rate kan tas bort utan ROI-förlust.

---

## §2 MEDEL konsolideringar (totalt ~1 vecka)

### §2.1 Slå ihop `pre_vm_typecheck` och `validate_syntax` till ett steg — ✅ LEVERERAD 2026-04-20

> **Status:** Implementerad. `runWarmTscPass` i [`src/lib/gen/autofix/validate-and-fix.ts`](../../../src/lib/gen/autofix/validate-and-fix.ts) körs efter esbuild når `passed`. `pre_vm_typecheck` borttaget från `OWN_ENGINE_POST_STREAM_PIPELINE`. F3 kvar på `forceTsc: true`. SSE-progress sammansläppt under `validate_syntax` med nya phases `tsc-validating`/`tsc-fixing`/`tsc-passed`/`tsc-skipped`. Glossary-rad "Validate-step (esbuild + warm tsc)" registrerad. Backoffice `pages/preview.py` synkad.

| Fält | Värde |
|------|-------|
| **Filer** | `src/lib/gen/preview/warm-typecheck.ts` (uppgår i) `src/lib/gen/autofix/validate-and-fix.ts` |
| **Svårighet** | Medel |
| **Tidsåtgång** | 2 dagar |
| **Värde** | Ett pipeline-steg mindre, en LLM-fixer-loop istället för två |

**Bakgrund:**

Idag har vi:
- Steg 7: `validate_syntax` = esbuild → om fel: mekanisk + LLM-fix-loop
- Steg 8: `pre_vm_typecheck` = `tsc --noEmit` → om fel: mekanisk + LLM-fix-loop

Båda kör samma `runLlmFixer` om de hittar fel. Skillnaden är bara *vilken* validator som kör (esbuild vs tsc). esbuild fångar syntax + typer för det mesta; tsc fångar mer typer + "module not found"-fel.

**Lösning:**

1. Behåll esbuild som första snabb-pass (millisekund).
2. Bara om esbuild passar: kör `tsc --noEmit` mot warm cache.
3. Båda failures → samma fix-loop, samma LLM-anrop, samma early-stop-policy.
4. SSE-progress: skicka `validate_syntax` med `phase: "esbuild"` resp. `phase: "tsc"` istället för två separata steg.

**Riskbedömning:** Låg. Det är en intern omorganisering — output är identisk.

---

### §2.2 Konsolidera 5 cross-file-import-fixers till 1 (med telemetri)

| Fält | Värde |
|------|-------|
| **Filer** | `src/lib/gen/autofix/common-import-fixer.ts` (mål för konsolidering) |
| **Svårighet** | Medel |
| **Tidsåtgång** | 1 dag |
| **Värde** | -4 fixers att underhålla; lättare att läsa |

**Bakgrund:**

`src/lib/gen/autofix/pipeline.ts` rad 252-269 dokumenterar:

> "These five 'cross-file' fixers look redundant but they're not — each encodes a different decision predicate and they're cheap to run. Consolidating them into one pass would force a more complex shared state machine without measurable savings; the current split makes each rule trivially auditable. **If you ARE going to consolidate them later, do it AFTER you have telemetry showing redundant work** (counters in `countByFixer(...)`), not before."

Detta är **god rådgivning** men också ett tecken på att utvecklaren vet att konsolidering är önskvärd "någon gång".

**Lösning:**

1. Lägg `countByFixer`-telemetri (idag finns det redan men logga aktivt i 1 vecka).
2. Mät: hur ofta körs varje fixer? Hur ofta gör de en ändring? Hur ofta finns det överlapp?
3. Slå ihop när data finns.

**Risken** är inte komplexitet — det är att skapa *mer* komplexitet om state machine blir fel. Var bara säker innan ni hoppar.

---

### §2.3 Mekaniska autofix-fixers → körda från en deklarativ tabell

| Fält | Värde |
|------|-------|
| **Filer** | `src/lib/gen/autofix/pipeline.ts` |
| **Svårighet** | Medel |
| **Tidsåtgång** | 1 dag |
| **Värde** | Lättare att se hela listan, lägga till nya, disable enskilda via config |

**Manual:**

1. Definiera `FixerSpec`-typ:
   ```ts
   interface FixerSpec {
     id: string;
     fn: (code: string, filePath: string) => FixResult;
     enabled: () => boolean; // läser FEATURE-flagga / manifest
     scope: "per-file" | "cross-file";
   }
   ```
2. Lista alla 20 fixers som `FixerSpec[]`.
3. Loop över listan istället för att hårdkoda calls i pipeline-funktionen.

---

## §3 STORA konsolideringar (totalt ~3 veckor)

### §3.1 Verifier-passet — ✅ DELVIS LEVERERAD 2026-04-20 (alt 4: feedback-loop)

> **Status:** Verifier-passet behållet, men feedback-loopen stängd. Blocking-fynd matas in i `runLlmFixer` direkt efter passet via `formatVerifierFindingsAsFixerErrors()` i [`verifier-pass.ts`](../../../src/lib/gen/verify/verifier-pass.ts) + 60 s timeout med scoped `phaseRouting.fixer`-modell i [`finalize-version.ts`](../../../src/lib/gen/stream/finalize-version.ts). Lyckad fixer-pass rensar `verifierBlockingFindings` så versionen inte markeras blocked för fynd som redan reparerats. Re-validation hoppas över för att undvika +5–15 sek på `done`. Asynk verifier (alt 2) eller borttagning (alt 1/3) kvarstår som möjlig framtida konsolidering.

| Fält | Värde |
|------|-------|
| **Filer** | Ta bort: `src/lib/gen/verify/verifier-pass.ts` (delvis), uppdatera: `src/lib/gen/stream/finalize-version.ts` |
| **Svårighet** | Stor (politiskt — det är en investering ni gjort) |
| **Tidsåtgång** | 3 timmar kod + ½ vecka A/B-test |
| **Kostnad infra** | -10–15 USD/mån (en LLM-anrop mindre per generering) |
| **Värde** | -1 LLM-anrop per generering = ~5–15 sek snabbare P50 |

**Bakgrund:**

`docs/architecture/glossary.md` om Verifier:
> "LLM-driven read-only granskning. `blocking` findings är **advisory** och stoppar inte persist."

Med andra ord: verifier hittar fel men gör **ingenting** åt dem. Den är ren observability.

`src/lib/gen/verify/verifier-pass.ts` rad 41-44 har *force-blocking* för 2 specifika ID:n (`navigation-placeholder-actions`, `footer-dead-links`). Det är de enda findings som faktiskt har någon effekt.

**Frågan:** Är verifier värd ~10 sek per generering bara för att fånga 2 specifika fel?

**Alternativ:**

1. **Helt ta bort verifier.** Ersätt de 2 force-blocking-fallen med deterministiska checkers i `finalize-preflight.ts` (regex för dummy-`#`-länkar i nav/footer).
2. **Behåll verifier men kör asynkront efter `done`.** Då blockerar det inte user-facing latency. Findings sparas som telemetri/dashboard.
3. **Kör verifier bara på `qualityTarget === "release-candidate"`-versioner**, dvs F3-promotion. Spara 80 % av kostnaden.

**Rekommendation:** Alternativ 2 eller 3. Alternativ 1 bara om data visar att de 2 force-blocking-fallen aldrig utlöses.

**Manual:**

1. Lägg counter på hur ofta `FORCE_BLOCKING_IDS` faktiskt promovas. Mät 1 vecka.
2. Om <1 % av genereringar: alternativ 1.
3. Annars: alternativ 2.

---

### §3.2 Slå ihop `server-verify` + `quality-gate` + `accept-repair` till ett enda flöde

| Fält | Värde |
|------|-------|
| **Filer** | `src/lib/gen/verify/server-verify.ts`, `src/lib/gen/verify/preview-quality-gate.ts`, `src/app/api/engine/chats/[chatId]/accept-repair/route.ts` |
| **Svårighet** | Stor |
| **Tidsåtgång** | 1 vecka |
| **Värde** | -2 separata kontrakt, -1 SSE-event-typ (`version-repair-available`), -1 backstage state (`repair_available` lifecycle) |

**Bakgrund:**

Idag:

```
finalize → done → preview-session start
                ↘ server-verify (async) → quality-gate fail
                                        → repair-loop → quality-gate repass
                                                       ↗ pass → repair_available state
                                                       ↘ fail → failed state
                                                                user måste klicka accept-repair
                                                                eller vänta på auto-accept timeout
```

Det är **fyra olika lifecycle-states** för samma underliggande operation. Varje övergång är en bug-källa (P28 har 2 failures i preview-status-routet).

**Föreslagen modell:**

```
finalize → done → preview-session + server-verify (parallellt)
                                                  ↘ fail → repair-loop → om pass: applicera direkt (ingen accept-step)
                                                                      → om fail: failed, visa felet i builder
```

**Vinst:**
- En lifecycle-state mindre (`repair_available` försvinner)
- Inga "accept-repair"-routes
- Inga timeouts att hantera
- Mer förutsägbart för användaren

**Risken:** Om server-repair ändrar filer som användaren ser i preview, blir det "magisk" automatik. Mitigering: visa toast "Repair applied automatically — undo?" med 30-sek undo-knapp.

**Manual:**

1. Skissa ny lifecycle i `engine_versions.lifecycle_stage`-enum.
2. Skapa migration som mapparar gamla `repair_available` → `passed` (med flag `auto_repaired: true`).
3. Refaktorera `runRepairLoop`-callsite.
4. Ta bort `accept-repair`-route och dess test.
5. Lägg till "undo"-UI i builder.

---

### §3.3 Ta bort `partial-file-repair`-loopen

| Fält | Värde |
|------|-------|
| **Filer** | `src/lib/gen/stream/finalize-version.ts` (sektionen med `PARTIAL_FILE_REPAIR_MAX_ATTEMPTS`) |
| **Svårighet** | Medel |
| **Tidsåtgång** | 4 timmar |
| **Kostnad infra** | -2–3 USD/mån |
| **Värde** | -1 retry-loop, mindre kognitiv last |

**Bakgrund:**

`PartialFileOutputError` triggas när modellen output:ar avhuggna filer. Repair-mekanismen försöker LLM-fixa.

**Frågan:** Är detta verkligen vanligt med GPT-5.4 / Claude Sonnet 4.6? Med modern token-budget och `max_tokens: large` är partial files sällsynta — och när de händer är det ofta för att modellen tappade kontext mitt i, vilket en LLM-fix inte kan rädda.

**Alternativ:**

1. **Ta bort.** Vid `PartialFileOutputError` → markera version `failed`, be användaren retry. Lättare att förstå.
2. **Behåll men gör trivialt:** vid partial → bara markera den filen som tom skeleton, fortsätt persist med rest. Användaren ser felet och retryar.

**Rekommendation:** Alternativ 1, om data visar att partial repair lyckas <30 % av tiden.

**Manual:**

1. Mät: räkna `partial-file-repair.outcome.success` vs `.fail` i 1 vecka.
2. Om success rate < 30 %: ta bort.

---

### §3.4 Slå ihop `/api/v0/*` ↔ `/api/engine/*` — **HELT DONE 2026-04-20**

> **Status 2026-04-20:** Hela `/api/v0/chats/**`-trädet borttaget. Fas 1A (18 testlösa re-exports) + Fas 1B (10 routes vars unique test-coverage migrerades till engine-side test-filer via 2 parallella write-subagents). `v0-chats-compat.ts`/`logLegacyV0ChatsHit` borta. 1172/1172 tester gröna.
>
> **Fas 2 beslut 2026-04-20:** De 7 kvarvarande Class C-routerna (`init-registry`, `integrations/vercel/projects`, `projects/instructions`, `projects/[id]/env-vars`, `deployments/*`) **behålls på `/api/v0/`** — ingen rename. Motivering: routerna är inte arkitektur-legacy utan canonical permanent URL för deras features; rename till `/api/legacy/v0/*` skulle vara kosmetiskt med klient-deploy-koordineringskostnad utan funktionellt värde. Dokumenterat i `src/lib/api/engine-chats-path.ts` JSDoc + glossary. P29-spåret stängt; planfil flyttad till `docs/plans/avklarat/P29-v0-engine-consolidation.md`.

| Fält | Värde |
|------|-------|
| **Filer** | Alla 50+ `src/app/api/v0/**/*.ts` |
| **Svårighet** | Stor |
| **Tidsåtgång** | 1 vecka (med tester) |
| **Kostnad infra** | 0 |
| **Värde** | Halverar API-yta; fixar 4 av 7 P28-failures samtidigt |

**Bakgrund:**

`docs/architecture/system-overview.md`: *"v0 — fortfarande i API:t för mallar/registry/zip/deploy-hjälp; **inte** huvudstream för codegen"*

Men i praktiken finns alla preview-routes dubblerade (`/api/v0/chats/[chatId]/preview-session/route.ts` OCH `/api/engine/chats/[chatId]/preview-session/route.ts`). Det är "compat-routes som finns kvar där det behövs" — men "där det behövs" är aldrig definierat.

**Manual:**

1. Inventera alla `/api/v0/*` routes. Klassificera:
   - **A:** Identisk med `/api/engine/*`-motsvarighet → ta bort `v0`-versionen, redirect.
   - **B:** Unik (mall/registry/zip/deploy) → behåll, men flytta till `/api/legacy/v0/*` så namnet signalerar status.
2. Sök i `src/` efter klient-anrop till `/api/v0/`. Uppdatera till `/api/engine/` eller `/api/legacy/v0/`.
3. Ta bort de borttagna routerna och deras `*.test.ts`.

**Bonusvinst:** P28 §1-failures #2, #3, #4, #5 (preview-URL och preview-status v0) försvinner när routerna gör det.

---

### §3.5 Brief som optional, inte default

| Fält | Värde |
|------|-------|
| **Filer** | `src/app/api/ai/brief/route.ts`, `src/lib/api/engine/chats/create-chat-stream-post.ts` |
| **Svårighet** | Medel |
| **Tidsåtgång** | 2 dagar |
| **Kostnad infra** | -5–10 USD/mån (mindre brief-LLM) |
| **Värde** | -2-5 sek per init-generering; enklare debug |

**Bakgrund:**

Brief-pipelinen är cirka 25 % av init-tiden. Den fyller ett systemprompt-block med pages, colorPalette, tone, etc.

**Hypotes:** Med GPT-5.4 är prompten "Bygg en sajt om X" tillräcklig för att modellen ska producera bra output. Brief-objektet är en kvarleva från tidigare svagare modeller.

**Manual:**

1. Implementera A/B-test:
   - 50 % får brief som idag
   - 50 % får hoppa över brief, kör direkt prompt → codegen
2. Mät output-kvalitet (eval-suite) + boot-tid.
3. Om brief inte signifikant förbättrar quality: gör default `noBrief` med opt-in.

> **Risk:** Brief är politiskt viktig — många `docs/`-filer förutsätter den. Om A/B-data är ojämn, behåll men gör snabbare.

---

### §3.6 Förenkla `BuildSpec`-objektet

| Fält | Värde |
|------|-------|
| **Filer** | `src/lib/gen/build-spec.ts` (~860 rader idag) |
| **Svårighet** | Medel |
| **Tidsåtgång** | 1 dag |
| **Värde** | Lättare att läsa; mindre intern kontrakts-overhead |

**Bakgrund:**

`BuildSpec` har 9 fält:
- `changeScope` (5 enum-värden)
- `qualityTarget` (3 enum-värden)
- `previewPolicy` (2 enum-värden)
- `verificationPolicy` (3 enum-värden)
- `contextPolicy` (3 enum-värden)
- `tokenBudgets` (6 fält)
- `routeRealization`
- `stylePack`
- `forbiddenPatterns`

Det är 11×11×11×11... = 1000+ kombinationer i teorin, men i praktiken används ~5–10 reala kombinationer.

**Manual:**

1. Logga vilka kombinationer som faktiskt används i 1 vecka.
2. Definiera 5–10 namngivna "preset"-policies (`init-standard`, `followup-light`, `followup-heavy`, `release-candidate`, …).
3. Härled BuildSpec från preset, inte från 9 oberoende fält.

---

### §3.7 Inventera FEATURES-flaggor och rensa döda

| Fält | Värde |
|------|-------|
| **Filer** | `src/lib/config.ts` (FEATURES-objekt) |
| **Svårighet** | Enkel-medel |
| **Tidsåtgång** | ½ dag |
| **Värde** | Kortare config, mindre dead code |

**Manual:**

1. Lista alla `FEATURES.*` referenser i kodbasen.
2. För varje feature-flagga: är den togglad i någon miljö idag? Om nej → gör default-värde till hardcoded och ta bort flaggan.

---

## Sammanfattning av föreslagna pipeline-ändringar

### Före (14 steg + 4 efterspår)

```
Variant pre-match → Brief → Orchestrate → DynamicContext+Budget → Codegen-LLM
  → url_expand → autofix → validate_syntax → pre_vm_typecheck → materialize_images
  → verifier → parse_merge_preflight → partial-file-repair → persist
  → done → preview-session ↘ server-verify → quality-gate → repair-loop → accept-repair
```

### Efter (10 steg + 2 efterspår)

```
Variant pre-match → [Brief? optional] → Orchestrate → DynamicContext+Budget → Codegen-LLM
  → url_expand → autofix → validate (esbuild+tsc kombinerat) → materialize_images
  → parse_merge_preflight → persist
  → done → preview-session ‖ server-verify (auto-applies repair if pass)
```

**Borta:**
- `verifier` (eller asynkron + opt-in)
- `pre_vm_typecheck` (uppgår i `validate`)
- `partial-file-repair` (eller trivialiserat)
- `accept-repair` route (auto-apply istället)

**Vinst:**
- 30–60 sek snabbare P50 (mindre LLM-anrop)
- 4–6 färre kontrakt att synka mellan kod och docs
- 4 av 7 pre-existing failures försvinner som bieffekt

---

## Statistik

| Svårighet | Antal | Total tid | Total löpande/mån |
|-----------|-------|-----------|-------------------|
| Enkel | 2 | ~½ dag | 0 |
| Medel | 4 | ~5 dagar | -5–10 USD |
| Stor | 5 | ~3 veckor | -25–35 USD |
| **Summa** | **11** | **~3 veckor** | **-30–45 USD/mån** |

---

## Vad denna fil INTE täcker

- **Buggar** — se [`01-buggar.md`](./01-buggar.md)
- **Förbättringar** (nya förmågor) — se [`02-forbattringar.md`](./02-forbattringar.md)
- **Körordning + wave-indelning** — se [`05-korplan.md`](./05-korplan.md)
