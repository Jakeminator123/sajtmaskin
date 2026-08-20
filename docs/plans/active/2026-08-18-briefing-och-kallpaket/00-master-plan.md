# Briefing och Källpaket — styrdokument

Status: Active
Startad: 2026-08-18
Ägarbeslut: **delvis** — Prompt-assist-knappen beslutad 2026-08-19.
Kvar: N1 (Briefing som lamenamn), N2, N3, N4, N5.

Underlag från ägarens externa granskare: `övrigt/chadcn-addendum-aiassist/`
(`summering..md` + `raw.txt`). Mappen är gitignorerad — cloud-agenter läser
**den här planen**, inte råfilerna. Planfilerna ligger på `master` sedan
`c44cf7c`. Den här texten är den kodverifierade versionen av underlaget;
nuläget för B6 rättades 2026-08-18 mot runtime.

## Läget 2026-08-19

Spåret är **inte** klart. Tabellen är live-status mot `master` / öppna PR:er.

| Id | Läge |
|---|---|
| B8 | **Klar.** #1032 |
| B3 | **Klar.** #1035 |
| B9 | **Klar.** #1037 |
| Docs + Deep Brief-etiketter | **Klar.** #1036, #1041 |
| B1 | **Klar.** #1040 |
| B10 | **Klar.** #1038 |
| B11 | **Klar.** #1042. Follow-up (ton ≠ scaffoldtyp) landade i #1054. |
| B2 | Inte startad. Väntar N1-resten. |
| B4 | Inte startad. |
| B5 | Inte startad. |
| B6 | Inte startad. Steg 1 får köras; steg 2 väntar N4. |
| B7 | Inte startad. Väntar N5. B3 är landad. |
| N1 | Delvis. Prompt-assist = knappen (beslutat). Briefing som lamenamn väntar. |
| N2–N5 | Öppna. N5 ligger i backloggen. |

## Kärnprincip

**Ett namn per roll, en ägare per signal, och ett kvitto på vad som faktiskt
nådde kodgeneratorn.**

