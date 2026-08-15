# T9c — samma dömda reservväg finns för uppföljningsmeddelanden

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)
Upptäckt: av T9a-agenten under arbetet med #1006, verifierad av orkestratorn 2026-08-15.

## Problemet

`T9a` (#1006) tog bort den dömda reservvägen för **nya** chattar. Men exakt samma
mönster finns kvar för **uppföljningar** — alltså när användaren redigerar en
befintlig sajt.

`src/lib/hooks/chat/useSendMessage.ts` (~rad 773-776) faller vid nätverksfel
tillbaka på `POST /api/engine/chats/[chatId]/messages`, och den rutten kör samma
stream-handler igen (`messages/route.ts` ~rad 235-244).

Rutten saknar `maxDuration`. Verifierat med sökning över `src/app/api/engine`:

| Rutt | `maxDuration` |
|---|---|
| `chats/stream` | 950 |
| `chats/[chatId]/stream` | 950 |
| `chats/[chatId]/repair` | 950 |
| `chats/[chatId]/quality-gate` | 950 |
| `chats/[chatId]/product-postcheck` | 60 |
| **`chats/[chatId]/messages`** | **saknas** |

En uppföljning tar lika lång tid som en förstagenerering — 47 till 405 sekunder i
verkliga körningar. Rutten kan alltså inte slutföra jobbet på plattformens
standardgräns, precis som create-rutten inte kunde. Utfallet är garanterat `504`.

## Varför detta inte kan vänta

Ägarens ursprungliga rapport handlade om *"att skapa och öppna och **redigera**
användarsajter"*. #1006 fixade skapandet. Utan den här punkten är redigering från
mobil fortfarande trasig på exakt samma sätt — och det är den vanligaste
handlingen, eftersom man skapar en sajt en gång men redigerar den många.

## Uppgift

Spegla lösningen i #1006. Läs den PR:en först (`git log origin/master` →
commit för #1006) så att lösningen blir konsekvent, inte en andra variant.

1. **Kartlägg anroparna av `POST /api/engine/chats/[chatId]/messages` innan du
   ändrar något.** Till skillnad från create-rutten kan den här ha legitima
   lätta användningar — den heter `messages` och kan tänkas användas för att
   lägga till ett meddelande utan att generera. Sök på `messagesPathFor`,
   `/messages`, och på `ENGINE_CHATS_API_PREFIX`-hjälparna. Returnera **inte**
   `405` innan du vet att ingen legitim anropare finns.
2. **Reservvägen ska inte starta en ny generering.** En bruten ström ska ge ett
   ärligt fel som säger att anslutningen bröts, inte ett tyst andra försök.
3. **Rutten får inte utlova något den inte kan hålla.** Kör den codegen ska den
   antingen bort som codegen-väg (som i #1006) eller ha en `maxDuration` som
   stämmer. Om den har både lätta och tunga användningar: dela dem, så den lätta
   vägen består.

Återanslutning till en pågående generering är fortfarande **T9b** och ett
arkitekturbeslut. Bygg det inte.

## Vad som INTE ingår

- Ingen resume-/återanslutningsmekanism.
- Rör inte `useCreateChat.ts` eller `src/app/api/engine/chats/route.ts` — de är
  klara i #1006.
- Ingen ny visuell yta. Återanvänd samma felyta som #1006 använde.
- Ingen env-flagga.

## Verifiering

- Test: en bruten ström på en uppföljning startar **inte** en andra full codegen.
- Test: användaren får ett fel som beskriver orsaken.
- Test: eventuella legitima lätta anropare av rutten fungerar fortfarande.
- `npm run typecheck` + riktad vitest på `useSendMessage`-sviterna och
  messages-routens tester.

## Klart när

En bruten uppföljningsström inte längre kan ge ett garanterat `504`, lösningen är
konsekvent med #1006, och ingen kodväg startar två fulla genereringar för en
handling.
