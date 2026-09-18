# Kundanskaffning: de fyra kvarvarande spåren

> Rekonstruktion 2026-09-18. Den fulla brainstormen skrevs som
> `docs/growth/kundanskaffning-fordjupning-fem-spar.md` på Jakobs
> Windows-checkout (`docs/kundanskaffning-gronomrade-brainstorm`,
> commit `c2c1c62ec`) men **pushades aldrig**. Den filen fanns inte i
> PR #1471. Den här sidan är den tracked resten så listan inte försvinner
> när `/analys`-spåret är mergat.

Ursprunglig fem-lista (Jakobs urval):

1. Inline bild i kalla mejl/DM
2. ~~Publik "gratis webbplatsgranskning"-widget~~ — gjort som `/analys` i #1471
3. T-1: varumärkesansökan hos PRV
4. Nyemission registrerad hos Bolagsverket
5. DNS/nameserver-byte hos befintligt bolag

## Ordning och läge

Principen från v1→v3: **testa signalvärdet först, bygg Radar först när en
signal faktiskt konverterar.** Ta ett litet antal riktiga leads per signal,
en pitch, `/analys` eller mockup som bevis, och se om människor svarar.
Först när en trigger tydligt slår vanlig kall outreach är den värd
automatisering.

| Ordning | Spår | Vad det egentligen är | Läge |
|---|---|---|---|
| 1 | Inline bild i kallt mejl/DM | Bättre kuvert på outreach som ändå ska ut — inte nya leads | **Protokoll klart, experiment ej kört**: [`aktiviteter/K1-inline-bild-ab-test.md`](aktiviteter/K1-inline-bild-ab-test.md) |
| 2 | T-1: varumärkesansökan hos PRV | Försök hitta bolaget före domän och bolagsregistrering | **Beställning:** datatillgänglighetsstudie |
| 3 | Nyemission hos Bolagsverket | Befintligt bolag som just gjort en kapitalåtgärd | **Beställning:** litet manuellt premiumexperiment |
| 4 | DNS/nameserver-byte | Befintligt bolag som gör något med webb eller leverantör nu | **PARK** tills Radar v1 finns |

**PRV T-1 och nyemission är beställningar; DNS-bytet är PARK tills Radar v1
finns.** Inget av dem är pågående implementation, ingen har egen planmapp
och ingen ska byggas utan nytt ja. Numreringen ovan gäller den här filen —
masterplanen använder den ursprungliga fem-listan, så hänvisa till spåren
med namn.

Utskick och leadhantering ägs av ägarens separata repo
`Jakeminator123/JakobScrape` («POIT-leads och dashboard»). Sajtmaskin-repot
ska inte få en parallell utskicks- eller leadpipeline.

## Hur `/analys` gör de andra starkare

`/analys` är levererad och fungerar som verktyg i båda riktningarna:
inbound på sajten, och som personlig bilaga i outreach.

```text
trigger (PRV, nyemission, annat)
  → hitta bolagets nuvarande webb
  → kör /analys
  → personlig rapport + ev. mockup
  → outreach
```

Då blir kontakten inte «en signal hände», utan något konkret om deras
faktiska webbplats.

## 2. T-1: varumärkesansökan hos PRV

Ett steg före T0 i den äldre kundplanen: någon har skickat in en
varumärkesansökan, ibland innan det finns bolag eller domän. Den som
varumärkesskyddar signalerar en mer premium-orienterad mottagare, men
volymen är låg.

**Beställning: datatillgänglighetsstudie, inte bygge.** Går det att få
färska poster med sökbar identitet och datum, och kan de matchas rimligt mot
Bolagsverket och en domänkontroll? Ta ett litet stickprov.

Undvik: huvudkanal på egen hand. Inte en av de första två
triggergrupperna. Bygg inget Radar-flöde innan datan är visad användbar.

## 3. Nyemission registrerad hos Bolagsverket

Den enda diskuterade triggern som pekar på **betalningsförmåga** i stället
för bara behov. Kungörs i Post- och Inrikes Tidningar med org.nr, datum och
ibland belopp.

**Beställning: litet manuellt premiumexperiment.** Hämta några färska fall
och kontrollera vilka som samtidigt har svag eller gammal sajt. Pitcha ett
betalt förbättrings-/tillväxterbjudande, inte «gratis hemsida» som standard.
PoIT-leads hanteras redan i `JakobScrape` — bygg inte om datasteget här.

Undvik: massutskickston — mottagarna har ofta byrå och höga förväntningar.
Registrerad emission är en **budgetsignal att testa**, inte ett bevis på
att pengarna finns på banken.

## 4. DNS/nameserver-byte hos befintligt bolag

Bolag mitt i ett leverantörsbyte, alltså redan i utvärderingsfas. Annan
målgrupp än nystartade utan sajt.

**PARK tills Radar v1 finns.** Signalen kräver historik och kontinuerlig
bevakning för att vara värd något, så den väntar på Radar v1 och används då
för prioritering — inte som egen fristående kanal. Jämför kostnad mot värde
innan bredare polling.

Undvik: nämn aldrig metoden («vi märkte att ni bytte nameserver»).
Formulera kring utfallet.

## Annonsspåret hålls separat

«Verksamt»-ögonblicket är inte en lead-datasignal utan ett **paid
intent**-spår: syns när någon aktivt är i starta-bolag-, domän- eller
hemsidefasen. Kan testas oberoende av Radar. Bjud inte på
myndighetsvarumärket «verksamt» rakt av.

## Inte det här paketet

Index/sitemap för `/analys` (B2) och partner `?mode=audit` (B4) är
ägarbeslut i [`00-master-plan.md`](00-master-plan.md), inte egna
kundanskaffningsspår.
