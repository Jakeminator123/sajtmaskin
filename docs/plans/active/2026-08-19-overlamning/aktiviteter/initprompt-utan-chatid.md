# Init-promptens logg saknar `chat_id`

Våg 1 · Cloud · Fynd `P0-L1` · Liten, låg risk

## Målet

Ingen kan i dag se vad v1 faktiskt fick för prompt. `/logg` på ett `chatId` ger
bara uppföljningarna — initieringsraden finns i tabellen men är föräldralös.

## Fyndet

`create-chat-stream-post.ts` anropar `createPromptLog` **innan** chatten finns
och skriver därför `chatId: null`. Uppföljningar skriver rätt `chatId`. Ingen
senare `UPDATE` fyller i fältet, så raden blir omöjlig att hitta via chat-scope
för alltid.

Ankare (omverifiera, radnummer driftar):

- `src/lib/api/engine/chats/create-chat-stream-post.ts:446-452`
- `src/lib/api/engine/chats/chat-message-stream/follow-up-prompt-log.ts:81-88`
- `src/lib/db/services/prompt-logs.ts:32-39`

## Bekräfta först

Läs de tre filerna. Stämmer det att `create_chat`-eventet skrivs med
`chatId: null` och aldrig uppdateras? Är det redan åtgärdat — skriv det i
rapporten och ändra ingenting.

## Fix

Skriv loggen **efter** att `engineChat.id` finns, eller uppdatera `chat_id` när
chatten skapats. Samma tabell, samma tjänst. Inte en ny loggväg och inte en ny
tabell.

Tänk igenom felvägen: om chatt-skapandet misslyckas ska prompten fortfarande
loggas — annars byter du en föräldralös rad mot en förlorad rad.

## Verifiering

```powershell
npm run typecheck
npx vitest run src/lib/api/engine/chats src/lib/db/services
```

Nytt test krävs. `AGENTS.md` klassar saknade tester som P1 när ändringen rör DB.
Låt testet visa att `create_chat`-raden bär chattens id.

## Gör inte

- Inför ingen ny tabell och ingen ny loggnivå.
- Rör inte retention-logiken (200 rader per användare).
- Bredda inte till andra `prompt_logs`-event i samma PR.
