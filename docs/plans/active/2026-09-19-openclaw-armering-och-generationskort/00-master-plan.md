# Armerad autonomi och generationskortens ärlighet

> **Status: utredning klar, kod inte påbörjad.** Fyra spår ur en reproducerad
> preview-körning 2026-09-19 (chat `a0b134d9`, preview `45f0f9842`). Varje spår
> har egen rotorsak och egen PR. Spår D kräver ingen kod.
> Ingen produktionspromote ingår.

## Ursprung

Användaren skapade en sajt i buildern, slog på skölden med alla tre
befogenheterna och skrev till Sajtagenten:

> gör 3 follow-ups och buggranska. Första steget: skicka själv en builder-prompt
> som gör hero-rubriken tydligare. Om det räcker med en liten textändring,
> föreslå också en snabbändring.

`/api/openclaw/chat` svarade HTTP 200 på 3,3 s med `lane=strong
agent=sajtagenten fallback=none`. Ingen text, inget action-block, ingen
ifylld builderprompt, ingen sändning. Tre tänkprickar blev kvar permanent.

Samma körning visade två nästan identiska kort «Kontroller att se över» (5 filer
respektive 1 fil), två Chromium-core-dumpar i `/tmp`, och live-review-bilder som
laddades upp till Blob men aldrig syntes i chatten.

## Spår

| Spår | Fel | Aktivitet | PR |
|---|---|---|---|
| A1 | Armeringen skapar mandat men leder aldrig till första builder-sändningen | [`aktiviteter/A1-armering-till-forsta-send.md`](aktiviteter/A1-armering-till-forsta-send.md) | Egen |
| A2 | Tom eller avhuggen ström lämnar evig tänkprick; orsaken till det tomma svaret är obevisad | [`aktiviteter/A2-terminal-stream.md`](aktiviteter/A2-terminal-stream.md) | Egen |
| B1 | Init och auto-reparation får samma rubrik; init-kortets `autoFixQueued` släpps aldrig | [`aktiviteter/B1-generationskortens-etiketter.md`](aktiviteter/B1-generationskortens-etiketter.md) | Egen |
| C1 | Live-review-bilderna når browsern men renderas aldrig | [`aktiviteter/C1-live-review-miniatyrer.md`](aktiviteter/C1-live-review-miniatyrer.md) | Egen |
| D1 | Chromium-core-dump, minnes- och disktryck | [`aktiviteter/D1-chromium-minnestryck.md`](aktiviteter/D1-chromium-minnestryck.md) | Ingen |

Ordning: **A1 → A2 → B1 → C1.** A2 kan köras parallellt med A1 av en annan agent
— de rör olika filer (`gateway-response.ts` + renderarens tomläge kontra
prompt/parser/väckning). Slå inte ihop dem: A1 är ett protokollfel, A2 är ett
transport- och tomlägesfel.

## Vad som är bevisat

Läst i koden på `45f0f9842`, inte antaget:

- Frasen ovan armerar tre steg. `parseArmingDirective` matchar `FOLLOWUP_RE` +
  `gör` + `3` och mandatet sätts **före** fetch
  ([`armed-mandate.ts`](../../../../src/lib/openclaw/debug/armed-mandate.ts),
  [`useOpenClawChat.ts`](../../../../src/components/openclaw/useOpenClawChat.ts)).
- Systemprompten ber modellen svara med **ett** `start_bug_hunt`-block vid
  armering, och beskriver fill+`submit:true` som en **separat** regel
  ([`edit-system-prompt.ts:25-33`](../../../../src/lib/openclaw/edit-system-prompt.ts)).
- Parsern kör högst ett action-block per svar; första kompletta payloaden vinner
  och resten klipps
  ([`text-field-actions.ts`](../../../../src/lib/openclaw/text-field-actions.ts)).
  Redan låst i test: `start_bug_hunt` följt av `fill_text_field` ger
  `start_bug_hunt`.
- `OpenClawStartBugHuntCard` är enbart en bekräftelse. Den armerar inte, skickar
  inte och väcker ingen
  ([`OpenClawMessage.tsx`](../../../../src/components/openclaw/OpenClawMessage.tsx)).
- Continuation-watch skapas först efter en lyckad `triggerOpenClawSend`.
- `parseGatewayStream` bryter på `done` utan att flusha kvarvarande buffert
  ([`gateway-response.ts:117-122`](../../../../src/lib/openclaw/gateway-response.ts)),
  och läser bara `choices[0].delta.content` som sträng.
- `resolveHeadline` har ingen repair-gren: `attention` ger alltid «Kontroller att
  se över»
  ([`GenerationSurface.tsx:324-329`](../../../../src/components/builder/chat/GenerationSurface.tsx)).
- `postCheck.autoFixQueued === true` håller kvar `attention`
  ([`generation-surface-state.ts:20`](../../../../src/components/builder/chat/generation-surface-state.ts))
  och nollställs inte när reparationen är klar.
- Live-review-URL:erna finns i `tool-post-check.output.productPostcheck.screenshots`
  men ingen komponent läser dem.

## Vad som inte är bevisat

- **Varför just den här streamen var tom.** HTTP 200 loggas när gateway-headers
  kommit, inte när tokens levererats. Gateway-bodyn för `a0b134d9` sparades inte.
  A2 börjar därför med mätning, inte med kodändring.
- Vilket fynd som satte `attention` på det **andra** kortet (egna varningar mest
  troligt, inte kopierade delar).
- Om `tool-post-check.output` överlever message-persist och omladdning. C1 måste
  verifiera det innan miniatyrer byggs på det fältet.

## Ramar

- Slå **inte** på OpenClaws generella browser-, shell- eller internettools på
  Render. Sajtagenten ska styra Sajtmaskin genom builder-, kontext- och
  action-vägarna. Beslutet och grindmatrisen ligger i
  [`powers.ts`](../../../../src/lib/openclaw/powers.ts) och
  [`docs/ENV.md`](../../../ENV.md) (`OC_EDIT`).
- OpenClaw får aldrig direkt filsystemsskrivning mot kundprojektet. Alla
  ändringar går genom builderns ordinarie pipeline.
- Snabbändring (`quick_edit`) förblir separat och kräver manuellt godkännande.
  A1 ändrar inte den säkerhetsmodellen.
- Slå inte ihop generationsytorna i B1. Strömning, kontroller och historik är
  knutna till respektive assistant-id.
- Ändra inte historiken så att två faktiska generationsturer blir en
  backend-händelse. B1 är presentation, gruppering och etikettering.

## Slutbevis för spår A

Inte «ett armeringskort syns». Följande ska gälla med `OC_EDIT` på, sköld på och
`armed_autonomy` beviljad:

1. Mandat skapas med tre steg.
2. Sajtagenten läser aktuell builder- och projektkontext.
3. Första follow-up-prompten fylls i det riktiga builderfältet och skickas med
   den vanliga send-knappen.
4. Buildern bygger och verifierar normalt.
5. Sajtagenten väcks när resultatet är terminalt och väljer nästa steg utifrån
   färskt resultat.
6. Högst tre auto-sändningar. Mandatet stannar efter steg 3.
7. Stopp, chattbyte, blockerad generation, avvisad sändning och användarfråga
   avslutar mandatet fail-closed.

## Buggkö

Inga nya `SM-###` har myntats i den här ändringen. Chromium-spåret är residual av
befintliga `SM-072`. Om ägaren vill ha backloggrader för A1, A2, B1 och C1 är det
en separat rad i [`BUG-SWARM-BACKLOG.md`](../../../../BUG-SWARM-BACKLOG.md), inte
en kopia av den här planen.
