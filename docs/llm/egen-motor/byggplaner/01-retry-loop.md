# Plan 01: Retry-loop vid trasig generation

> Prioritet: HÖGST — åtgärdar "vita sidan"-problemet
> Beroenden: Inga
> Insats: 3-5 dagar

## Problemet

När LLM:en genererar kod som innehåller syntaxfel (obalanserade taggar, saknade imports, TypeScript-fel) renderas en helt vit sida i preview. Användaren får ingen feedback om vad som gick fel.

## Lösning

Lägg till syntaxvalidering efter generation. Om koden inte kompilerar, skicka tillbaka koden + felmeddelanden till LLM:en för en fix-runda. Max 2 retries.

## Nya filer att skapa

### `src/lib/gen/retry/validate-syntax.ts`

Syfte: Validera genererad kod med esbuild (redan i package.json som `^0.25.0`).

```typescript
// Gränssnitt:
interface ValidationResult {
  valid: boolean;
  errors: SyntaxError[];
  fileErrors: Map<string, string[]>;
}

interface SyntaxError {
  file: string;
  line: number;
  column: number;
  message: string;
}

function validateGeneratedCode(content: string): Promise<ValidationResult>
```

Implementation:
1. Parsa CodeProject-formatet med `parseCodeProject()` från `src/lib/gen/parser.ts`
2. För varje TSX/TS-fil: kör `esbuild.transform(code, { loader: 'tsx', jsx: 'transform' })`
3. Samla alla fel per fil
4. Returnera `{ valid, errors, fileErrors }`

### `src/lib/gen/retry/retry-pipeline.ts`

Syfte: Wrappa generationspipelinen med retry-logik.

```typescript
interface RetryOptions {
  maxRetries: number;        // default: 2
  model?: string;            // default: samma som original
  chatHistory?: ModelMessage[];
}

interface RetryResult {
  content: string;
  retryCount: number;
  finalValid: boolean;
  validationErrors: SyntaxError[];
}

async function generateWithRetry(options: RetryOptions): Promise<RetryResult>
```

Implementation:
1. Kör `createGenerationPipeline()` och samla hela svaret
2. Kör `validateGeneratedCode()` på resultatet
3. Om fel: bygg ett fix-prompt: "The following code has syntax errors. Fix them:\n\nErrors:\n{errors}\n\nCode:\n{content}"
4. Skicka fix-prompten som nytt meddelande till LLM:en
5. Upprepa tills valid eller maxRetries nått

## Filer att modifiera

### `src/app/api/v0/chats/stream/route.ts` (skapa-chat)

Runt rad 339-440 (engine path):
1. Efter `accumulatedContent` är komplett och `done`-eventet ska skickas
2. Kör `validateGeneratedCode(accumulatedContent)`
3. Om invalid och retries kvar:
   - Logga valideringsfel
   - Bygg fix-prompt med fel + kod
   - Skapa ny pipeline med fix-prompten
   - Fortsätt streama från nya pipelinen
4. Om valid eller retries slut: skicka `done`-event som vanligt

### `src/app/api/v0/chats/[chatId]/stream/route.ts` (skicka-meddelande)

Samma logik som ovan, runt rad 219-430.

## Tester

1. Skapa en test-prompt som genererar felaktig kod (t.ex. "Create a component with unclosed tags")
2. Verifiera att retry-loopen fångar felet och producerar fixad kod
3. Verifiera att max 2 retries görs (inte oändlig loop)
4. Verifiera att retry-metadata skickas i SSE-strömmen (så klienten kan visa "Fixing errors...")

## Acceptanskriterier

- [ ] `validateGeneratedCode()` fångar syntaxfel i TSX/TS-filer
- [ ] Retry-loop gör max 2 försök att fixa
- [ ] Stream-routes integrerar retry-logiken
- [ ] Felaktigt genererad kod producerar inte vit sida (visar antingen fixad kod eller felmeddelande)
- [ ] Inga nya lint-fel
- [ ] TypeScript kompilerar rent
