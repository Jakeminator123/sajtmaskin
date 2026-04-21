# Handoff — sajtmaskin 2026-04-20 (efter 11 etapper)

> **Syfte:** Snabb orientering för en ny agent (Cursor-session, cloud-agent, eller annan AI-agent) som ska fortsätta arbetet på sajtmaskin. Läs detta först. Komplettering till `docs/plans/active/Kvarvarande-uppgifter.md` (kanonisk öppen-punkt-lista) och `docs/reports/audit-2026-04-20-komplexitet-vs-varde/` (45-punkts-audit som denna session arbetade igenom).

---

## TL;DR

* **11 etapper levererade 2026-04-20 (A-K).** ~22 commits på `master`. 1214/1214 tester gröna.
* **22 av 43 audit-punkter klara** (~51%). Tier S = 100%, Tier A = 75%, Tier B = 38%.
* **`master` är ren** — `git status` visar bara användarens lokala edits (`.cursor/settings.json`, `.markdownlintignore`, `drizzle.config.ts`).
* **3 stora arbetsspår är stängda:** Tier S (alla snabba quick-wins), P28 (alla 7 pre-existing test-failures), P29 (`/api/v0/chats/**` helt borttaget och konsoliderat till `/api/engine/chats/**`).
* **API-yta:** `/api/v0/chats/**` helt borttaget (28 routes). `/api/v0/`-grenen krympt 82% (34 → 6 routes; 6 kvar är Class C: deployments + projects + integrations som canonical permanent URL). Total sajtmaskin-API-yta krympt ~23% (123 → ~95 routes).
* **Telemetri-grunden är på plats:** Prometheus-metrics + `/api/metrics`-endpoint + Streamlit observability-panel + P50-prompt-to-done-histogram + ingress-counters + brief-cache-counters.

---

## Var vi är nu (commit-historik denna session)

`b639c33f5..9249a0994` på `master`. Samtliga commits pushade.

| Etapp | Commit | Vad | Audit-koppling |
|---|---|---|---|
| Pre-A | `057b9bd0b`, `6c9b20b25`, `72837c500`, `ccb92a3e5`, `9ad682fab` | 4 bug-fixar utanför audit (loop-order, deterministic block-pick, preview_url-invalidate, mock-drift) + Tier S städning | Tier S #1–5, #10 |
| **A** | `b2d073cd0` | F2 quality-gate `build`-check | Tier S #7 |
| **B** | `560a788ef` | P29 Fas 1A — 18 testlösa v0-chat-routes borttagna | Tier A #14 |
| **C** | `594ad6c1c` | Docs sync för A+B | — |
| **D** | `8136324a0` | P29 Fas 1B — 10 routes med tester migrerade till engine-side | Tier A #14 |
| **E** | `44a9c9eeb` | Stale-ref cleanup (vercel.json kritiskt: `supportsCancellation` flyttat till engine-route) | — |
| **F** | `14feacb50`, `3266ac4fe` | P29 Fas 2 + audit-städning (P29 helt stängd) | Tier A #14 |
| **G** | `425108b58` | Tier A #8 verifierat non-issue (`incremental: true` redan i tsconfig) | Tier A #8 |
| **H** | `79416228a` | Auto-archive plans-script + P19/P20 status-städning | Tier B #22 |
| **I** | `a42e7629a` | Prometheus/OTel observability-grund + 3 pipeline-wire-ins | Tier B #19 |
| **J** | `f7d33c640`, `04ee54240`, `018b5bb36`, `f9626e7f8` | 3 parallella subagents: P50 metric + promptAssist unified + v0-import freshness | Tier A #12, Tier B #23, P19 Steg 4 |
| **K** | `bac91042b`, `70b22f861`, `d817227f6`, `37decf766`, `9249a0994` | 4 parallella subagents: backoffice-panel + brief-cache + P19 Steg 1 telemetri + P20 Nivå 3 font-CI | Tier B #20, P19 Steg 1, P20 Nivå 3 |

---

## Linje-disciplin under sessionen

