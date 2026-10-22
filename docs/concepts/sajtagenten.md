# Sajtagenten i buildern

Sajtagenten är samtalspartnern i builderchatten. Byggmotorn (own-engine)
bygger, verifierar och skapar versioner; Sajtagenten förklarar, granskar,
navigerar i koden och startar byggen åt användaren. De delar en input och en
tidslinje, men är två skilda LLM-flöden. Koden äger kontrakten — den här
sidan är den mentala modellen. Plan och status:
[`docs/plans/active/2026-10-22-en-chatt-sajtagenten/`](../plans/active/2026-10-22-en-chatt-sajtagenten/00-master-plan.md).

## En chatt, två mottagare

| Du skriver | Vem svarar | Varför |
|---|---|---|
| En fråga, en granskning, något oklart («Vad tycker du om startsidan?», «Granska före publicering», «Blåare knappar?») | Sajtagenten | Kostar inget bygge; agenten kan läsa koden och föreslå. |
| En uttrycklig ändring («Byt rubriken till Välkommen», «Lägg till en kontaktsida») | Byggmotorn | Skapar en ny version direkt, som i dag. |
| Bilagor, Figma-länk, inspect-punkter, första bygget | Byggmotorn | Där finns ingen agentväg. |

Lägesväljaren Auto · Fråga · Bygg i komposern tvingar mottagaren. Regeln bor i
[`composer-route.ts`](../../src/lib/builder/composer-route.ts); en live-hint
under textrutan visar valet innan du skickar.

## Vad Sajtagenten ser

Allt skickas per tur till `/api/openclaw/chat`; servern verifierar att den som
frågar äger chatten innan något versionsbundet läggs till.

| Kontext | När | Ägare |
|---|---|---|
| Builderläge: chatt, aktiv version, previewadress, byggprofil, de fem senaste buildermeddelandena, kodutdrag | Alltid i buildern | `use-dev-context-effects.ts` → `server-context.ts` |
| **Filmanifest** (namn, typ, storlek) | Alltid när en ägd chatt är öppen | `chat-context-policy.ts` (`navigate`) |
| Full kod | På uttrycklig begäran («läs koden», «hela projektet») eller `OC_DEBUG` | `chat-context-policy.ts` |
| Verifierings- och reparationsfynd, tidslinje, live review | Vid gransknings-/felintention | `review-context.ts`, `findings-context.ts` |
| Preview-VM:ens logg, bug-hunt-fynd, Sajtmaskins egen källkod | Bara `OC_DEBUG` (källkod kräver dessutom operatörstoken) | `preview-log-context.ts`, `repo-context.ts` |

## Vad Sajtagenten kan göra

Agenten svarar med text och högst ett `<openclaw-action>`-block per svar.
Parsern i [`text-field-actions.ts`](../../src/lib/openclaw/text-field-actions.ts)
är enda vägen in; allt den inte känner igen blir ett synligt «kunde inte tolkas».

| Action | Vad händer | Grind |
|---|---|---|
| `read_files` | Klienten hämtar de begärda filerna (ägarverifierat) och skickar tillbaka dem som en intern `[Filinnehåll]`-tur; agenten svarar med koden framför sig. Högst 6 filer per runda, 2 rundor per fråga, teckenbudget. | Ingen befogenhet krävs — läsning. |
| `start_build` | Startar en byggtur genom builder-bryggan (samma `sendMessage` som Skicka-knappen). | Armerad autonomi: körs direkt. Annars ett kort att godkänna. |
| `fill_text_field` | Fyller komposern med en föreslagen prompt. Med `submit:true` under ett armerat mandat skickas den också. | Kort att godkänna, eller mandat. |
| `apply_quick_edit` | Exakta filoperationer genom Fast Edit Lane till en minor-version. | Snabbändringar beviljad + manuellt godkännande per förslag, alltid. |
| `request_repair` | Startar den befintliga autofix-vägen på aktiva versionen. | Kort att godkänna. |
| `start_bug_hunt` | Bekräftar ett mandat användaren själv armerat («gör 3 follow-ups och buggranska»). | Armerad autonomi. |

Agenten skriver aldrig filer själv; varje ändring går genom builderns
ordinarie pipeline (ägarbeslut 2026-08-14). Byggkommandon går via
[`builder-bridge.ts`](../../src/lib/openclaw/builder-bridge.ts); DOM-ifyllning
är fallback utanför buildern.

## Befogenheter

`OC_EDIT` är env-grinden. Ovanpå den finns sköldknappen i komposern med tre
befogenheter: **Armerad autonomi**, **Snabbändringar**, **Granskar sajten
live**. En ny builderchatt utan persisterad grant får alla tre
(`OPENCLAW_BUILDER_DEFAULT_POWERS`); sköldknappen stänger av per chatt och ett
uttryckligt av-val respekteras. Läsning (`read_files`, manifest) är inte en
befogenhet. Matrisen bor i [`powers.ts`](../../src/lib/openclaw/powers.ts).

## Efter ett bygge

När en builder-tur når ett terminalt läge väcks agenten en gång med
`[Byggresultat]` och svarar kort: vad som ändrades och ett nästa steg. Styrs av
inställningen «Sajtagenten kommenterar efter varje bygge». Under ett armerat
mandat äger continuation-slingan väckningen i stället
([`armed-continuation.ts`](../../src/lib/openclaw/debug/armed-continuation.ts)).

## Vad som syns i chatten

| Innehåll | Visas som |
|---|---|
| Din fråga och agentens svar | Vanliga rader med etiketten «Sajtagenten» / «Till Sajtagenten». |
| `[Automatisk fortsättning]`, `[Automatisk väckning]`, `[Byggresultat]`, `[Filinnehåll]` | En kort statusrad — aldrig en användarbubbla. |
| Förslag och byggkommandon | Kort med knappar (eller en kvittens när de kört automatiskt). |
| Byggmotorns svar, kontroller och filer | Byggkortet som förut; detaljer under «Visa detaljer». |

Agentens samtal persisteras i `agent_messages` per chatt
([`agent-history.ts`](../../src/lib/openclaw/agent-history.ts)); byggmotorns
`engine_messages` förblir dess LLM-historik. Rader från historiken kan aldrig
köra kommandon igen efter en omladdning.

## Utanför buildern

På landnings- och kampanjytor är Sajtagenten fortfarande den flytande bubblan
(`OpenClawChat`) med text eller D-ID-avatar. Där finns ingen builderchatt, inga
filer och inga byggkommandon — bara samtal.

## Inte nu

Creditmodell per agentuppdrag (chat-routen debiteras inte), sajtägarens agent
efter publicering, projektminne och avataren i builderchatten är följduppdrag.
