---
status: avklarad
owner: unassigned
created: 2026-07-08
archived: 2026-07-09
archived_note: "Levererad via PR #456 (mergad 2026-07-09): alla sex lanes (A1–A4 ReleaseGate-lås/domänlås/deploy-repair/inspectorUrl, B RAG-härdning, C terminologi) + kompletteringspass A#12/A#5/A#3. Bug-post-check: 5 fynd (#1 fixad, #2–#5 loggade som BB#deploy2–5). Flyttad active→avklarat 2026-07-09."
topic: Publicera/deploy + F3-integrationer — enklare och mer stringent, låst mot scheman/policies/beslut
source: Kodläsning via 6 read-only subagenter + orkestratörens egen verifiering (file:line nedan)
---

# Publicera-stringensplan

## TL;DR

Publicera-vägen (`POST /api/v0/deployments`) har en **kontroll-lucka**: den blockerar
bara en version vars `verification_state === "failed"`, men en version som **aldrig
körde full ReleaseGate** (`typecheck + build + lint` på VM) kan ändå publiceras. När
Vercel-bygget sedan failar finns **ingen** LLM-repair/redeploy-loop (den finns bara i
preview/quality-gate-vägen). Det är därför "byggen går upp i varsel och saknar kontroll".

Den här planen gör publicera **stringentare** genom att (1) låsa deploy bakom en
**bevisat grön ReleaseGate**, (2) spegla preview-repair-loopen till deploy, (3) låsa
Vercel-projektnamn efter domänkoppling, (4) enhetliga fel-logg-/RAG-vägarna, (5) rätta
terminologi-drift som skymmer sanningen, och (6) exponera Vercel-loggar + felstate i UI.

Exekvering sker via subagenter enligt "Exekveringsmodell" nedan, med orkestratören som
granskare. Allt landar via **en PR mot `master`** (bug-post-check på skyddade paths krävs).

## Leveransstatus (2026-07-08)

Alla sex lanes levererade på grenen `feat/publicera-stringens`. Orkestratören granskade
varje lane (diff + riktade tester + typecheck) och rättade småfel.

| Lane | Modell | Commit-typ | Verifiering | Not |
|---|---|---|---|---|
| C terminologi/docs | Composer | `docs(rag)` | diff-granskad | Composer felrapporterade "0 ändringar" — innehållet ändå korrekt |
| B RAG-härdning | Sonnet 5 | `feat(rag)` | 88 tester | additivt/best-effort |
| A1 ReleaseGate-lås (Ö1) | Fable 5 → **Opus 4.8** | `feat(deploy)` | 52 tester | Fable 5 kapad; kördes på Opus |
| A2 projektnamn-lås (Ö2) | Opus 4.8 | `feat(deploy)` | 37 tester | — |
| A3 deploy-repair (Ö3) | Opus 4.8 | `feat(deploy)` | 148 tester | orkestrator-fixade 4 typfel (bare-return + closure-narrowing) |
| A4 inspectorUrl + felstate | Sonnet 5 | `feat(deploy)` | 4 tester | ren presentation |

### Kompletteringspass (2026-07-09, pre-merge-granskning)

Audit-svärm + granskningsagenter hittade tre glapp som stängdes på grenen före merge:

| Fynd | Fix | Verifiering |
|---|---|---|
| A#12: readiness visade `canDeploy:true` medan deploy-API:t 409:ar ogrön F3 (Ö1 fanns bara server-side) | Readiness speglar nu `resolveDeployReleaseGate` via `buildReleaseGateBlocker` (`readiness-payload.ts`); Publicera-knappen disablas medan readiness laddar (`BuilderShellContent.tsx`) | 5 nya tester i `readiness-payload.test.ts` |
| A#5/BB#deploy3: felstate + repair-knapp (Ö3/Ö4) försvann vid sidladdning — `activeDeploymentId` hydrerades aldrig | `useDeploymentHistory` exponerar `latestFailedDeployment` (nyaste rad = `error`); controllern hydrerar `activeDeploymentId` vid mount | 2 nya tester i `useDeploymentHistory.test.ts` |
| A#3: deploy-SSE + single-GET auth:ade v0-first → 404 för own-engine-chattar (hela deploy-status-strömmen död i huvudflödet) | Engine-first auth med legacy-fallback i `[deploymentId]/events/route.ts` + `[deploymentId]/route.ts`, samma mönster som deployments-GET; Redis-subscriber släpps nu alltid vid stream-slut (VADE-fynd #443) | 4 nya tester i `events/route.test.ts` |

