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
| F8 | "Du redigerar v2 — inte senaste v1" | v2 **är** senaste |
| Ö11 | "Anthropic-jämförelse" | jämför ingenting; byter bara modell |

## F8 — versionsbannern kan påstå det omöjliga

Bannern renderas av `src/components/builder/ChatInterface.tsx:677-698` och styrs
av `followUpBaseInfo`, som beräknas i
`src/app/builder/BuilderShellContent.tsx:199-214`.

Villkoret är `activeVersionIsLatest === false`, dvs. `vm.activeVersionId !==
vm.latestVersionId`. Etiketterna kommer från versionslistan:
`baseLabel` = numret för den aktiva versionen, `latestLabel` = numret för den
som `latestVersionId` pekar på.

I sessionen blev det `baseLabel: "v2"` och `latestLabel: "v1"`. Det betyder att
`activeVersionId` hade uppdaterats till den nya versionen medan
`latestVersionId` fortfarande pekade på den gamla — och ingenting i beräkningen
kontrollerar att "senaste" faktiskt är senare än "aktiv".

Bannern är alltså inte fel i sin copy. Den avslöjar att invarianten
**latest ≥ active** inte upprätthålls någonstans.

Rimlig åtgärd i två delar:

1. **Guard i beräkningen:** rendera aldrig bannern när den aktiva versionens
   nummer är större än eller lika med den "senaste"-versionens nummer. Det gör
   symptomet omöjligt oavsett varför id:na glider.
2. **Rotorsaken:** ta reda på varför `latestVersionId` inte uppdaterades när v2
   skapades. Sannolikt saknad refetch efter att reparationsvarven skrivit klart —
   samma familj som F10, men det här är ett klient-state-problem, inte
   innehållsidentitet.

Ny test: `followUpBaseInfo` är `null` när aktiv version har högre nummer än
"senaste".

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

### Steg 1 — F8: guard + rotorsak

1. Lägg guarden i `followUpBaseInfo` (nummerjämförelse, inte bara id-olikhet).
2. Spåra varför `latestVersionId` var stale efter reparationsvarven; åtgärda
   refetchen eller dokumentera varför den inte kan göras här.

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
| 1 | Versionsbannern kan inte påstå att en högre version inte är senaste | nytt test |
| 2 | Rotorsaken till stale `latestVersionId` är åtgärdad eller dokumenterad | PR-text |
| 3 | "Anthropic-jämförelse" är borta och ingen död kod är kvar | `npm run knip` |
| 4 | B2 är beslutat och implementerat | ägarens rad nedan |
| 5 | Ingen användarsynlig rad i Lansering-kortet innehåller intern gate-vokabulär | manuell genomgång av alla readiness-copy-strängar |
| 6 | En blockerad version är fortfarande tydligt blockerad för användaren | manuell körning mot en underkänd version |

## Risker

| Risk | Hantering |
|---|---|
| Alt A/B gör att blockerare blir osynliga | `Publicera`-knappen måste själv förklara varför den inte går att använda innan kortet döljs |
| Klarspråksomskrivning tappar teknisk information som behövs vid felsökning | behåll det tekniska i slutstegsloggen; klarspråket gäller kortet |
| Guarden i F8 döljer ett verkligt fall där användaren står på en äldre version | guarden gäller bara när aktiv version har **högre** nummer — det legitima fallet (aktiv < senaste) renderas som förut |

## Ägarbeslut

- **B2 (Lansering-kortets framtid):** _(ej beslutat)_
