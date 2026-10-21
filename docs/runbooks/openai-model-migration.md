# Redan exporterade kundsajter — OpenAI-chatt

Ny injektion av dossiern [openai-chat](../../data/dossiers/hard/openai-chat/components/api/chat/route.ts) följer med i nya projekt. En sajt som redan fått routen behåller kopian som skrevs dit.

## Skrivskyddad inventering

Gå igenom berörda kundprojekt utan att ändra filer. Sök i den injicerade chattrouten efter den äldre anropsformen `openai("gpt-4o-mini")`.

## Kontroll före migrering

Bekräfta för det enskilda projektet att:

- chatten fortfarande går genom dossierns `/api/chat` och AI SDK:s UI-message-stream
- installerad `ai` och `@ai-sdk/openai` har `openai.responses`
- nyckellöst läge och preview-stubbar svarar med det markerade demoläget och gör inget provideranrop

## Migrering

Omskrivning och publicering görs när projektägaren uttryckligen bett om migrering av just det projektet. Inventeringen omfattar ingen massöverskrivning, ingen databasändring och ingen skarp publicering.