BB#deploy3-raden i backloggen flyttas till arkivet vid merge (fixad här). BB#deploy2/4/5 kvarstår öppna.

**Bug-post-check (bugbot-subagent):** 5 fynd. #1 (dubbelskriven deploy-fel-logg) **fixad**
(single-writer via `emitVersionErrorLogs`, commit `abf38b6a4`). #2–#5 **loggade** i
[`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md) som `BB#deploy2–5` (reload-persistens,
implicit domän-orphan, webhook-vs-poll-dubbellogg, orelaterad `repair_available`-no-op). Inga P0.

**Kända begränsningar (baseline, ej denna gren):** två pre-existerande typecheck-fel på master
(`.next/types/validator.ts` stale artefakt, `src/lib/projects/thumbnail-capture.ts` saknar
`@sparticuz/chromium` i `package.json`).

## Verifierade fynd (source of truth)

| # | Fynd | Bevis (file:line) | Följd |
|---|---|---|---|
| V1 | Deploy blockerar bara `verification_state === "failed"` | `src/app/api/v0/deployments/route.ts:456-465` | En obyggd/ej-verifierad version kan publiceras |
| V2 | Vercel bygger; ingen lokal `npm install/build/start` i deploy | `route.ts:743-748`, `src/lib/vercelDeploy.ts:102-119` | Coach hade rätt |
| V3 | `deploymentDelivered=true` efter accept → ingen refund vid senare build-fail | `route.ts:749-751`, `853-859` | Coach rätt |
| V4 | Ingen LLM-repair/redeploy-loop efter Vercel-build-fel | webhooks/vercel + events polling; ingen repair-import i deploy | Coach rätt (störst lucka) |
| V5 | Pre-deploy-fix är **mekanisk/deterministisk**, inte LLM | `route.ts:527-530`, `92-334` | Coach **fel** här |
| V6 | RepairGate skickar riktad bunt, default **16 filer** (inte hela repot) | `src/lib/gen/verify/repair-loop.ts:420-421`, `710` | Coach **fel** här |
| V7 | Domän kräver publicerad sajt (409); deployment vinner över `app_projects`-cache | `src/lib/domains/resolve-vercel-project.ts:53-66` | Orphan-risk vid namnbyte kvarstår |
| V8 | `useErrorLogRag` på utom test; kommentar säger fel "Vector RAG" (är TF-IDF) | `src/lib/config.ts:449`, `:440` | Terminologi-drift |
| V9 | RAG-producent smal (bara `verifier-phase.ts`); kallstart kan ge tomt | (RAG-spårets rapport) | Begränsad prod-täckning |
| V10 | SEO är **inte** dossier — tvåspårig release-feature (brief + deploy-injektion) | `src/lib/gen/scaffolds/seo-defaults.ts`, `route.ts:661-689`, `site-brief-generation.ts:146` | Klassning: feature, ej dossier |

## Målbild

1. **Publicera kan aldrig ske på en overifierad version.** Deploy kräver ett *bevis* på
   grön ReleaseGate för exakt den `versionId` som deployas.
2. **Publicera är lika självläkande som preview.** Vercel-build-fel → samma repair-loop.
3. **Inget ändras utan förhandsbeslut** — kontrakt låses mot schema/policy/test (se nästa avsnitt).
4. **En sanning per signal.** Fel-loggar och RAG går via en väg, inte fem.

## Låsningar (mot scheman/policies/beslut)

Detta är kärnan i din "stringens"-önskan — saker som blir *omöjliga att ändra av misstag*:

| Lås | Mekanism | Var |
|---|---|---|
| Deploy-gate | Kontrakt-test: `deployments/route` MÅSTE avvisa version utan grön ReleaseGate-bevis | ny `route.test.ts`-case + typad guard |
| ReleaseGate-tiers | `config/ai_models/manifest.json` `qualityGateTiers` = enda källa; Zod-validering vid load | `src/lib/gen/verify/quality-gate-checks.ts` + manifest-schema |
| Release-bevis | DB-fält/enum på `engine_versions` (t.ex. `release_gate_state`) + zod på API-svar | migration + `src/lib/db/schema.ts` |
| Deploy-repair-policy | Policy-flagga (default-beslut dokumenterat) styr om auto-redeploy körs | `config/env-policy.json` + `FEATURES` |
| Domän↔projekt | Projektnamn låst efter domänkoppling; namnbyte kräver explicit ompekning | guard i `route.ts` + test |

