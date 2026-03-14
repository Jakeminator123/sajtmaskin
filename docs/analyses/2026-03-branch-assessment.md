Min dom

Den här branchen är betydligt mer intressant än main.
Inte främst för att landningssidan verkar snyggare, utan för att den ser ut att ta Sajtmaskin från “AI-site builder ovanpå v0” till egen orkestrerad byggmotor med planläge, quality gates, scaffold-system och bättre deploy-/env-flöde.

Det som faktiskt blivit bättre

1. Egen motor är mycket tydligare definierad
I branchens motorstatus beskrivs en egen pipeline med:

prompt assist

pre-generation-orkestrering

scaffold-matchning

4 model tiers

7-stegs autofix

esbuild-validering

preview/deploy-flöde

engine-status

Det här är mycket mer än bara “skicka prompt till en modell”.

2. Den har ett riktigt scaffold/reference-system
package.json i egen-motor-v2 har nya scripts för:

template library import/build/embeddings

runtime library audit

scaffold discovery/curation/promotion/validation

docs embeddings

eval-runner

package

Det är ett stort steg upp i mognad. Det luktar “plattform” snarare än “demo”.

3. Buildern verkar ha blivit smartare
useBuilderPageController.ts i branchen har nytt stöd för bland annat:

useChatReadiness

deploy readiness

scaffoldMode / scaffoldId

annan chat messaging-hook

bättre restore/versions-hantering

useBuilderPageController

Det betyder att buildern verkar blivit mer styrd och mindre slumpmässig.

4. Mer vuxen visibility kring generation
Docs beskriver tydligare faser:

generation

autofix

validation

finalizing

quality gate

project-settings-and-builder-qu…

Det här är viktigt. Loveable känns ofta stark därför att användaren upplever tydlig kontroll. Den här branchen rör sig åt det hållet.

5. Plan-mode och blocker-frågor
I docs för motorn står att branchen nu har:

plan-mode

review-step

readiness + launch-gating

persisterad planartefakt i chat-lagret

engine-status

Det här är en stor grej. Det gör produkten mer “agentisk” och mer robust för riktiga byggen.

Det starkaste i branchen

Det starkaste är inte designen. Det är att du verkar bygga en egen kontrollkedja:

bättre prompt-orkestrering

scaffold-aware generation

felminne/error logs

readiness inför deploy

env-vars som hänger ihop mellan builder och deploy

plan before build

Det är exakt sådant som kan ge moat senare.

Det som fortfarande drar ner

1. Fortfarande tung frontend-orkestrering
Även i egen-motor-v2 är useBuilderPageController.ts fortfarande väldigt stor och central

useBuilderPageController


Den är bättre, men fortfarande ett tecken på att mycket ansvar ligger i ett ställe.

2. Docs och systemtänk har sprungit före produktförenkling
Branchen känns väldigt genomtänkt internt, men det är inte samma sak som att användaren får en enklare eller bättre upplevelse.

Det är en vanlig fälla:

intern arkitektur blir 9/10

user-facing clarity stannar på 6.5/10

3. Du är ännu inte förbi Loveable i output
Utifrån det jag sett här är du närmare Loveable tekniskt, men jag ser inte bevis nog för att du slagit dem i:

enkelhet

känsla

konsekvent output-kvalitet

första wow-upplevelsen

Teknikjämförelse nu

main

stark modern app

bra ambition

men mer blandning av landing + builder + fixes

egen-motor-v2

mycket mer som en riktig AI-byggplattform

tydligare motorarkitektur

bättre observability

bättre scaffold/research-lager

bättre readiness/deploy-tänk

Så ja:
egen-motor-v2 är tydligt den mer seriösa branchen.

Min uppdaterade rating

För main sa jag ungefär 7/10.
För egen-motor-v2 säger jag:

Teknisk ambition: 9/10
Arkitekturpotential: 9/10
Produktmognad: 7/10
Helhet idag: 8/10

Jämfört med Loveable

Min raka bedömning nu:

