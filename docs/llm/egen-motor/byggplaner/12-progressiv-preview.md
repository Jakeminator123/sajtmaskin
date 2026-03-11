# Plan 12: Progressiv preview (component-streaming)

> Prioritet: MEDEL — största UX-lyftet
> Beroenden: Plan 02 (suspense), Plan 07 (preview)
> Insats: 4-5 dagar

## Problemet

Preview visas först när HELA genereringen är klar (10-20 sek). Användaren ser en tom ruta. v0 visar komponenter progressivt medan de streamas.

## Lösning

Detektera kompletta fil-block i SSE-strömmen. Skicka `preview-update`-events till klienten med partiell kod. Klienten uppdaterar preview inkrementellt.

## Nya filer

### `src/lib/gen/stream/file-block-detector.ts`

Parser som detekterar kompletta CodeProject-filblock i strömmen:

```typescript
interface FileBlock {
  path: string;
  language: string;
  content: string;
}

class FileBlockDetector {
  private buffer: string = "";

  feed(chunk: string): FileBlock[]  // returnerar nya kompletta block
  flush(): FileBlock[]              // returnerar ofullständiga block vid stream-slut
}
```

Implementation:
- Buffra text
- Matcha ```lang file="path" ... ``` mönster
- När ett komplett block hittas → emit det och ta bort från buffer
- Ofullständiga block behålls i buffer

### `src/lib/gen/stream/preview-event-emitter.ts`

Bygger preview-events från detekterade filblock:

```typescript
interface PreviewUpdateEvent {
  type: "preview-update";
  files: Array<{ path: string; content: string }>;
  previewHtml?: string;  // om vi kan bygga partiell preview
}

function buildPreviewUpdateEvent(
  existingFiles: FileBlock[],
  newBlocks: FileBlock[],
): PreviewUpdateEvent | null
```

## Filer att modifiera

### `src/app/api/v0/chats/stream/route.ts` och `[chatId]/stream/route.ts`

I engine-pathen, inuti content-event-hanteringen:
1. Feed varje content-chunk till `FileBlockDetector`
2. Om nya kompletta block detekteras → skicka `preview-update` SSE-event
3. Klienten kan använda detta för att uppdatera preview progressivt

### `src/lib/streaming.ts`

Lägg till "preview-update" som giltig SSE-eventtyp.

### `src/components/builder/PreviewPanel.tsx`

Lyssna på `preview-update`-events från parent (via props/callback):
1. När `preview-update` tas emot → rendera partiell preview
2. Behåll loading-state men visa partiellt innehåll i iframen

### `src/lib/hooks/v0-chat/stream-handlers.ts`

Hantera det nya `preview-update`-eventet i `handleSseStream()`:
- Extrahera filer
- Anropa `onPreviewUpdate` callback

## Acceptanskriterier

- [ ] FileBlockDetector fångar kompletta filblock
- [ ] preview-update events skickas under streaming
- [ ] Klienten visar partiell preview
- [ ] Ingen regression i fullständig preview
- [ ] Inga nya lint-/TSC-fel
