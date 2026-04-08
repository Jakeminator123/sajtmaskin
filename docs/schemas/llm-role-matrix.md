# LLM Role Matrix

Det här dokumentet beskriver de **LLM-roller** som faktiskt finns i Sajtmaskins builder-/own-engine-kedja.

Kanonisk kodsanning ligger fortfarande i:

- `src/lib/gen/defaults.ts`
- `src/lib/models/phase-routing.ts`
- `config/ai_models/manifest.json`
- `src/lib/builder/site-brief-generation.ts`
- `src/lib/builder/promptAssist.ts`

Det här dokumentet är den mänskligt läsbara översikten över **vilka modeller/roller som finns**, **när de används**, och **vad de producerar**.

## Roller

| Roll | Typ av steg | Primär funktion | Viktiga filer |
|---|---|---|---|
| Prompt polish | LLM | lätt copy-polish av prompten utan att lägga till ny scope | `src/lib/builder/promptAssist.ts`, `/api/ai/chat` |
| Prompt rewrite / improve | LLM | skriver om och förbättrar prompten till en bättre byggprompt | `src/lib/builder/promptAssist.ts`, `/api/ai/chat` |
| Deep brief | LLM | bygger strukturerad site brief från användarprompten | `src/lib/builder/site-brief-generation.ts`, `/api/ai/brief` |
| Server auto-brief | LLM | kör Deep brief server-side när klienten inte redan skickat brief | `src/lib/api/engine/chats/create-chat-stream-post.ts`, `src/lib/builder/server-auto-brief-policy.ts` |
| Spec-first helper | LLM eller transform | bygger spec från prompt eller brief för högre kvalitet i senare steg | `src/lib/builder/promptAssistContext.ts` |
| Planner | LLM | används i plan mode för plan-/JSON-artifact, inte sajtkod | `src/lib/own-engine/session/own-engine-plan-mode.ts` |
| Generator | LLM | genererar själva sajtkoden/projektfilerna | `src/lib/providers/own-engine/generation-stream.ts` |
| Syntax fixer | LLM | riktad kodreparation efter syntaxvalidering när deterministiska fixar inte räcker | `src/lib/gen/autofix/validate-and-fix.ts`, `src/lib/gen/autofix/llm-fixer.ts` |
| Verifier | LLM | read-only verifiering/quality findings efter syntax och innan/under finalize | `src/lib/gen/verifier-pass.ts`, `src/lib/models/phase-routing.ts` |
| Deploy assistant | LLM-roll | hjälpfas i phase routing för deploy-/auxiliary-steg | `src/lib/models/phase-routing.ts` |

## Fasrouting

De phase-routade rollerna definieras kanoniskt i manifestet och i phase-routing-koden:

- `planner`
- `generator`
- `fixer`
- `verifier`
- `deploy-assistant`

Se:

- `config/ai_models/manifest.json`
- `src/lib/ai-models/load-manifest.ts`
- `src/lib/models/phase-routing.ts`

## Viktiga noter

- `Thinking` är **inte** en egen LLM-roll. Det är en separat flagga som påverkar resonemangs-/reasoning-exponering.
- Prompt assist, Deep brief och spec-first ligger **utanför** phase-routingtabellen och fungerar mer som för-/pre-generation-lager.
- Deep brief och server auto-brief bygger **samma typ av structured brief**, men startas från olika ställen i kedjan.

## När detta dokument uppdateras

Uppdatera dokumentet när något av detta ändras:

- ny LLM-roll tillkommer
- phase routing ändras
- prompt assist / brief / spec-first byter ansvar
- samma roll börjar producera annan typ av output

Om du i stället bara ändrar modell-ID:n eller env-nycklar: uppdatera även `docs/schemas/model-build-profiles.md` och `config/ai_models/_READ_ME_FIRST.md`.