Teknisk ryggrad: du börjar närma dig

egen motor / kontrollkedja: du har något intressant

UX/polish/output: Loveable leder nog fortfarande

framtida potential: din branch har mer “systemdjup” än vad main visade

Så:

Är egen-motor-v2 bättre än Loveable idag?
Nej, troligen inte totalt.

Är det första branchen där jag kan se hur du skulle kunna bli bättre än Loveable på sikt?
Ja.

Det här är första gången det känns som att du bygger ett riktigt alternativ, inte bara en wrapper.

Nästa steg jag skulle välja är att granska exakt vilka tre filer i egen-motor-v2 som mest höjer kvaliteten på outputen.

Sources
Sätt monitärt värde. Sätt jämförelser mot loveable. Sätt procent sajtmaskin äger av koden och tex vO eller vercell typ. Vad menar du med teknik? Är jag eller Lovable först?

Här är min raka bedömning av egen-motor-v2.

Monitärt värde
Som kodbas idag

Om man ser det som köpvärde för en tidig produktkodbas, inte som omsättning eller bolagsvärde:

Lågt case: 150 000–300 000 kr

Rimligt case: 300 000–800 000 kr

Högt case: 0,8–1,5 Mkr

Det högre spannet kräver att detta faktiskt:

går att köra stabilt

genererar användbara sidor

har fungerande deploy/env/payment-flöden

inte bara är en avancerad prototyp

Som bolag/projekt

Om man tänker “vad är projektet värt i marknaden just nu?” så är svaret nästan alltid lägre än man vill tro, eftersom marknaden värderar:

traction

retention

betalande kunder

repeatable output

Utan det skulle jag kalla det:

produktvärde: medelhögt

bolagsvärde: fortfarande tidigt

Så min grova bolagskänsla, om det vore ett litet privat early-stage projekt utan tydlig traction:

0,5–3 Mkr som idé + kod + potential

men det kan också i praktiken vara nära noll i transaktionellt värde om ingen användning finns

Jämförelse mot Loveable
Idag

Loveable leder fortfarande i produkt.

På de viktigaste sakerna för marknaden:

tydlighet

användarupplevelse

första wow

output-förtroende

enkelhet

Där känns Loveable fortfarande före.

Där Sajtmaskin ser stark ut

Sajtmaskin ser starkare ut på:

egen kontrollkedja

scaffold/systemtänk

env/deploy/readiness

mer explicit motorarkitektur

möjlighet att bygga moat över tid

