# Handoff — sajtmaskin 2026-04-20 (efter 11 etapper)

> **Syfte:** Snabb orientering för en ny agent (Cursor-session, cloud-agent, eller annan AI-agent) som ska fortsätta arbetet på sajtmaskin. Läs detta först. Komplettering till `docs/plans/active/Kvarvarande-uppgifter.md` (kanonisk öppen-punkt-lista) och `docs/reports/audit-2026-04-20-komplexitet-vs-varde/` (45-punkts-audit som denna session arbetade igenom).

---

## TL;DR

* **11 etapper levererade 2026-04-20 (A-K).** ~22 commits på `master`. 1214/1214 tester gröna.
* **22 av 43 audit-punkter klara** (~51%). Tier S = 100%, Tier A = 75%, Tier B = 38%.
* **`master` är ren** — `git status` visar bara användarens lokala edits (`.cursor/settings.json`, `.markdownlintignore`, `drizzle.config.ts`) + 2 untracked filer (`src/FIXA.txt`, `version-777eaba7.zip`).
* **3 stora arbetsspår är stängda:** Tier S (alla snabba quick-wins), P28 (alla 7 pre-existing test-failures), P29 (`/api/v0/chats/**` helt borttaget och konsoliderat till `/api/engine/chats/**`).
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
| 1 | **`Source_Sans_3`-violation i `editorial-serif.json`** | 5 min | Produktbeslut — lägg till i `google-font-registry.ts` ELLER byt variant. Verifiera med `npm run typography:validate-pairings` |
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

## FIXA.txt — separat skuld-dokument (icke-adresserat)

`src/FIXA.txt` listar **18 buggar i genererad output (A1-A18) + 9 system-buggar (B1-B9) + 4 preview-issues (C1-C4) + 2 docs-uppdateringar (D1-D2)** från en faktisk site-generering (`version-777eaba7`, Hotellet i Spanien). Det var ursprungligen "parallel-agentens scope" enligt filen själv — **ingen av dem är direkt adresserad denna session** (möjligen A7 indirekt via Wave 2:s motion-reduce-trap-check och B7 via Wave 3).

**Toppen-5 i FIXA.txt enligt dess egen prioritering:**

1. **C1** — HMR/Turbopack-regression i preview-iframen (console-spam ~1s)
2. **B1** — DB pool kraschar 3 endpoints samtidigt
3. **A3** — `source.unsplash.com` URL:er (domänen död sedan 2024)
4. **A1** — `booking-form-state` dead-stub-fil följer med varje version
5. **A2** — Lucide `Circle as BedDouble` — fel-ikon i hero

Detta är **utomstående bugfixar** för en ny session att överväga om de vill prioritera UX-quality för faktiskt genererade siter snarare än arkitektonisk konsolidering.

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
| `src/FIXA.txt` | **Separat skuld-dokument** (utomstående bugs i genererad output) — ej kanonisk, ej kompletterad denna session. |
| `imorgon.txt` (root) | Tidigare arbetsdagsanteckning från en annan agent — historisk, ej kanonisk. |

---

## Klart, säkert, bockat av

* `master` på commit `9249a0994`
* 1214/1214 tester gröna
* `npm run typecheck` clean
* `npx eslint` clean på all touched code
* Inga merge/rebase pågår
* Inga oväntade `D`/`??`-filer på min sida
* Användarens lokala edits (`.cursor/settings.json`, `.markdownlintignore`, `drizzle.config.ts`, `src/FIXA.txt`, `version-777eaba7.zip`) lämnade orörda