Det finns ingen saknad orkestreringsagent att bygga. Kvar: (a) den
förbikopplade resten städas bort (B1, PR #1040), och (c) en ev. Ändringsbrief
för refine inte är densamma som en redesign (B6). (b) källkvittot är landat
(#1035). Vanliga uppföljningar har redan Snapshot-Brief.

Lägg **inte** till ett nytt LLM-steg där ett befintligt kan göra jobbet. Repot
har redan `brief_structured`, `plan_mode_planner`, `post_generation_verifier`,
`match_classifier` och `seo_publish_copy` i `config/ai_models/manifest.json`
(`workloads`). Nya steg registreras där eller finns inte.

## Verifierat nuläge (2026-08-18, `origin/master` `c44cf7c`)

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

Vid **uppföljningar** finns redan två olika briefvägar. Skillnaden är inte
«brief eller ingen brief».

| Lägesklass | Vad kodgeneratorn får | LLM? |
|---|---|---|
| `clear-redesign` | ny Deep Brief (samma `siteBriefSchema` som init) + avskalad snapshot-reserv vid fel | ja |
| `clear-refine`, `capability-add`, `capability-modify`, `neutral` | Snapshot-Brief (`buildFollowUpBriefFromSnapshot`) | nej |
| `ambiguous-*` | klargörande fråga; ingen ny brief | nej |

`resolveFollowUpActiveBrief`
(`src/lib/api/engine/chats/follow-up-orchestration-input.ts`) gör:

1. `parsedMeta.brief` om den finns (LLM-delta har skrivit tillbaka hit),
2. annars den **avskalade** snapshot-reserven bara vid `clear-redesign`,
3. annars den **rikare** Snapshot-Briefen. `null` bara när snapshoten saknar
   användbar `briefSummary`. Handlerns lokala `metaBrief` kan däremot vara
   `null` för vanliga uppföljningar; det är request-fältet, inte den aktiva
   briefen.

LLM-deltafasen (`runClearRedesignDeltaBriefPhase`) är **redesign-specifik**,
inte en generell grind: loggar och typer säger `clear-redesign`, och
`formatPriorDesignContext(summary, { intent: "clear-redesign" })` säger till
modellen att tidigare stil får ersättas. Samma funktion fyller hela
`siteBriefSchema` (`Include every field in the schema.`). B6 är därför inte
«bredda if-villkoret». Att återanvända den vägen på `clear-refine` eller
`capability-*` ger redesign-semantik och riskerar just den scope-drift
uppföljningar ska förhindra.

Gällande beslut 2026-08-14 står kvar: ingen delta-brief på **varje**
follow-up. Se [`docs/decisions/README.md`](../../../decisions/README.md). B6
öppnar en smalare fråga (N4), inte en omkörning av det beslutet.

### Korta hemsidor fick aldrig någon Brief — åtgärdat i B8

Fram till 2026-08-18 avgjorde en teckengräns om ett bygge fick hela
Briefing-lagret. Appar avvisades alltid från snabbspåret `simpleWebsitePath`
och fick därför Auto Brief, scaffold-embeddings, UI Recipes och dossiers. En
hemsideprompt under **420 tecken** fick inget av det.

Det förklarar mönstret ägaren såg: appar blev ofta bra, korta hemsidor tunna.
Skillnaden satt inte i byggmodellen utan i vad den fick se — och eftersom
`briefSummary` aldrig persisterades saknade även följande rundor sitt
brief-golv.

Snabbspåret är borttaget i [B8](aktiviteter/B8-brief-paritet-website-app.md).
Det var rätt första åtgärd just för att den **inte** kräver ett nytt LLM-steg:
den fungerande appvägen fanns redan, hemsidor fick bara inte gå den. En mindre
Snabbrief är en kostnadsoptimering att överväga *efter* mätning, inte före.

### Varianten väljs innan Briefen finns

Auktoritetsordningen nedan gäller för scaffold och dossiers, men inte för
varianten. Vid en vanlig ny sajt görs en keyword-only förmatchning på ~1 ms
(`create-chat-stream-post.ts:263-312`) som skickas vidare som
`persistedVariantId` (`:913-919`) och slår det Brief-drivna valet i
prioritetskedjan (`orchestrate/finalize-prompts.ts:102-115`). Briefens
`visualDirection` når då aldrig variant-poängsättningen, som annars är enda
vägen in (`orchestrate/scaffold-variant-resolver.ts:33-90`).

En preliminär hint har blivit ett persisterat beslut. Det är inte ett saknat
steg — det är fel auktoritetsordning i ett steg som redan finns, och därför en
egen punkt: [B7](aktiviteter/B7-variantens-auktoritetsordning.md).

Att briefen skulle sakna makt över **scaffold** är däremot fel efter
[B11](aktiviteter/B11-brief-i-scaffoldvalet.md), landad i #1042: `pages`,
`styleKeywords` och `domainProfile` väger in via `buildScaffoldQueryContext`.
Äldre kod läste `businessType`/`industry`, som inte finns i `siteBriefSchema`.
#1042:s första landning tog även in `toneAndVoice`; det smala follow-up-fixspåret
tar bort det från scaffold-keywords och scaffold-embedding. Ton styr copy och
variant, men får inte ensam göra en domänscaffold valbar.

### Prompt-assist-addendumet är borttaget (B1)

Klientens förbikopplade instruction-addendum är raderat. `useInitBrief`
returnerar brief-objektet (eller `null`). Serverns `guidance-resolvers.ts` är
enda ägaren av motion-/tema-/domänvägledningen som når kodgeneratorn. Kvar i
`src/lib/builder/prompt-assist/`: `models.ts` (Deep Brief-modellrutt) och
`formatters.ts` (`formatPrompt` i prompt-wizard).

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
  `src/lib/gen/orchestrate/resolve-base.ts`. Sedan B8 finns ingen gren som
  tömmer listan i förväg. Renderas som `## UI Recipes` i
  `src/lib/gen/system-prompt/sections/brief-visual-media.ts:472-481`.
- Add-panelen (Block/Bläddra/Beskriv) har **kod-default av**
  (`src/lib/builder/add-panel-feature.ts`, `src/lib/shadcn/describe-feature.ts`),
  men Vercel-env sätter `1` i production, preview och development
  (CLI-verifierat 2026-08-18, [`docs/ENV.md`](../../../ENV.md)). Den betalda
  nyckeln arbetar alltså i det tysta oavsett om ytan är synlig.
- **Varje misslyckande är tyst:** `.catch(() => [])` (`resolve-base.ts:231`) och
  `catch {}` (`src/lib/gen/data/shadcn-ui-recipes.ts:171, 248`). Ingen telemetri
  skiljer «Pro-källkod laddad» från «metadata-gissning».

### Källpaketet är redan förextraherat — men inte i Blob

Frågan om LLM-flödet kan hämta inspiration och delar utan att ladda ner hela
`.zip`-arkiv har redan ett ja. Utdragen ligger **inte** i Blob utan i
`config/variant-template-addenda.json` (491 KB, 69 poster), statiskt importerad
i bundlen. En init får max 3 filutdrag / 9 000 tecken plus **en** stillbilds-URL
som modell-leverantören hämtar — vi laddar aldrig ner bilden.

I Blob ligger arkivet: 313 template-ZIP:ar, 313 stillbilder och tre
embeddings-index. Att flytta addendumet dit vore en ny lagringsyta, inte en
saknad förmåga, och skulle byta en synkron minnesläsning mot ett nätverksanrop
i hot path.

ZIP-fallbacken i hot path är stängd i [B9](aktiviteter/B9-inget-zip-i-hot-path.md)
(#1037): `missing` / `stale` / `invalid` är tysta och mätbara, inte en
arkivhämtning mitt i genereringen.

### Källkvittot — landat i B3 (#1035)

`GenerationInputPackage.sources` loggar valda källor (variantreferens, UI Recipe,
dossier, media) plus `reachedPrompt` efter tokenbudget. Selection Rationale visar
kvittot. B4 och B5 kan nu utvärderas mot riktiga körningar, inte gissningar.

## Beslut som behövs

Samma frågor ligger i [`BUG-SWARM-BACKLOG.md`](../../../../BUG-SWARM-BACKLOG.md)
§ Väntar på ägarbeslut. Planen äger formuleringen; backloggen är kön.

| # | Fråga | Förslag |
|---|---|---|
| N1 | Vad ska lagret före kodgeneratorn heta? | **Briefing** — ett lane med fyra lägen: *Init Brief* (deep), *Auto Brief* (server), *Ändringsbrief* (LLM-delta vid `clear-redesign`), *Snapshot* (återanvänd brief, ingen LLM). Ändringsbrief är inte «uppföljningens brief». **«Prompt-assist» pensioneras inte** (ägarbeslut 2026-08-19): det är knappen bredvid Plan, se glossaryn och [B10](aktiviteter/B10-prompt-assist-knapp.md). Pensionera «Assist Model» och «Förbättra-modell» som namn på Deep Brief-rutten. Inget nytt «AI-assistent»: det namnet är redan taget av Sajtagenten/OpenClaw. |
| N2 | Vad ska «Addendum» heta i produkttext? | **Källpaket** för samlingen av valbara ingredienser (variantreferens, UI Recipes, dossiers, media). Filnamn och kod (`variant-template-addenda.json`, `resolveVariantTemplateAddendum`) behåller sina namn. |
| N3 | Ska «Polish» återinföras? | Ja, men **efter** generering och under namnet **Refine**, drivet av verifierarens advisory-fynd (`post_generation_verifier`) — aldrig som omskrivning av användarens prompt. Ligger sist, efter B3. |
| N4 | Får vi — efter mätningen i B6 steg 1 — prova en **bevarande** Ändringsbrief för `clear-refine` bakom feature flag? | **Experimentet (B6 steg 2) kräver uttryckligt OK; mätningen i steg 1 gör det inte.** Gällande beslut 2026-08-14 («ingen delta brief på varje follow-up») står kvar. N4 är inte att bredda if-villkoret till alla redigerande lägen. Först om mätningen visar ett verkligt problem: ett flaggat experiment på `clear-refine` med den redan byggda *preserve*-varianten av `formatPriorDesignContext` (utan `intent: "clear-redesign"`). `capability-add` / `capability-modify` övervägs först efter ett bra utfall. Neutral och `ambiguous-*` lämnas. B1–B5 är städning, sanning och mätning och behöver inget nytt beslut. |
| N5 | Får det slutliga variantvalet (B7) kosta en extra embedding-runda på init? | **Kräver uttryckligt OK.** I dag kortsluter förmatchningspinnen oftast bort variant-embeddingen, så B7 lägger till en `text-embedding-3-small`-runda per ny sajt. Frågan är enbart latens och kostnad — inte om briefen ska få bestämma, vilket auktoritetsordningen redan svarat ja på. Mildringen (dela query-vektor med scaffold-sökningen) är möjlig men byter semantik och ska mätas, inte antas. |

## Ordning

Varje punkt är en egen PR. B1 och B2 rör samma filer och tas i följd; B3-B5 kan
köras parallellt efter B2. B7 kräver B3:s kvitto för att effekten ska gå att
mäta, och ska ligga **efter** B8 så att de två inte döljer varandras effekt i
samma mätfönster. B8 gick före resten (ägarbeslut 2026-08-18) eftersom den
löser den största kvalitetsskillnaden utan att kräva något nytt steg.

| Id | Uppgift | Kanonisk ägare | Kräver beslut |
|---|---|---|---|
| [B1](aktiviteter/B1-radera-forbikopplat-prompt-addendum.md) | Radera det förbikopplade prompt-addendumet och rätta docs som påstår att det lever. **PR #1040.** | `src/lib/builder/prompt-assist/`, `useInitBrief.ts` | nej |
| [B2](aktiviteter/B2-ett-namn-briefing.md) | Ett namn: Briefing. Konsolidera `promptAssist` → `briefing` i manifestet, städa användartexterna | `config/ai_models/manifest.json`, glossary | N1 |
| [B3](aktiviteter/B3-kallkvitto.md) | **Klar.** #1035. Källkvitto i Selection Rationale | `generation-input-package.ts`, `selection_rationale.py` | nej |
| [B4](aktiviteter/B4-kurera-variant-addenda.md) | Kurera de tio mest använda variant-addendumen, stäng de generiska | `config/variant-template-addenda.json` via Template Curator | nej |
| [B5](aktiviteter/B5-shadcnblocks-matning.md) | Sluta svälja shadcnblocks-fel tyst; mät om den betalda nyckeln ger riktig källkod | `shadcn-ui-recipes.ts`, `resolve-base.ts` | nej |
| [B6](aktiviteter/B6-andringsbrief-followup.md) | Ändringsbrief: mät per uppföljningsläge; därefter ev. bevarande LLM-brief för `clear-refine` bakom flagga — inte en grindbredd av redesign-vägen | `delta-brief-phase.ts`, `follow-up-orchestration-input.ts`, `formatPriorDesignContext` | **N4** (bara steg 2) |
| [B7](aktiviteter/B7-variantens-auktoritetsordning.md) | Variantens auktoritetsordning + Brief rankar addendum ur `sourceTemplateIds` | `orchestrate/finalize-prompts.ts`, `scaffold-variants/matcher.ts` | **N5** |
| [B8](aktiviteter/B8-brief-paritet-website-app.md) | **Klar.** Brief-paritet: ta bort snabbspåret och 420-teckengränsen så hemsidor får samma väg som appar | `simple-website-path.ts` (raderad), `create-chat-stream-post.ts`, `orchestrate/resolve-base.ts` | nej |
| [B9](aktiviteter/B9-inget-zip-i-hot-path.md) | **Klar.** #1037. Inget template-ZIP i hot path: `missing`/`stale`/`invalid` tysta och mätbara | `scaffold-variants/template-inspiration.ts` | nej |
| [B10](aktiviteter/B10-prompt-assist-knapp.md) | Prompt-assist-knapp bredvid Plan: rätta/strukturera utkastet i rutan, eget modellsteg i Backoffice. **PR #1038 öppen.** | `ChatInterface.tsx`, `config/ai_models/manifest.json`, `backoffice/pages/ai_models.py` | **beslutat 2026-08-19** |
| [B11](aktiviteter/B11-brief-i-scaffoldvalet.md) | **Landad #1042.** Briefens `pages` + `styleKeywords` + `domainProfile` väger i scaffold-valet. Follow-up-fixspåret håller `toneAndVoice` till copy/variant och utanför scaffold-keywords/embedding. | `scaffold-query-context.ts`, `scaffolds/matcher.ts` | nej |

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

- Återinför inte Prompt-Polish, «Skriv om» eller «Förbättra prompt». Prompt-assist-knappen (B10, ägarbeslut 2026-08-19) är ett annat steg: den rättar utkastet i rutan och gör ingen spec.
- Bygger inte en ny orkestreringsagent, ny agentyta eller ny UI-yta. B3
  återanvänder Selection Rationale, B4 återanvänder Template Curator, B7
  återanvänder eval-riggen `scripts/scaffolds/eval-landing-variants.ts`.
- Döper inte om kodidentifierare, DB-kolumner, telemetri-nycklar eller wire-fält
  som bär `promptAssist`/`prompt_assist`.
- Rör inte `BRA`-brancher, prod-migrationer eller env-hantering.
- Breddar inte `runClearRedesignDeltaBriefPhase` till `clear-refine` /
  `capability-*` genom att bara ändra if-villkoret.

## Klart när

Deep Brief kallas inte Prompt-assist i produkttext. Prompt-assist är knappen
bredvid Plan (B10). En generering går att förklara i efterhand utifrån ett
kvitto, minst tio variant-addendum är manuellt bedömda, ett misslyckat
shadcnblocks-anrop syns i loggarna i stället för att tyst bli en gissning,
ingen preliminär förmatchning kan längre överrösta Briefen i
auktoritetsordningen, och varje fritextbygge — hemsida som app, kort som
långt — får samma Briefing-väg. B6 räknas som klar när mätningen per
uppföljningsläge finns och en ev. refine-Ändringsbrief (N4) inte har landat
som grindbredd av redesign-vägen.
