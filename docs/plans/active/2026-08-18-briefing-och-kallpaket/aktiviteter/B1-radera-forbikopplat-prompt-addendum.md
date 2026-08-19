# B1 — radera det förbikopplade prompt-addendumet

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)
Status: öppen PR #1040.

## Problemet

`src/lib/builder/prompt-assist/` innehåller 815 rader som bygger en
"dynamic instruction addendum"-sträng ingen läser, och som duplicerar text
servern redan äger.

Kedjan, verifierad:

1. `src/app/builder/useBuilderPromptActions.ts:173-180` är enda anroparen:

```ts
await generateDynamicInstructions(trimmed, {
  forceShallow: false,
  forceDeepBrief: true,
  skipAddendum: true,
  onBrief: (brief) => { pendingBriefRef.current = brief; },
});
```

Returvärdet tilldelas inte. Endast `onBrief` används.

2. `src/lib/hooks/useInitBrief.ts:162-167` returnerar `""` när `skipAddendum` är
satt. Övriga grenar (rad 64 assist av, rad 73 ogiltig modell, rad 110 ej deep,
rad 182-190 tom brief-addendum, rad 219 fel/timeout) bygger en sträng som
anroparen kastar.

3. `src/lib/gen/guidance-resolvers.ts:8-9` säger själv att detta redan är flyttat:
«Previously these lived in the prompt-assist package and were wired through a
client-side addendum. Now they are server-side only.»

Så motion-, quality-bar-, domän- och palettvägledningen finns i **två** kopior.
Den server-sida (445 rader) når kodgeneratorn via `build-dynamic-context.ts`. Den
klient-sida gör det inte.

4. Kommentaren `runner.ts:42-48` hävdar motsatsen: «that one IS active (used by
`useInitBrief.ts` as fallback when the request misses a brief)». Det är den rad
som fått flera granskningsrundor att tro att det finns en levande fallback.

## Uppgift

Ta bort den förbikopplade vägen och låt brief-hooken returnera en brief i stället
för en sträng.

Krav:

- Radera `runner.ts`, `shared-addendum.ts`, `motion-guidance.ts`,
  `theme-guidance.ts` och `domain-hints.ts` ur
  `src/lib/builder/prompt-assist/`, plus deras export i `index.ts`.
- **Behåll** `formatters.ts` (`formatPrompt` används av
  `src/components/modals/prompt-wizard/prompt-wizard-modal-v2.tsx:12, 452, 510`)
  och `models.ts` (modellrutt/allowlist för brief). Rensa bara de hjälpexporter i
  `formatters.ts` som blir föräldralösa när `runner.ts` är borta — kontrollera med
  grep, ta inte bort på gissning.
- Ändra `generateDynamicInstructions` så att den returnerar briefen
  (`Record<string, unknown> | null`) i stället för en sträng. Då kan `onBrief`,
  `skipAddendum` och `forceShallow` utgå ur `InitBriefOptions`
  (`src/lib/hooks/prompt-assist-types.ts:15`). Behåll den hårda guarden på rad
  57-59 (`forceDeepBrief` är init-only) — den fångar en verklig regression.
- Rätta de tre docs-påståendena: `runner.ts`-kommentaren (försvinner med filen),
  `docs/schemas/llm-role-matrix.md:77` och
  `docs/schemas/orchestration-signal-contract.md:18`.
- Namnbytet i sig hör till B2. Den här punkten flyttar inga namn.

## Vad som INTE ingår

- Ändra inte `src/lib/gen/guidance-resolvers.ts` — det är den kanoniska ägaren och
  ska fortsätta producera samma promptblock. Diffen får inte ändra en enda rad
  text som når kodgeneratorn.
- Rör inte `/api/ai/brief`, `site-brief-generation.ts` eller server auto-brief.
- Ta inte bort DB-kolumnen `prompt_assist_mode` (migration → egen rad i
  `BUG-SWARM-BACKLOG.md`).
- Byt inte namn på `promptAssistModel`/`promptAssistDeep` på tråden eller i DB.

## Verifiering

- `npm run typecheck`.
- Riktad vitest: `src/lib/hooks/useInitBrief.test.ts`,
  `src/app/builder/useBuilderPromptActions.test.ts`,
  `src/lib/builder/site-brief-generation.test.ts`.
  `useInitBrief.test.ts:13-14` mockar i dag de raderade funktionerna — mocken ska
  bort, inte bytas mot en tom stubb.
- Ett test som låser att buildern får briefen och att ingen addendum-sträng
  produceras (det är kontraktet som annars glider tillbaka).
- Grep efter `buildDynamicInstructionAddendum`, `skipAddendum` och
  `shared-addendum` ska ge noll träffar utanför git-historiken.
- `npm run docs:check` + `npm run docs:links` när role-matrisen ändrats.

## Klart när

En init-generering ger exakt samma systemprompt som före PR:n, ingen kod bygger
längre en addendum-sträng, och ingen doc påstår att den gör det.
