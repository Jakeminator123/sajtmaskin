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

Plus ett tillägg som **inte** är ett av de fem: annonsspåret kring
myndighetsprocessen (typ «verksamt»-ögonblicket). Bjuda på
myndighetsvarumärket «verksamt» rakt av rekommenderades inte.

Ingen av de fyra nedan har egen plan under `docs/plans/active/`.
Beställ dem separat; bygg inte dem ur den här listan utan nytt ja.

## 1. Inline bild i kalla mejl/DM

Sänker friktionen till första intrycket: bädda in mockupen i mejlet eller
LinkedIn-DM, inte bara en länk. Känns som att något redan är gjort.

Första test: A/B i redan planerad batch 1/2. Samma preview-pipeline till
bild; CID i e-post eller bifogad bild i LinkedIn. Mät leverans och
öppningsgrad.

Undvik: spamfilter på bildtunga mejl. Bilden är ett förslag, inte påstådd
färdig leverans.

## 3. T-1: varumärkesansökan hos PRV

Ett steg före T0 i den äldre kundplanen. Den som varumärkesskyddar
signalerar en mer premium-orienterad mottagare, men volymen är låg.

Första test: datatillgänglighet mot PRV, inte bygg. Därefter matchning
mot Bolagsverket och domänkontroll.

Undvik: huvudkanal på egen hand. Inte en av de första två triggergrupperna.

## 4. Nyemission registrerad hos Bolagsverket

Den enda diskuterade triggern som signalerar **budget just nu**, inte
bara behov. Premiumspår, inte gratis-först i batch 1.

Första test: parsa PoIT-kungörelser (org.nr, datum, ev. belopp) och
kombinera med bolagsålder.

Undvik: massutskickston. Mottagarna är ofta sofistikerade.

## 5. DNS/nameserver-byte hos befintligt bolag

Befintligt bolag mitt i ett leverantörsbyte — redan i utvärderingsfas,
annan målgrupp än nystartade utan sajt.

Första test: lager ovanpå domänbevakning efter Radar v1, på redan
bevakade domäner. Jämför kostnad mot värde innan bredare polling.

Undvik: nämn aldrig metoden («vi märkte att ni bytte nameserver»).
Formulera kring utfallet, inte kring signalen.

## Inte det här paketet

Index/sitemap för `/analys` (B2) och partner `?mode=audit` (B4) är
ägarbeslut i [`00-master-plan.md`](00-master-plan.md), inte egna
kundanskaffningsspår.
