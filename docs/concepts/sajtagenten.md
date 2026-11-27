# Sajtagenten i buildern

Sajtagenten är samtalspartnern och orkestratorn i builderchatten. Byggmotorn
(own-engine) bygger, verifierar och skapar versioner; Sajtagenten förklarar,
granskar, navigerar i koden och får jobbet gjort genom byggmotorn: den startar
byggen, reparationer och småändringar direkt när användaren ber om dem
(ägarbeslut 2026-11-20). De delar en input och en tidslinje, men är två skilda
LLM-flöden. Koden äger kontrakten — den här
sidan är den mentala modellen. Plan och status:
[`docs/plans/avklarat/2026-10-22-en-chatt-sajtagenten/`](../plans/avklarat/2026-10-22-en-chatt-sajtagenten/00-master-plan.md).

## En chatt, två mottagare

| Du skriver | Vem svarar | Varför |
|---|---|---|
| En fråga eller en granskning («Vad tycker du om startsidan?», «Granska före publicering») | Sajtagenten | Kostar inget bygge; agenten läser koden och svarar. |
| En artig eller kort ändringsbegäran («Kan du lägga till en karta?», «Blåare knappar») | Sajtagenten | Agenten avgör att det är en ändring och startar bygget själv, utan kort att godkänna (se Handlingsmedgivande nedan). |
| En uttrycklig ändring («Byt rubriken till Välkommen», «Lägg till en kontaktsida») | Byggmotorn | Skapar en ny version direkt, som i dag. |
| Första bygget, eller en ändring med bilaga, Figma-länk eller inspect-punkter | Byggmotorn | Där finns ingen agentväg. |
| En artig begäran med bilaga («Kan du lägga in den här loggan i sidhuvudet?») | Byggmotorn | Bilagan följer bara byggmotorn, och ett ändringsverb direkt efter «kan du» gör texten till en beställning. |
| En fråga när Sajtagenten inte nås (okonfigurerad, otillgänglig eller med bilaga, t.ex. «Vad tycker du om bilden?») | Ingen: utskicket blockeras och utkastet ligger kvar | En fråga får aldrig tyst kosta ett bygge. Välj Bygg om texten är en ändring. |

Lägesväljaren Auto · Fråga · Bygg i komposern tvingar mottagaren. Läget gäller
per chatt; en ny chatt börjar i Auto. Regeln bor i
[`composer-route.ts`](../../src/lib/builder/composer-route.ts), och en etikett
intill Skicka («Fråga – ändrar inget», «Till Sajtagenten – kan ändra sajten»,
«Ändring – skapar en ny version») visar samma beslut innan du skickar. Den
lovar «ändrar inget» bara när agenten faktiskt inte får agera på texten.

När byggmotorn väntar på svar på en motfråga eller plan hör svaret fortsatt
till byggmotorn i Auto-läget. Välj Fråga uttryckligen för att diskutera med
Sajtagenten utan att besvara den väntande frågan.

## Avatar i samma samtal

Avatar-knappen vid komposern aktiverar D-ID som röst och bild för Sajtagentens
befintliga svar. Den skapar ingen egen chatt eller modellförfrågan. Text och
mikrofon använder samma input, och historiken ligger kvar i samma tidslinje.
Endast nya, färdiga svar läses upp; action-block, avbrutna svar och inläst
historik läses inte upp. Chattbyte och «Endast text» avslutar anslutningen.
Vid anslutningsfel fungerar textchatten vidare. Knappen finns bara när de
befintliga publika D-ID-nycklarna och avatarflaggan är konfigurerade.

## Byggkuben

Chattpanelen kan bytas mot byggkubens sex vyer. Från `lg` visas de i en
flyttbar panel över förhandsvisningen. På mobil fyller de chattytan med sex
flikar under **Byggvyer**, bredvid **Förhandsvisning**. **Vanlig chatt** går
tillbaka till den klassiska chatten. Kubknappen ovanför inmatningen öppnar
vyerna igen, och valet sparas per webbläsare. Utan chatt används den vanliga
inmatningen.

| Sida | Innehåll |
|---|---|
| Chatt | Inmatningen. Det du skickar vrider fram Svar. |
| Svar | Tidslinjen. Svar som kommer medan en annan sida står fram räknas på fliken. |
| Bygglogg | F3-ytorna, senaste byggets läge och filer; arbetsloggen bara för admin. |
| Verktyg | Modellnivå, resonemang, AI-bilder och kommentar efter bygge. |
| Avatar | D-ID-avataren som egen yta; knappen vid komposern visas då inte. |
| Sajtkarta | Versionens sidor som träd; ett klick visar sidan i förhandsvisningen. |

