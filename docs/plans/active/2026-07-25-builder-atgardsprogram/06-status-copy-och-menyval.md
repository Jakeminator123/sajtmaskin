---
status: active
owner: unassigned
created: 2026-07-25
topic: Statusärlighet i presentationslagret — Lansering-kortet, den felaktiga versionsbannern och menyvalet som inte gör vad det heter. Täcker Ö8, F8, Ö11.
source: Observationssession 2026-07-25 (`.cursor/logg-internet/runs/2026-07-25_0302.md`, Ö8 + Ö11 + Fynd 8). Kodverifierat mot master `57416834`.
parent: 00-master-plan.md
---

# Spår 06 — Status, copy och menyval

## TL;DR

Tre saker i UI påstår något som inte stämmer eller inte betyder något. Alla tre
är billiga att åtgärda och helt isolerade från pipelinen, så spåret kan köras
parallellt med 01 och 02.

| ID | Vad UI säger | Vad som gäller |
|---|---|---|
| Ö8 | "Lansering / Redo att publicera" med badge-status | oklart för användaren vad det indikerar och vilka gates som styr |
| F8 | "Du redigerar v2 — inte senaste v1" | sant, men ordet "senaste" är fel — v1 är den senaste *användbara* |
| Ö11 | "Anthropic-jämförelse" | jämför ingenting; byter bara modell |

## F8 — bannern har rätt men säger fel ord

