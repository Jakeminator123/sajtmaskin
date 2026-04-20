# 01 — Buggar

> **Definition:** En bugg är något som **inte fungerar som dokumenterat eller förväntat**. Skiljer sig från en *förbättring* (där allt funkar men kan bli bättre).

Indelning: **enkla** (≤2h) → **medel** (½–2 dagar) → **stora** (3+ dagar).

Källor: `docs/plans/active/P27-validator.md` blocking_note, `docs/plans/active/P28-pre-existing-cleanup.md`, samt egen scanning av kod.

---

## §1 ENKLA buggar (totalt ~3 timmar)

### §1.1 Lint-error: `prefer-const` i `font-import-fixer.ts`

| Fält | Värde |
|------|-------|
| **Fil** | `src/lib/gen/autofix/rules/font-import-fixer.ts:45` |
| **Bevis** | P27 blocking_note: `1 pre-existing error i src/lib/gen/autofix/rules/font-import-fixer.ts:45 (prefer-const), 12 warnings` |
| **Svårighet** | Enkel |
| **Tidsåtgång** | 2 minuter |
| **Kostnad infra** | 0 |
| **Värde** | Master blir grön på `npm run lint` |

**Manual:**

1. Öppna `src/lib/gen/autofix/rules/font-import-fixer.ts`
2. Hitta rad 45, byt `let workingCode = ...` → `const workingCode = ...` (eller flytta deklarationen om reassignment behövs).
3. Kör `npx eslint src/lib/gen/autofix/rules/font-import-fixer.ts` — ska bli exit 0.
4. (Optional) Adressera de 12 warnings i samma fil om de är triviala.

---

### §1.2 Git-status fylls med Turbopack-cache-filer

| Fält | Värde |
|------|-------|
| **Fil** | `.gitignore` |
| **Bevis** | `git status` vid sessionsstart: 170+ untracked filer under `.next/dev/cache/turbopack/c573e8c4/*.{sst,meta,del}` + `.next/dev/node_modules/shiki-*` |
| **Svårighet** | Enkel |
| **Tidsåtgång** | 5 minuter |
| **Kostnad infra** | 0 |
| **Värde** | `git status` blir läsbar igen, inga oavsiktliga commits av cache-artefakter |

**Manual:**

1. Lägg följande rader i `.gitignore` om de inte redan täcker:
   ```gitignore
   .next/dev/cache/
   .next/dev/node_modules/
   ```
2. Kör `git rm -r --cached .next/dev/cache .next/dev/node_modules` (om något redan är spårat).
3. Verifiera: `git status` ska visa <10 rader, inte 170+.

---

### §1.3 ÅÄÖ-stripping i `preview-host/README.md`

| Fält | Värde |
|------|-------|
| **Fil** | `preview-host/README.md` |
| **Bevis** | P27 blocking_note: *"ÅÄÖ-check: 35 träffar — OK, inte ASCII-stripped"* — men instruktionen finns kvar som permanent risk för framtida agenter |
| **Svårighet** | Enkel |
| **Tidsåtgång** | 30 minuter |
| **Kostnad infra** | 0 |
| **Värde** | Förebygger framtida Unicode-incidenter |

**Manual:**

1. Lägg till en pre-commit hook i `.husky/` (eller motsvarande) som kör:
   ```bash
   if git diff --cached --name-only | grep -qE "preview-host/(README|kommandon)\.(md|txt)"; then
     for f in $(git diff --cached --name-only | grep -E "preview-host/.*\.(md|txt)"); do
       if ! rg -q "[åäöÅÄÖ]" "$f"; then
         echo "❌ $f saknar ÅÄÖ — möjlig ASCII-strippning. Avbryter commit."
         exit 1
       fi
     done
   fi
   ```
2. Alternativ: lägg en CI-check i `e2e/`-pipeline.

---

### §1.4 `docs/övergipande-vision-och-mål.md` har stavfel i filnamnet