Sessionen följde tre principer som **bör fortsätta** (annars riskerar vi att förlora konsistens):

1. **Förenkling > teaterföreställning.** Ingen rename eller refactor utan funktionellt värde. Audit-rekommendationer som var kosmetiska (t.ex. P29 Fas 2 rename Class C till `/api/legacy/v0/*`) avslogs medvetet med dokumenterad motivering.
2. **Root cause > symptom.** När andra agenten föreslog `syntaxFixPasses 4 → 2` som "quick win" upptäcktes att loop-ordningen var trasig — fixade ordningen istället för att maskera problemet.
3. **Data först, beslut sen.** Stora reversals (verifier-removal, partial-file-repair-removal) deferrerades till efter telemetri samlats in. Telemetri-grunden levererades i Etapp I så framtida beslut blir datadrivna.

---

## Kvarstående arbete (kanonisk lista)

Källa: `docs/plans/active/Kvarvarande-uppgifter.md` punkt 1–10 + audit-rapportens öppna punkter.

### Aktivt öppet (kan plockas direkt eller med små förberedelser)

| # | Vad | Effort | Blocker |
|---|---|---|---|
| 1 | **`Source_Sans_3`-violation i `editorial-serif.json`** | 5 min | Produktbeslut — lägg till i `google-font-registry.ts` ELLER byt variant. Source Sans 3 är officiell Google Font (https://fonts.google.com/specimen/Source+Sans+3); orchestrator rekommenderar Alternativ A (lägg till i registret). Verifiera fyndet med `npm run typography:validate-pairings`. **Bör tas av nästa cloud-agent som första uppvärmning.** |
| 2 | **P19 Steg 3 — UX-transparens** vid follow-up-bas != latest | 4–8h | Ingen — UI-arbete |
| 3 | **P25b-rest — VersionHistory tooltips/badges** + `VersionMismatchOverlayPayload`-rendering | medel | Ingen — kräver visuell verifiering |
| 4 | **Eval auto-baseline-uppdatering** (CI-script för eval-svit) | låg | Ingen |

### Blockad på telemetri-data (vänta 1 vecka, sen plocka)

| # | Vad | Förkrav | Notering |
|---|---|---|---|
| 5 | **Tier A #16** Inventera early-stop-flaggor i `validateAndFix`/`runRepairLoop` | 1 vecka data via `sajtmaskin_early_stop_total` | Counter wirad i Etapp I |
| 6 | **Audit §3.1** Verifier asynk eller bort | 1 vecka data via `sajtmaskin_verifier_blocking_total{finding_id}` | Counter wirad i Etapp I |
| 7 | **Audit §3.3** Partial-file-repair removal | 1 vecka data via `sajtmaskin_partial_file_repair_total{outcome}` + fast-tier upgrade till GPT-5+ | Counter wirad i Etapp I |
| 8 | **Audit §3.5** Brief som optional A/B-test | A/B-infra + 1 vecka data | Cache redan på plats (Etapp K.2), men A/B-grenen ej byggd |

### Blockad på externa förutsättningar

| # | Vad | Blocker |
|---|---|---|
| 9 | **Tier A #9** ÅÄÖ pre-commit hook | Husky/lint-staged install (mer än "30 min" audit påstår) |
| 10 | **Tier A #17** Brief A/B-test | Behöver A/B-infrastruktur (statistical splitting, experimentation framework) |

### Strategiska / stora satsningar (separata spår)

| # | Vad | Effort | Värde |
|---|---|---|---|
| 11 | **Audit §3.2** Slå ihop server-verify + quality-gate + accept-repair | 1 vecka | -1 lifecycle-state, mer förutsägbar UX |
| 12 | **Audit Tier D #38** WebContainers-migration | 2–3 veckor | **Boot 2-5 min → 5 sek (50–60×). Tar betyget från 6.5 → 8 i unbiased.** |

### "Nice to have" (Tier B-rest, ej akut)

* #24 Eval-suite som CI-gate (1 dag, +20-40 USD/mån)
* #25 Strukturerad JSON-logging (2 dagar)
* #26 Engelska som primärspråk i docs (2 dagar, politiskt val)
* #27 Konsolidera 5 cross-file-import-fixers — kräver telemetri (`sajtmaskin_fixer_call_total`)
* #28 Mekaniska autofixers → deklarativ tabell — **avslogs i Etapp G** efter analys (skulle göra koden mer indirect, inte enklare)
* #29 Förenkla `BuildSpec` till presets — kräver telemetri på faktiska kombinationer
* #30 Repair-loop hård gräns 90s
* #31 Komponenttester (builder)

---

## Skuld från arkiverade rapport-dokument (FIXA.txt + imorgon.txt — borttagna 2026-04-20)

> Dessa två lokala rapport-dokument har konsoliderats hit och raderats från repot för att undvika parallella sanningar. Innehåll bevarat i git-historiken.

### Från `imorgon.txt` (2 öppna kvalitetsrisker)

**I1 — `NEXT_PUBLIC_SAJTMASKIN_TIER2_PREVIEW_HOST_SUFFIXES` saknar default i `compatibility-shim.ts`** _(LÖST 2026-04-21 i Block D)_
* Tier-2-host-suffix-detektionen lever nu i `src/lib/gen/preview/preview-url-classifier.ts` (utbruten ur `compatibility-shim.ts` i D1). `DEFAULT_TIER2_HOST_SUFFIX_LIST = ["fly.dev"]` används som fallback när env-varen är unset. `isTier2LivePreviewUrl()` returnerar därmed `true` för Fly-värdar även utan explicit env-konfiguration → tier-2-downgrade-guarden är inte längre tandlös. Block D dödade också compatibility-shim som default (`SAJTMASKIN_SHIM_PREVIEW_DISABLED` defaultar till true), så "blå overlay"-regressionen är dubbelt skyddad.

**I2 — Element Preservation Guard sektion-landmarks kan blockera legitima section-renames**
* CSS-klass-detection (`hero`, `about`, `pricing`, `testimonial`, `feature`, `service`, `portfolio`, `cta`, `footer`, `header`, `banner`, `showcase`, `menu`, `reservation`, `booking`, `gallery`, `team`, `faq`, `video`, `media`, `player`) i `src/lib/gen/context/structural-elements.ts` betraktar varje sådan sektion som "kritiskt element". Follow-up som byter `hero-section` → `intro-block` blockeras tyst — sajten ser oförändrad ut, ingen UI-felindikering.
* **Lösning (större förändring):** (a) ta bort sektion-keyword-detection helt (behåll bara riktiga DOM-element som `<video>`/`<canvas>`/`<form>`/3D-scener); ELLER (b) varna i UI istället för att blockera; ELLER (c) tillåt force-instruktion i prompt. Vågen 1 i denna session bubblar `done.rejectedStructural` via SSE — så symptomet är observerbart men grundorsaken inte fixad.

### Från `src/FIXA.txt` — 33 buggar från konkret site-generering (`version-777eaba7`, Hotellet i Spanien)

> **Status:** Inget direkt adresserat denna session (möjligen A7 indirekt via Wave 2:s `checkMotionReduceTrap` och B7 via Wave 3-konsolideringen). Listan är prioriterad efter värde/effort. Topp-15 nedan; full lista i git-historik (`git show <commit-före-radering>:src/FIXA.txt`).

**A: 18 buggar i GENERERAD OUTPUT (varje genererad site påverkas)**

| ID | Bugg | Effort |
|---|---|---|
| **A1** | `components/booking-form-state.tsx` är tom auto-stub (data-stub-pattern, dead code) — auto-detektera + ta bort | Liten |
| **A2** | `import { Circle as BedDouble, ... } from "lucide-react"` — Lucide-fallback aliasar saknad ikon till `Circle`, fel ikon visas i hero. Behöver mapping-tabell (`BedDouble → Bed`, `BedSingle → Bed`) | Liten |
| **A3** | 6 `source.unsplash.com`-URL:er (domänen död sedan 2024). Brief-LLM får ALDRIG resolvera till `source.unsplash.com`; image-validator ska re-resolvera 5xx-URL:er | Medel |
| **A4** | `@react-three/rapier@^2.1.0` installerat men aldrig importerat — ~150-200KB bundle bloat. Skanna deps mot imports | Liten |
| **A5** | `ThemeProvider` ligger inuti `<main>` istället för runt `<body>` — header/footer följer inte dark-mode-toggling | Liten |
| **A6** | `<Canvas>` med `fixed inset-0 z-[70]` täcker hela sidan inkl. header/footer/modaler; iOS Safari touch-event-issues. Sänk z-index | Liten |
| **A7** | `frameloop="demand"` stänger inte ner Canvas vid `prefers-reduced-motion` — WebGL-context lever, GPU/batteri-belastning. Returnera null vid reduced motion | Liten |
| **A8** | `<Environment preset="studio">` drar 4-8MB HDR från extern CDN. För liten flying-phone räcker simple lighting (~5MB sparing) | Liten |
| **A9** | `metadataBase` pekar på `https://hotelletispanien.se` (fictive domain) — Open Graph 404 | Liten |
| **A10** | `globals.css :focus-visible` slår ut shadcn:s egna focus-rings; ring-färg osynlig i dark-mode (a11y-bugg) | Liten |
| **A11** | Ingen JSON-LD/schema.org för hotell — Google rich results saknas | Medel |
| **A12** | Ingen analytics — ingen `@vercel/analytics`/GA/Plausible. Brief tagged "Lead form + email routing" som workflow saknas mätning | Liten |
| **A13** | 7 vanliga `<img>` istället för `next/image` — ingen LCP-prio, ingen blur-placeholder | Liten/Medel |
| **A14** | `ContactForm.handleSubmit` är client-only mock — user skickar förfrågan, ser "Tack!", inget mail skickas | Liten |
| **A15** | OpenStreetMap-iframe i kontakt/page.tsx → CSP frame-src violation i preview-iframe | Liten |
| **A16** | Inkonsistent format — 5 separata `import { Card } from "@/components/ui/card"` istället för en samlad. Behöver `import/no-duplicates` eslint-fix i finalize-pipeline | Liten |
| **A17** | `package.json scripts.dev = "next dev"` defaultar Turbopack i Next 16 → triggrar HMR-WS-spam (se C1) | Liten |
| **A18** | Inga `loading.tsx` / `error.tsx` / `not-found.tsx` — vit sida vid SSR-error | Liten |

**B: 9 SYSTEM-BUGGAR (sajtmaskin-pipeline)**

| ID | Bugg | Effort |
|---|---|---|
| **B1** | `EMAXCONNSESSION: max clients reached` — `chat-repository-pg.ts:452` kraschar i 3 endpoints samtidigt (readiness, validate-images, quality-gate 500). Byt till transaction mode (`?pgbouncer=true&connection_limit=1`) eller höj pool | Liten/Medel |
| **B2** | Verifier retryar 3× på `insufficient_quota` (icke-tillfälligt, slösar 8s+) — `verifier-pass.ts:223`. Sätt `maxRetries=1` när status ∈ {401, 402, 403, 429} med `code: insufficient_quota` | Liten |
| **B3** | "Stream error" i UI maskerar provider-felkoder. Mappa OpenAI-felkoder i `comm.error.create`: `insufficient_quota → "OpenAI-kvoten slut"`, `rate_limit_exceeded → "Rate limit"`, `context_length_exceeded → "För lång prompt"` | Liten |
| **B4** | `detectPromptType` returnerar `"freeform"` innan `!isFirstPrompt`-check — follow-ups loggas alltid som freeform, `ORCHESTRATION_SOFT_TARGET_FOLLOWUP_CHARS` aktiveras aldrig. Fix: gate freeform-grenen på `isFirstPrompt` | Liten |
| **B5** | "Brief: applicerad + Systempromt: NK tecken" visas inte för follow-ups i Agentloggen. Sätt `briefApplied + systemPromptLength` på model-info-payload i follow-up-grenen i `chat-message-stream-post.ts` | Liten |
| **B6** | `POST /quality-gate` tar 49s efter `site.done` — preview rapporteras "ready" men UI fryser. Utred om quality-gate måste vara blockerande post-finalize (alternativt: bakgrund + SSE-push) | Liten utredning + Medel |
| **B7** | Validate-step hoppar över `tsc` warm pass ("tsc-skipped") trots Wave 3-aktivering. Hitta varför `runWarmTscPass` skippar (timeout? feature-flagga? `forceTsc`?) | Liten/Medel |
| **B8** | Brun→grön tema-ändring rörde page.tsx 269L (CSS-only delta överflödig). Pre-classify follow-up: theme-only? → exkludera page.tsx från delta-prompten | Medel |
| **B9** | 78-93s reasoning + 42-74s output för triviala ändringar på "Lagom"-tier. Auto-downgrade till "Snabb"+thinking-off när delta-classifier säger trivial CSS | Medel |

**C: 4 PREVIEW/IFRAME-issues**

| ID | Bugg | Effort |
|---|---|---|
| **C1** | Turbopack i Next 16 kringgår `SAJTMASKIN_PREVIEW_DISABLE_HMR` — `web-socket.ts:50` spammar wss `~1s`. Fix: ändra `project-scaffold.ts:34` → `"dev": "next dev --webpack"` (minst angreppsyta) | Liten |
| **C2** | `PreviewPanelFrame.tsx:150` saknar `allow-pointer-lock` (+`allow-modals`) i sandbox — R3F:s `OrbitControls` kraschar tyst i iframen | 2 min |
| **C3** | Inspector-overlay osynlig — `bg-sky-950/10` / `bg-emerald-950/5` med `cursor-crosshair`. Användare glömmer inspector är på, tror knappar är trasiga | Liten |
| **C4** | `preview-status` + `readiness` pollas parallellt var ~750ms (bidrar till B1). Throttla till 2-3s eller long-poll/SSE | Medel |

**D: 2 DOC-UPPDATERINGAR (gör tillsammans med C1)**

| ID | Vad | Effort |
|---|---|---|
| **D1** | `Kvarvarande-uppgifter.md`: "WSS/HMR till Fly — löst (stabil)" är **regressed** via Turbopack/Next 16 (se C1). | 2 min |
| **D2** | `docs/ENV.md` + `preview-host/README.md`: caveat — `SAJTMASKIN_PREVIEW_DISABLE_HMR` adresserar bara Webpack. Turbopack kräver separat åtgärd (se C1) | 5 min |

### Topp-15 prioriteringsordning från FIXA.txt (värde/effort)

1. **C1** — HMR-regression (täpper console-spam, snabb fix, varje preview påverkas)
2. **B1** — DB pool (kraschar 3 endpoints, snabb fix om pgbouncer-mode finns)
3. **A3** — `source.unsplash.com` (varje genererad sajt har trasiga bilder, hög synlighet)
4. **A1** — booking-form-state stub (dead code i varje version)
5. **A2** — Lucide BedDouble-fallback (synligt fel-ikon i hero)
6. **A4** — Rapier oanvänd dep (250 KB bundle bloat)
7. **C2 + C3** — Sandbox + inspector overlay (löser "iframen känns död")
8. **A5** — ThemeProvider-positionering
9. **B2 + B3** — Verifier retry + silent-output mapping (snabba kvalitetsfixar)
10. **B6** — Quality-gate 49s blockering
11. **B5 + B4** — UI-loggning av brief/typ
12. **A11 + A12** — JSON-LD + tracker (SEO/analytics)
13. **A6, A7, A8** — Canvas-overlay + reduced-motion + Environment (3D-best-practices)
14. **A13 + A14** — `next/image` + form-backend (kvalitetslyft)
15. **A10, A15, A16, A18** — Polish

### Topp-3 från `imorgon.txt`

1. **I1** — Default `fly.dev` i `compatibility-shim.ts` (5-10 min, stor robusthet)
2. **C1 (FIXA)** — Turbopack `--webpack`-flagga (samma effort, samma rotorsak)
3. **I2** — Element Preservation Guard sektion-landmarks (större förändring, gör efter att data via `done.rejectedStructural`-SSE samlas in 1 vecka)

---

## Tre rekommenderade vägar för nästa agent

### Väg A — STORT: WebContainers-migration (2–3 veckor)

**Syfte:** Gå från 6.5 → 8 i audit-betyg. Migrera live-preview från Fly-VM till StackBlitz WebContainers (boot 2-5 min → 5 sek = 50–60× snabbare). Detta är **det enskilt största kvarvarande user-impact-arbetet**.

**Lämpar sig för:** Cloud-agent eller dedikerad session — för stort för iterativ-takt.

**Plan-fil att skapa:** `docs/plans/active/P30-webcontainers-migration.md` (audit `05-korplan.md` "Strategisk satsning" beskriver 6 faser).

### Väg B — MEDEL: Datadrivet pipeline-konsolidering (efter 1 veckas telemetri)

**Syfte:** Med telemetri-grunden från Etapp I+J+K kan vi nu **datadrivet besluta** tre stora konsolideringar audit-rapporten flaggade:

1. Audit §3.1 — Verifier asynk eller helt bort?
2. Audit §3.3 — Partial-file-repair-removal?
3. Audit Tier A #16 — Vilka early-stop-flaggor är dead code?

**Lämpar sig för:** Framtida iterativ session (om en vecka) eller en analys-fokuserad agent som tittar på `/api/metrics` data.

### Väg C — KORT: Plocka FIXA.txt eller P25b UX-polish

**Syfte:** Faktiska användarsynliga UX-fixes på genererad output (FIXA.txt A1-A18) eller builder-UI-polish (P25b).

**Lämpar sig för:** Iterativ session som vill ge omedelbar synlig kvalitetsförbättring.

---

## Prompt till nästa agent

Klipp och klistra in följande till en ny Cursor-session, cloud-agent, eller annan AI-agent:

```
Du tar över sajtmaskin-projektet (Next.js + Drizzle + own-engine codegen) efter en
session som levererade 11 etapper (A–K) den 2026-04-20. Läs först:

1. `docs/plans/active/handoff-2026-04-20-next-session.md` (denna fil)
2. `docs/plans/active/Kvarvarande-uppgifter.md` (kanonisk öppen-punkt-lista)
3. `docs/reports/audit-2026-04-20-komplexitet-vs-varde/00-README.md` (audit-rapportens index — 22/43 punkter klara)
4. `.cursor/skills/sajtmaskin-context/SKILL.md` (terminologi-guardrails: v0-mallar vs template-library vs scaffolds, /api/v0/ vs v0-provider, etc.)
5. `AGENTS.md` (repo-konventioner)

KRITISKT att förstå:

- Kanonisk pipeline-källa: `docs/architecture/fas2-orchestration-and-build.md` + `fas3-preview-and-deploy.md`
- Kanonisk glossary: `docs/architecture/glossary.md` (terminologi)
- All chat-trafik går via `/api/engine/chats/**` (P29 Fas 1B 2026-04-20). `/api/v0/**` finns kvar för 7 Class C-routes (deployments/projects/integrations) som canonical permanent URL — INTE för migrering.
- `pre_vm_typecheck` finns inte längre — uppgår i `validate_syntax` sedan W3.
- Telemetri: alla pipeline-faser, fixer-anrop, verifier blocking-fynd, partial-file-repair-utfall, early-stop-skäl, prompt-to-done-tid, brief-cache hit/miss, P19-ingress events är instrumenterade. Endpoint: `GET /api/metrics` med bearer-token `SAJTMASKIN_METRICS_TOKEN`. Operativ panel: `backoffice/pages/observability.py` (Streamlit).

LINJE som bör fortsätta (annars förlorar vi konsistens):

1. Förenkling > teaterföreställning (ingen rename utan funktionellt värde)
2. Root cause > symptom (fixa loop-ordningen, inte sänk pass-talet)
3. Data först, beslut sen (kör inte verifier-removal eller partial-file-removal utan telemetri-data; vi har precis börjat samla in)

VAL AV ARBETE — välj en av tre vägar dokumenterade i handoff-filen:

- Väg A (STORT, 2-3 veckor, lämpar för cloud-agent): WebContainers-migration. Audit Tier D #38. Tar betyget 6.5 → 8.
- Väg B (MEDEL, vänta ~1 vecka för data): Datadrivet pipeline-konsolidering (verifier asynk/bort, partial-file-repair, early-stop-cleanup).
- Väg C (KORT, iterativ): Plocka FIXA.txt-buggar (toppen-5 = C1 HMR-Turbopack, B1 DB-pool, A3 source.unsplash.com, A1 dead-stub, A2 Lucide-fallback) ELLER P25b UX-polish (VersionHistory tooltips/badges).

UPPSTART — kör innan du börjar koda:

- `git status` — verifiera ren working tree (1214/1214 tester gröna är baseline)
- `npx vitest run` — verifiera baseline
- `npm run typecheck` — verifiera tsc clean
- `npm run plans:archive` — kolla om några plan-filer är klara att arkivera
- `npm run typography:validate-pairings` — kolla att font-pairings är clean (just nu finns 1 violation: `Source_Sans_3` saknas i registret)

DISCIPLIN PER ETAPP:

- Använd parallella write-subagents för disjunkta filytor (bevisade fungera bra denna session)
- Diktera FAST API-kontrakt UPPFRONT så subagents kan jobba parallellt utan koordinering
- Granska subagent-output men gör pipeline-yta-edits själv
- Fail-safe på alla telemetri-anrop: `try { incXxx(...) } catch {}`
- Efter varje etapp: synka glossary + audit + Kvarvarande-uppgifter + commit + push
- Aldrig force-push (master är skyddad)
- ÅÄÖ-känsligt: använd `Write`/`StrReplace` (ej PowerShell heredoc/echo)
```

---

## Källdokument du följer (kanoniska)

| Fil | Roll |
|---|---|
| `docs/plans/active/Kvarvarande-uppgifter.md` | **Kanonisk** öppen-punkt-lista. Uppdatera efter varje etapp. |
| `docs/reports/audit-2026-04-20-komplexitet-vs-varde/` | 45-punkts-audit. `04-kostnadsmatris.md` har Status-kolumn för Tier S+A+B (delvis). `00-README.md` har Top-10 ROI med status. |
| `docs/architecture/glossary.md` | Kanonisk terminologi. Uppdatera när nya begrepp införs. |
| `docs/architecture/fas2-orchestration-and-build.md` | Kanonisk pipeline-källa (Fas 2 codegen → finalize). |
| `docs/architecture/fas3-preview-and-deploy.md` | Kanonisk pipeline-källa (Fas 3 preview/deploy). |
| `.cursor/skills/sajtmaskin-context/SKILL.md` | Terminologi-guardrails (v0/template-library/scaffold-disambiguering). |
| `.cursor/rules/useful-commands.mdc` | Snabb npm-script-överblick. |
| `AGENTS.md` | Repo-konventioner. |
| (`src/FIXA.txt` borttagen 2026-04-20 — innehåll konsoliderat i sektionen "Skuld från arkiverade rapport-dokument" ovan) | — |
| (`imorgon.txt` borttagen 2026-04-20 — innehåll konsoliderat i sektionen "Skuld från arkiverade rapport-dokument" ovan) | — |

---

## Klart, säkert, bockat av

* `master` på commit `9249a0994`
* 1214/1214 tester gröna
* `npm run typecheck` clean
* `npx eslint` clean på all touched code
* Inga merge/rebase pågår
* Inga oväntade `D`/`??`-filer på min sida
* Användarens lokala edits (`.cursor/settings.json`, `.markdownlintignore`, `drizzle.config.ts`, `src/FIXA.txt`, `version-777eaba7.zip`) lämnade orörda
