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

Gemensam form för alla fem: **två källor som måste stämma överens, ingen grind
som kontrollerar att de gör det, och signalen visar grönt.** Använd det som
lukttest när du bedömer ett nytt fynd.

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

### Död källa — vilseledande, rör inte utan att läsa detta

`buildContractClarificationQuestion` (`src/lib/gen/contract/clarification.ts`)
kan **aldrig** ställa en fråga idag, av två oberoende skäl: `previewFirst`
defaultar till `true` och returnerar `null` på första raden, och
`inferPreGenerationContracts` pushar aldrig till `unresolvedDecisions`
(invariant-kommentar i filen). Anropsstället i
`src/lib/api/engine/chats/create-chat-stream-post.ts` ser dock levande ut, med
DB-skrivningar och en egen SSE-ström bakom `if (contractClarification)`. Flera
läsare har trott att det är här frågorna kommer ifrån. Loggad som skuld.

**Ägarbeslut krävs (2026-08-13) — tre vägar, välj en:**

1. **Låt OpenClaw svara i stället för användaren.** Kontraktsvalen (databas, auth,
   betalning) är precis den sorts fråga en modell med repokontext kan avgöra
   bättre än en otålig användare. Kräver att `previewFirst` kan sättas `false`
   för en icke-interaktiv väg, och att svaret loggas som antagande.
2. **Låt den faktiskt fråga användaren igen** i de fall där valet kostar pengar
   eller låser en leverantör. Då måste `inferPreGenerationContracts` börja
   fylla `unresolvedDecisions`, vilket är den verkliga arbetsinsatsen.
3. **Ta bort hela vägen** — funktion, anropsställe, DB-skrivningarna och
   `ConfirmedContractAnswer`-hanteringen. Minst kod kvar att missförstå.

Bygg inget av detta utan att ägaren valt. Att låta den ligga kvar halvdöd är
det enda alternativet som garanterat kostar nästa läsare en timme.

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

### Öppen precedensbugg från #962 (PR i arbete)

`classifyCeilingTrim` returnerar första matchande klass, och `named` prövas före
`required`. Efter #962 är `required` den mest skyddade klassen vid nödbromsen, så
en rutt som är **både** namngiven av användaren och required av scaffolden klassas
`named` och kan kapas före rena required-rutter. En användare som ber om en
webshop och själv räknar upp produktsidan bland 9 sidor kan alltså tappa
`/products` — samma döda länkar, annan dörr. Grenen för explicit sidantal har
omvänd ordning och är korrekt som den är, så fixen måste vara ordningsmedveten:
klassen ska vara den matchande klass som trimmas **sist** i den aktiva ordningen.
Branch: `fix/ceiling-class-precedence`.

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

Rätt ordning enligt både merge-agenten och ägarens coach: gör spår B först
(manifest → ruttkontrakt → planerare → validator). Bredda inte till en
sammansättningsmodell förrän ruttsanningen har en ägare.

**Korrigering av en spridd uppgift:** det finns **ingen** `sync-nav-from-route-plan.ts`
i repot. Endast en kommentar i `src/lib/gen/verify/verifier-pass.ts` (~779)
refererar till den, tillsammans med `extractArrayBody`. `src/lib/builder/editors/nav-items-editor.ts`
finns, men det är en redigerare för användaren — inte automatisk synk från
ruttplanen. Antag alltså inte att det finns ett embryo att bygga vidare på;
«RoutePlan → navigation» är nytt arbete. (Andra döda referensen i samma område:
`href-route-cross-check.ts` pekar på `docs/plans/active/repair-loop-hardening.md`
som inte längre finns.)

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
