# Briefing och Källpaket — styrdokument

Status: Active
Startad: 2026-08-18
Ägarbeslut: **väntar** (N1 och N4 i § Beslut som behövs)

Underlag från ägarens externa granskare: `övrigt/chadcn-addendum-aiassist/`
(`summering..md` + `raw.txt`). Den här planen är den kodverifierade versionen av
det underlaget — merparten av granskarens påståenden stämmer, ett par är för
snäva, och de två mest värdefulla fynden nämnde granskaren inte.

## Kärnprincip

**Ett namn per roll, en ägare per signal, och ett kvitto på vad som faktiskt
nådde kodgeneratorn.**

Det finns ingen saknad orkestreringsagent att bygga. Det som saknas är att
(a) den förbikopplade resten städas bort, (b) källorna som redan når prompten går
att se i efterhand, och (c) uppföljningar slipper låta kodgeneratorn både planera
och bygga i samma svep.

Lägg **inte** till ett nytt LLM-steg där ett befintligt kan göra jobbet. Repot
har redan `brief_structured`, `plan_mode_planner`, `post_generation_verifier`,
`match_classifier` och `seo_publish_copy` i `config/ai_models/manifest.json`
(`workloads`). Nya steg registreras där eller finns inte.

## Verifierat nuläge (2026-08-18, lokal master-checkout)

### Det finns ingen orkestrerande LLM före kodgeneratorn

Vid en vanlig ny sajt körs **ett** LLM-steg före kodgeneratorn: Deep Brief
(`/api/ai/brief` → `siteBriefSchema`). Allt annat i orkestreringen är
deterministiskt (scaffoldmatchning, variantval, dossierval, UI Recipes,
kontextbudget). Ingen fil-plan, ingen ruttplan från en LLM — kodgeneratorn
planerar och skriver i samma pass.

Det finns däremot en riktig planner-roll: plan-läget
(`src/lib/own-engine/session/own-engine-plan-mode.ts`, workload
`plan_mode_planner`) kör mot **samma** dynamiska kontext men producerar en plan i
stället för kod. Infrastrukturen för ett planeringssteg är alltså redan byggd.

Vid **uppföljningar** finns dessutom redan en Ändringsbrief — men bara för läget
`clear-redesign` (`delta-brief-phase.ts`). De redigerande lägena `clear-refine`,
`capability-add`, `capability-modify` och `neutral` får ingen strukturerad brief
alls: `resolveFollowUpActiveBrief` returnerar `null` för dem
(`src/lib/api/engine/chats/follow-up-orchestration-input.ts:130-135`). Det är
skillnaden B6 handlar om, och den är en grindbredd — inte ett saknat steg.

### Prompt-assist-addendumet är förbikopplat — och en ren dubblett

| Fakta | Källa |
|---|---|
| Enda anroparen kör `forceDeepBrief: true, skipAddendum: true` och **tilldelar inte** returvärdet | `src/app/builder/useBuilderPromptActions.ts:173-180` |
| `skipAddendum` returnerar tom sträng | `src/lib/hooks/useInitBrief.ts:162-167` |
| Alla övriga returvägar (assist av, ogiltig modell, ej deep, fel) bygger en addendum-sträng som anroparen kastar | `useInitBrief.ts:64, 73, 110, 182-190, 219` |
| Servern äger redan samma vägledning: «Previously these lived in the prompt-assist package and were wired through a client-side addendum. Now they are server-side only.» | `src/lib/gen/guidance-resolvers.ts:8-9` |

Det är alltså inte bara död kod — det är **två kopior av samma prompttext**, där
den ena (445 rader, server-side) faktiskt når kodgeneratorn och den andra
(815 rader, klient-side) inte gör det.

| Fil i `src/lib/builder/prompt-assist/` | Rader | Konsument utanför paketet |
|---|---|---|
| `runner.ts` | 202 | bara `useInitBrief` (som kastar resultatet) |
| `theme-guidance.ts` | 199 | ingen |
| `motion-guidance.ts` | 165 | ingen |
| `shared-addendum.ts` | 131 | ingen |
| `domain-hints.ts` | 118 | ingen |
| `formatters.ts` | 81 | **ja** — `formatPrompt` i prompt-wizard |
| `models.ts` | 53 | **ja** — modellrutt/allowlist för brief |
| `index.ts` | 24 | barrel |

### Docs påstår mer än koden gör

- `src/lib/builder/prompt-assist/runner.ts:42-48` — «that one IS active (used by
  `useInitBrief.ts` as fallback when the request misses a brief)». Falskt.
