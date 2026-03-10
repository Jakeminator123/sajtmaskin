# Plan 04: Multi-file uppföljning

> Prioritet: MEDEL — fixar "likadana sidor" och förbättrar uppföljningsprompts
> Beroenden: Plan 03 (behöver stabil enfilsgenerering)
> Insats: 5-7 dagar

## Problemet

När användaren skickar en uppföljningsprompt ("byt färg på headern", "lägg till en kontaktsida") regenererar LLM:en ofta hela projektet från scratch. Det ger:
1. Sidor som ser likadana ut (LLM:en "glömmer" vad den genererat)
2. Långsamma svar (genererar 10 filer istället för 1)
3. Oavsiktliga ändringar i filer som inte berörs

## Lösning

Skicka med befintliga filer (eller sammanfattning) i kontexten vid uppföljningsprompts. Instruera LLM:en att bara returnera ändrade filer. Merge-logik bevarar oändrade filer.

## Ny fil att skapa

### `src/lib/gen/context/file-context-builder.ts`

Bygger en filkontext att injicera i uppföljningsprompts.

```typescript
interface FileContextOptions {
  chatId: string;
  versionId: string;
  maxTokens?: number;  // default: 4000
}

interface FileContext {
  summary: string;      // Komprimerad representation av alla filer
  fileList: string[];    // Lista med filnamn
  totalFiles: number;
  totalLines: number;
}

function buildFileContext(options: FileContextOptions): FileContext
```

Implementation:
1. Hämta filer från `getVersionFiles(chatId, versionId)` i `src/lib/gen/version-manager.ts`
2. Bygg en sammanfattning:
   - Lista alla filnamn med radantal
   - För varje fil: extrahera exported component-namn och imports
   - Om totalstorlek > maxTokens: trimma till filnamn + exports only
3. Formatera som markdown för injektion i prompt

Sammanfattningsformat:
```
## Current Project Files

The user's project currently has these files. Only return files you need to CHANGE.
Files not included in your response will be kept as-is.

- app/page.tsx (45 lines) — exports: default HomePage; uses: HeroSection, FeatureGrid
- components/hero-section.tsx (28 lines) — exports: default HeroSection; uses: Button, Image
- components/feature-grid.tsx (35 lines) — exports: default FeatureGrid; uses: Card
- app/globals.css (22 lines) — Tailwind base styles
```

## Filer att modifiera

### `src/app/api/v0/chats/[chatId]/stream/route.ts`

I engine-pathen (runt rad 187-210):
1. Hämta filkontext: `const fileCtx = buildFileContext({ chatId, versionId: latestVersion?.id })`
2. Injicera i systemprompt eller som extra användarmeddelande:
   ```typescript
   const contextMessage = fileCtx.summary;
   const chatHistory = [
     ...engineChat.messages,
     { role: "system", content: contextMessage },
   ];
   ```
3. Alternativt: lägg till i `buildDynamicContext()` som en ny sektion

### `src/lib/gen/system-prompt.ts`

Lägg till instruktioner i STATIC_CORE eller dynamisk kontext:

```
## Follow-up Behavior

When the user sends a follow-up message about an EXISTING project:
- Only return files that you need to CREATE or MODIFY.
- Files you do not include in your response will be kept unchanged.
- Do NOT regenerate files that don't need changes.
- If the user asks to change a specific component, only return that component's file.
- Preserve the existing design language, color scheme, and layout unless explicitly asked to change.
```

### `src/lib/gen/version-manager.ts`

Lägg till merge-logik:

```typescript
function mergeVersionFiles(
  previousFiles: CodeFile[],
  newFiles: CodeFile[],
): CodeFile[]
```

Implementation:
1. Skapa en Map<path, CodeFile> från previousFiles
2. För varje fil i newFiles: uppdatera eller lägg till i Map
3. Returnera alla filer (bevarade + uppdaterade + nya)

### Stream-route integration

I done-hanteringen (efter generation):
1. Parsa genererat innehåll med `parseCodeProject()`
2. Hämta föregående version: `getVersionFiles(chatId, previousVersionId)`
3. Merge: `mergeVersionFiles(previousFiles, newFiles)`
4. Spara merged version: `createVersion(chatId, messageId, mergedFilesJson)`

## Acceptanskriterier

- [ ] `buildFileContext()` producerar komprimerad filsammanfattning
- [ ] Uppföljningsprompts inkluderar filkontext
- [ ] LLM:en returnerar bara ändrade filer (verifierat manuellt)
- [ ] Merge-logik bevarar oändrade filer
- [ ] System prompt innehåller follow-up-instruktioner
- [ ] Inga nya lint-fel
- [ ] TypeScript kompilerar rent