| Fält | Värde |
|------|-------|
| **Fil** | `docs/övergipande-vision-och-mål.md` |
| **Bevis** | "övergipande" → "övergripande" (saknar `r`) |
| **Svårighet** | Enkel |
| **Tidsåtgång** | 5 minuter |
| **Kostnad infra** | 0 |
| **Värde** | Sökbart, citerbart filnamn |

**Manual:**

1. `git mv "docs/övergipande-vision-och-mål.md" "docs/overgripande-vision-och-mal.md"` (eller med rätt ÅÄÖ — välj policy först).
2. Sök i kodbasen efter referenser till gamla filnamnet och uppdatera.

> **Notera:** Diskutera om docs-filnamn ska vara ASCII (rekommenderat — förebygger ÅÄÖ-incidenter på Windows + git portability) eller behålla svenska tecken.

---

### §1.5 Quality-gate kör bara `typecheck` på F2 — inte `build`

| Fält | Värde |
|------|-------|
| **Fil** | `config/ai_models/manifest.json` (`qualityGateTiers.designPreview`) |
| **Bevis** | `src/lib/gen/verify/quality-gate-checks.ts:38` → `DEFAULT_DESIGN_PREVIEW = ["typecheck"]` |
| **Svårighet** | Enkel (men gränsar mot förbättring §2.4 — listas båda) |
| **Tidsåtgång** | 30 minuter test + verifiering |
| **Kostnad infra** | +5–20 sek per generering, +5–10 USD/mån (mer Fly-CPU) |
| **Värde** | Fångar Next-runtime-fel före preview-iframe — undviker "ren HTML"-incidenter |

**Manual:**

1. Editera `config/ai_models/manifest.json`:
   ```json
   "qualityGateTiers": {
     "designPreview": ["typecheck", "build"],
     "integrationsBuild": ["typecheck", "build"]
   }
   ```
2. Kör en testgenerering, mät boot-tid före/efter.
3. Om bootkostnaden är >20 % regression: lägg `build` bara på "interactive"-anrop (manuell preview-refresh), inte på var enda finalize.

> **Egentlig tradeoff:** se §2.4 i förbättringar — kanske vill du ha `build` på vissa anrop bara.

---

### §1.6 Manifest-schema och manifest har drivit isär

| Fält | Värde |
|------|-------|
| **Fil** | `docs/schemas/strict/manifest.schema.json` vs `config/ai_models/manifest.json` |
| **Bevis** | P28 §7: schemat kräver `qualityGateTiers.tier2/serverVerify/promotion/interactive`, men 2026-04-konsolideringen bytte till `designPreview/integrationsBuild`. Schemat är inte uppdaterat. |
| **Svårighet** | Enkel |
| **Tidsåtgång** | 30 minuter |
| **Kostnad infra** | 0 |
| **Värde** | Schema-validering blir trovärdig igen |

**Manual:**

1. Öppna `docs/schemas/strict/manifest.schema.json`
2. Ersätt:
   ```json
   "qualityGateTiers": {
     "type": "object",
     "required": ["tier2", "serverVerify", "promotion", "interactive"],
     "properties": { ... }
   }
   ```
   med:
   ```json
   "qualityGateTiers": {
     "type": "object",
     "required": ["designPreview", "integrationsBuild"],
     "properties": { ... }
   }
   ```
3. Kör manifest-parity-test: `npx vitest run src/lib/ai-models/manifest-parity.test.ts`

---

## §2 MEDEL buggar (totalt ~2 dagar)

### §2.1 7 pre-existing testfailures (P28-spåret)

| Fält | Värde |
|------|-------|
| **Fil** | Se `docs/plans/active/P28-pre-existing-cleanup.md` rad 36-46 |
| **Bevis** | P27 blocking_note + P28-planen |
| **Svårighet** | Medel |
| **Tidsåtgång** | ½ dag |
| **Kostnad infra** | 0 |
| **Värde** | Master grön på `npm run test:ci` |

**Failures:**