Kuben kan fällas ut till kort som dras, ändrar storlek och fälls ned till ett
fält. Komposern, tidslinjen och F3-ytorna är samma instanser i panelen och i
kuben: [`relocation.tsx`](../../src/components/builder/cube/relocation.tsx)
flyttar DOM-noden, så ett layoutbyte tappar varken utkast, bilagor eller
rulläge. Ytan ägs av
[`cube-surface.tsx`](../../src/app/builder/builder-shell-content/cube-surface.tsx).

**Samla till vänster** återställer kubens läge, storlek och kortplaceringar och
samlar alla sex vyer i kuben till vänster. Vald vy och pågående utkast finns
kvar. Valet gäller även efter omladdning. **Samla till kub** använder kubens
senast sparade plats. **Sidopanel** öppnar den vanliga chatten till vänster.

## Vad Sajtagenten ser

Allt skickas per tur till `/api/openclaw/chat`; servern verifierar att den som
frågar äger chatten innan något versionsbundet läggs till.

| Kontext | När | Ägare |
|---|---|---|
| Builderläge: chatt, aktiv version, previewadress, byggprofil, de åtta senaste meddelandena mellan användaren och byggmotorn (märkta så, utan builderns egna reparations- och F3-promptar), den första briefen när den fallit utanför fönstret, kodutdrag | Alltid i buildern | `context-helpers.ts` → `use-dev-context-effects.ts` → `server-context.ts` |
| **Filmanifest** (namn, typ, storlek) | Alltid när en ägd chatt är öppen | `chat-context-policy.ts` (`navigate`) |
| Full kod | På uttrycklig begäran («läs koden», «hela projektet») eller `OC_DEBUG` | `chat-context-policy.ts` |
| Verifierings- och reparationsfynd, tidslinje, live review | Vid gransknings-/felintention | `review-context.ts`, `findings-context.ts` |
| Preview-VM:ens logg, bug-hunt-fynd, Sajtmaskins egen källkod | Bara `OC_DEBUG` (källkod kräver dessutom operatörstoken) | `preview-log-context.ts`, `repo-context.ts` |

## Vad Sajtagenten kan göra

### Läsa källor och granska utseendet

En uttrycklig webbsökning, en vald sidkälla eller en bild-/textbilaga använder
en lästur. Samma personakärna används i chatt, avatar och lästur. Lästuren
får upp till åtta tidigare meddelanden och byggkontext för den ägarverifierade
aktiva versionen. Avataren får ett kort, pratbart svar med källänkar separat.

Frågor som «Hur ser min sajt ut?» och «Granska designen på sajten» använder
befintliga dator- och mobilskärmbilder från versionskontrollen. Servern
kontrollerar ägarskap, version, filrevision och bildernas giltighetstid före
bildläsningen. Saknas aktuella bilder ska svaret säga vilket bildunderlag som
saknas. Läsningen använder ett modellanrop och kan lämna svar och källor.
Ändringsbegäranden fortsätter genom byggmotorn och dess handlingsmedgivande.
Den vanliga chatten får också den sparade granskningsdomen först när chatt,
version, filrevision och giltighetstid stämmer.

Ägarna är `read-task.ts`, `read-task-input.ts` och `persona.ts` under
`src/lib/openclaw/`. Gatewayns direkta verktygskonfiguration ägs av
`infra/openclaw/generate-config.mjs`.

Agenten svarar med text och högst ett `<openclaw-action>`-block per svar.
Parsern i [`text-field-actions.ts`](../../src/lib/openclaw/text-field-actions.ts)
är enda vägen in; allt den inte känner igen blir ett synligt «kunde inte tolkas».

| Action | Vad händer | Körs direkt när |
|---|---|---|
| `read_files` | Klienten hämtar de begärda filerna (ägarverifierat) och skickar tillbaka dem som en intern `[Filinnehåll]`-tur; agenten svarar med koden framför sig. Högst 4 filer per runda, 3 rundor per fråga; hela turen ryms under chat-transportens tak per meddelande (stora filer klipps och markeras). | Alltid — läsning kräver ingen befogenhet. |
| `start_build` | Startar en byggtur genom builder-bryggan (samma `sendMessage` som Skicka-knappen). | **Agerar direkt** är beviljad och turen bär handlingsmedgivande. |
| `request_repair` | Startar den befintliga autofix-vägen på aktiva versionen. Bara på den senaste versionen. | **Agerar direkt** är beviljad och turen bär handlingsmedgivande. |
| `apply_quick_edit` | Exakta filoperationer genom Fast Edit Lane till en minor-version, bundna till versionen modellen såg. | **Snabbändringar** är beviljad och turen bär handlingsmedgivande. |
| `fill_text_field` | Fyller komposern med en föreslagen prompt. Med `submit:true` under ett armerat follow-up-mandat skickas den också. | Aldrig utan mandat: ett kort att godkänna. |
| `start_bug_hunt` | Bekräftar ett mandat användaren själv armerat («gör 3 follow-ups och buggranska»). | **Agerar direkt** är beviljad. |