## Exekveringsmodell (agenter, modeller, ordning)

**Filägande styr parallellitet.** Lanes med disjunkta filer körs parallellt; delade filer sekventiellt.

| Lane | Uppdrag | Modell (din skala) | Kör | Beroende |
|---|---|---|---|---|
| **A1** | #1 Lås deploy bakom grön ReleaseGate (bevis + guard + kontrakt-test) | **Fable 5** (extremt tufft: kontraktsändring) | sekventiellt i Lane A | — |
| **A2** | #3 Lås Vercel-projektnamn efter domänkoppling (+ ompekning) | **Opus 4.8 thinking** | efter A1 | delar `route.ts` |
| **A3** | #2 Deploy-repair-loop vid Vercel-build-fel (spegla preview) | **Fable 5** (extremt tufft: ny loop + credits/idempotens) | efter A2 | delar deploy-status |
| **A4** | #6 Exponera `inspectorUrl` + tydlig felstate i header | **Sonnet 5** | efter A3 | delar deploy-UI |
| **B** | #4 Enhetliga fel-logg-vägar + bredda RAG-producent + värm index | **Sonnet 5** | parallellt m. Lane A | disjunkt (logging/rag) |
| **C** | #5 Terminologi-fix (Vector RAG→TF-IDF), stale env-ref, glossary (SEO=feature) | **Composer** | parallellt m. A/B | disjunkt (docs/kommentarer) |

> Composer = billig, Sonnet 5 = medel, Opus 4.8 thinking = bästa tillåtna, Fable 5 = enbart för de två svåraste kontraktsändringarna (A1, A3).

**Vågschema:**

- **Våg 1 (parallellt):** starta A1 + B + C samtidigt.
- **Våg 2:** A2 startar när orkestratören granskat/godkänt A1.
- **Våg 3:** A3 efter A2-granskning. **Våg 4:** A4 efter A3-granskning.
- B och C mergas in i grenen så fort de är granskade (blockerar inte Lane A).

**Granskningsgrind (orkestratörens jobb):** efter varje lane —
`npm run typecheck` + riktad `npx vitest run` + `npm run lint` på berörda filer,
läs diff, rätta småfel själv (enradsfixar, namn, saknad test-assert). Vid större
avvikelse: skicka tillbaka lanen till samma agent med `resume`.

## Agent-uppdrag i detalj

### A1 — Lås deploy bakom grön ReleaseGate (Fable 5)
- **Mål:** `POST /api/v0/deployments` avvisar (409) en version som saknar bevis på grön
  `integrationsBuild`-gate. `verification_state === "failed"`-checken behålls men utökas.
- **Filer:** `src/app/api/v0/deployments/route.ts`, `src/lib/gen/verify/quality-gate-checks.ts`,
  ev. migration + `src/lib/db/schema.ts` (release-bevis), `route.test.ts`.
- **Acceptans:** kontrakt-test som failar om guarden tas bort; F2-preview opåverkad;
  befintliga deploy-tester gröna; dokumenterat i `docs/architecture/llm-pipeline.md`.
- **Icke-mål:** ändra F2/preview-gaten; ändra credits.

