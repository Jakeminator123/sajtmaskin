# T10 — en misslyckad generationsstart får inte lämna en tom chatt

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)

## Problemet

I `src/lib/api/engine/chats/create-chat-stream-post.ts` skapas chat-raden
**före** generation-låset tas:

```ts
// ~rad 967
const engineChat = await chatRepo.createChat(
  projectIdForChat, engineModel, engineSystemPrompt, resolvedScaffold?.id,
);
await chatRepo.addMessage(engineChat.id, "user", message);
...
// ~rad 977
const initGenerationLock = await acquireChatGenerationLock(engineChat.id);
if (initGenerationLock.status !== "acquired") {
  return attachSessionCookie(
    chatGenerationLockFailureResponse(initGenerationLock.status, { chatId: engineChat.id }),
  );
}
```

Misslyckas låset returneras `409`/`503` — och chat-raden ligger kvar. Samma
sak gäller varje fel mellan rad 967 och finalize: raden finns, men ingen version
skapas någonsin.

Det syns i prod. Projektet `ZgSu4hlAkrqiRzfQmtXGn` (2026-08-14 19:47) har **två**
chattar och **noll** versioner. Ägarens projektlista innehåller flera sådana
tomma poster, vilket gör listan svår att läsa och gör det oklart vilket projekt
som faktiskt innehåller en sajt.

## En viktig observation innan du börjar

För en **nyskapad** chat kan låset aldrig vara taget av någon annan — id:t är
färskt. Utfallet `held` är alltså omöjligt på init-vägen; det enda realistiska
felet är `unavailable`, som `generation-lock.ts` returnerar när Redis-anropet
kastar:

```ts
// src/lib/gen/stream/generation-lock.ts
} catch {
  // Redis is the cross-instance mutex. Do not fall through to the
  // in-process map ... callers map this to 503 so the user can retry.
  return { status: "unavailable" };
}
```

Låset skyddar alltså ingenting på init-vägen — men det kan fortfarande fälla
starten och lämna skräp efter sig.

## Uppgift

En generationsstart som inte går igenom får inte lämna en chat-rad efter sig.

Två vägar är rimliga. Välj en och **motivera valet i PR-beskrivningen**:

- **Lås före raden.** Kräver att chat-id:t finns innan `createChat` — alltså att
  id:t genereras först och skickas in, i stället för att returneras. Renast, men
  rör `chatRepo.createChat`s signatur; kontrollera alla anropare.
- **Städa vid fel.** Behåll ordningen men ta bort (eller markera) den skapade
  raden när starten faller innan generering. Mindre ingrepp, men kräver att
  städningen täcker **varje** tidig felväg, inte bara låset.

Oavsett väg: lös problemet i den kanoniska ägaren, inte genom att filtrera bort
tomma chattar i projektlistans UI. Att dölja skräpet är inte att sluta skapa det.

## Vad som INTE ingår

- Ändra inte låsets TTL eller dess semantik för follow-up-vägen.
- Rör inte reservvägen i `useCreateChat.ts` (T9a).
- Städa **inte** befintliga tomma chattar/projekt i prod — det är en separat
  datauppgift som kräver ägarbeslut.
- Bygg inte om hur projekt skapas per fritext-submit (eget problem, egen rad).
- Ingen env-flagga.

## Verifiering

- Test: låset returnerar `unavailable` → svaret är fortfarande `503`, **och**
  ingen chat-rad finns kvar efteråt.
- Test: en lyckad start skapar chat-raden precis som förut (ingen regression).
- Väljer du id-först: test som visar att övriga anropare av `createChat`
  fortfarande fungerar.
- `npm run typecheck` + riktad vitest på create-chat-stream-sviterna.

## Klart när

Ett nekat lås inte längre lämnar en chat-rad, en lyckad start beter sig
oförändrat, och lösningen sitter i den kanoniska ägaren.
