# Plan 08: Fixer-modell och sandbox-verifiering

> Prioritet: MEDEL — polerar kvaliteten till v0-nivå
> Beroenden: Plan 01 (retry), Plan 03 (autofix)
> Insats: 5-7 dagar

## Problemet

Retry-loopen (Plan 01) skickar tillbaka hela koden + fel till samma LLM. Det är dyrt (hela prompten + generationen igen) och inte alltid effektivt. v0 har en separat, specialiserad modell bara för att fixa kodfel.

Dessutom finns ingen verifiering att preview faktiskt renderar — vi vet bara att koden kompilerar.

## Lösning

### Del A: Fixer-modell
En dedikerad "fixer" som tar trasig kod + felmeddelanden och returnerar fixad kod. Använder GPT-4.1-mini (billigare, snabbare) med ett specialiserat systemprompt.

### Del B: Playwright-verifiering
Headless Playwright-check som verifierar att preview renderar icke-tom HTML.

## Nya filer att skapa

### `src/lib/gen/autofix/fixer-prompt.ts`

Systemprompt för fixer-modellen:

```typescript
const FIXER_SYSTEM_PROMPT = `You are a code fixer. You receive broken Next.js/React/TypeScript code and error messages. Your job is to fix the errors and return working code.

Rules:
1. Only fix the errors mentioned. Do not refactor or improve the code otherwise.
2. Keep the same file structure (CodeProject format with fenced blocks).
3. Only return files that you changed. Unchanged files should be omitted.
4. Common fixes:
   - Missing "use client" directive → add it at the top
   - Missing imports → add the import statement
   - Unclosed JSX tags → close them
   - TypeScript type errors → fix or add type assertions
   - Missing default export → add export default
5. If you cannot fix an error, leave the code as-is and add a comment: // TODO: fix this

Output format: Same CodeProject format as the input.`;

function buildFixerPrompt(content: string, errors: string[]): string {
  return `Fix the following errors in this code:

## Errors

${errors.map((e, i) => `${i + 1}. ${e}`).join("\n")}

## Code

${content}`;
}
```

### `src/lib/gen/autofix/llm-fixer.ts`

Kör fixer-modellen:

```typescript
interface FixerResult {
  fixedContent: string;
  fixedFiles: string[];
  success: boolean;
  tokensUsed: { input: number; output: number };
  durationMs: number;
}

async function runLlmFixer(
  content: string,
  errors: string[],
  options?: { model?: string; maxTokens?: number },
): Promise<FixerResult>
```

Implementation:
1. Bygg prompt med `buildFixerPrompt(content, errors)`
2. Anropa `streamText()` med `getOpenAIModel("gpt-4.1-mini")`
3. Vänta på hela svaret (text-only, ingen streaming till klient)
4. Parsa resultat med `parseCodeProject()`
5. Returnera fixad kod

### `src/lib/gen/verify/playwright-check.ts`

Headless Playwright-check av preview:

```typescript
interface VerifyResult {
  success: boolean;
  hasContent: boolean;
  elementCount: number;
  textLength: number;
  consoleErrors: string[];
  screenshotBase64?: string;
  durationMs: number;
}

async function verifyPreview(
  previewUrl: string,
  options?: { timeout?: number; takeScreenshot?: boolean },
): Promise<VerifyResult>
```

Implementation:
1. Starta headless Chromium via Playwright
2. Navigera till `previewUrl`
3. Vänta max 10 sekunder på content
4. Mät:
   - `elementCount`: antal DOM-element
   - `textLength`: total text-content längd
   - `consoleErrors`: JS-fel i konsolen
5. `hasContent = elementCount > 5 && textLength > 50`
6. Valfritt: ta screenshot
7. Stäng browser

OBS: Playwright är already a dependency (used by the project for diagnostics). If not installed, add `playwright` to devDependencies.

## Filer att modifiera

### `src/lib/gen/retry/retry-pipeline.ts` (från Plan 01)

Uppdatera retry-logiken att använda fixer-modellen istället för att skicka hela prompten igen:

```
Genererat innehåll
    ↓
runAutoFix()          ← regelbaserade fixar
    ↓
validateSyntax()      ← esbuild-validering
    ↓
Om fel:
    ↓
runLlmFixer()         ← GPT-4.1-mini fixar (NYTT)
    ↓
validateSyntax()      ← validera fixarens output
    ↓
Om fortfarande fel:
    ↓
retry med GPT-5.2     ← full re-generation (befintlig)
```

### `src/app/api/v0/chats/stream/route.ts` och `[chatId]/stream/route.ts`

Lägg till valfri Playwright-verifiering efter generation:

```typescript
// Efter version skapats och preview-URL genererats:
if (process.env.VERIFY_PREVIEW === "1") {
  const verification = await verifyPreview(previewUrl, { timeout: 15000 });
  if (!verification.hasContent) {
    // Logga varning, men blockera inte
    console.warn("[verify] Preview rendered empty", {
      chatId, versionId, consoleErrors: verification.consoleErrors,
    });
  }
}
```

## Playwright dependency-check

Kontrollera om `playwright` redan finns i `package.json`. Om inte:
```bash
npm install -D playwright @playwright/test
npx playwright install chromium
```

## Acceptanskriterier

- [ ] `fixer-prompt.ts` har specialiserat systemprompt för kodfix
- [ ] `llm-fixer.ts` kör GPT-4.1-mini och returnerar fixad kod
- [ ] `playwright-check.ts` verifierar att preview renderar innehåll
- [ ] Retry-pipeline använder fixer-modellen som mellansteg
- [ ] Playwright-verifiering är opt-in (env var)
- [ ] Inga nya lint-fel
- [ ] TypeScript kompilerar rent