- `docs/schemas/llm-role-matrix.md:77` — påstår att `useCreateChat` kör
  `buildDynamicInstructionAddendumFromPrompt()` när deep brief saknas.
  `useCreateChat` anropar den inte alls.
- `docs/schemas/orchestration-signal-contract.md:18` — listar «formatterad prompt
  + snabb addendum» som en aktiv signalväg.

### Namnskuggor som lever kvar

| Yta | Skugga |
|---|---|
| `config/ai_models/manifest.json` | **både** `promptAssist` och `briefing` som toppnycklar — halvfärdig omdöpning |
| `src/lib/hooks/useInitBrief.ts:72` | toast: «Ogiltig förbättra-modell» (Förbättra-knappen togs bort 2026-04-21) |
| `src/components/builder/shell/BuilderHeader.tsx:244` | «Assist aktiv» |
| `src/lib/db/schema.ts:224` + `src/lib/db/services/prompt-logs.ts:46` | kolumnen `prompt_assist_mode` skrivs alltid som `null` |
| `config/ai_models/20-prompt-assist.md` | filnamnet bär det döda begreppet |

Kodidentifierare på tråd och i DB (`promptAssistModel`, `promptAssistDeep`,
`prompt_assist_*`) **behålls** enligt `terminology.mdc` — de mappas i text, döps
inte om.

### Variant-template-addendum: aktivt, men helt ogranskat

`config/variant-template-addenda.json`: 69 poster, **69 `generated`, 0
`reviewed`, 0 `disabled`**. 66 poster har 3 utdrag, 2 har 2, 1 har 0. Alla 31
variantfiler i `config/scaffold-variants/` bär `sourceTemplateIds` och pekar
tillsammans på samma 69 ID. Gränser: max 3 utdrag, 9 000 tecken totalt,
SHA-bundet mot både arkiv och extraktor
(`src/lib/gen/scaffold-variants/variant-template-addendum.ts:19-21, 85-99`).
Används bara vid init, ej importerat repo, ej Scaffold-off
(`src/lib/gen/orchestrate/finalize-prompts.ts:143-148`). `generated` räknas som
träff — runtime kräver inte `reviewed`.

Kurationsverktyget finns redan: Backoffice **Template Curator**
(`backoffice/pages/template_curator.py`, kommandon `templates:addenda`,
`--refresh-reviewed`). Det som saknas är att någon faktiskt granskar.

### shadcnblocks: nyckeln används automatiskt, men mäts inte

- Auto-resolvern är **default på** och körs på **både init och uppföljning**:
  `resolveShadcnUiRecipes({ maxRecipes: 3 })` i
  `src/lib/gen/orchestrate/resolve-base.ts:225-231`. Bara `simpleWebsitePath`
  tömmer listan. Renderas som `## UI Recipes` i
  `src/lib/gen/system-prompt/sections/brief-visual-media.ts:472-481`.
- Add-panelen (Block/Bläddra/Beskriv) är **default av**
  (`src/lib/builder/add-panel-feature.ts`, `src/lib/shadcn/describe-feature.ts`).
  Den betalda nyckeln arbetar alltså i det tysta även när ytan är osynlig.
- **Varje misslyckande är tyst:** `.catch(() => [])` (`resolve-base.ts:231`) och
  `catch {}` (`src/lib/gen/data/shadcn-ui-recipes.ts:171, 248`). Ingen telemetri
  skiljer «Pro-källkod laddad» från «metadata-gissning».

### Källkvittot finns till en femtedel

`src/lib/gen/generation-input-package.ts` sparar `promptSize` och
`variantTemplateId` — men inte vilka UI Recipes, dossiers eller media som valdes,
eller varför. Backoffice har redan rätt yta:
`backoffice/pages/selection_rationale.py` («Selection Rationale — varför valdes
detta?»), som läser prompt-dumpen plus telemetri. Bygg **i** den, inte en ny sida.

## Beslut som behövs

