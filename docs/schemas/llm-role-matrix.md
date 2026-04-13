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
| Spec-first helper | Transform eller LLM-hjälproute | bygger spec från brief eller prompt för högre kvalitet i senare steg; normal builder bygger oftast spec lokalt från brief/prompt i stället för att kalla `/api/ai/spec` | `src/lib/builder/promptAssistContext.ts`, `src/app/api/ai/spec/route.ts` |
| Planner | LLM | används i plan mode för plan-/JSON-artifact, inte sajtkod | `src/lib/own-engine/session/own-engine-plan-mode.ts` |
| Generator | LLM | genererar själva sajtkoden/projektfilerna | `src/lib/providers/own-engine/generation-stream.ts` |
| LLM-fix (syntax fixer) | LLM | riktad kodreparation efter syntaxvalidering när mekaniska fixar inte räcker | `src/lib/gen/autofix/validate-and-fix.ts`, `src/lib/gen/autofix/llm-fixer.ts` |
| Verifier | LLM | read-only verifiering/quality findings efter syntax och innan/under finalize | `src/lib/gen/verify/verifier-pass.ts`, `src/lib/models/phase-routing.ts` |
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

Phase routing bär nu två signaler per fas:

- **modellval** via `phaseRouting.defaultByTier`
- **thinking / reasoningEffort** via `phaseRouting.thinkingByTier`

## Prompt-assist-kedjan i detalj

Två lager bearbetar prompten **före** kodgenerering:

| Lager | Vad det gör | Var output hamnar | Kodfiler |
|-------|-------------|-------------------|----------|
| **Deep brief** (`/api/ai/brief`) | LLM-anrop som producerar en **strukturerad JSON** (sidor, sektioner, visuell riktning, imagery, SEO, m.m.). Kanonisk semantisk expansion för init. | `meta.brief` → systemprompten via `buildDynamicContext()`. Genererar ~15–20k tecken dynamisk kontext. | `src/lib/builder/site-brief-generation.ts`, `/api/ai/brief` |
| **`formatPrompt()`** *(fallback)* | Enkel client-side formatter som wrappar text i `MÅL / CONSTRAINTS / TILLGÄNGLIGHET`-rubriker. Ingen LLM involverad. Körs **bara** när Deep Brief inte är aktiv (assist off eller brief-generering misslyckades). | User-meddelandet i streamen (`message`-fältet). | `src/lib/builder/promptAssist.ts` (~rad 760) |

Flödet vid freeform create-chat:

1. Användaren skriver prompt (t.ex. 400 tecken)
2. `/api/ai/brief` producerar strukturerad JSON (deep brief, ~28s)
3. Brief-objektet skickas via `meta.brief` till servern
4. Serverns `buildDynamicContext(brief)` bygger rik dynamisk kontext (~17k tecken)
5. Kontexten injiceras i **systemprompten** (dynamisk del)
6. Användarens **råa prompttext** skickas som user-message (ingen MÅL/CONSTRAINTS-wrappning)
7. Kodgeneratorn ser: statisk kärna (23k) + dynamisk kontext (17k) + rå user-message

**Utan** deep brief (t.ex. om `promptAssistDeep: false` eller briefen misslyckas) körs `formatPrompt()` som fallback och `buildDynamicInstructionAddendumFromPrompt()` för en enklare prompt-baserad expansion.

## Viktiga noter

- `Thinking` är **inte** en egen LLM-roll. Det är en separat flagga som påverkar resonemangs-/reasoning-exponering. Planner/generator kräver nu både den vanliga builder-togglen och att fasen är aktiverad i `phaseRouting.thinkingByTier`; fixer/verifier/manual repair/server verify använder fasinställningen direkt. `SAJTMASKIN_SHOW_THINKING` finns bara kvar som legacy-alias för äldre miljöer.
- Prompt assist, Deep brief och spec-first ligger **utanför** phase-routingtabellen och fungerar mer som för-/pre-generation-lager.
- Deep brief och server auto-brief bygger **samma typ av structured brief**, men startas från olika ställen i kedjan.
- Builderns normala `specMode` använder oftast `briefToSpec()` eller `promptToSpec()` och inte den fristående `/api/ai/spec`-routen.

## När detta dokument uppdateras

Uppdatera dokumentet när något av detta ändras:

- ny LLM-roll tillkommer
- phase routing ändras
- prompt assist / brief / spec-first byter ansvar
- samma roll börjar producera annan typ av output

Om du i stället bara ändrar modell-ID:n eller env-nycklar: uppdatera även `docs/schemas/model-build-profiles.md` och `config/ai_models/_READ_ME_FIRST.md`.
