# Builder — generering, modeller, prompt och SSE

**Senast uppdaterad:** 2026-03-27

## Modellbanor (UI ↔ API)

Tre **lanes** + flaggor (detalj + mermaid i arkiv: `builder-model-routing-and-trace.md`):

1. **Byggmodell (model lane)** — `fast` | `pro` | `max` | `codex` | `anthropic` — styr **själva generation/refine-streamen**.
2. **Produkt-/promptlane** — modell för *Förbättra*, *Djup brief*, m.m. (`/api/ai/chat`, `/api/ai/brief`).
3. **Polish** — billig omskrivning av promptfältet (`Skriv om`, `SAJTMASKIN_POLISH_MODEL`).
4. **Resonemang (`Thinking`)** — metadata/reasoning i generationen, **inte** en tredje modellbana i samma bemärkelse.

**Anthropic-jämförelse** — preset som linjerar build + produktlane mot Anthropic.

Primär kod: `BuilderHeader.tsx`, `useBuilderState.ts`, `usePromptAssist.ts`, `src/lib/models/catalog.ts`, `selection.ts`, stream routes under `src/app/api/v0/chats/...`.

## Promptlager och träd

- **Statisk kärna** + dynamisk kontext (scaffold, brief, tema, KB) byggs i `system-prompt.ts` m.m.
- **Prompt tree** (alla lager och parametrar): se arkiv `prompt-tree.md` och kod: `config/prompt-static/`, `codegen-static-prompt.json`.

## SSE / stream-scope (W3)

Builder **egen motor** använder SSE på engine-routes — det är **kanon** för chat/generation. Övriga SSE-ytor (admin, observability) är **inte** samma backlog som W3; K-009 är stängd — nya behov = ny planrad (tidigare `own-engine-sse-scope.md` i arkivet).

## Generationsloop och felminne

- Efter stream: `finalizeAndSaveVersion`, autofix-pipeline, ev. kvalitetsgrind — se `generation-loop-and-error-memory.md` i arkivet.
- **Agentlogg** / replay av fel: `runtime-lane-refactor-and-log-viewer.md` i arkivet.

## UX-kontrakt och projektinställningar

- **Preview/iframe-kontrakt** (toast, laddning, demoUrl): `builder-ux-contracts-and-preview.md` i arkivet + `PreviewPanel.tsx`.
- **Projektfrågor / inställningar** som styr builder: `project-settings-and-builder-questions.md` i arkivet.

## Meritmind / särskilda flöden

Om du letar efter domänspecifika byggflöden, se `meritmind-build-flows.md` i arkivet.

## Snabb felsökning

- Fel route eller modell: spåra `selectedModelTier` + stream route i nätverkspanelen.
- Trace overlay: `model_trace_overlay.py` / env som beskrivs i [`docs/ENV.md`](../ENV.md).