> **Diagnosen är omskriven efter Codex-granskning (P2, PR #614).** Ett tidigare
> utkast läste bannern som ett omöjligt tillstånd och föreslog en guard som skulle
> dölja den när aktiv version har högre nummer än "senaste". Det var fel, och
> guarden hade varit skadlig: den hade tystat en **legitim** varning medan
> uppföljningar fortsatte bygga på en underkänd bas — precis den typ av
> false-green som repots granskningsregler prioriterar högst.

Bannern renderas av `src/components/builder/ChatInterface.tsx:677-698` och styrs
av `followUpBaseInfo` i `src/app/builder/BuilderShellContent.tsx:199-214`.
Villkoret är `activeVersionId !== latestVersionId`.

Nyckeln ligger i vad `latestVersionId` faktiskt är. Den kommer från
`useBuilderDerivedState.ts:108-122` → `selectPreferredEngineVersion`
(`src/lib/db/engine-version-lifecycle.ts:250-264`), vars dokumenterade semantik är:

> newest non-failed, non-superseded version wins

Det är alltså **inte** "senaste versionen" utan "senaste användbara versionen".

I sessionen underkändes v2 av quality gate. Då är utfallet korrekt: aktiv version
är v2 (den användaren tittar på), och den föredragna är v1 (den som fungerar).
Bannern försökte säga något viktigt — *du står på en underkänd version och nästa
meddelande bygger på den* — men formulerade det som en självklar lögn genom att
kalla v1 "senaste".

Åtgärden är alltså språklig och begreppslig, inte en guard:

1. **Byt ord.** `latestLabel` ska inte presenteras som "senaste". Copyn ska säga
   varför den andra versionen föreslås, t.ex.: *"Du redigerar v2, som inte gick att
   bygga. Nästa meddelande bygger på v2 — växla till v1 om du vill utgå från den
   senaste som fungerade."*
2. **Byt namn på fältet** från `latestLabel` till något som speglar
   `selectPreferredEngineVersion`, t.ex. `preferredLabel`. Namnet är orsaken till
   att copyn blev fel.
3. **Skilj de två fallen.** "Aktiv är äldre än föredragen" och "aktiv är nyare men
   underkänd" är olika situationer för användaren och förtjänar olika text. I dag
   får de samma.

Ny test: när aktiv version är underkänd och föredragen är en äldre fungerande
version, innehåller bannertexten inte ordet "senaste" om den underkända, och
förklarar varför den andra föreslås.

Ny test (regressionsskydd för rättelsen ovan): bannern renderas **fortfarande** när
aktiv version har högre nummer än den föredragna.

## Ö8 — vad indikerar "Lansering" egentligen?

Användarens fråga var direkt: vad betyder de här raderna, och vilka gates styr
dem?

Ägarna av svaret:

| Lager | Fil | Roll |
|---|---|---|
| Beräkning | `src/app/api/engine/chats/[chatId]/readiness/route.ts` | kör kontrollerna och sätter severity (`blocker` / `warning`) |
| Kontrakt | `src/lib/chat-readiness.ts` | typerna och statusreglerna (`blocked` / `warning` / `ready`) |
| Presentation | `src/lib/builder/deploy-readiness-ui.ts` | etiketter och badge-klasser |

I sessionen visade kortet, korrekt: *Blockerar deploy — Versionen underkändes av
quality gate (typecheck/build)* plus en icke-blockerande rekommendation. Det var
sant och användbart **just då**. Problemet är att kortet också tar plats och
kräver tolkning när allt är grönt, och att raderna använder intern vokabulär
("quality gate", "preflight") som inte förklaras.

Tre alternativ, ägarbeslut B2:

| Alt | Beteende | Fördel | Kostnad |
|---|---|---|---|
| **A** | Ta bort kortet helt | maximal previewyta | blockerare blir osynliga; `Publicera` misslyckas utan förklaring |
| **B** | Visa **bara** vid `blocked` eller `warning` | ytan tillbaka när allt är bra; problem syns när de finns | användaren ser inte "allt klart" som positiv bekräftelse |
| **C** | Behåll alltid, men skriv om till klarspråk | pedagogiskt | fortsätter äta yta |

Rekommendation: **B**, med `Publicera`-knappen som bärare av den positiva
signalen (den vet redan när den är blockerad). Klarspråksomskrivningen från C bör
göras oavsett vilket alternativ som väljs — den kostar ingenting extra.

Klarspråkskrav om B eller C väljs: varje rad ska säga **vad** som är fel och
**vad användaren kan göra**, inte vilken intern gate som fällde. "Versionen
underkändes av quality gate (typecheck/build)" blir t.ex. "Koden går inte att
bygga än — vi försöker reparera. Du kan skriva vad som ska ändras."

## Ö11 — "Anthropic-jämförelse" jämför ingenting

Kedjan: `BuilderHeader.tsx:~326-335` → `onApplyAnthropicComparePreset` →
`BuilderShellContent.tsx:~829-833` → `vm.setSelectedModelTier("anthropic")`.

Det är allt. Menyposten är därmed **identisk** med att välja "Anthropic" i
radiogruppen strax ovanför (`MODEL_TIER_OPTIONS`) — samma dropdown, bara under en
avdelare. Namnet antyder en jämförelse eller sida-vid-sida-körning som inte finns
någonstans i koden.

Vad `anthropic`-profilen faktiskt gör (`config/ai_models/manifest.json`):

| Del | Värde |
|---|---|
| Byggmodell | `claude-opus-4.8` |
| Fasrouting | planner / generator / deploy-assistant → `claude-opus-4.8`; fixer + verifier → vald byggmodell |
| Brief | `anthropic/claude-opus-4.8` |
| Tänkande | planner + generator på hög reasoning-nivå |
| Reparation | 2 deterministiska autofix-pass, 3 syntaxpass, 2 server-repair-pass |
| Tidsgränser | 600 s route, 120 s verifier |

Åtgärd: **ta bort menyposten.** Radiogruppen täcker redan funktionen. Om posten
ska finnas kvar som genväg måste den byta namn till något ärligt ("Kör med
Anthropic") — men en genväg till ett val som ligger två rader upp i samma meny är
svårmotiverad.

## Sekvens

Stegen är oberoende av varandra och kan tas i valfri ordning av samma agent.

### Steg 1 — F8: byt namn och copy, lägg ingen guard

1. Döp om `latestLabel` → `preferredLabel` hela vägen genom
   `followUpBaseInfo`-propen och `ChatInterfaceProps`.
2. Skriv om copyn så att den förklarar **varför** en annan version föreslås, och
   skilj de två fallen (aktiv äldre än föredragen / aktiv nyare men underkänd).
3. Lägg **ingen** villkorsguard som döljer bannern — se rättelsen ovan.

### Steg 2 — Ö11: ta bort menyposten

- Ta bort menyposten och `onApplyAnthropicComparePreset`-kedjan hela vägen
  (header-prop, callback i `BuilderShellContent`).
- Lämna inget dött prop-namn kvar — kör `npm run knip` på ändringen.

### Steg 3 — ägarbeslut B2 + Ö8

1. Invänta B2.
2. Implementera valt alternativ.
3. Skriv om raderna till klarspråk oavsett val. Termerna `quality gate`,
   `preflight` och `readiness` ska inte förekomma i användarsynlig copy — jämför
   [`terminology.mdc`](../../../../.cursor/rules/terminology.mdc), som redan
   kräver leverantörsneutral och begriplig copy i användarytor.

## Definition of done

| # | Krav | Bevis |
|---|---|---|
| 1 | Versionsbannern kallar aldrig en äldre version "senaste"; den förklarar varför en annan version föreslås | nytt test |
| 2 | Bannern renderas fortfarande när aktiv version är nyare men underkänd | nytt regressionstest |
| 3 | "Anthropic-jämförelse" är borta och ingen död kod är kvar | `npm run knip` |
| 4 | B2 är beslutat och implementerat | ägarens rad nedan |
| 5 | Ingen användarsynlig rad i Lansering-kortet innehåller intern gate-vokabulär | manuell genomgång av alla readiness-copy-strängar |
| 6 | En blockerad version är fortfarande tydligt blockerad för användaren | manuell körning mot en underkänd version |

## Risker

| Risk | Hantering |
|---|---|
| Alt A/B gör att blockerare blir osynliga | `Publicera`-knappen måste själv förklara varför den inte går att använda innan kortet döljs |
| Klarspråksomskrivning tappar teknisk information som behövs vid felsökning | behåll det tekniska i slutstegsloggen; klarspråket gäller kortet |
| En framtida agent lägger tillbaka guarden i F8 och tystar varningen | rättelserutan under F8 finns kvar i planen och förklarar varför; regressionstestet i DoD rad 2 låser beteendet |

## Ägarbeslut

- **B2 (Lansering-kortets framtid):** **Alternativ B** — beslutat 2026-07-26.
  Kortet renderas bara vid `blocked` eller `warning`. Vid `ready` döljs det helt
  och `Publicera`-knappen bär den positiva signalen. Klarspråksomskrivningen från
  alternativ C görs oavsett — den kostar ingenting extra och krävs av
  `terminology.mdc`. `Publicera`-knappens `deployDisabledReason` måste fortsätta
  förklara spärren i klarspråk, eftersom kortet inte längre är den enda bäraren.

## Evidence (implementation 2026-07-26)

- F8: `latestLabel` → `preferredLabel` + `kind: stale-selection | rejected-active`;
  ingen hide-guard. Tester: `explains a rejected active version without calling
  it senaste`, `still renders when active version number is higher than preferred
  (regression)`.
- Ö11: `onApplyAnthropicComparePreset` + menyvalet borttaget. `knip --exports`:
  inga träffar på Anthropic-/latestLabel-symboler.
- Ö8/B2: `LaunchReadinessCard` returnerar `null` vid `ready`; klarspråk i
  readiness route + payload. Snapshot uppdaterad. `deployDisabledReason` läser
  fortfarande `blockers[0].detail|title` (nu klarspråk).
- Ej rörda (utanför ownership): `src/lib/gen/preview/diagnostics.ts` (mappas
  lokalt i readiness-route), `engine-version-lifecycle.ts` deploy-API-meddelanden
  (readiness använder egen copy, ignorerar `releaseGate.message`).
