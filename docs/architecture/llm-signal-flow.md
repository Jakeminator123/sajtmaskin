# LLM Signal Flow

Det här dokumentet beskriver **hur** signallagren samspelar i create-chat, follow-up och repair.

För den kontraktslika tabellen över lager, inputs och outputs: se
`docs/schemas/orchestration-signal-contract.md`.

För matrisen över LLM-roller/modeller: se `docs/schemas/llm-role-matrix.md`.

## Översikt

```mermaid
flowchart TD
  rawPrompt[RawPrompt] --> promptOrchestration[PromptOrchestration]
  promptOrchestration --> canonicalBrief[CanonicalDeepBrief]
  canonicalBrief --> scaffoldMatch[ScaffoldSelection]
  canonicalBrief --> routePlan[RoutePlan]
  canonicalBrief --> contractPlan[ContractPlan]
  rawPrompt --> capabilityMap[CapabilityMap]
  capabilityMap --> contractPlan
  capabilityMap --> dynamicContext[DynamicContext]
  scaffoldMatch --> buildSpec[BuildPolicy]
  routePlan --> buildSpec
  contractPlan --> buildSpec
  canonicalBrief --> dynamicContext
  scaffoldMatch --> dynamicContext
  routePlan --> dynamicContext
  contractPlan --> dynamicContext
  buildSpec --> dynamicContext
  dynamicContext --> generator[Generation]
  generator --> postChecks[PostChecks]
  postChecks --> qualityGate[QualityGate]
```

**Styrprincip:** expandera en gång (Deep Brief), exekvera många steg.

## Ägarskap per steg

| Steg | Äger | Ska **inte** |
|------|------|-------------|
| **Deep Brief** | Produktidé, målgrupp, tonalitet, sidor/IA, CTA, visual direction, imagery, SEO-bas | — |
| **Scaffold Selection** | Strukturhypotes och startform | Uppfinna ny produktsemantik |
| **Route Plan** | IA-normalisering med tydlig provenance (`brief` / `prompt` / `scaffold`) | Omtolka briefens sidor |
| **Contract Plan** | Auth, db, betalning, env, integrationer | Gissa domäntillhörighet utöver brief |
| **BuildSpec** | Execution policy, budgetar, preview/verifiering, change scope | Kreativt omtolka prompten |
| **Dynamic Context** | Prompt-assembly och token-pruning | Lägga till ny kreativ tolkning utöver brief |

## Create-chat (`init`)

1. Buildern tar emot användarprompten.
2. **Deep Brief** genereras som det kanoniska semantiska expansionssteget. Brief-objektet skickas via `meta.brief`; brief-deriverad prose ska **inte** dubblera samma semantik i `system`/`customInstructions`.
3. Server Auto-Brief är fallback när klienten inte skickar brief — körs för underspecificerade init-prompts (inklusive korta vaga website-prompts), hoppas över för audit, technical, follow-up och redan tydligt strukturerade prompts.
4. Scaffoldval körs i `resolveOrchestrationBase()` via `matchScaffoldAuto()`.
5. Route plan, contracts och BuildSpec byggs — dessa översätter briefens semantik till exekvering snarare än att uppfinna ny vision.
6. Dynamic context byggs i `system-prompt.ts`. `## Your Toolkit` byggs nu från den registry-synkade `SHADCN_COMPONENTS`-mappen men filtreras mot vilka `@/components/ui/*`-subpaths som faktiskt finns lokalt; `## Component References` lägger separat till capability-matchade kodexempel från `data/shadcn-examples/`.
7. Generatorn kör. Modellvalet kommer från `phaseRouting.defaultByTier`, och planner/generator hämtar dessutom phase-specifik thinking / `reasoningEffort` från `phaseRouting.thinkingByTier`. För dessa två faser måste också builderns vanliga thinking-toggle vara på.
8. Finalize, post-checks, preview-start och quality gate sker efteråt.

### Brief → Scaffold

Deep brief matas in i scaffoldmatchningen via `ScaffoldQueryContext` (`briefPages`, `styleKeywords`, `domainHints` → keyword-boost + berikad embedding-prompt). Det minskar risken att ett fel scaffold väljs, men keyword-lagret kan fortfarande dominera vid mycket starka träffar.

## Follow-up

Follow-ups skiljer sig från create-chat på fyra sätt:

1. user-turnen wrappas med continuity / current files / requested changes
2. persisted scaffold kan återanvändas
3. route plan fryser ofta befintliga routes i stället för att bygga ny IA från scratch
4. **init-brief skickas inte med** — follow-ups förlitar sig på persisted scaffold, orchestration snapshot och tidigare filer

Det här gör follow-upkedjan mer konservativ, men innebär också att ett fel scaffold kan leva kvar tills repair eller explicit redesign låser upp det.

### Viktig nuvarande follow-up-balans

Vanliga follow-ups hålls fortfarande konservativa, men capability-heavy önskemål som t.ex. karusell, 3D, större animationer eller premium-visuals ska inte lika lätt falla ner till den lättaste context-/verification-banan bara för att användaren inte skrev ordet `redesign`.

Det betyder i praktiken:

- små copy-/layoutändringar kan fortfarande gå i ett lättare follow-up-spår
- capability-heavy follow-ups ska oftare stanna på minst `contextPolicy: normal`
- capability-heavy follow-ups ska oftare undvika `verificationPolicy: fast`

### Framtida delta-brief

Större redesigns eller nya sidstrukturer kan i framtiden få en smal `change-brief` eller `delta-brief` som bara beskriver vad som ska ändras och vad som ska bevaras — inte en ny full Deep Brief.

## Repair

Repair arbetar normalt med:

- senaste versionen
- persisted scaffold
- error logs / quality gate / preflight-signaler

När tier kan härledas använder repairkedjan nu både fixer-fasens modell och fixer-fasens thinking / `reasoningEffort` från manifestet.

Om scaffold-aware retry hittar tydliga blockerare kan den föreslå en enklare scaffoldpivot (t.ex. `ecommerce` -> `base-nextjs`), men detta sker sent och kostar extra pass. Ren merged syntax utan import-/strukturstöd ska nu mindre aggressivt tolkas som scaffold-drift.

### Viktig repair-begränsning

Repair/fixer-output måste returnera **kompletta filer**, inte snippets. Runtime antar att varje `file="..."`-block är hela filen. Partial-file-output blockeras nu tidigare i finalize/preflight i stället för att sparas som preliminär version.

## Vad som fungerar bra

- Deep brief ger bättre pages/sections/visual direction/SEO än en torftig prompt ensam.
- Dynamic context har bra struktur och prioriterad pruning.
- Repairkedjan kan rädda bra resultat även efter dåligt scaffoldval.

## Vad som fungerar sämre

- scaffoldval använder nu brief via `ScaffoldQueryContext`, men keyword-lagret kan fortfarande dominera vid starka träffar; embeddings kan utmana svagare keyword-val (se merge-policy i `matcher.ts`)
- capability/contract-lagren kan förstärka ett dåligt scaffoldval
- follow-up kan bevara fel routes/scaffold för länge

## Rekommenderad styrprincip

1. Deep Brief ska vara den **enda kanoniska semantiska expansionen** för init. Expandera en gång, exekvera många steg.
2. Scaffold ska vara **strukturhypotes**, inte ensam domänsanning.
3. Route plan och contracts ska väga briefsignaler tyngre än scaffolddefaults när de krockar.
4. Follow-ups ska **inte** bära init-brief — de utgår från persisted scaffold, orchestration snapshot och tidigare filer.
5. Post-checks ska fortsatt vara sanningslager för vad som faktiskt blev genererat.
