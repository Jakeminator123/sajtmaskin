# A2 — Tomt svar ska vara terminalt, och orsaken mätbar

## Mål

En avslutad ström får aldrig se ut som pågående arbete. Och nästa gång ett svar
uteblir ska loggen kunna skilja tomt, avhugget och hängande.

## Rotorsak — tänkprickarna (bevisad)

Tre prickar är inte en typing-indikator. De är else-grenen när
`parsed.visibleContent` är falskt
([`OpenClawMessage.tsx`](../../../../../src/components/openclaw/OpenClawMessage.tsx)).
`shouldRenderBubble` är sant när det saknas både action och `actionError`, så en
**ofullständig** `<openclaw-action>`-tagg ger tom synlig text utan action — och
prickarna blir kvar. `setStreaming(false)` i `finally` tar inte bort dem.

`hasIncompleteAction` sätts av parsern men läses **aldrig** i UI:t. Hookens
fallback `(Inget svar fran agenten)` räddar bara fallet `!accumulated` efter
avslutad ström, inte fallet «accumulated finns men är osynlig».

## Rotorsak — tomma svaret (obevisad, ska mätas)

Två bevisade glipor i transporten, plus fall som bara mätning kan skilja:

1. `parseGatewayStream` bryter på `done` **utan** att flusha kvarvarande buffert
   ([`gateway-response.ts:117-122`](../../../../../src/lib/openclaw/gateway-response.ts)).
   En sista SSE-rad utan avslutande radbrytning slängs.
2. Samma parser läser bara `choices[0].delta.content` som **sträng**. Array-parts,
   `message.content` och reasoning-fält hoppas tyst över. `did/chat`-routen läser
   redan fler former, så gatewayn kan leverera dem.
3. Övriga kandidater: modellen producerade tom content; klienten hängde i
   `for await` utan att strömmen tog slut; abort.

`[openclaw/gateway] … status=200` skrivs när gateway-headers kommit, innan bodyn
proxas. De 3,3 sekunderna bevisar ingenting om innehållet.

## Ordning

**Mät först, fixa sedan.** Lägg diagnostiken innan transportfixen, annars vet vi
aldrig vilken glipa som slog i den rapporterade körningen.

## Krav

1. Diagnostik efter strömslut som gör fallen maskinellt skiljbara:
   `accumulated.length`, `hasIncompleteAction`, om bufferten hade rester,
   om strömmen faktiskt avslutades, och vilken content-form som sågs.
   **Aldrig** token, secrets eller full promptdata. Maskad prefix räcker.
2. Flusha kvarvarande buffert och decoder vid strömslut.
3. Acceptera samma content-former som `extractAssistantText` redan gör.
4. UI:t ska vara terminalt efter avslutad ström: text, ett tydligt fel, eller en
   svensk tomlägesrad. Villkoret behöver täcka
   `!streaming && !visibleContent && (hasIncompleteAction || !action)`.
   Spegla fallbacken i renderaren, inte bara i hooken.
5. Byt ut `(Inget svar fran agenten)` mot korrekt svensk copy.

## Owner

- [`src/lib/openclaw/gateway-response.ts`](../../../../../src/lib/openclaw/gateway-response.ts)
- [`src/components/openclaw/useOpenClawChat.ts`](../../../../../src/components/openclaw/useOpenClawChat.ts)
- [`src/components/openclaw/OpenClawMessage.tsx`](../../../../../src/components/openclaw/OpenClawMessage.tsx)

## Tester

1. Tom HTTP-200-ström lämnar ingen tänkprick och sätter `isStreaming` falskt.
2. Ofullständigt action-block med `streaming=false` ger felkort eller
   tomlägesrad, inte eviga prickar.
3. SSE-rad utan avslutande radbrytning tappas inte.
4. `delta.content` som array och `message.content` i SSE accepteras.
5. Error-envelope ger fortsatt svensk feltext, inte tomläge.

## Acceptans

En reproducerad tom ström slutar i ett terminalt UI-tillstånd, och loggen pekar
ut vilken av kategorierna i «Rotorsak — tomma svaret» som inträffade.