När en åtgärd inte körs direkt visas den som ett kort med en knapp — samma
åtgärd, ett klick.

### Handlingsmedgivande och uppdrag

En regel avgör om en åtgärd körs direkt, och servern skriver samma besked till
modellen som `[BYGGMEDGIVANDE]`, så agenten aldrig lovar något som bara blir
ett kort ([`agent-action-consent.ts`](../../src/lib/openclaw/agent-action-consent.ts)).

| Fråga | Svar |
|---|---|
| Vilka turer bär medgivande? | Det du skriver i läget Auto eller Bygg. Agenten avgör själv om texten är en ändring — «Kan du lägga till en karta?» räcker. |
| Vilka gör det aldrig? | Läget Fråga, «ändra inget», ett stopp och text som öppnar med ett frågeord («Vad tycker du om startsidan?»): en fråga blir aldrig tyst ett bygge ([`composerAllowsAgentBuild`](../../src/lib/builder/composer-route.ts)). |
| Hur långt får agenten gå? | Ett **uppdrag** = ditt meddelande. Högst tre automatiska åtgärder per uppdrag, och högst en per besvarad tur. Nästa åtgärd blir ett kort som säger varför. |
| Får den fortsätta efter ett bygge? | Bara efter ett bygge den själv startade inom uppdraget: då säger `[Byggresultat]` att den får laga eller ta nästa uttalade steg. Efter ett bygge du själv beställde ger den bara ett besked. |
| Hur stoppar jag? | Skriv «stopp», tryck Stoppa eller headerns Avbryt, eller välj Fråga. Alla återkallar medgivandet: inget mer körs förrän du ber om något nytt. |
| Vad händer efter en omladdning? | Ingenting körs igen. Rader från historiken är kvitton utan knappar. |
| Kan ett gammalt förslag köra i efterhand? | Nej. Beslutet fattas en gång, när kortet först visas. Ett förslag som visades med befogenheten av förblir ett förslag även om du slår på den igen. |

Agenten har ingen egen skrivväg: varje ändring går genom builderns ordinarie
pipeline eller Fast Edit Lane (ägarbeslut 2026-08-14), med samma creditgrind,
versionsbindning och stale-base-skydd som när du gör den själv. Byggkommandon
går via
[`builder-bridge.ts`](../../src/lib/openclaw/builder-bridge.ts); DOM-ifyllning
är fallback utanför buildern.

## Befogenheter

`OC_EDIT` är env-grinden. Ovanpå den finns sköldknappen i komposern med tre
befogenheter: **Agerar direkt** (`armed_autonomy`: byggen, reparationer och
armerade follow-up-serier), **Snabbändringar** och **Granskar sajten live**.
En ny builderchatt utan persisterad grant får alla tre
(`OPENCLAW_BUILDER_DEFAULT_POWERS`), och befintliga chattar med grant får det
nya beteendet utan att göra något. Sköldknappen stänger av per chatt och ett
uttryckligt av-val respekteras: utan den ger agenten bara råd och förslag.
Läsning (`read_files`, manifest) är inte en befogenhet. Matrisen bor i
[`powers.ts`](../../src/lib/openclaw/powers.ts).

## Efter ett bygge

När en builder-tur når ett terminalt läge väcks agenten en gång med
`[Byggresultat]` och svarar kort: vad som ändrades och ett nästa steg. Styrs av
inställningen «Sajtagenten kommenterar efter varje bygge». Startade agenten
själv bygget inom ett uppdrag med steg kvar väcks den oavsett inställningen,
och får då agera direkt: laga ett misslyckat bygge eller ta nästa uttalade
steg ([`post-build-digest.ts`](../../src/lib/openclaw/post-build-digest.ts)).
Under ett armerat mandat äger continuation-slingan väckningen i stället
([`armed-continuation.ts`](../../src/lib/openclaw/debug/armed-continuation.ts)).

## Vad som syns i chatten

| Innehåll | Visas som |
|---|---|
| Din fråga och agentens svar | Vanliga rader med etiketten «Sajtagenten» / «Till Sajtagenten». |
| `[Automatisk fortsättning]`, `[Automatisk väckning]`, `[Byggresultat]`, `[Filinnehåll]` | En kort statusrad — aldrig en användarbubbla. |
| Byggen, reparationer och småändringar | En kvittens när de kört direkt («Direktbygg», «Reparation», «Snabbändring»), annars ett kort med en knapp. |
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
efter publicering och projektminne är följduppdrag.
