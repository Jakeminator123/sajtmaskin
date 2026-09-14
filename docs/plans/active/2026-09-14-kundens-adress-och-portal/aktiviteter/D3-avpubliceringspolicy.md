# D3 — Föreslagen pauspolicy och faktisk driftåtgärd

Område: [04](../04-abonnemang-och-livscykel.md). D1:s policyneutrala
grundschema är levererat utan att dessa policyförslag ratificerats. Policyn
fastställs före kundaktivering; driftimplementationen följer D1 och D2.

## Genomförandestatus 2026-09-14

Policyn är inte ratificerad och faktisk paus/återställning är inte levererad.
7 dagars respit, 90 dagars bevarande och övriga utfall nedan är fortsatt förslag.

## Föreslagen policy att svara ja till

| Händelse/läge | Utfall |
|---|---|
| Första betalningen misslyckas | Ingen ny betald publicering; checkout kan göras om |
| Förnyelsen misslyckas | Sajten förblir live i 7 dagar med meddelande i portalen och påminnelse till ägaren |
| Kunden säger upp | Sajten fungerar till slutet av redan betald period |
| Betalning kommer under respit | Fortsätt live; ta bort respit utan avbrott |
| Respit/betald period tar slut utan rättighet | Neutral pausad sida; orsaken visas bara för inloggad ägare |
| Under paus | Domänkoppling och reserverad slug kvar; konto, redigering inom egna credits och export tillgängliga |
| Ny giltig betalning efter paus | Ägaren kan med ett klick återställa senaste fungerande publicerade version, aldrig automatiskt senaste utkastet |
| Data | Minst 90 dagar från faktisk paus för sajtdata/media; ingen automatisk radering i MVP |

Föreslagen gallring efter bevarandetiden sker endast som separat operatörsåtgärd
med minst 14 dagars förvarning och exportmöjlighet. Radera inte bokföringsdata,
återanvänd inte branded-sluggar till andra kunder och släpp inte alias medan
kunden fortfarande pekar sin DNS dit utan en definierad avslutsprocess.
En neutral statisk pausad sida kan ligga kvar tills domänexit är ordnad;
bevarandetid för innehåll är inte automatiskt tidpunkt för aliasborttagning.

## Pausens teknik

Ett projektfält stoppar inte en separat Vercel-deployment. Välj och verifiera
en konkret MVP-mekanism: publicera exempelvis ett minimalt pausprojekt till
**samma** kundprojekt med bevarade alias. Behåll senaste fungerande artefakt/
versionsreferens före åtgärden. Plattformens eget projekt får aldrig väljas.

D2:s tidsstyrda avstämning beställer idempotent paus och återförsök. Status är
`pausning pågår` tills provideråtgärd och HTTP bekräftar den. Providerfel får
inte rapporteras som lyckad paus. Vid återställning bekräftas på samma sätt
rätt version och live-adress innan sajten räknas som aktiv.

Inventera gamla deployment-URL:er: att flytta alias stoppar inte säkert
åtkomst till tidigare versioner. Verifiera provider-skydd/pausmöjlighet för
dessa, särskilt om de har kostnadsdrivande API:er. Lova inte stoppad drift
om det bara är huvuddomänens HTML som ersatts. Genomför inget nytt delat
trafikproxy-lager bara för att lösa detta; en operatörsåtgärd kan ingå i liten pilot.

## SEO och besökartext

Ingen text på kundens publika domän ska berätta att kunden inte har betalat.
Visa exempelvis att webbplatsen tillfälligt är otillgänglig och en ägarlänk.

Tillfälligt 503 med `Retry-After` kan användas en kort tid, högst ungefär två
dagar i detta förslag. Därefter krävs ett medvetet långpausläge, exempelvis
200 med neutral sida och `noindex`. **Lång paus kan påverka indexering och
ranking**; `noindex` skyddar inte mot SEO-skada. Se
[Googles vägledning om paus](https://developers.google.com/search/docs/crawling-indexing/pause-online-business).

## Klart när

Policyn är godkänd och kundtexten stämmer med implementationen. Klockstyrd
verifiering täcker dag 7, uppsägning vid periodslut, utebliven webhook,
providerfel, lyckat återförsök och återställning av senast publicerade version.
Faktiska kundtesthosten är prövad över HTTPS. Återförsök får aldrig skriva
över ett senare betalt/återaktiverat tillstånd. Automatisk radering byggs inte.
