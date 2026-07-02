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

Typisk ordning:

1. parse/extract files
2. merge mot scaffold eller tidigare version
3. skydda scaffold-owned paths
4. apply dossier verbatim policy
5. mekanisk autofix
6. LLM-fix endast när mekanik inte räcker
7. preflight och quality gate
8. persist version
9. starta eller patcha preview
10. emit events/status

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
| F2 / `design` / `fidelity2` | Design-preview och snabb iteration | designPreview |
| F3 / `integrations` / `fidelity3` | Integrationer, build, deploybarhet | integrationsBuild |

F3 ska triggas explicit, t.ex. via finalize-design-flöde. Prompten ska inte auto-promota till F3 bara för att den nämner Stripe, auth eller databas.

## Fast Edit Lane

Fast Edit Lane är inte en follow-up-codegen. Den är deterministisk och skapar en immutable minor-version från exakta fil-/inspectorändringar.

- Ingen LLM.
- Ingen scaffold rematch.
- Ingen dossier selection.
- Försöker patcha live preview; fallback är full preview start.
- Ska inte köras på F3/integrations-versioner.

Kodankare: `src/lib/gen/quick-edit/`.
