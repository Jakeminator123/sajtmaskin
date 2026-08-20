# LLM Role Matrix

Det här dokumentet beskriver de **LLM-roller** som faktiskt finns i Sajtmaskins builder-/own-engine-kedja.

Kanonisk kodsanning ligger fortfarande i:

- `src/lib/gen/defaults.ts`
- `src/lib/models/phase-routing.ts`
- `config/ai_models/manifest.json`
- `src/lib/builder/site-brief-generation.ts`
- `src/lib/builder/prompt-assist/` (`models.ts` för Deep Brief-modellrutt, `formatters.ts` för prompt-wizard)

Det här dokumentet är den mänskligt läsbara översikten över **vilka modeller/roller som finns**, **när de används**, och **vad de producerar**.

## Roller

| Roll                      | Typ av steg                  | Primär funktion                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Viktiga filer                                                                                                           |
| ------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Prompt-assist             | LLM                          | knapp bredvid Plan: rättar utkastet i chattrutan före sändning (`prompt_rewrite`). Naturligt språk, inte `siteBriefSchema`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `src/lib/builder/prompt-assist-pre-send.ts`, `/api/ai/prompt-assist`                                                    |
| Deep brief                | LLM                          | klient-triggad strukturerad site brief från användarprompten (`generateSiteBriefObject`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `src/lib/builder/site-brief-generation.ts`, `/api/ai/brief`                                                             |
| Server auto-brief         | LLM                          | kör Deep brief server-side när klienten inte redan skickat brief (`tryGenerateServerAutoBrief`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `src/lib/api/engine/chats/create-chat-stream-post.ts`, `src/lib/builder/server-auto-brief-policy.ts`                    |
| Delta brief               | LLM                          | follow-up-brief bara när `followUpIntent === "clear-redesign"` (`runClearRedesignDeltaBriefPhase`). Samma `siteBriefSchema` som init, med redesign-prior-context — inte en smal diff. Övriga uppföljningar får Snapshot-Brief.                                                                                                                                                                                                                                                                                                                                                                                                                       | `src/lib/api/engine/chats/chat-message-stream/delta-brief-phase.ts`                                                     |
| SEO publish copy          | LLM                          | separat copy-pass vid publish: bara title/description (`improveSeoCopyWithLlm`, workload `seo_publish_copy`). Inte Prompt-Polish.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `src/lib/seo/llm-copy.ts`                                                                                         |
| Planner                   | LLM                          | används i plan mode för plan-/JSON-artifact, inte sajtkod                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `src/lib/own-engine/session/own-engine-plan-mode.ts`                                                                    |
| Generator                 | LLM                          | genererar själva sajtkoden/projektfilerna                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `src/lib/providers/own-engine/generation-stream.ts`                                                                     |
| RepairGate (syntax fixer) | LLM                          | riktad kodreparation efter syntaxvalidering när Normalize inte räcker                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `src/lib/gen/autofix/validate-and-fix.ts`, `src/lib/gen/autofix/llm-fixer.ts`                                           |
| Verifier                  | Hybrid (deterministic + LLM) | Kör först deterministiska guards (`undefined-jsx-symbol` med TS-generic-registrering, `motion-reduce-canvas-trap`, `motion-reduce-overlay-trap`) och därefter LLM-quality-findings. Blocking-fynd matas in i `runLlmFixer` via `formatVerifierFindingsAsFixerErrors()`. I F2 gate:ar build-breaking-klassen (`isBuildBreakingFinding`: import-/namnupplösning som `import-name-collision`/`build-*-import`, `undefined-jsx-symbol`, TS2304/2307/2440 m.fl.) verifiering → `verifier_failed` → promote-guard blockerar; produktkvalitetsfynd förblir Advisory. F3 gate:ar alla blocking-fynd. Lyckad fixer (ren rerun) rensar `verifierBlockingFindings`. | `src/lib/gen/verify/verifier-pass.ts`, `src/lib/gen/preview/should-start-preview.ts`, `src/lib/models/phase-routing.ts` |
| Deploy assistant          | LLM-roll                     | hjälpfas i phase routing för deploy-/auxiliary-steg                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `src/lib/models/phase-routing.ts`                                                                                       |

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

Phase routing bär nu tre signaler per fas:

- **modellval** via `phaseRouting.defaultByTier`
- **thinking / reasoningEffort** via `phaseRouting.thinkingByTier`
- **reasoningMode** (`standard` / `pro`, valfritt och GPT-5.6-specifikt) via
  samma faspost. Premium använder `pro` för planner/generator.

## Prompt-assist-kedjan i detalj

**Assist Model (`briefing.defaults.assist` / `SAJTMASKIN_ASSIST_MODEL`) är inte en agent.**
Den är bara en modell-hint till brief-lanen (klient Deep Brief, server
auto-brief och delta brief). `requestModel` är ett annat fält: serverns default
för `/api/ai/brief` när anroparen inte skickar någon. Det finns ingen
`/api/ai/chat`-rewrite och ingen Prompt-Polish-knapp. Auktoritetsordningen för
vad som får styra kodgeneratorn ägs av glossaryn (`## Auktoritetsordning`).

**Prompt-assist-knappen** (workload `prompt_rewrite`, env
`SAJTMASKIN_PROMPT_REWRITE_MODEL`) är ett annat steg: den rättar utkastet i
chattrutan *innan* sändning och skriver tillbaka naturligt språk. Den går via
`/api/ai/prompt-assist`, inte `/api/ai/brief`.

Tre live pre-codegen-modellsteg finns:

| Lager | Vad det gör | Var output hamnar | Kodfiler |
| --- | --- | --- | --- |
| **Deep brief** (`/api/ai/brief`) | LLM-anrop som producerar en **strukturerad JSON** (sidor, sektioner, visuell riktning, imagery, SEO, m.m.). Kanonisk semantisk expansion för init. | `meta.brief` → systemprompten via `buildDynamicContext()`. Storlek varierar med prompt, scaffold, dossiers och follow-up-policy; mät aktuell verklighet via `promptSize` i `GenerationInputPackage` / prompt-dumps. | `src/lib/builder/site-brief-generation.ts`, `/api/ai/brief` |
| **Server auto-brief** | Samma brief-typ som Deep brief, startad på servern när klienten inte skickat `meta.brief`. | Samma `meta.brief` / snapshot-väg. | `tryGenerateServerAutoBrief` |
| **Delta brief** | Bara vid `followUpIntent === "clear-redesign"`. Samma `siteBriefSchema` som init (`Include every field`), med `formatPriorDesignContext(..., { intent: "clear-redesign" })`. Inte en smal diff. Övriga uppföljningar får Snapshot-Brief (`null` bara om snapshoten saknar `briefSummary`). | Skriver tillbaka brief för den follow-up-rundan. | `runClearRedesignDeltaBriefPhase` |
| **Prompt-assist-knapp** (`/api/ai/prompt-assist`) | Billig pre-send-rewrite av utkastet i samma ruta. Naturligt språk in och ut. Inte `siteBriefSchema`. | Writeback via `setInput`. Skickar inte meddelandet. | `src/lib/builder/prompt-assist-pre-send.ts`, `/api/ai/prompt-assist` |
| **`formatPrompt()`** _(legacy wrapper)_ | Enkel client-side formatter som wrappar text i `MÅL / TILLGÄNGLIGHET`-rubriker. Ingen LLM involverad. **Inte i `useCreateChat`-init-vägen** (sedan 2026-04-28 — Core Rules bar redan kraven, wrappern var brus). Lever kvar i prompt-wizard. | User-meddelandet i de paths som fortfarande använder den. | `src/lib/builder/prompt-assist/formatters.ts` |

Flödet vid freeform create-chat:

1. Användaren skriver prompt (t.ex. 400 tecken)
2. `/api/ai/brief` producerar strukturerad JSON (deep brief, ~28s)
3. Brief-objektet skickas via `meta.brief` till servern
4. Serverns `buildDynamicContext(brief)` bygger rik dynamisk kontext (mät via `promptSize.dynamicContext`)
5. Kontexten injiceras i **systemprompten** (dynamisk del)
6. Användarens **råa prompttext** skickas som user-message (ingen MÅL/CONSTRAINTS-wrappning)
7. Kodgeneratorn ser: statisk kärna + dynamisk kontext + rå user-message; exakta storlekar mäts i prompt-telemetrin (den arkiverade uppföljningsplanen `prompt-slim-systemprompt.md` lever i git-historiken).

**Utan** deep brief (t.ex. om `promptAssistDeep: false` eller briefen misslyckas) skickar `useCreateChat` user-prompten rå (sedan 2026-04-28). Servern kan då köra auto-brief. Det finns ingen klient-addendum-sträng. `formatPrompt()` används inte i den vägen.

## Viktiga noter

- `Thinking` är **inte** en egen LLM-roll. Det är en separat flagga som påverkar resonemangs-/reasoning-exponering. Planner/generator kräver nu både den vanliga builder-togglen och att fasen är aktiverad i `phaseRouting.thinkingByTier`; fixer/verifier/manual repair/server verify använder fasinställningen direkt. Legacy-aliaset `SAJTMASKIN_SHOW_THINKING` togs bort i omtag-04 (2026-04-23); använd `SAJTMASKIN_DEFAULT_THINKING`.
- Prompt assist (modell-hint), Deep brief, server auto-brief och delta brief ligger **utanför** phase-routingtabellen och fungerar mer som för-/pre-generation-lager.
- Deep brief och server auto-brief bygger **samma typ av structured brief**, men startas från olika ställen i kedjan. Delta brief är en tredje **anropare** av samma schema, inte en smalare follow-up-variant: den är redesign-specifik och tillåter stilbyte. En bevarande refine-variant är plan B6 / beslut N4, inte nuläge.
- Spec-first är ett **legacy-alias** för Deep Brief + orchestration (se glossaryn). Det finns ingen `specMode`, `briefToSpec`, `promptToSpec` eller `/api/ai/spec` i runtime.

## När detta dokument uppdateras

Uppdatera dokumentet när något av detta ändras:

- ny LLM-roll tillkommer
- phase routing ändras
- prompt assist / brief byter ansvar
- samma roll börjar producera annan typ av output

Om du i stället bara ändrar modell-ID:n eller env-nycklar: uppdatera även `docs/schemas/model-build-profiles.md` och `config/ai_models/_READ_ME_FIRST.md`.
