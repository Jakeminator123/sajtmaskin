---
status: active
owner: unassigned
created: 2026-07-27
topic: Restlista — små, oberoende svansar som blev kvar när fyra nästan-levererade planer konsoliderades. R1–R4 + R6 levererade 2026-07-28 (#639); kvar är env-scope i export, F3-observation, dossier-beteendetester, review-freshness och single-canary
source: Kodverifiering 2026-07-27 mot master `3b419115` av fyra read-only-agenter. Ersätter svansarna i de raderade planerna 2026-07-13-builder-status-ui-declutter.md, 2026-07-13-anvandarsajt-env-konsolidering.md och 2026-07-13-stabilisering-verify-f3-doman-plan.md (§ 6, § 7, PR 4) — kärnan i de tre är levererad och indexerad i ../avklarat/README.md
---

# Restlista: builder-UI, F3-scope och env-klarhet

Varje rad här är **liten, oberoende och färdigutredd**. Inget i listan väntar på
ägarbeslut. Ta en eller flera i samma PR — de delar inte kod och behöver ingen
inbördes ordning.

De kommer från fyra planer vars kärna är levererad. Kärnleveranserna finns som
rader i [`../avklarat/README.md`](../avklarat/README.md); bara resterna lever
här.

**Levererat 2026-07-28 (#639):** R1, R2, R3, R4 och R6 — se
[`../avklarat/README.md`](../avklarat/README.md) för raden och git för diffen.
Raderna nedan är de som återstår.

## Restrader

| # | Rest | Ägarfil (kodverifierad 2026-07-27) | Åtgärd |
|---|---|---|---|
| R5 | `.env.local` faller tillbaka till hela dossier-katalogen | `project-scaffold.ts:688-689` (`selectedKeys === undefined`) | Ta bort fallbacken när alla vägar trådar scope |
| R7 | Ingen koppling från observerad F3-körning till dess kravlista | saknas (`capture-and-triage`-todo från stabiliseringsplanen) | Knyt observerad 412 till `chatId`/`versionId`/`missingByIntegration` |
| R8 | Inga beteendetester per Kopplad dossier | saknas — bara manifest-/validate-/select-tester | Mock mountar utan krasch per hard-dossier + aktiverings-E2E (dossier etapp 7.3-residual) |
| R9 | `merge:ready` invalideras inte av ny botkommentar | `review-window.yml:12-22` väntar på botar men bär ingen SHA; sign-off-format i `pr-merge-review-gate.mdc:58-65` | Sign-off bär head-SHA + timestamp; ny botkommentar efter sign-off tar bort labeln |
| R10 | Single-canary aldrig körd | saknas | En prod-kontroll: Byggblock-val → F2 → follow-up → F3 → release-status |
| R11 | Ownership-kontraktet är instruktion, inte grind | `dossiers.ts` (`renderCapabilitySurfaceOwnership`) instruerar; `finalize-merge.ts` kan inte radera en LLM-byggd konkurrent | **Ägarbeslut** (se detalj nedan): låt modellen deklarera ersatta paths och radera dem i finalize, eller acceptera prompt-prevention + Advisory som slutläge |

## Detaljer där raden inte räcker

### R5 — precondition är **inte** uppfylld (kodverifierat 2026-07-28)

Åtgärden säger "ta bort fallbacken när alla vägar trådar scope". Det gör de inte:
`buildExportableProject`s verbatim-gren anropar `buildPlaceholderEnvLocalBody()`
**utan** options (`build-exportable-project.ts:97`), så `selectedKeys` är
`undefined` där. Tar man bort fallbacken nu förlorar en importerad repo utan egen
`.env.local` hela placeholder-kuvertet, och preview↔verify-pariteten som Codex P2
på #594 införde bryts. Trådningen genom export/verify-vägen måste komma först.

### R5 — angränsande backlog-rad

`BUG-SWARM-BACKLOG.md` fick 2026-07-27 en P3-rad om att `resolvePreviewEnvLayers`
seedar **hela** placeholder-katalogen (56 nycklar) för varje design-preview. Det är
ett annat lager än R5 (som gäller `.env.local`-scaffoldingen), men samma tema: vi
seedar mer env än sajten använder. Tar du R5, läs den raden först — de kan visa sig
vara en leverans.

### R11 — varför den inte är en fix utan ett beslut

Dossier/UI-ownership-planen levererades 2026-07-28 (#640) som prompt-kontrakt plus
en Advisory som gör ett kvarlämnat anrop upptäckbart — se
[`../avklarat/README.md`](../avklarat/README.md) § Dossier/UI-ownership. Det som
återstår är enda halvan pipelinen inte kan garantera i dag: **att faktiskt ta bort
en konkurrerande yta modellen byggde i en tidigare runda.**

Kodläget: `mergeVersionFilesWithWarnings` (`version-manager.ts`) lägger föregående
version som bas och låter nya filer skriva över den, så en fil som inte re-emitteras
lever vidare. Enda deterministiska raderingsvägen är
`removeExplicitlyRemovedDossierFiles` (`finalize-merge.ts`), som bara släpper
**dossier-ägda** paths för dossiers användaren uttryckligen tagit bort. En
LLM-byggd `app/api/ai-chat/route.ts` matchar ingen av dem.

De två vägarna, och varför de är ett ägarbeslut:

| Väg | Innebär | Risk |
|---|---|---|
| Modellen deklarerar ersatta paths (t.ex. ett `REPLACES:`-direktiv som finalize raderar) | Nytt **utdataprotokoll** mellan modell och finalize | En felaktig deklaration raderar användarens filer — dataförlust, inte bara brus |
| Acceptera prompt-prevention + Advisory | Ingen ny mekanik | En envis modell kan fortfarande lämna två ytor; vi ser det i diagnostiken i stället för att stoppa det |

Enligt `workflow.mdc` pausar en agent vid arkitekturbeslut och möjlig dataförlust,
så valet ligger hos ägaren. Backlog-raden är omtriagerad M#dchat1.

### R9 — avgränsning

Detta är process, inte produkt. Implementeras som lättviktigt checkjobb eller
utökning av `review-window.yml`, och speglas i
[`pr-merge-review-gate.mdc`](../../../.cursor/rules/pr-merge-review-gate.mdc).
Inget nytt governance-lager (jfr `project-phase-priorities.mdc`).

## Verifiering

| Rest | Minsta verifiering |
|---|---|
| R5 | `npm run typecheck` + `npm run test:followup-contract` + export/verify-svitarna |
| R8 | nya tester gröna + `npx vitest run` på berörd svit |
| R7, R10 | prod-observation, ingen kodgrind |
| R9 | workflow-körning på en test-PR |
| R11 | ägarbeslut först; vid raderingsvägen krävs test som visar att bara deklarerade paths försvinner |

## Explicit icke-mål

- Ingen ny env-yta, ingen återinförd `ProjectEnvVarsPanel`.
- Ta inte bort `/readiness`-datan eller `canDeploy`-grinden — bara UI-presentationen.
- Ingen bred verify-refaktor; innehållsrevisionen har egen plan
  ([`2026-07-25-innehallsrevision-verifieringskvitton.md`](2026-07-25-innehallsrevision-verifieringskvitton.md)).