| # | Fråga | Förslag |
|---|---|---|
| N1 | Vad ska lagret före kodgeneratorn heta? | **Briefing** — ett lane med fyra lägen: *Init Brief* (deep), *Auto Brief* (server), *Ändringsbrief* (uppföljning), *Snapshot* (utan LLM). Pensionera «Prompt-assist», «Assist Model» och «Förbättra-modell» som produktord. Inget nytt «AI-assistent»: det namnet är redan taget av Sajtagenten/OpenClaw och betyder något annat. |
| N2 | Vad ska «Addendum» heta i produkttext? | **Källpaket** för samlingen av valbara ingredienser (variantreferens, UI Recipes, dossiers, media). Filnamn och kod (`variant-template-addenda.json`, `resolveVariantTemplateAddendum`) behåller sina namn. |
| N3 | Ska «Polish» återinföras? | Ja, men **efter** generering och under namnet **Refine**, drivet av verifierarens advisory-fynd (`post_generation_verifier`) — aldrig som omskrivning av användarens prompt. Ligger sist, efter B3. |
| N4 | Får B6 (Ändringsbrief) breddas? | **Kräver uttryckligt OK**, men frågan är mindre än den såg ut: steget finns redan i koden och körs för `clear-redesign`-uppföljningar. B6 breddar en befintlig grind, den bygger ingen ny förmåga. Beslutet gäller därför kostnad och latens per uppföljning — inte en ny yta. B1-B5 är städning, sanning och mätning och behöver inget nytt beslut. |

## Ordning

Varje punkt är en egen PR. B1 och B2 rör samma filer och tas i följd; B3-B5 kan
köras parallellt efter B2.

| Id | Uppgift | Kanonisk ägare | Kräver beslut |
|---|---|---|---|
| [B1](aktiviteter/B1-radera-forbikopplat-prompt-addendum.md) | Radera det förbikopplade prompt-addendumet och rätta docs som påstår att det lever | `src/lib/builder/prompt-assist/`, `useInitBrief.ts` | nej |
| [B2](aktiviteter/B2-ett-namn-briefing.md) | Ett namn: Briefing. Konsolidera `promptAssist` → `briefing` i manifestet, städa användartexterna | `config/ai_models/manifest.json`, glossary | N1 |
| [B3](aktiviteter/B3-kallkvitto.md) | Källkvitto: logga vilka källor som nådde prompten, visa i Selection Rationale | `generation-input-package.ts`, `selection_rationale.py` | nej |
| [B4](aktiviteter/B4-kurera-variant-addenda.md) | Kurera de tio mest använda variant-addendumen, stäng de generiska | `config/variant-template-addenda.json` via Template Curator | nej |
| [B5](aktiviteter/B5-shadcnblocks-matning.md) | Sluta svälja shadcnblocks-fel tyst; mät om den betalda nyckeln ger riktig källkod | `shadcn-ui-recipes.ts`, `resolve-base.ts` | nej |
| [B6](aktiviteter/B6-andringsbrief-followup.md) | Ändringsbrief: bredda den befintliga grinden så alla redigerande uppföljningar får samma avsiktstolkning som en ny sajt | `delta-brief-phase.ts`, `follow-up-orchestration-input.ts` | **N4** |

## Auktoritetsordning (den enda)

B2 och B3 ska landa den här ordningen som en enda dokumenterad lista — inte som
sju separata «inspiration»-formuleringar spridda i promptblocken.

| Nivå | Källa | Behandlas som |
|---|---|---|
| 1 | Användarens uttryckliga krav + låsta byggval (tema, byggval, mutade capabilities) | absolut krav |
| 2 | Scaffold, befintliga filer, rutter, kontrakt, protected paths | teknisk sanning |
| 3 | Brief (init/auto/ändring) | strukturerad tolkning av avsikten |
| 4 | Scaffold Variant | stark visuell riktning när 1-3 är tysta |
| 5 | Källpaket: variantreferens, UI Recipes, dossiers, media | valbara ingredienser med angivet skäl |
| 6 | Core Rules-defaults | reservvärden |
| 7 | Modellens egen komplettering | frihet inom 1-6 |

## Vad den här planen INTE gör

- Återinför inte Prompt-Polish, «Skriv om» eller «Förbättra prompt».
- Bygger inte en ny orkestreringsagent, ny agentyta eller ny UI-yta. B3
  återanvänder Selection Rationale, B4 återanvänder Template Curator.
- Döper inte om kodidentifierare, DB-kolumner, telemetri-nycklar eller wire-fält
  som bär `promptAssist`/`prompt_assist`.
- Rör inte `BRA`-brancher, prod-migrationer eller env-hantering.

## Klart när

Prompt-assist finns inte längre som produktbegrepp eller som körbar kodväg, en
generering går att förklara i efterhand utifrån ett kvitto, minst tio
variant-addendum är manuellt bedömda, och ett misslyckat shadcnblocks-anrop syns
i loggarna i stället för att tyst bli en gissning.
