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

### §1.4 `docs/övergipande-vision-och-mål.md` har stavfel i filnamnet — **DONE 2026-04-20**

| Fält | Värde |
|------|-------|
| **Fil** | tidigare: `docs/övergipande-vision-och-mål.md` → nu: `docs/övergripande-vision-och-mål.md` |
| **Bevis** | "övergipande" → "övergripande" (saknade `r`) |
| **Status** | Klart i hygien-paketet 2026-04-20. Policy: behåll ÅÄÖ i docs-filnamn (förebygger ÅÄÖ-stripping i samma yta som `preview-host/README.md`). |

---

> **Historisk notering (policy upphävd 2026-04-23):** Avsnittet nedan var korrekt vid audit-datumet 2026-04-20, men nuvarande policy är F2 `designPreview = ["typecheck"]` och `build` är reserverat för F3 `integrationsBuild`.

### §1.5 Quality-gate kör bara `typecheck` på F2 — inte `build` — **DONE 2026-04-20**

| Fält | Värde |
|------|-------|
| **Fil** | `config/ai_models/manifest.json`, `src/lib/gen/verify/quality-gate-checks.ts` |
| **Status** | Klart 2026-04-20. `qualityGateTiers.designPreview` är nu `["typecheck", "build"]` och `DEFAULT_DESIGN_PREVIEW`-fallback matchar. Backoffice `pages/ai_models.py` läser värdet direkt från manifest så panelen surfar nya policyn automatiskt. Testerna i `server-verify.test.ts` + `preview-quality-gate.test.ts` uppdaterade att asserta nya beteendet. För att revertera per-miljö (kostnad), sätt arrayen till `["typecheck"]`. |
| **Kostnad** | +5–20 sek per finalize, +5–10 USD/mån (Fly-CPU). |

---

### §1.6 Manifest-schema och manifest har drivit isär — **DONE 2026-04-20**

| Fält | Värde |
|------|-------|
| **Fil** | `config/ai_models/manifest.schema.json` (audit-rapporten pekade på `docs/schemas/strict/manifest.schema.json` — den filen finns inte; det kanoniska schemat ligger bredvid manifestet under `config/ai_models/`). |
| **Bevis** | P28 §7: schemat krävde `qualityGateTiers.tier2/serverVerify/promotion/interactive`, men 2026-04-konsolideringen bytte till `designPreview/integrationsBuild`. |
| **Status** | Klart i hygien-paketet 2026-04-20. `qualityGateTiers.required` uppdaterat till `["designPreview", "integrationsBuild"]`; `properties` slimmade till samma två. Verifierat mot `src/lib/ai-models/manifest-parity.test.ts`. |

---

## §2 MEDEL buggar (totalt ~2 dagar)

### §2.1 7 pre-existing testfailures (P28-spåret)

| Fält | Värde |
|------|-------|
| **Status** | **DONE 2026-04-20.** Full vitest-körning visar 1172/1172 gröna. Alla 7 listade fails löstes organiskt via Wave 1-4 + dagens hygien-pass + mock-drift-fix (commit `99a0f8efb`). Tester #2-#5 levde ursprungligen på `/api/v0/chats/...`-routes som nu är borttagna i P29 Fas 1B; deras assertions migrerade till engine-side test-filer först. #6-#7 isolation-leaks är inte längre observerbara i full suite. |

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

### §2.4 v0/engine API-duplikat introducerar `null`/`undefined`-glipor — **DONE 2026-04-20**

| Fält | Värde |
|------|-------|
| **Status** | Klart i P29 Fas 1B 2026-04-20. `/api/v0/chats/[chatId]/preview-status/route.ts` borttagen, unique test-coverage migrerat till `/api/engine/chats/[chatId]/preview-status/route.test.ts`. Duplikat-yta borta = en bug-källa, inte två. Audit §3.4 chat-ytan stängd. |

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
