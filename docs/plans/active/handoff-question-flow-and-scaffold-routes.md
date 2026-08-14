# Handoff: frågeflödet och scaffoldernas ruttsanning

Skriven 2026-08-13 av merge-agenten efter en kvälls granskning, utökad samma kväll
med ägarens coachs invändningar. Tre spår: A och B är oberoende, C är den djupare
orsaken bakom B och ska inte påbörjas före B.

Ägarens sammanhang: han har kämpat med scaffold-systemet i tre månader och är
trött på att varje fix föder ett nytt hörnfall. Bygg inte nya lager. Backloggen
äger de öppna raderna; den här filen äger bara kontexten som inte får plats där.

## Vad som redan är gjort — gör inte om det

| Commit | Vad |
|---|---|
| `83ede61` (#962) | Sidtakets nödbroms kapar namngiven sida före `required` scaffold-rutt. Kolonlistan avvisar instruktionssvansar efter `och`/`and` |
| `becdb6c` (#974) | `href`-extraktorn tål whitespace runt kolonet; regressionslås på ecommerce-navmönstret |
| `dbb3463` (#971) | Backoffice kan inte längre säga «matchning publicerad» när bara lokal cache skrevs |
| `a5d54ca` (#973) | `db:init` fäller vid RLS-fel; CI-Postgres emulerar `service_role` |
| `a0338fd` (#972) | Generationslåset läcker inte mellan SSE-tester |
| `ddd7da2` (#976) | Sidtaket klassar en namngiven **och** required rutt som `required`, så den överlever nödbromsen |
| `12964dd` (#977) | Döda dokumentreferenser rättade; `ecommerce` planerar inte längre en olänkad `/cart` |
| `f0836d2` (#975) | Färre onödiga klargöringsfrågor — svensk böjning räknas som specifikt mål |
| `b98e3bf` (#978) | Sidantal skrivet i ord känns igen (`bara en sida`, `den enda sida`, `två sidor`) |
| `8a3b8a7` (#980) | Preview-klienten laddas om när runtimen byts, så server-HTML och klient-JS inte kommer från olika byggen (`SM-044`) |

Gemensam form för de flesta: **två källor som måste stämma överens, ingen grind
som kontrollerar att de gör det, och signalen visar grönt.** Använd det som
lukttest när du bedömer ett nytt fynd.

**Stängd dubblett:** #979 löste `SM-044` parallellt med #980 (uppgiften
delegerades två gånger). Den är stängd, men branchen `fix/preview-runtime-restart-race`
ligger kvar och innehåller en **trafikgrind** som #980 saknar. Om hydration-felet
återkommer i skarp drift — alltså om en request träffar mitt i bytesfönstret — är
det första stället att titta.

## Spår A — frågeflödet i buildern

**Problemet enligt ägaren:** buildern ställer frågor i chatten i stället för att
bygga, och frågorna känns mekaniska.

**Verifierat:** modellen väljer *inte* att fråga. Verktyget
`askClarifyingQuestion` exponeras bara i planläge (`own-engine-plan-mode.ts`),
och core-kontraktet säger «Write code, not prose»
(`config/prompt-core/00-core-contract.md`). Frågan ställs av kod, före modellen.

### Levande källor

| Källa | Fil | Blockerar codegen? |
|---|---|---|
| Follow-up-klargöring — **den ägaren möter** | `src/lib/providers/own-engine/follow-up-clarification.ts`, anropad från `src/lib/api/engine/chats/chat-message-stream/handler.ts` | Ja, `awaitingInput`, ingen version |
| Planläge: `blockers[]` | `src/lib/gen/plan/prompt.ts` regel 11 | Ja, för byggfasen |
| F3-fortsättning utan kod | `src/lib/providers/own-engine/generation-stream.ts` | Ja, för nästa F3 |

### Borttagen källa — kontraktsklargöring (2026-08-14)

Ägaren valde väg 3 (2026-08-13): ta bort hela vägen. `buildContractClarificationQuestion`,
SSE-grinden `createPreGenerationContractGateReadableStream`,
`ConfirmedContractAnswer`-hanteringen och anropsställena i
`create-chat-stream-post.ts` / `codegen-turn.ts` är borta.

Follow-up-klargöring (`follow-up-clarification.ts`) och F3-fortsättning är
levande och orörda. Historiska `## Contract Clarification Answer`-wrappers
i chattar strippas fortfarande i display-lagret.

### Fällan i klassificeraren

`isUnderspecifiedFollowUp` kräver i ordning: ≤300 tecken, matchar ett
vaghetsmönster, matchar **inte** explicit riktning, matchar **inte** specifikt
mål, sedan ≤10 ord. Ordräkningen är alltså sist och tämligen väl skyddad — den
verkliga svagheten är **täckningen i de tre mönsterlistorna**. En tydlig prompt
vars formulering ingen lista känner igen blir klassad som vag. Filen har redan en
kommentar om ett historiskt sådant fall (`"till Hej"`).

Öka aldrig antalet frågor när du rör den här filen. Additiva mönster i
`FOLLOW_UP_EXPLICIT_DIRECTION_PATTERNS` / `FOLLOW_UP_SPECIFIC_TARGET_PATTERNS`
kan bara minska frågorna, och är därför den säkra riktningen. Använd
Unicode-klasser (`\p{L}`, `u`-flagga) — ASCII `\w`/`\b` missar `ändra`,
`större`, `mörkare`.

### Ägarens egna idéer på detta spår

- **Samla all frågelogik på ett ställe (ägarens uttryckliga önskan).** Det finns
  bara tre levande källor plus en död, så det är billigt. En modul äger *får vi
  fråga, och vad frågar vi*, medan varje anropare behåller sin egen trigger —
  alltså inget nytt lager, bara flyttat ägarskap. Vinsten är att nästa gång
  ägaren säger «varför frågade den?» finns det ett ställe att titta på, och en
  ändring av frågepolicyn behöver inte röra tre flöden.
- **Fråga bara i verkliga kantfall.** Det är redan designen; problemet är att
  kantfallet definieras av mönsterlistor som inte täcker verkligheten.
- Ett alternativ ägaren inte tagit ställning till: bygg den troligaste
  tolkningen och **redovisa antagandet** i stället för att blockera. Planläget
  har redan begreppet (`assumptions` i plan-artefakten). Kräver ägarbeslut —
  det är ny produktbeteende, inte en härdning.

## Spår B — scaffoldernas ruttsanning

**Status 2026-08-14:** flytten och grinden är byggda (PR
`feat/scaffold-route-contract`): `ScaffoldManifest.routeContract` äger nu
ruttkontraktet (required/optional/declared/dynamic), switchen i
`planning-helpers.ts` är borta, och grinden i
`scaffold-manifest-validation.test.ts` fäller på SM-042-fallen + SM-043:s
`/cart` via en explicit undantagslista. **Ägarbeslutet nedan är fortfarande
öppet** — undantagen tas bort först när riktningen är vald.

**Problemet:** scaffoldernas navigering länkar hårdkodat till sidor som
ruttplaneraren inte garanterar. Kapas eller planeras inte rutten får den
genererade sajten döda länkar.

**Rotorsaken är strukturell, inte tio olika fel:** varje scaffolds ruttkontrakt
är handskrivet i en `switch` i `applyScaffoldDefaults`
(`src/lib/gen/route-plan/planning-helpers.ts`), alltså i en helt annan fil än
scaffolden. Manifesten har inget `requiredRoutes`-fält. Därför kan ingen
validator jämföra länk mot rutt, och `case`-grenarna divergerar godtyckligt
(`blog` villkorar på `buildIntent !== "app"`, `dashboard` på
`buildIntent === "app"`, `ecommerce` inte alls).

### Mätning 2026-08-13

| Scaffold | Garanterad | Valfri | Saknas helt i defaults |
|---|---|---|---|
| `ecommerce` | `/products` | — | `/categories`, `/om`, `/category/*`, `/product` |
| `app-shell` | — | `/settings` | `/pipeline`, `/tasks` |
| `auth-pages` | `/login` | `/signup` | `/forgot-password` |
| `dashboard` | — | `/analytics`, `/settings` | `/users` |
| `blog` | `/blog` | — | — |
| `base-nextjs`, `landing-page`, `portfolio`, `projekt-bas-app`, `saas-landing` | — | — | — |

Sex av tio är rena. `/cart` är skräp i motsatt riktning: den finns i defaults men
länkas inte längre sedan en cart-drawer ersatte sidan.

### Ägarbeslutet som blockerar spåret

Två vägar, och de utesluter varandra:

1. **Låt menyn spegla planen** — ta bort eller härled länkarna. Påverkar hur
   genererade sajter ser ut.
2. **Låt planen garantera menyn** — markera rutterna `required`. Tvingar fram
   fler sidor per runda och krockar med det medvetna taket på tre sidor.

Välj inte åt ägaren. Grinden nedan tvingar fram valet utan att göra det.

### Målbilden: scaffolden äger sina egna rutter

`ScaffoldManifest` (`src/lib/gen/scaffolds/types.ts`) har redan
`structureProfile`, `contentProfile`, `siteKind`, `features` och `files` — men
**inget** ruttfält. Flytta ruttkontraktet dit, låt planeraren läsa manifestet,
och `switch (resolvedScaffold.id)` i `applyScaffoldDefaults` kan försvinna. Då
ligger sanningen i samma mapp som filerna som beror på den.

**Fyra kategorier, inte två.** «Varje länk måste vara en `required` rutt» är för
grovt — `ecommerce` har riktiga filer för `/category/[slug]` och `/product/[id]`,
och länkar till exempeldata som `/category/category-1`. Skilj på:

| Kategori | Betyder | Exempel |
|---|---|---|
| `required` | Planen måste innehålla den; scaffoldens filer länkar dit ovillkorligt | `/products` |
| `optional` | Får planeras, får kapas | `/cart` |
| `declared` | Filen finns i scaffolden men rutten behöver inte planeras varje runda | `/om` |
| `dynamic pattern` | Matchas som mönster, aldrig som lista | `/product/[id]` |

Utan den uppdelningen skapar «standardiseringen» femtio `required`-rutter och
nästa fixkarusell.

### Den billiga grinden (föreslagen, inte byggd)

Ett fall i den befintliga `src/lib/gen/scaffolds/scaffold-manifest-validation.test.ts`
(körs av `npm run scaffolds:validate`): läs varje scaffolds `files/**`, plocka ut
interna länkar, matcha dynamiska mot mönster, och kräv att varje kvarvarande path
finns i manifestets ruttkontrakt. Hade fångat `/products`-buggen före runtime, och
fångar `/categories`, `/pipeline`, `/forgot-password` **idag**.

### Precedensfallgropen — stängd i #976, men läs den innan du rör trimningen

`classifyCeilingTrim` returnerade första matchande klass, och `named` prövades
före `required`. När #962 gjorde `required` mest skyddad vid nödbromsen blev en
rutt som är **både** namngiven och required klassad `named` — och därmed sämre
skyddad än före #962. En användare som ber om en webshop och själv räknar upp
produktsidan bland nio sidor kunde alltså tappa `/products`.

Klassningen är nu **ordningsmedveten**: klassen är den matchande klass som trimmas
**sist** i den aktiva ordningen. Det spelar roll att de två grenarna har olika
ordning — vid nödbromsen är `required` mest skyddad, vid explicit sidantal är
`named` det. Ändrar du trimordningen i en gren måste du tänka om klassningen i
båda. Lärdomen: en fix som flyttar prioritet kan göra ett fall sämre än före
fixen, så leta alltid efter rutter som tillhör två klasser samtidigt.

### Varför inte en LLM-verifierare här

`src/lib/gen/verify/href-route-cross-check.ts` gör redan analysen i runtime, men
`runFinalizePreflight` klassar fynden som `non_blocking_quality_warning` — den
ser problemet och släpper igenom. En modellbaserad grind hamnar i samma hörn:
falsklarm tvingar den att vara icke-blockerande, och då är den ännu en varning
ingen agerar på. Deterministiska kontroller kan vara blockerande just för att de
inte kan ha fel på ett trovärdigt sätt.

Filens egen kommentar hänvisar till `docs/plans/active/repair-loop-hardening.md`
för «the gate-flip path». **Den filen finns inte längre** — död referens att
städa när någon ändå rör filen.

## Spår C — struktur och domän är samma dimension idag

Upptäckt 2026-08-13 ur ägarens fråga: *«vad händer om prompten säger EN sida, men
att det ska vara en ecommerce?»* Det avslöjar en djupare krock än spår B.

Idag konkurrerar `landing-page`, `ecommerce`, `blog`, `dashboard` och `portfolio`
om **ett** val, som om de låg i samma dimension. Men prompten bär tre
oberoende signaler:

| Dimension | Exempel |
|---|---|
| Struktur | en sida, flera sidor, dashboard, app-shell |
| Domän | handel, portfolio, redaktionellt, tjänsteföretag |
| Funktioner | varukorg, produkter, checkout, auth, betalningar |

«En enda landningssida, men ecommerce» är alltså inte motsägelsefullt — det är
**one-page commerce**. Systemet kan inte uttrycka det: scaffold-matchern väljer
ett helt paket, och sedan kapar sidtaket ner till `/`.

**Ohunterat påstående som måste verifieras först:** att scaffoldens filer för
`/products`, `/categories` m.fl. ändå hamnar i projektet vid slutmergen även när
ruttplanen bara innehåller `/`. Om det stämmer får användaren en «en-sidig» sajt
som innehåller sex sidor — en kontraktsbugg, inte en smakfråga. Verifiera i
finalize-/merge-vägen innan någon planerar om arkitekturen. Reproförslag: init
med «en enda landningssida för en webshop med produkter och varukorg», läs
`routePlan` och de faktiskt levererade filerna.

Halva modellen finns redan: `structureProfile`, `contentProfile`, `siteKind` och
`features` ligger i manifestet. Det som saknas är att runtime väljer **paket**
i stället för att sätta samman struktur + domän + funktioner.

### Kärnan i spår C: briefen tolkar, men den explicita begränsningen överlever inte

**Rättelse 2026-08-13:** ett tidigare påstående i den här handoffen — att
*ingen* LLM läser prompten i freeform-init — var fel. Det belades i prod
(`llm_usage` för generationsfönstret 2026-08-13 19:02–19:12 UTC: `phase: brief`,
`workload: dynamic_instructions`, modell `gpt-5.6-sol`, ~52 mUSD, sex sekunder
före embeddings; `generation_telemetry.brief_influenced_selection = true` för
chat `90624ed9-01e2-4d9a-8e7c-ca55f2477511`).

Init-freeform kör redan ett brief-steg **före** scaffold-matchningen:

| Steg | Fil-ankare |
|---|---|
| Klient triggar Deep Brief | `useBuilderPromptActions.applyDynamicInstructionsForNewChat` → `generateDynamicInstructions(..., { forceDeepBrief: true })` i `src/app/builder/useBuilderPromptActions.ts` |
| Hook → HTTP | `useInitBrief` (`src/lib/hooks/useInitBrief.ts`) POST:ar `/api/ai/brief` med `source: "dynamic_instructions"` |
| Route → modell | `src/app/api/ai/brief/route.ts` anropar `generateSiteBriefObject` |
| Schema + usage | `generateSiteBriefObject` i `src/lib/builder/site-brief-generation.ts` kör `generateObject` mot `siteBriefSchema` och loggar `recordLlmUsage({ phase: "brief", workload: <source> })` |

`resolveOrchestrationBase` (`src/lib/gen/orchestrate/resolve-base.ts`) är
**fortfarande** deterministisk i sig: den tar emot briefen som `input.brief`,
väljer scaffold via embedding-likhet och bygger ruttplanen. `buildRoutesFromBrief`
(`src/lib/gen/route-plan/planning-helpers.ts`) gör `brief.pages[]` till rutter med
`required: true`. Poängen är alltså inte «ingen tolkning finns» utan att
**användarens explicita begränsning inte överlever briefen** — briefen kan
expandera sidlistan, och den deterministiska vägen har ingen separat grind som
tvingar tillbaka den.

En verklig brist kvarstår i regexen: `EXPLICIT_PAGE_COUNT_RE` i
`planning-helpers.ts` kräver siffror (`\d{1,2}` + sidor/pages/…), så ordform
som «en sida» / «enda sidan» missas. Öppen PR #978 täcker den delen.

Uppdelningen finns redan i princip — det som saknas är att den explicita
begränsningen når fram och respekteras:

| Steg | Vem | Status idag |
|---|---|---|
| Tolka | Billig modell (`phase: brief`) | Körs redan via `/api/ai/brief` + `siteBriefSchema` |
| Kontrollera | Kod | Delvis: `buildRoutesFromBrief` + sidtak/regex, men ingen grind som håller kvar användarens explicita tak mot briefens expansion |
| Bygga | Kodmodell | Som idag, med ruttplan som färdig instruktion |

Uppgiften är alltså inte att bygga en ny planerare, utan att se till att den
tolkning som redan sker inte får radera eller kringgå användarens uttryckliga
scope — och att den sifferfria sidräkningen (#978) når `detectExplicitPageCount`.

Rätt ordning enligt både merge-agenten och ägarens coach: gör spår B först
(manifest → ruttkontrakt → planerare → validator). Bredda inte till en
sammansättningsmodell förrän ruttsanningen har en ägare.

**Embryot finns redan — bygg vidare, uppfinn inte.**
`src/lib/gen/scaffolds/sync-nav-from-route-plan.ts` (+ dess test) skriver om
navigeringen utifrån ruttplanen, tillagd i #963 (`4b102e091`). Modulens egen
kommentar säger: *«Dashboard is the only target today. To reuse for another
scaffold, add …»*. Alltså finns halva spår C redan implementerad för en scaffold,
och att bredda den är en förlängning — inte nytt arbete.

> **Varning till nästa agent, och orsaken till att den här filen först påstod
> motsatsen:** huvudcheckouten `C:\Users\jakem\dev\projects\sajtmaskin` låg
> 2026-08-13 **64 commits efter** `origin/master`, eftersom ägaren har
> ocommittade ändringar som blockerar fast-forward. En `Glob`/`Test-Path` där
> svarar alltså «finns inte» om filen tillkom idag. Kontrollera alltid mot
> `git ls-tree -r --name-only origin/master -- <path>` eller i en färsk worktree.
> Repots `workflow.mdc` varnar för kallt sökindex; en gammal checkout ger samma
> fel utan att indexet är inblandat. Samma kväll missade ett `llm_usage`-svep
> brief-raden för att det filtrerade på `chat_id` — briefraden har
> `chat_id: null` (se `SM-045`), så räkna alltid i tidsfönstret också, inte bara
> via claimat chatt-id.

## Öppna trådar

- **OpenClaw som diagnostiker på felvägen.** Ägaren har mer att berätta om detta
  och ska tillfrågas innan någon bygger. Tanken: när en deterministisk kontroll
  faller, låt OpenClaw läsa loggarna och säga *vilka två sanningsytor som gled
  isär*. Förlänger `src/lib/openclaw/**` som redan finns; ingen het väg.
- **Sambandscentralen bor i Backoffice.** Ägaren bygger redan Backoffice i den
  riktningen, så en `scaffolds:doctor`-vy hör dit snarare än i ett nytt CLI: alla
  sanningsytor per scaffold på en sida (länkar, garanterade rutter, embeddings i
  Blob, artefaktfärskhet). Det är ett verktyg för de tio scaffolderna i repot —
  det ska inte in i användarsajterna.

## Minsta verifiering

| Ändring | Kör |
|---|---|
| `follow-up-clarification.ts` | `npm run typecheck` + riktad vitest på filens test |
| `planning-helpers.ts` / `route-plan-builder.ts` | `npm run typecheck` + `npx vitest run src/lib/gen/route-plan.test.ts` |
| Scaffold-manifest eller defaults | `npm run scaffolds:validate` |
| Backloggen | `npm run check:bug-backlog` (blockerande i `quality`) |
