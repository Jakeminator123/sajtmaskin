# A1 — Armeringen ska leda till första builder-sändningen

## Mål

När användaren armerar Sajtagenten med en fras som redan skapar ett giltigt
mandat ska första follow-upen faktiskt skickas i buildern. Idag kan turen dö
efter bekräftelsen.

## Rotorsak (bevisad)

Fyra led som var för sig är avsiktliga men tillsammans bildar ett hål:

1. `parseArmingDirective` skapar mandatet **före** fetch
   ([`armed-mandate.ts`](../../../../../src/lib/openclaw/debug/armed-mandate.ts),
   [`useOpenClawChat.ts`](../../../../../src/components/openclaw/useOpenClawChat.ts)).
2. Systemprompten ber modellen svara med **ett** `start_bug_hunt`-block vid
   armering. Fill med `submit:true` beskrivs som en separat regel för «när du är
   armerad»
   ([`edit-system-prompt.ts:25-33`](../../../../../src/lib/openclaw/edit-system-prompt.ts)).
3. Parsern kör högst ett action-block per svar. Första kompletta payloaden
   vinner, resten klipps
   ([`text-field-actions.ts`](../../../../../src/lib/openclaw/text-field-actions.ts)).
   Ordningen i prompten sätter bekräftelsen först, så en lydig modell som
   skickar båda **förlorar** fill.
4. `OpenClawStartBugHuntCard` är ren UI-bekräftelse. Ingen timer, ingen watch,
   ingen send
   ([`OpenClawMessage.tsx`](../../../../../src/components/openclaw/OpenClawMessage.tsx)).
   Continuation-watch skapas först efter en lyckad `triggerOpenClawSend`.

Resultat: `user armar → assistant bekräftar → ingenting väcker assistenten →
inget fill → ingen builder-sändning.`

## Krav

1. Behåll **ett körbart kommando per svar**. Bygg inte en multi-action-pipeline.
2. Synka prompt och körlogik så att armeringsturen leder vidare. Två vägar,
   välj den som visar sig bära:
   - a) Om både `start_bug_hunt` och `fill_text_field` finns i samma svar,
     preferera `fill_text_field` deterministiskt (bekräftelsen är kosmetisk när
     ett riktigt steg finns).
   - b) Efter ett `start_bug_hunt` **utan** fill: en strikt engångsväckning med
     `allowArming: false`, samma mönster som continuation.
   Prompten ska inte be om enbart bekräftelse när användaren redan beskrivit
   första builder-steget.
3. Engångsväckningen får **aldrig** förnya eller förlänga mandatet.
4. `submit:true` utan aktivt mandat auto-sändar fortfarande aldrig.
5. Remount och omrendering får inte dubbelsända.
6. Ingen ändring av `quick_edit`: snabbändring kräver fortsatt manuellt
   godkännande.

## Owner

- [`src/lib/openclaw/edit-system-prompt.ts`](../../../../../src/lib/openclaw/edit-system-prompt.ts)
- [`src/lib/openclaw/text-field-actions.ts`](../../../../../src/lib/openclaw/text-field-actions.ts)
- [`src/components/openclaw/OpenClawMessage.tsx`](../../../../../src/components/openclaw/OpenClawMessage.tsx)
- [`src/components/openclaw/useOpenClawChat.ts`](../../../../../src/components/openclaw/useOpenClawChat.ts)
- [`src/lib/openclaw/debug/armed-continuation.ts`](../../../../../src/lib/openclaw/debug/armed-continuation.ts)

## Tester

1. Exakt användarfrasen ur [`00-master-plan.md`](../00-master-plan.md) armerar
   tre steg.
2. Armeringsfras + svar med **endast** `start_bug_hunt` leder till ett första
   builder-steg — inte till tystnad. Detta test saknas helt idag.
3. Svar med båda blocken hanteras deterministiskt och dokumenterat.
4. `submit:true` utan aktivt mandat sändar aldrig.
5. Aktivt mandat + rätt befogenhet + ny assistant-action sändar exakt en gång.
6. Remount kan inte dubbelsända.
7. Continuation kör steg 2 och 3 och stannar efter steg 3.
8. Stopp, chattbyte, avvisad sändning och användarfråga avslutar mandatet.

Befintliga tester täcker parserns first-wins, **inte** stallet.

## PR

[#1495](https://github.com/Jakeminator123/sajtmaskin/pull/1495) — `fix/openclaw-armering-forsta-send`.
Väg (b): engångsväckning efter hunt-only. A2 (#1498) är stackad härpå.

## Återstående kontroll

Väckningen får bara gå efter ett **lyckat** strömavslut. Ett komplett
`start_bug_hunt` följt av ett gatewayfel får inte utlösa nästa automatiska
anrop. Regressionstest: hunt-block + error-envelope. Skyddet mot dubbla
väckningar ska vara kvar.

## Acceptans

De sju punkterna under «Slutbevis för spår A» i
[`00-master-plan.md`](../00-master-plan.md). En preview-smoke där första
follow-upen syns skickas i builderfältet är kravet — inte att ett armeringskort
renderas.