### A2 — Lås Vercel-projektnamn efter domänkoppling (Opus 4.8 thinking)
- **Mål:** när en domän är kopplad låses projektnamnet; ompublicering med nytt namn
  antingen blockeras eller pekar om domänen automatiskt (beslut: se Öppna beslut #Ö2).
- **Filer:** `src/app/api/v0/deployments/route.ts` (namn-reuse `736-766`), `src/lib/domains/`,
  `src/lib/db/services/`, tester.
- **Acceptans:** test som bevisar att domän inte kan bli orphan vid namnbyte.

### A3 — Deploy-repair-loop vid Vercel-build-fel (Fable 5)
- **Mål:** vid webhook `deployment.error`/poll-error skapa `deploy_repair_available` och
  köra `runRepairLoop` med Vercel-build-loggen som `buildError`-kontext; idempotent, aldrig
  dubbeldebitering, aldrig oändlig redeploy.
- **Filer:** `src/app/api/webhooks/vercel/route.ts`, `src/app/api/v0/deployments/events/route.ts`,
  `src/lib/gen/verify/server-verify.ts` (återanvänd `build_error_repair`), ny `deploy-repair`-modul, tester.
- **Acceptans:** simulerat Vercel-fel → repair triggas en gång, resultat loggas, credits korrekt;
  policy-flagga styr auto-redeploy (default-beslut #Ö3).

### A4 — Exponera inspectorUrl + felstate (Sonnet 5)
- **Filer:** `src/components/builder/BuilderHeader.tsx`, `useBuilderDeployActions.ts`,
  `useBuilderPageController.ts`, komponent-test.
- **Acceptans:** vid `deploymentStatus === "error"` visas tydlig felruta + länk till Vercel-logg.

### B — Fel-logg/RAG-enhetligande (Sonnet 5)
- **Mål:** en väg till `engine_version_error_logs` (bus-sink), bredda RAG-producent bortom
  `verifier-phase.ts`, värm TF-IDF-index vid boot, fixa "Vector RAG"→TF-IDF i de filer lanen ändå rör.
- **Filer:** `src/lib/logging/error-log-*.ts`, `src/lib/gen/rag/error-log-retriever.ts`,
  `src/lib/logging/event-bus-error-log-sink.ts`, berörda producenter, tester.
- **Acceptans:** cross-tenant-redigering bevaras i prod; test för kallstart/warm.

### C — Terminologi + docs (Composer)
- **Filer:** `src/lib/config.ts` (kommentar), `backoffice/pages/error_log_rag.py`,
  `scripts/dev/next-runner.mjs` (stale `SAJTMASKIN_USE_ERROR_LOG_RAG`), `docs/architecture/glossary.md`
  (SEO = release-feature, ej dossier).
- **Acceptans:** inga kod-beteendeändringar; bara text/kommentar/docs.

## PR-strategi

1. Orkestratören skapar gren från `master` i **separat worktree** (`../sajtmaskin-publicera-stringens`),
   inte i huvudcheckouten (`agent-worktree.mdc`).
2. Alla lanes committar i den grenen; små orkestratör-fixar ovanpå.
3. **Bug-post-check krävs** (skyddade paths: `src/app/api`, `src/lib/gen`, deploy, `migrations`, env):
   `bugbot`-subagent (readonly) enligt `AGENTS.md` review-gate; triagera fynd (fixad/loggad/avfärdad).
4. Verifiering före PR: `npm run typecheck`, `npm run lint`, `npx vitest run` (berörda), ev. `db:schema-drift`.
5. **En PR mot `master`** med sammanfattning per lane + vilken review-väg som användes.

## Beslut (låsta 2026-07-08 av ägaren)

| ID | Beslut | Val |
|---|---|---|
| Ö1 | Deploy-gate (A1) hårdhet | **Hård 409 för F3/integrations**, mjuk (varning) för rena F2-sajter |
| Ö2 | Namnbyte efter domänkoppling | **Blockera** med tydligt felmeddelande (enklare, säkrare) |
| Ö3 | Efter lyckad deploy-repair | **Manuell knapp "Publicera om med fix"** (ingen auto-redeploy → ingen loop-kostnad) |
| Ö4 | PR-fasning | **Fasat i en gren:** Lane C + B committas först (lågrisk, kan brytas ut), sedan Lane A sekventiellt. Landar via **en PR mot `master`** |

Dessa val är nu **kontrakt** för agent-uppdragen nedan — A1 ska tvinga hård gate endast för
`lifecycle_stage === "integrations"`, A2 ska blockera (ej ompeka), A3 ska exponera manuell
re-publicera-knapp (auto-redeploy default av).

## Risker

- Deploy-gaten (A1) kan blockera sajter som idag går igenom → mät mot prod-historik före hård tvingning (Ö1).
- Deploy-repair (A3) rör credits/idempotens → högsta testkrav.
- Delade filer i Lane A tvingar sekventiell körning → längre ledtid; värt det för säkerhet.
