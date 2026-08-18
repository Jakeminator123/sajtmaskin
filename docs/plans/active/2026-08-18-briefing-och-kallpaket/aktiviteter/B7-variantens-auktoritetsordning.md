# B7 — variantens auktoritetsordning

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)

Kräver beslut: **N5** (extra embedding-runda på init).
Beror på: **B3** (källkvittot är mätytan — kör B3 först).
Ordning: körs **efter** [B8](B8-brief-paritet-website-app.md), i en egen PR.
B8 ger hemsidor samma Brief-väg som appar; B7 ändrar vem som väljer varianten.
Appar använder redan samma variantpinne som hemsidor och blir ändå ofta bra —
det talar för att den större kvalitetsvinsten ligger i B8. Landar de i samma
diff går ingen av dem att mäta.

## Problemet

Styrdokumentets [auktoritetsordning](../00-master-plan.md#auktoritetsordning-den-enda)
säger nivå 1 = användarens uttryckliga val, nivå 3 = Brief, nivå 4 = Scaffold
Variant. Koden följer den ordningen för scaffold och dossiers — men inte för
varianten.

Vid en vanlig ny sajt väljs varianten av en **preliminär gissning som görs innan
Briefen finns**, och den gissningen behandlas sedan som ett persisterat beslut.
Gissningen står inte med i auktoritetsordningen över huvud taget.

### Verifierad kedja (lokal master-checkout 2026-08-18)

| Steg | Vad som händer | Källa |
|---|---|---|
| 1 | Keyword-only förmatchning (~1 ms) av scaffold + variant, medvetet utan embeddings för att Brief-steget inte ska vänta på en round-trip | `src/lib/api/engine/chats/create-chat-stream-post.ts:263-312` |
| 2 | Gissningen skickas som `persistedVariantId` — kommentaren anger syftet: hindra brief→codegen-drift | `create-chat-stream-post.ts:913-919` |
| 3 | `persistedVariant` slås upp ur den inskickade id:n | `src/lib/gen/orchestrate/finalize-prompts.ts:85-89` |
| 4 | Prioritetsordning: `styleChoiceVariant ?? persistedVariant ?? resolveScaffoldVariant(...)` — det Brief-drivna valet ligger **sist** | `finalize-prompts.ts:102-115` |
| 5 | `resolveScaffoldVariant` är enda stället där `brief.visualDirection.styleKeywords` och `brief.toneAndVoice` når variant-poängsättningen | `src/lib/gen/orchestrate/scaffold-variant-resolver.ts:33-90` |

Följd: på init med sajttyp på Auto och utan uttryckligt stilval körs steg 5
aldrig. Briefens visuella riktning påverkar då inte vilken variant som renderas.

### Nollsignal blir ett låst beslut

Träffar inga nyckelord roterar `pickScaffoldVariant` deterministiskt med en
seed-hash över hela kandidatfältet (`src/lib/gen/scaffold-variants/matcher.ts:255-258`).
Det är medvetet och inte slumpmässigt — rotationen infördes för att svenska
prompts annars aldrig kunde nå varianter längre ner i bokstavsordningen. Men
resultatet är ett val **utan signal i sig**, och steg 2 gör det till det
slutliga beslutet innan Briefen ens hunnit producera en stilriktning.

Poängsättningen bakom: `scoreVariant` ger +3 per keyword-träff, +2 extra per
träff vid ≥ 2 träffar, och en färglägesboost (`matcher.ts:183-228`). Nyckelorden
bor per variant i `config/scaffold-variants/<scaffold>/<variant>.json`.

## Vad som INTE är fel

Rättelser mot en tidigare, för snäv problembeskrivning. De här punkterna ska
inte "åtgärdas" i B7:

| Påstående | Verklighet |
|---|---|
| «Briefen saknar makt över scaffold» | Falskt. `buildScaffoldQueryContext` (`resolve-base.ts:224`) skickar briefens `pages`, `styleKeywords` och domänhintar in i **både** keyword-vägen (`applyBriefKeywordBoost`, `matcher.ts:187-217`, `Math.max` — inte summa, så briefen kan inte tillverka en extra träff) och embedding-vägen (`buildScaffoldPrompt`, `matcher.ts:219-237`). |
| «Briefen styr inte dossiers» | Falskt. `brief.requestedCapabilities` är auktoritativt på capability-nivå (`resolve-base.ts:684-705`); provider-syskonet väljs sedan deterministiskt (`dossiers/select.ts:322-371`). Rör inte den vägen. |
| «Varianten blir slumpmässig» | Nästan. Deterministisk hash-rotation, inte slump. |
| «Alla starter får Deep Brief» | Numera sant. Fram till B8 hoppade korta hemsideprompter över Brief-LLM:en via snabbspåret; det är borttaget. Kvarvarande undantag är klientbrief, teknisk/preserve-prompt, audit och follow-up (`server-auto-brief-policy.ts`). |

## Spänningen fixen måste lösa

Pinnen finns av ett skäl. Brief-steget **får veta** vilken variant som
förmatchats, via ett hint-block med färgläge, signaturmotiv, typsnittspar,
tema-tokens och en kurerad referens (`src/lib/gen/scaffold-variants/variant-hints.ts:94-160`).
Byter vi variant efter briefen utan att bestämma vem som vinner, kan briefens
`Brief-Locked Design Values` motsäga den slutliga variantens tokens i samma
systemprompt.

Styrdokumentet har redan svaret: Brief är nivå 3, Variant nivå 4. **Briefen
vinner**, och varianten ska väljas för att tjäna briefen — inte tvärtom.
Hint-blocket är redan formulerat som just en hint («use as design starting
point, adjust when user intent differs», `variant-hints.ts:124`), så texten
behöver inte skrivas om.

## Uppgift

Minsta möjliga ändring. Inget nytt LLM-steg, ingen ny orkestratoragent, ingen ny
UI-yta.

### 1. Skilj på de tre begreppen på tråden

I dag betyder `persistedVariantId` två olika saker: «variant från en tidigare
runda» (uppföljning) och «preliminär gissning» (init). Separera dem.

- Lägg till `variantHintId` i `OrchestrationInput` (`src/lib/gen/orchestrate/types.ts`).
- `create-chat-stream-post.ts:919` skickar förmatchningen som `variantHintId`.
- `persistedVariantId` behåller sin riktiga betydelse och används oförändrat av
  uppföljningsvägen.
- Döp **inte** om fältet i DB, telemetri eller wire-format som redan bär
  `persistedVariantId` — mappa i text enligt `terminology.mdc`.

### 2. Låt det slutliga valet ske efter Briefen

Ny ordning i `finalize-prompts.ts:102-115`:

| Nivå | Källa | Kod |
|---|---|---|
| 1 | Uttryckligt stilval (Byggval Stil) | `styleChoiceVariant` — oförändrat först |
| 2 | Uppföljningsfrys / persisterad variant | `lockedVariant` ?? `persistedVariant` |
| 3 | Brief-drivet val: prompt + `visualDirection.styleKeywords` + `toneAndVoice` + embeddings | `resolveScaffoldVariant(...)` |
| 4 | Hinten, bara när nivå 3 returnerar `null` | `variantHintId` |

Init kortsluter alltså inte längre på hinten. Scaffold-valet är oförändrat och
löses fortsatt via `matchScaffoldAuto(prompt + brief)`.

### 3. Uttryckliga val förblir absoluta

`styleChoiceHint` och explicit `scaffoldId` (Byggval) ska vinna över allt annat.
Det gäller redan i dag — B7 lägger till regressionsskydd så att steg 2 inte kan
råka flytta dem.

### 4. Lägg inte scaffold-/variant-ID i Brief-schemat

Uttryckligen utanför scope. En LLM som får skriva fria interna id:n hallucinerar
dem. Skulle det någon gång göras måste schemat begränsas till en kandidatlista
— men briefens `styleKeywords`/`toneAndVoice` räcker för att styra valet, och de
finns redan.

### 5. Observability — annars går effekten inte att mäta

Två fällor att räta ut först:

- `OrchestrationBase.scaffoldVariantId` är i dag bara en **eko av inputen**
  (`resolve-base.ts:901`: `input.persistedVariantId ?? null`), medan det verkliga
  valet är `finalized.variantId` (`finalize-prompts.ts:266`).
- `buildGenerationInputPackage` sprider `...base` **och** sätter `variantId`
  (`orchestrate/generation-package.ts:87-99`), så paketet bär båda fälten och de
  kan säga olika saker. Källkvittot (B3) ska läsa `variantId`, aldrig ekot.

Lägg sedan till ett `variantSelection`-objekt som speglar det befintliga
`scaffoldSelection`:

| Fält | Innehåll |
|---|---|
| `source` | `style-choice` \| `follow-up-lock` \| `brief-embedding` \| `brief-keyword` \| `keyword` \| `hash-fallback` \| `hint-fallback` |
| `score` / `runnerUpScore` / `margin` | mot `VARIANT_DOMINANT_MARGIN` (`matcher.ts:157`) och `VARIANT_EMBEDDING_MIN_SCORE` (`matcher.ts:150`) |
| `hintId` / `finalId` / `changedFromHint` | pre-match kontra slutligt val |

Det kräver att `pickScaffoldVariant` och `pickScaffoldVariantAsync` returnerar
ett skäl, inte bara varianten — det är den huvudsakliga kodytan i B7. Kvittot
visas i Selection Rationale via B3. **Bygg ingen ny sida.**

### 6. Tester och evals

Riktade tester med svenska semantiska formuleringar, alltså sådana som inte
innehåller de nyckelord matchningen letar efter:

- «folk ska kunna boka tid hos mig» — `boka tid` finns inte i någon
  scaffold-nyckelordsbank (hospitality-listan har `boka bord`).
- «nåt lugnt för min lilla salong»
- «skogen och naturen ska kännas i designen»

Regressionsskydd:

| Yta | Måste fortsatt gälla |
|---|---|
| Byggval Stil | Uttryckligt val vinner över brief och embeddings |
| Byggval sajttyp | Explicit scaffold oförändrad |
| Enkla hemsidevägen | Ingen brief → deterministiskt variantval, ingen ny LLM-runda |
| Uppföljning neutral | Fryst variant behålls |
| `clear-redesign` | Låset släpper som i dag |

Filer att bygga vidare i: `src/lib/gen/scaffold-variants/matcher.test.ts`,
`style-choice-variants.test.ts`, `src/lib/gen/orchestrate-scaffold-intent-clamp.test.ts`,
`src/lib/gen/orchestrate/generation-package.test.ts`. Eval-riggen finns:
`scripts/scaffolds/eval-landing-variants.ts` — återanvänd den, bygg ingen ny.

## Risker

| Risk | Storlek | Not |
|---|---|---|
| **Latens** | Störst posten | I dag kortsluter pinnen oftast bort variant-embeddingen på init. Görs nivå 3 auktoritativ tillkommer en `text-embedding-3-small`-runda per init. |
| **Kostnad** | Liten men verklig | Anropet loggas som workload `scaffold_variant_match` (`matcher.ts:356-362`) och når `llm_usage` → debitering. |
| **Brief→codegen-drift** | Medveten | Driften pinnen skyddade mot återinförs. Motmedlet är den dokumenterade auktoritetsordningen (B2/B3), inte en pin. |
| **Visuell regression** | Låg | Uppföljningsfrysen är orörd; bara nya init-val ändras. Befintliga sajter påverkas inte. |

**Latensmildring att utreda, inte att anta:** `pickScaffoldVariantAsync` tar
redan emot en färdig `queryVector` (`matcher.ts:317-322`), och båda indexen
använder `text-embedding-3-small` med 1536 dimensioner
(`scaffolds/scaffold-embeddings-core.ts:9-10`,
`scripts/scaffolds/generate-variant-embeddings.ts:41-42`). Scaffold-sökningens
vektor skulle alltså tekniskt kunna återanvändas. **Men** de två vägarna
embeddar olika text — scaffold-sökningen kör `expandQuery` plus briefkontext,
variantvalet kör prompt + style/tone. Att dela vektor byter alltså semantik i
variantvalet. Mät före beslut.

## Vad som INTE ingår

- Ingen ny orkestrerande LLM och inget nytt steg i `config/ai_models/manifest.json`.
- Ingen ändring av dossier-selektionen — briefen har redan rätt auktoritet där.
- Inga ändrade trösklar i scaffold-matchningen (`MIN_SCORE`, embedding-golv).
- Ingen regenerering av variant-embeddings och inget rört i artefakten.
- Inga omdöpta kodidentifierare, DB-kolumner eller telemetri-nycklar.
- Ingen ny UI-yta; kvittot går via Selection Rationale (B3).

## Verifiering

- `npm run typecheck` + `npm run scaffolds:validate`.
- Riktad vitest: `scaffold-variants/matcher.test.ts`,
  `style-choice-variants.test.ts`, `variant-hints.test.ts`,
  `orchestrate-scaffold-intent-clamp.test.ts`, `orchestrate/generation-package.test.ts`.
- `variant-integrity.test.ts` ska vara grön utan ändring — rör den inte.
- `scripts/scaffolds/eval-landing-variants.ts` före och efter; jämför
  variantfördelningen.
- Manuellt: fyra sajter av olika typ, jämför `variantSelection.source` i
  B3-kvittot mot vad prompten faktiskt bad om.

## Klart när

En preliminär förmatchning kan inte längre bli ett slutligt variantbeslut,
briefens stilriktning når variantvalet på init, uttryckliga Byggval vinner
fortfarande över allt, och kvittot säger i efterhand vilken källa som valde
varianten och med vilken marginal.
