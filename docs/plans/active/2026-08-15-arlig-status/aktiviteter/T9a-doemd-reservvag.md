# T9a — reservvägen får inte starta en generering som är dömd att misslyckas

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)

## Problemet — detta är spår 1, mobilfelet

2026-08-14 kl 19:47 skickade ägaren en fritextprompt från mobilen. Ingen sajt
byggdes. Vercels runtime-logg visar exakt vad som hände:

```text
19:47:18  POST /api/engine/chats/stream   status=200  lvl=info
19:47:54  POST /api/engine/chats          status=504  lvl=error
```

Första raden är den strömmande rutten — den öppnade korrekt. Andra raden är
felet: `504` är Vercels gateway som dödar funktionen för att den överskred sin
tidsgräns.

Kedjan:

1. Strömmen bröts på mobilanslutningen.
2. Klientens reservväg (`src/lib/hooks/chat/useCreateChat.ts`, ~rad 667-691) gjorde
   om anropet mot `ENGINE_CHATS_API_PREFIX` = `/api/engine/chats`, alltså den
   **icke-strömmande** rutten.
3. Den rutten kör hela kodgenereringen synkront via `handleEngineChatsPostSync`.
4. Filen är fem rader och saknar `maxDuration`:

```ts
// src/app/api/engine/chats/route.ts
import { handleEngineChatsGet, handleEngineChatsPostSync } from "@/lib/api/engine/chats/chats-http";

export const GET = handleEngineChatsGet;
export const POST = handleEngineChatsPostSync;
```

Dess strömmande syskon sätter `maxDuration = 950`. En generering tar 47-405
sekunder i verkliga körningar (mätt i `engine_generation_logs`). Rutten **kan
alltså inte** slutföra jobbet på plattformens standardgräns. Utfallet är inte
osäkert — det är garanterat `504`.

Två följder utöver felet: användaren får ett mystiskt avbrott efter ~30 sekunder,
och en enda användarhandling startar **två** fulla genereringar, vilket betyder
dubbel debitering av credits.

## Uppgift

En bruten ström får inte tyst starta en ny full generering mot en rutt som inte
kan slutföra den.

Arbeta i den här ordningen:

1. **Ta reda på vad `POST /api/engine/chats` är till för** och vilka som anropar
   den. Sök i repot efter `ENGINE_CHATS_API_PREFIX` och efter direkta anrop mot
   sökvägen. Finns legitima icke-codegen-anropare (MCP, verktyg, tester) ska de
   inte gå sönder.
2. **Reservvägen ska inte starta om genereringen.** Är den enda realistiska
   codegen-anroparen reservvägen i `useCreateChat.ts`: låt en bruten ström ge ett
   **ärligt fel** till användaren i stället för ett tyst andra försök som är dömt.
   Felet ska säga något användaren kan agera på — att anslutningen bröts och att
   hen kan försöka igen — inte "Failed to create chat".
3. **Rutten får inte utlova något den inte kan hålla.** Behålls den för codegen
   måste den ha en `maxDuration` som stämmer med vad den faktiskt gör. Behålls den
   bara för lätta operationer ska det framgå i koden att den inte är en
   codegen-väg.

Att **återansluta** till den pågående genereringen i stället för att starta om är
den riktiga kuren, men det är **T9b** och ett arkitekturbeslut. Bygg inte det här.

## Vad som INTE ingår

- Ingen resume-/återanslutningsmekanism (T9b, kräver ägarbeslut).
- Rör inte generation-låsets ordning (T10).
- Ingen ny visuell yta i buildern — återanvänd befintlig felyta i chatten.
- Ingen env-flagga.

## Verifiering

- Test som visar att en bruten ström **inte** startar en andra full codegen.
- Test som visar att användaren får ett fel som beskriver orsaken, inte ett
  generiskt "Failed to create chat".
- Om du behåller rutten för andra anropare: test som visar att de fortfarande
  fungerar.
- `npm run typecheck` + riktad vitest på `useCreateChat`-sviterna och
  eventuella route-tester.

## Klart när

En bruten ström inte längre kan resultera i ett garanterat `504`, användaren får
veta vad som hände, och ingen kodväg startar två fulla genereringar för en
handling.
