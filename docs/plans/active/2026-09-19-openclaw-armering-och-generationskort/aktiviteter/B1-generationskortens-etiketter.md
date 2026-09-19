# B1 — Skilj ursprungsgenerering från automatisk reparation

## Mål

Efter ett bygge som utlöser AUTO-FIX ska användaren se vad som var
ursprungsbygget, vad som var reparationen och vilken fil reparationen ändrade —
utan två visuellt identiska varningskort.

## Rotorsak (bevisad)

Det är **två riktiga turer**, inte dubblerad generering. En `GenerationSurface`
renderas per assistant-meddelande
([`MessageList.tsx`](../../../../../src/components/builder/chat/MessageList.tsx)),
och AUTO-FIX är en ny `sendMessage`-tur med eget user- och assistant-id
([`useAutoFix.ts`](../../../../../src/lib/hooks/chat/useAutoFix.ts),
[`useSendMessage.ts`](../../../../../src/lib/hooks/chat/useSendMessage.ts)).

Tre saker gör dem förväxlingsbara:

1. `resolveHeadline` har ingen repair-gren. `attention` ger alltid «Kontroller
   att se över» / «Se kontrollresultatet i detaljerna.»
   ([`GenerationSurface.tsx:324-329`](../../../../../src/components/builder/chat/GenerationSurface.tsx)).
2. `postCheck.autoFixQueued === true` håller kvar `attention`
   ([`generation-surface-state.ts:20`](../../../../../src/components/builder/chat/generation-surface-state.ts))
   och **nollställs inte** när reparationsturen är klar. Init-kortet fortsätter
   alltså be om uppmärksamhet för en fix som redan kört.
3. Byggprofil, profil-ID, motorväg och modell skrivs om vid **varje** ström
   ([`helpers-model-info.ts`](../../../../../src/lib/hooks/chat/helpers-model-info.ts)).
   Samma profil ger identiska rader i båda detaljlådorna. Inte duplicerad data
   — men repeterad utan nytta.

Filräknaren är semantiskt rätt: `parseGenerationContent` räknar avslutade
`file="..."`-block i **det svaret**
([`generation-content.ts`](../../../../../src/components/builder/chat/generation-content.ts)).
Fem block i init-svaret, ett i reparationssvaret. Det är inte projektets 22
filer. Etiketten «5 filer» antyder något annat.

## Redan tillgänglig markering

Datamodellen bär repair-status — men inte där rubriken sätts:

- User-raden har `prompt-source` med `sourceKind: "autofix"`, och renderas som
  chip «Automatisk reparation kördes» via `SyntheticSystemPromptRow`.
- Servern sätter `promptSource: "auto_repair"`.
- Arbetsloggen kan visa «Källa: Auto-repair (server-driven)».
- Assistant-raden har **ingen** egen repair-flagga. Det är luckan.

## Krav

1. Behåll två separata kort. Slå inte ihop ytorna — strömning, kontroller och
   historik är knutna till respektive assistant-id.
2. Märk dem olika. Riktning: «Ursprunglig generering · 5 filer i svaret» och
   «Automatisk reparation · 1 fil ändrad».
3. Lägst risk: låt `MessageList` känna igen att föregående meddelande är
   auto-repair-prompten och skicka den signalen till ytan. Fallback finns i
   prefixet `AUTO-FIX REQUEST`.
4. Skilj reparationsstatus från kvarvarande varningar. `autoFixQueued` betyder
   «fix köad», inte «användaren måste se över». Init-kortet bör säga att en
   reparation startade.
5. Håll repeterad metadata under detaljer. Om andra turen bara skiljer sig i
   källa, orsak och ändrad fil ska just det synas överst.
6. Ändra inte historiken så att två faktiska turer blir en backend-händelse.

## Owner

- [`src/components/builder/chat/GenerationSurface.tsx`](../../../../../src/components/builder/chat/GenerationSurface.tsx)
- [`src/components/builder/chat/generation-surface-state.ts`](../../../../../src/components/builder/chat/generation-surface-state.ts)
- [`src/components/builder/chat/MessageList.tsx`](../../../../../src/components/builder/chat/MessageList.tsx)

## Tester

Regressionsprov för sekvensen initial generation + AUTO-FIX, i den rapporterade
formen: första turen med flera filer, andra reparationsturen med en fil.

1. Init-turen och reparationsturen får olika rubrik.
2. Filantalet hör till rätt steg och är etiketterat som svarets filer.
3. Reparationsturen namnger den ändrade filen.
4. Ett kvarvarande kontrollfynd syns fortfarande som varning.
5. Init-kortet slutar be om uppmärksamhet enbart på grund av en avslutad
   köad fix.

## PR

[#1497](https://github.com/Jakeminator123/sajtmaskin/pull/1497) — `fix/generationskort-repair-etikett`.
Etikettfelet är rättat med regressionstester. Review + smoke före merge.

## Acceptans

De fem punkterna ovan i UI, plus att inget av korten längre kan förväxlas för
en dubblett av det andra.

## Öppet

Vilket fynd som satte `attention` på **andra** kortet i just `a0b134d9` är inte
fastställt — troligen dess egna varningar, inte kopierade delar. Bekräfta innan
`attention`-logiken rörs.