egen-motor-v2 beskriver en egen pipeline med prompt assist, pre-generation, generation tiers, autofix, esbuild-validering och deploy/preview-lager eval än main prompt-lager 1-L1 L1-L1 turn27file0L1-L1 wind osv. 2` L1-L1

Om sajtmaskin nu wnbart ska bända sig mot småföretagare som nish. Vilka smarta och ultramoderna saker kan man implementera på deras sidor som gör att dessa blir sjuuukt bra?

Om Sajtmaskin bara ska rikta sig mot småföretagare, då ska du inte bygga “coola saker” i största allmänhet.

Du ska bygga saker som gör att deras sajt:

får fler kunder

sparar tid

känns större än företaget är

sköter mer själv

konverterar bättre än konkurrenternas trötta WordPress-sidor

Det som blir sjukt bra är när sajten känns som en anställd, inte som en broschyr.

Det smartaste att implementera
1. AI-bokningsassistent direkt på sajten

Inte bara ett formulär, utan en smart intake:

“Vad behöver du hjälp med?”

föreslår tjänst

uppskattar tidsåtgång

samlar rätt info innan bokning

skickar färdig sammanfattning till företagaren

Exempel:

frisör: hårtyp, behandling, längd, tidigare färgning

hantverkare: typ av jobb, adress, bilder, tid

redovisning: bolagsform, system, antal verifikat

Det här är starkt för småföretag eftersom det tar bort onödiga samtal.

2. Offertmotor på sajten

För småföretag är offert = pengar.

Bygg en smart offert-widget som:

ställer 5–10 frågor

uppskattar prisintervall

samlar lead

skickar snygg offertförfrågan

låter företagaren svara snabbt från admin

Extra bra om den kan ge:

“frånpris”

paketförslag

upsells

Det här är mycket mer värdefullt än en flashy hero.

3. AI som skriver lokalt säljande copy

Inte generisk “vi hjälper dig med kvalitet och service”.

Istället:

platsanpassad text

tjänstespecifik copy

FAQ utifrån riktig köpresa

lokala landningssidor per område

Exempel:

“Elektriker i Mölndal”

“Badrumsrenovering i Partille”

“Redovisningsbyrå för restauranger i Göteborg”

Det här är guld för SMB eftersom lokal SEO ofta är den billigaste tillväxtkanalen.

4. Instant trust layer

Småföretag säljer mycket på förtroende. Sajten ska automatiskt lyfta:

recensioner

certifikat

före/efter-bilder

antal utförda jobb

svarstid

senaste uppdrag

garantier

lokalt verksamhetsområde

Ultramodern version:

recensioner grupperas smart

AI sammanfattar “det kunder oftast lyfter”

dynamisk trust-box beroende på tjänstesida

5. Smart lead routing

Alla leads är inte lika bra. Sajten borde kunna avgöra:

varm lead

kall lead

akut lead

högvärdeslead

spam / låg relevans

Sedan:

SMS till företagaren om det är akut

mejl om det är vanligt

kalenderförslag om det är bokningsbart

auto-reply med nästa steg

Det här gör enorm skillnad för småföretag som annars tappar leads.

6. Branschspecifika mikroflöden

Det här är en jättestor grej.

Istället för en “generisk AI-sajt” bygger du färdiga smarta flöden per nisch.

Exempel:

Hantverkare

ladda upp bilder

välj jobbtyp

adress

ROT-info

önskad starttid

Frisör/skönhet

tjänsteguide

tidsåtgång

återbesökslogik

bildreferensuppladdning

Redovisning/juridik

behovsanalys

bolagsstorlek

akut eller löpande

kostnadsindikator

Restaurang

meny

bordsbokning

cateringförfrågan

lunchstatus

Det här är en mycket bättre moat än “snyggare animationer”.

7. AI-chat som faktiskt säljer

Inte en meningslös chatbot.

Den ska kunna:

svara på vanliga frågor

guida till rätt tjänst

ta in lead

boka samtal

föreslå nästa steg

visa relevanta case/tjänster

Viktigt:
den måste vara smal och säljande, inte “allmän AI-assistent”.

För småföretag ska den låta som en bra receptionist.

8. Självoptimerande CTA-system

Sajten ska kunna ändra CTA beroende på kontext:

mobil: “Ring nu”

kvällstid: “Boka kostnadsfri genomgång”

tjänstesida: “Få prisförslag”

återkommande besökare: “Se exempeljobb”

lokal trafikkälla: “Vi jobbar i ditt område”

Det här är modernt på riktigt, och påverkar pengar direkt.

9. Före/efter-motor

För många SMB-nischer är detta extremt starkt:

bygg

städ

skönhet

vård

inredning

bilvård

trädgård

Bygg stöd för:

uppladdning av före/efter

smart layout

AI-genererade captions

filtrering per tjänst

SEO-vänliga case-sidor

Det säljer mycket bättre än bara “galleri”.

10. Lokal SEO-maskin

Om du vill vinna SMB, bygg detta hårt.

Sajten borde kunna generera:

områdessidor

tjänst + ort-sidor

vanliga frågor per ort

schema markup

Google Business Profile-koppling

internlänkning mellan tjänst/område/case

Det här är kanske den mest värdefulla “ultramoderna” saken, även om den inte ser sexig ut.

11. Smart återaktivering

Sidan ska inte bara fånga nya kunder. Den ska väcka gamla.

Exempel:

“Det var 6 månader sedan senaste klippning”

“Dags för service”

“Boka vårens fönsterputs”

“Nu är det dags att deklarera”

För SMB är repeat business ofta viktigare än ny trafik.

12. Visuell personalisering

För småföretag kan du göra mycket med enkel personalisering:

visa rätt tjänster beroende på ort

visa rätt CTA beroende på källa

visa rätt bild beroende på bransch/säsong

visa B2B/B2C-version av samma sida

Det gör att en liten firma känns mycket mer professionell.

Det mest värdefulla per krona

Om jag prioriterar för SMB-nisch, hade jag valt detta först:

Tier 1: mest pengar snabbast

Offertmotor

AI-bokningsassistent

Lokal SEO-maskin

Smart lead routing

Trust/review layer

Tier 2: gör produkten farlig

Branschspecifika mikroflöden

AI-chat som säljer

Före/efter-case motor

Självoptimerande CTA

Återaktiveringsflöden

Vad du inte ska lägga för mycket tid på först

Det här är lätt att överskatta:

för mycket 3D/design-wow

generiska AI-chatbots

“allt för alla”-funktioner

för avancerad CMS innan konverteringsmaskinen sitter

massa integrationsfluff utan tydlig ROI

Småföretagare bryr sig inte om teknik. De bryr sig om:

fler bokningar

mindre telefonstrul

snabbare offertflöde

bättre intryck

högre avslut

Den bästa positioneringen

Om du verkligen ska nischa mot småföretag hade jag tänkt så här:

SajtMaskin ska inte bara bygga hemsidor.
Den ska bygga småföretagets bästa säljare.

Det betyder att varje sajt borde ha:

lead capture

offert/bokning

trust

lokal SEO

uppföljning

enkel drift

Min bästa konkreta idé för dig

Om du vill ha en riktigt stark edge:

Bygg branschpaket där varje paket innehåller:

färdig struktur

rätt widgets

rätt frågor

rätt trust-sektioner

rätt CTA-logik

rätt SEO-upplägg

rätt admin/dataflöde

Exempel:

Hantverkarpaket

Frisörpaket

Klinikpaket

Juridikpaket

Restaurangpaket

Redovisningspaket

Det är mycket starkare än att bara vara “AI website builder”.

Vill du, kan jag nu sätta ihop en konkret topp-10 roadmap för Sajtmaskin mot småföretagare, i ordning från mest affärsvärde till minst.

Jag har ju en openclawdocker bla som man kan skicka med

Ja — det där är faktiskt en av dina starkaste edges.

Om du har en OpenClaw-docker / agent-container som kan skickas med, då kan du göra småföretagssidor mycket mer än “bara snygga sajter”. Då kan du börja sälja:

“hemsida + digital medarbetare”

Det är mycket starkare än en vanlig AI-site builder.

Vad det betyder i praktiken

Om OpenClaw-containern kan följa med per projekt, eller per kundmiljö, kan du låta sajten få en lokal agent som kan:

läsa projektets filer

förstå företagets tjänster, priser och FAQ

hantera innehållsändringar

hjälpa till med lead routing

göra enklare automationer

köra säkrare, avgränsade verktyg per kund

Det gör att sajten inte bara blir statisk, utan operativ.

De smartaste sakerna du kan bygga med det
1. Företagets egen AI-receptionist

Inte en generisk chatbot, utan en agent med koll på:

tjänster

öppettider

priser

område

policy

vanliga frågor

bokningslogik

Den kan:

svara korrekt

kvalificera leads

avgöra om kunden ska ringa, boka eller skicka offert

skriva sammanfattning till företagaren

För SMB är det här sjukt värdefullt.

2. Agent som skriver om sajten själv

Om containern har kontrollerad tillgång till projektets innehåll kan den:

uppdatera kampanjbanner

lägga in sommarstängt

byta CTA

skriva ny servicesida

skapa FAQ från inkomna frågor

lägga till ortssidor för lokal SEO

Detta är mycket starkare än att kunden måste in i ett admin och pilla själv.

3. Lead-agent

När en lead kommer in kan agenten:

analysera om leaden är bra eller dålig

märka upp bransch/ärendetyp

föreslå svar

skriva offertutkast

välja prioritet

skicka vidare till rätt kanal

Exempel:

akut VVS-jobb → SMS direkt

vanlig förfrågan → mejl

låg kvalitet → lägre prioritet

återkommande kund → specialflöde

4. Innehållsagent för lokal SEO

Det här kan bli enormt starkt.

Agenten kan:

skapa nya lokala landningssidor

uppdatera befintliga sidor

generera FAQ utifrån riktiga frågor

förbättra interna länkar

skapa “vi jobbar i X”-sidor

skriva case-sidor från färdiga mallar

Om det görs kontrollerat kan du ge småföretagare en SEO-maskin istället för en hemsida.

5. Före/efter-agent

För hantverk, skönhet, städ, bilvård, klinik osv:

ta emot uppladdade bilder

gruppera dem per jobbtyp

skriva captions

skapa case-sidor

välja ut bästa bilderna

lägga in trust copy runt dem

Det här är perfekt för en lokal agent/container.

6. Offertagent

Om kund fyller i formulär kan agenten:

strukturera behovet

jämföra mot prisregler

ge prisintervall

föreslå paket

skapa offertutkast

förbereda uppföljning

Det gör småföretagaren snabbare än konkurrenterna.

7. Admin-agent i bakgrunden

Istället för att kunden måste förstå systemet kan agenten göra adminjobbet:

“lägg till ny tjänst”

“uppdatera prislistan”

“publicera julkampanj”

“gör en sida för däckbyte”

“lägg in recensionerna jag fick idag”

Det här är där du börjar få riktigt produktvärde.

Det viktigaste: använd OpenClaw rätt

Det du inte ska göra är att bara säga:
“vi har en agentcontainer”

Det säljer inte.

Du ska paketera det som tydliga SMB-funktioner:

AI-receptionist

offertassistent

SEO-assistent

innehållsassistent

uppföljningsassistent

publiceringsassistent

Då blir det konkret.

Hur jag skulle positionera det

För småföretagare skulle jag inte prata om Docker eller OpenClaw alls.

Jag skulle säga något i stil med:

“Din hemsida får en egen AI-assistent”

“Sidan kan själv svara, sortera leads och uppdatera innehåll”

“Du får inte bara en hemsida, du får en digital medarbetare”

Det är rätt språk.

Den stora strategiska fördelen

Det här kan bli din skillnad mot Loveable.

Loveable känns mer som:

snabb byggupplevelse

snygg output

generellt AI-bygge

Sajtmaskin kan bli:

vertikal SMB-motor

färdiga branschflöden

hemsida + agent

hemsida som fortsätter jobba efter publicering

Det är mycket mer moat.

Min bästa prioritering för OpenClaw-spåret

Jag hade gjort i den här ordningen:

Steg 1

Bygg en enkel AI-receptionist per SMB-sida:

känner till företagets innehåll

svarar på frågor

tar in leads

bokar eller skickar vidare

Steg 2

Bygg content actions:

skapa servicesida

uppdatera text

lägg till ortssida

publicera kampanj

Steg 3

Bygg lead/offert-agent:

analysera leads

skriv sammanfattning

föreslå svar/offert

Steg 4

Bygg SEO-agent:

hitta innehållsluckor

skapa lokala sidor

förbättra interna länkar

skapa FAQ och case

Min raka bedömning

Om du verkligen kan “skicka med” OpenClaw per sajt/projekt, då är det inte bara en teknisk detalj.

Det kan vara din starkaste produktidé.

För då säljer du inte:

hemsidor

Du säljer:

småföretagets digitala front office

Och det är mycket mer värdefullt.

Jag kan skissa en konkret Sajtmaskin + OpenClaw-arkitektur för SMB, med exakt vilka 5 agentfunktioner som borde byggas först.
