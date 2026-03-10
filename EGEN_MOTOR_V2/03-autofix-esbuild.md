# Plan 03: Autofix med esbuild

> Prioritet: HÖG — fångar fel som suspense-regler missar
> Beroenden: Plan 01 (retry använder autofix-resultat)
> Insats: 5-7 dagar

## Problemet

Nuvarande autofix-pipeline (`src/lib/gen/autofix/pipeline.ts`) kör tre fixers:
- `import-validator.ts` — fixar shadcn-imports (fungerar)
- `jsx-checker.ts` — bara varnar, fixar inget
- `dep-completer.ts` — samlar dependencies (fungerar)

JSX-checkern och saknade `"use client"`-direktivet fångas inte. Ingen riktig syntaxvalidering görs.

## Befintlig arkitektur

```
pipeline.ts
  ├── import-validator.ts  (fixar shadcn paths)
  ├── jsx-checker.ts       (varnar om tag-mismatch, saknade imports)
  └── dep-completer.ts     (samlar third-party dependencies)
```

`runAutoFix(content, context)` returnerar `{ fixedContent, fixes, warnings, dependencies }`.

Anropas från:
- `src/lib/gen/autofix/pipeline.ts` → exporteras som `runAutoFix`
- Används i stream-routes efter generation (redan integrerat)

## Nya filer att skapa

### `src/lib/gen/autofix/syntax-validator.ts`

Kör esbuild-transform på varje fil för att fånga syntaxfel.

```typescript
interface SyntaxValidation {
  valid: boolean;
  errors: Array<{ line: number; column: number; message: string }>;
  fixedCode: string | null;  // om esbuild lyckas med auto-recovery
}

function validateSyntax(code: string, filename: string): Promise<SyntaxValidation>
```

Implementation:
1. Använd `esbuild.transform(code, { loader: inferLoader(filename), jsx: 'preserve', logLevel: 'silent' })`
2. Fånga fel från `esbuild.TransformFailure`
3. Om fel: försök fixa med heuristiker:
   - Oavslutade strängar → stäng dem
   - Saknade semikolon → lägg till
   - Obalanserade taggar → stäng dem
4. Returnera `{ valid, errors, fixedCode }`

### `src/lib/gen/autofix/use-client-fixer.ts`

Detekterar filer som behöver `"use client"` men saknar det.

```typescript
function fixUseClient(code: string, filename: string): { code: string; fixed: boolean }
```

Implementation:
1. Skanna koden efter hooks: `useState`, `useEffect`, `useCallback`, `useMemo`, `useRef`, `useContext`, `useReducer`
2. Skanna efter event-handlers: `onClick`, `onChange`, `onSubmit`, `onKeyDown`, etc.
3. Skanna efter browser-APIs: `window.`, `document.`, `localStorage`, `sessionStorage`
4. Om någon hittas OCH `"use client"` / `'use client'` saknas i första 3 raderna → injicera

### `src/lib/gen/autofix/react-import-fixer.ts`

Lägger till `import React from "react"` om det saknas men behövs.

```typescript
function fixReactImport(code: string): { code: string; fixed: boolean }
```

Implementation:
1. Kontrollera om `React.` används i koden (t.ex. `React.createElement`, `React.Fragment`)
2. Kontrollera om `import React` eller `import * as React` finns
3. Om `React.` används utan import → lägg till `import React from "react";` överst (efter `"use client"` om det finns)

## Filer att modifiera

### `src/lib/gen/autofix/pipeline.ts`

Lägg till nya fixers i pipeline-kedjan:

```
pipeline.ts (uppdaterad)
  ├── use-client-fixer.ts    (NYTT - injicera "use client")
  ├── import-validator.ts    (befintlig)
  ├── react-import-fixer.ts  (NYTT - lägg till React import)
  ├── syntax-validator.ts    (NYTT - esbuild-validering)
  ├── jsx-checker.ts         (befintlig - varningar)
  └── dep-completer.ts       (befintlig)
```

Ordning är viktig:
1. `use-client-fixer` först (påverkar vad som är valid)
2. `import-validator` (fixar import paths)
3. `react-import-fixer` (lägger till saknade imports)
4. `syntax-validator` (validerar slutresultatet)
5. `jsx-checker` (sista varnings-pass)
6. `dep-completer` (samlar dependencies sist)

### `src/lib/gen/autofix/jsx-checker.ts`

Uppgradera från enbart varningar till faktiska fixar:
- Tag-mismatch: försök stänga oavslutade taggar
- Saknade component-imports: lägg till import-statement

## Integration med Plan 01 (retry)

`retry-pipeline.ts` ska använda `runAutoFix()` som första steg innan `validateGeneratedCode()`:

```
Genererat innehåll
    ↓
runAutoFix()        ← fixar det som kan fixas automatiskt
    ↓
validateSyntax()    ← validerar det fixade resultatet
    ↓
Om fortfarande fel → retry med LLM
```

## Acceptanskriterier

- [ ] `syntax-validator.ts` fångar syntaxfel via esbuild
- [ ] `use-client-fixer.ts` injicerar direktivet korrekt
- [ ] `react-import-fixer.ts` lägger till React-import när den behövs
- [ ] Pipeline-ordningen är korrekt (use-client → imports → syntax → warnings → deps)
- [ ] Befintliga fixers fungerar fortfarande
- [ ] Inga nya lint-fel
- [ ] TypeScript kompilerar rent
