# Glossary — Sajtmaskin

Kanonisk ordlista för termer som lätt blandas ihop eller används i flera docs.

Kod är source of truth. Behöver du exakt kodsymbol, enumvärde eller pipeline-detalj:
grepa koden eller läs respektive arkitekturdokument.

Snabbtabell: `.cursor/rules/terminology.mdc`
Signalägare: `docs/schemas/orchestration-signal-contract.md`
Pipeline: `docs/architecture/llm-pipeline.md`

---

## Kärnflöde

| Term | Kort |
|---|---|
| own-engine | Sajtmaskins egen codegen-väg för React/Next.js, inte legacy v0-stream. |
| Init / Create-chat | Första riktiga genereringen i en chat. Kör full orkestrering från prompt till version. |
| Follow-up | Ändring på befintlig version. Återanvänder/fryser scaffold, variant och routes om inte redesign uttryckligen begärs. |
| Deep Brief | Init-brief: LLM-genererat strukturerat site-brief-objekt. |
| Snapshot-Brief | Kompakt follow-up-brief rehydrerad från tidigare `orchestration_snapshot.briefSummary`. |
| Plan Mode | Planner-LLM returnerar plan/JSON, inte sajtkod. |
| Clarification | Agenten ställer motfråga i stället för att generera. |

---

## Orkestrering och prompt

| Term | Kort |
|---|---|
| Scaffold | Runtime-startpunkt för generering. |
| Scaffold Variant | Visuellt uttryck inom scaffold: typografi, motif, theme tokens och prompt hints. Låses normalt på follow-up. |
| Variant-Lock | Deterministiskt variantval från init återanvänds på follow-up för att undvika drift. |
| Dossier | Återanvändbar capability-modul som kan injiceras i codegen-prompten. |
| Capability | Intent/capability-id som kan mappas till dossier, t.ex. `auth`, `payments`, `visual-3d`. |
| Route Plan | IA/ruttlista för projektet. |
| Contract Plan | Auth, payment, database, env vars och integrations före generering. |
| BuildSpec | Runtime-policy för generering: scope, kvalitet, preview-policy, verifiering, tokenbudget och route realization. |
| Dynamic Context | Request-specifik promptdel byggd från scaffold, variant, brief, routes, contracts, dossiers och guidance. |
| Core Rules | Statiska produktregler i `config/prompt-core/*.md`. |
| System Prompt | Core Rules + Dynamic Context. |
| Generation Package | Kanonisk fan-in: system prompt, dynamic context, pruning och lineage/hash. |
| shadcn primitive | Lokal `src/components/ui/*`-komponent. |
| UI Recipe | Request-specifik shadcn registry-referens med metadata/dependencies/kompakta utdrag. |

---

## Preview, F2/F3 och versioner

| Term | Kort |
|---|---|
| Preview / VM / `preview_host` | Live-preview via VM/runtime. Säg inte “sandbox” i ny text. |
| F2 / `fidelity2` | Design/preview-läge. Fokus på render, visuell kvalitet och iteration. |
| F3 / `fidelity3` | Integrationer/build-läge. Explicit steg för auth, payment, databas, env och deploybar build. |
| LifecycleStage | `"design"` för F2 eller `"integrations"` för F3. |
| Preview ID-set | `appProjectId`, `chatId`, `versionId`, `previewSessionId`, `previewUrl`, `runId`. |
| Fast Edit Lane | Deterministisk snabbredigering utan LLM för exakta kod-/inspector-ändringar. |
| Preview patch / hot patch | Patchar ändrade filer i levande VM utan full restart när möjligt. |
| Minor-version | Quick-edit-version under major-version, t.ex. `v3.1`. |

---

## Repair, verifiering och status

| Term | Kort |
|---|---|
| Mekanisk autofix | Deterministiska fixers. Säg inte bara “autofix” om LLM kan misstolkas. |
| LLM-fix | Modellbaserad reparation när mekanisk autofix inte räcker. |
| Validate and Fix | Valideringsloop som kan köra mekanisk fix, LLM-fix och revalidering. |
| Finalize | Samlad pipeline som gör genererad output körbar, verifierbar och sparbar. |
| Preflight | Teknisk kontroll inför preview: routes, filer, blockers. |
| Verifier Pass | Hybridgranskning: deterministiska guardrails + read-only LLM-findings. |
| Quality Gate | Pass/fail-gate. F2 och F3 har olika lanes. |
| Repair Loop Core | Delad repair-kärna för server-verify och manuell repair. |
| Repair Available | Repair passerade gate men väntar på explicit accept. |
| EngineEvent / event-bus | Append-only runtime-händelser för versionens livscykel. Exakta typer finns i kod. |
| VersionStatus | UI-projektion av event-bus: fas, blockers, repair, verifier outcome och degradations. |
| VersionDegradationKind | “Works but degraded”-signal. Exakta enumvärden finns i `event-bus-types.ts`. |
| FaultEvent | Läsmodell för historiska fel/fix-källor. Inte samma sak som EngineEvent. |
| false-green | Systemet ser grönt ut trots att runtime/verifiering inte stödjer det. Föredra blocker/degraded. |

---

## Stabilitet och planering

| Term | Kort |
|---|---|
| Stabilitetstester | Kuraterad testlane för buggar och UX-invarianter. Bredare än klassisk regression. |
| Kontraktslager | Schema, policy, regel och beslut/ADR. Låser struktur och ansvar, inte all planering. |
| Beslut / ADR | Kort arkitekturbeslut med motivering. |
| Plan-nivåmodell | Nivå 1 målbild, nivå 2 område, nivå 3 agent-körbar aktivitet. |

---

## Namnskuggor

| Tvetydigt ord | Skriv hellre |
|---|---|
| brief | `Deep Brief` eller `Snapshot-Brief` |
| scaffold | `ScaffoldManifest`, `Scaffold Selection` eller `Scaffold` beroende på kontext |
| context | `Dynamic Context` när det är promptblocket |
| contracts | `Contract Plan` eller `Orchestration Contract` |
| quality gate | `F2/designPreview quality gate` eller `F3/integrationsBuild quality gate` |
| preflight | `Preflight` bara när `runFinalizePreflight()` avses |
| autofix | `mekanisk autofix` eller `LLM-fix` |
| template-library | Undvik. Skriv `Scaffold`, `Mallar-tab` eller `Dossier` beroende på kontext |
| shadcn | `shadcn primitive`, `UI Recipe`, `Scaffold` eller `Dossier` |
| 3D / game | `visual-3d`, `physics-3d` eller `interactive-game` |

---

## Legacy / inte återintroducera

| Skriv inte | Skriv |
|---|---|
| AI Gateway / `AI_GATEWAY_API_KEY` | Direkt provider: OpenAI/Anthropic |
| Vercel Sandbox som primär preview | VM / `preview_host` |
| `demoUrl` | `previewUrl` |
| `simplifiedBriefSchema` / `StructuredBrief` | `siteBriefSchema` / Brief |
| Spec-first-kedjan | Deep Brief |
| Prompt Rewrite / Prompt Polish / Prompt Assist som paraply | Deep Brief, om det är briefen du menar |
| Directives / Directive Cascade | Per-Request Signal Cascade / Core Rules |
| `qualityGateTiers.tier2` / `serverVerify` / `promotion` | `designPreview` / `integrationsBuild` |
| `template-library` runtime-pipeline | Dossier-pipeline |
| `sandbox` generellt | VM / `preview_host` |