| # | Fil | Test |
|---|-----|------|
| 1 | `src/lib/project-env-vars.test.ts` | `fails closed when sensitive env vars saved without encryption key` |
| 2 | `src/app/api/v0/chats/[chatId]/route.test.ts` | `does not expose a preview URL for failed own-engine versions` |
| 3 | `src/app/api/v0/chats/[chatId]/route.test.ts` | `returns legacyShimPreviewUrl but null previewUrl when own-engine version saved but preview not yet provisioned` |
| 4 | `src/app/api/v0/chats/[chatId]/preview-status/route.test.ts` | `returns stopped when resume fails` |
| 5 | `src/app/api/engine/chats/[chatId]/preview-status/route.test.ts` | `returns stopped + provider_not_running_or_unreachable when resume fails (alias)` |
| 6 | `src/lib/gen/engine.test.ts` | Test-isolation-leak (passerar standalone, failar i full suite) |
| 7 | Övriga isolation-leaks i `orchestrate.test.ts`, `route-plan.test.ts`, `capability-inference.test.ts`, `verifier-pass.test.ts`, `generation-log-writer.test.ts` |

**Manual:**

P28 är redan en aktiv plan — följ den. Sammanfattat:

1. Börja med #1 (`project-env-vars.ts`): sannolikt en saknad guard som ska throwa när `ENCRYPTION_KEY` saknas.
2. För #2-#5 (preview-URL): troligen en assert som väntar `null` men får `undefined` eller en URL-string.
3. För #6-#7 (test-isolation): lägg `vi.resetModules()` i `beforeEach` av en eller flera nya tester från P22/P23/P26 som mockar `system-prompt`/`models`/`stream-format`.

---

### §2.2 Stream-route follow-up-failures (P22b-spåret)

| Fält | Värde |
|------|-------|
| **Fil** | `src/lib/api/engine/chats/chat-message-stream-post.ts` |
| **Bevis** | P22 frontmatter `deviations_from_plan.caller-side-wiring-deferred-to-P22b` |
| **Svårighet** | Medel |
| **Tidsåtgång** | ½ dag |
| **Kostnad infra** | 0 |
| **Värde** | "ignores persisted scaffold lock for clear-redesign follow-ups in auto mode"-test passar |

**Manual:**

1. Läs `docs/plans/active/P22b-followup-caller-wiring.md` (om den finns) eller skapa den.
2. Wire `priorQualityTarget` + `followUpIntent` + `persistedVariantId` till `orchestrate`-callern i `chat-message-stream-post.ts`.
3. Kör failande test-fil och verifiera att den nu passar.

---

### §2.3 Bus factor 1 — onboarding-friction blockerar andra utvecklare

| Fält | Värde |
|------|-------|
| **Fil** | Hela docs-trädet |
| **Bevis** | All docs är på svenska. `docs/architecture/glossary.md` är på svenska. Cursor-rules är blandat. En engelsktalande utvecklare kan inte rimligen onboardas. |
| **Svårighet** | Medel (om bara primärfilerna översätts) |
| **Tidsåtgång** | 2 dagar |
| **Kostnad infra** | 0 (men +20 USD/mån om man vill ha LLM-baserad doc-sync) |
| **Värde** | Möjliggör att rekrytera/få hjälp utan språkspärr |

> **Detta är gränsfall mellan bugg och förbättring** — listad här för att det blockerar test/QA-deltagande från externa. Se även `02-forbattringar.md` §2.10.

**Manual:**

1. Översätt **bara** dessa till engelska först:
   - `docs/architecture/system-overview.md`
   - `docs/architecture/repo-tree.md`
   - `docs/architecture/glossary.md`
   - `AGENTS.md`
2. Behåll svenska som sekundärt språk i fasdokumenten initialt.
3. Etablera regel i `.cursor/rules/` att ny dokumentation skrivs på engelska.

---

### §2.4 v0/engine API-duplikat introducerar `null`/`undefined`-glipor

