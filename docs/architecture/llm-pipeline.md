# LLM-pipeline

Detta är den enda architecture-docen som beskriver generationens körflöde. Detaljerade enumvärden, fält och callsites läses från kod.

## En rad

```txt
user prompt -> intent/brief -> resolveOrchestrationBase -> BuildSpec -> Dynamic Context + Core Rules -> codegen -> finalize -> preview/status
```

## Fas 1 — Intent och input

Målet i Fas 1 är att bygga ett rent underlag till orkestreringen.

- Raw prompt är användarens text.
- Init kan få Deep Brief och variant pre-match.
- Follow-up får Snapshot-Brief och tidigare orchestration snapshot.
- Build intent, generation mode, follow-up intent och requested capabilities ska bestämmas innan prompten byggs.

Kodankare:

- `src/lib/api/engine/chats/create-chat-stream-post.ts`
- `src/lib/api/engine/chats/chat-message-stream-post.ts`
- `src/lib/gen/orchestrate.ts`
- `src/lib/gen/follow-up-intent-types.ts`
- `src/lib/own-engine/session/own-engine-build-session.ts`

## Fas 2 — Orkestrering och codegen

`resolveOrchestrationBase()` är central fan-in för generationens runtimebeslut.

Den ska samla:

- scaffold och scaffold variant
- route plan
- pre-generation contracts
- capabilities och dossier selection
- BuildSpec
- UI recipes och toolkit-signaler
- freeze/floor-regler för follow-up

Efter base steget skapas Dynamic Context och sedan System Prompt:

```txt
Core Rules + separator + Dynamic Context = system message
```

User prompt ska vara user message, inte dupliceras i Dynamic Context.

Kodankare:

- `src/lib/gen/orchestrate.ts`
- `src/lib/gen/build-spec/`
- `src/lib/gen/system-prompt/`
- `src/lib/gen/scaffolds/`
- `src/lib/gen/scaffold-variants/`
- `src/lib/gen/dossiers/`
- `config/prompt-core/`

## Fas 3 — Finalize, verifiering och preview

Efter codegen ska output bli en körbar version.

Typisk ordning i runtime:

1. codegen-output samlas till kandidat-innehåll.
2. Normalize (kod: url-expand + autofix) expanderar media-URL:er och kör
   deterministiska fixers före LLM.
3. syntax/esbuild körs; när syntax är ren körs warm-tsc och vid behov warm-eslint.
4. deterministisk diagnostikdriven import-repair
   (`autofix/deterministic-import-repair.ts`: kända imports, egna komponenter,
   React/same-module-dedupe + re-check) körs före LLM på warm-tsc-residual.
5. RepairGate (kod: `runLlmRepairGate` + `RepairLedger`) används endast för
   residual som Normalize och statiska kontroller inte löste. Samma ledger
   dedupe:ar syntax-, warm-tsc-, warm-eslint-, verifier- och preflight-repair
   inom en finalize-run.
6. verifiern körs riskstyrt: `safe_fixes_only` kan hoppa över verifiern när
   grundpolicyn redan säger `run`, men aldrig vid 3D-signal; `risky_fixes`
   behåller verifier-täckning.
7. parse/merge applicerar scaffold-skydd, dossier verbatim policy och
   follow-up-bevarande mot tidigare version.
8. preflight kontrollerar preview-/verification-blockers före persist.
9. persist sparar assistant-rad, version, snapshot, preflight-loggar,
   telemetry och event/status-underlag.
10. preview startas, patchas eller resyncas mot den persistade versionen.
11. RenderGate (kod: `designPreview` quality gate) kör F2 render/preview-kontroll:
    typecheck är Advisory utom render-risk-koder.
12. ReleaseGate (kod: `integrationsBuild` quality gate) kör F3 strikt
    typecheck + build + lint + env-krav när användaren explicit går till F3.
13. promote, `repair_available`, Blocker eller Advisory-status skrivs utifrån
    gate-resultat och promote-guard.

Viktig ordningsregel: Normalize, verifier och preflight ligger före persist.
VM-gaten (RenderGate/ReleaseGate) ligger efter persist och arbetar på den
sparade versionen.

Kodankare:

- `src/lib/gen/stream/finalize-version/`
- `src/lib/gen/stream/finalize-merge.ts`
- `src/lib/gen/autofix/`
- `src/lib/gen/verify/`
- `src/lib/gen/preview/`
- `src/lib/logging/`

## Follow-up-regler

Follow-up är en deltaoperation. Standardläget är bevarande:

- scaffold fryses om inte redesign uttryckligen låser upp matchning
- variant fryses för att undvika visuell drift
- routes är ett floor, inte ett ceiling
- capabilities får växa men ska inte tyst tappas
- high-value UI-element ska inte tappas utan tydlig anledning

Undantag: clear-redesign och explicita borttagningar.

## F2/F3-regler

| Läge | Syfte | Gate |
|---|---|---|
| F2 / `design` / `fidelity2` | Design-preview och snabb iteration | RenderGate (kod: `designPreview`) |
| F3 / `integrations` / `fidelity3` | Integrationer, build, deploybarhet | ReleaseGate (kod: `integrationsBuild`) |

F3 ska triggas explicit, t.ex. via finalize-design-flöde. Prompten ska inte auto-promota till F3 bara för att den nämner Stripe, auth eller databas.

### F3-förslagsrunda och approval-runda

När en F3-generation slutar tool-only (`suggestIntegration` utan kod) parkas chatten i awaiting-input med en persisterad F3-continuation-marker (`f3-continuation.ts`). Markern bär signalerade providers och en rundräknare. Svaret klassas server-side:

- **Godkänn** ärver F3 och kör en *approval-runda* som tvingar kodgenerering: `suggestIntegration`/`requestEnvVar` dras ur tool-setet, ett byggdirektiv med graceful not-configured-fallback injiceras i prompten, och godkända providers mappas till dossier-capabilities (t.ex. stripe → payments) så hard-dossierns verbatim-mallar väljs in via `selectDossiersForRequest`.
- **Avvisa** konsumerar markern och avslutar F3 lugnt med ett bekräftelsemeddelande — ingen generation körs.
- **Loop-breaker:** max en upprepad tool-only-runda per F3-kick. Andra upprepningen avslutar F3 med ett terminalt meddelande utan ny marker.

Tier-3-stub-placeholders (`41-tier3-stub-placeholders.env.txt`-värden i `.env.local`/`env.example`) är inte integrationsbevis: de filtreras ur både `detect-integrations` och follow-up-filkontexten (`stub-env-filter.ts`).

## Fast Edit Lane

Fast Edit Lane är inte en follow-up-codegen. Den är deterministisk och skapar en immutable minor-version från exakta fil-/inspectorändringar.

- Ingen LLM.
- Ingen scaffold rematch.
- Ingen dossier selection.
- Försöker patcha live preview; fallback är full preview start.
- Ska inte köras på F3/integrations-versioner.

Kodankare: `src/lib/gen/quick-edit/`.
