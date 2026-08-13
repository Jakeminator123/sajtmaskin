# Handoff: frågeflödet och scaffoldernas ruttsanning

Skriven 2026-08-13 av merge-agenten efter en kvälls granskning. Två **oberoende**
spår som råkade ha samma rotorsak. Läs det spår du ska jobba i — de kräver inte
varandra.

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

- **Samla all frågelogik på ett ställe.** Rimligt: det finns bara tre levande
  källor plus en död. En modul som äger *får vi fråga, och vad frågar vi* medan
  varje anropare behåller sin trigger. Ingen ny yta, bara flyttat ägarskap.
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

### Den billiga grinden (föreslagen, inte byggd)

Ett fall i den befintliga `src/lib/gen/scaffolds/scaffold-manifest-validation.test.ts`
(körs av `npm run scaffolds:validate`): läs varje scaffolds `files/**`, plocka ut
interna länkar, och kräv att varje sådan path är garanterad. Hade fångat
`/products`-buggen före runtime, och fångar `/categories`, `/pipeline`,
`/forgot-password` **idag**.

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

## Öppna trådar

- **OpenClaw som diagnostiker på felvägen.** Ägaren har mer att berätta om detta
  och ska tillfrågas innan någon bygger. Tanken: när en deterministisk kontroll
  faller, låt OpenClaw läsa loggarna och säga *vilka två sanningsytor som gled
  isär*. Förlänger `src/lib/openclaw/**` som redan finns; ingen het väg.
- **`scaffolds:doctor`.** Ett kommando som skriver ut alla sanningsytor per
  scaffold (länkar, garanterade rutter, embeddings i Blob, artefaktfärskhet).
  Repo-verktyg för de tio scaffolderna — ska inte in i användarsajterna.

## Minsta verifiering

| Ändring | Kör |
|---|---|
| `follow-up-clarification.ts` | `npm run typecheck` + riktad vitest på filens test |
| `planning-helpers.ts` / `route-plan-builder.ts` | `npm run typecheck` + `npx vitest run src/lib/gen/route-plan.test.ts` |
| Scaffold-manifest eller defaults | `npm run scaffolds:validate` |
| Backloggen | `npm run check:bug-backlog` (blockerande i `quality`) |