| Fält | Värde |
|------|-------|
| **Fil** | `src/app/api/v0/chats/[chatId]/preview-status/route.ts` + `src/app/api/engine/chats/[chatId]/preview-status/route.ts` |
| **Bevis** | Båda har test som failar med samma mönster (`returns stopped when resume fails`) — duplikat ger 2× bug surface |
| **Svårighet** | Medel |
| **Tidsåtgång** | 1 dag (denna bugg + början på konsolidering — se `03-konsolidering-pipeline.md` §3.7) |
| **Kostnad infra** | 0 |
| **Värde** | Halverar API-yta + fixar 2 tester på ett ställe |

**Manual:** Se `03-konsolidering-pipeline.md` §3.7 — denna bugg löses som en bieffekt av API-konsolideringen.

---

## §3 STORA buggar (totalt ~5 dagar)

### §3.1 Live-preview boot 2–5 minuter (Fly-VM-kall start)

| Fält | Värde |
|------|-------|
| **Fil** | `preview-host/src/runtime.js`, `preview-host/src/server.js` |
| **Bevis** | `preview-host/README.md`: *"Forsta boot ar seg (2-5 min for riktiga Next-projekt med tunga deps som three.js)"* |
| **Svårighet** | Stor |
| **Tidsåtgång** | 3–5 dagar för palliativa optimeringar (cache, prewarm); fundamentalt löst först av §3.1 i förbättringar (WebContainers-migration) |
| **Kostnad infra** | -10–20 USD/mån (om prewarm görs smart) |
| **Värde** | Användarupplevelsen blir uthärdlig |

**Klassificering: bugg** eftersom användaren förväntar sig sekunder, inte minuter — det är produktens kärnvärde.

**Manual (palliativ — fundamental fix kräver WebContainers, se `02-forbattringar.md` §3.1):**

1. Skapa en "warm pool" av idle preview-VMs på Fly med `node_modules` redan installerat för de 5 vanligaste scaffold-baserna (`landing-page`, `saas-landing`, `dashboard`, `blog`, `app-shell`).
2. När en användare initierar generering: börja installera deps i en VM omedelbart (parallellt med codegen-streamen).
3. Lägg till metric `previewBootP50` i logs och watcha den i Streamlit dashboard.

---

### §3.2 Repair-loop kan loopa länge utan tydlig progress

| Fält | Värde |
|------|-------|
| **Fil** | `src/lib/gen/verify/repair-loop.ts`, `src/lib/gen/autofix/validate-and-fix.ts` |
| **Bevis** | Mångfaldiga `early-stop`-flaggor (`fixer_noop`, `no_improvement`, `time_budget_exceeded`) — visar att problemet är välkänt men inte uppstädat |
| **Svårighet** | Stor |
| **Tidsåtgång** | 2 dagar |
| **Kostnad infra** | -2–5 USD/mån (färre slösade LLM-anrop) |
| **Värde** | Förutsägbar latency, lägre LLM-kostnad |

**Manual:**

1. Inventera alla early-stop-paths i `runRepairLoop` och `validateAndFix`. De är 4–5 stycken — verifiera att de faktiskt utlöses i produktion (lägg till counter-telemetri i 1 vecka).
2. Sätt **hård övre gräns** för repair: max 2 LLM-fix-anrop, max 90 sekunder totalt. Idag är det manifeststyrt men gränserna är generösa.
3. Om gränsen nås: markera version som `failed` direkt — försök inte "rädda" 30 % av filerna.

---

## Statistik

| Svårighet | Antal | Total tid | Total löpande/mån |
|-----------|-------|-----------|-------------------|
| Enkel | 6 | ~3 timmar | 0 |
| Medel | 4 | ~2 dagar | 0 |
| Stor | 2 | ~5 dagar | -12 USD |
| **Summa** | **12** | **~5–6 dagar** | **-12 USD** |

---

## Vad denna fil INTE täcker

- **Förbättringar** (allt funkar men kan bli bättre) — se [`02-forbattringar.md`](./02-forbattringar.md)
- **Pipeline-konsolidering** (förenkling utan funktionsförändring) — se [`03-konsolidering-pipeline.md`](./03-konsolidering-pipeline.md)
