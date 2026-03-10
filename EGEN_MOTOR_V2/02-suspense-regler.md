# Plan 02: Fler suspense-regler

> Prioritet: HÖG — minskar kompileringsfel under streaming
> Beroenden: Inga
> Insats: 3-5 dagar

## Problemet

Tre streaming-regler finns idag (shadcn-import-fix, lucide-icon-fix, url-alias-expand). Många vanliga LLM-fel passerar fortfarande genom och orsakar preview-krascher.

## Befintlig arkitektur

Regler lever i `src/lib/gen/suspense/rules/`. Varje regel implementerar:

```typescript
interface SuspenseRule {
  name: string;
  transform(line: string, context: StreamContext): string;
}
```

Regler registreras i `src/lib/gen/suspense/index.ts` → `DEFAULT_RULES`.
`SuspenseLineProcessor` i `src/lib/gen/route-helpers.ts` kör reglerna rad-för-rad under streaming.

## Nya regler att skapa

### 1. `src/lib/gen/suspense/rules/missing-use-client.ts`

Detekterar hooks/event-handlers utan `"use client"` och injicerar direktivet.

Logik:
- Buffra de första ~20 raderna av varje fil (använd context-state)
- Om `useState`, `useEffect`, `useCallback`, `useMemo`, `useRef`, `onClick`, `onChange`, `onSubmit` detekteras
- OCH första raden INTE är `"use client"` eller `'use client'`
- Injicera `"use client";\n` före första raden

### 2. `src/lib/gen/suspense/rules/tailwind-class-fix.ts`

Fixar vanliga Tailwind-misstag som LLM:er gör.

Mappning:
- `bg-primary-500` → `bg-primary` (shadcn använder ej -nnn-sufffix)
- `text-primary-600` → `text-primary`
- `bg-secondary-100` → `bg-secondary`
- `border-primary-300` → `border-primary`
- `rounded-sm` på knappar → `rounded-md` (shadcn default)
- `gap-x-` och `gap-y-` utan värde → ta bort
- `dark:bg-gray-900` → `dark:bg-background` (semantisk token)

### 3. `src/lib/gen/suspense/rules/duplicate-import-fix.ts`

Detekterar och tar bort duplicerade import-statements.

Logik:
- Håll en `Set<string>` av sedda import-statement (per fil-kontext)
- Om exakt samma import-rad redan setts → returnera tom sträng
- Hantera partiella duplikat: `import { Button } from "..."` följt av `import { Button, Card } from "..."` — behåll den med fler imports

### 4. `src/lib/gen/suspense/rules/missing-export-fix.ts`

Om en TSX-fil saknar `export default`, lägg till det.

Logik:
- Buffra hela filen (eller de sista ~10 raderna)
- Vid filslut (detektera via context att ny fil börjar eller stream slutar):
  - Scanna efter `export default` i hela bufferten
  - Om det saknas: hitta sista funktions-/const-deklaration och lägg till `\nexport default ComponentName;`

### 5. `src/lib/gen/suspense/rules/next-og-strip.ts`

Strippar `next/og`-imports som orsakar runtime-fel i preview.

Logik:
- Matcha: `import ... from "next/og"` eller `import ... from 'next/og'`
- Ersätt hela raden med `// next/og is not available in preview`
- Matcha även: `import { ImageResponse } from "next/server"` → strippa

## Fil att modifiera

### `src/lib/gen/suspense/index.ts`

Lägg till alla 5 nya regler i `DEFAULT_RULES`:

```typescript
import { missingUseClientFix } from "./rules/missing-use-client";
import { tailwindClassFix } from "./rules/tailwind-class-fix";
import { duplicateImportFix } from "./rules/duplicate-import-fix";
import { missingExportFix } from "./rules/missing-export-fix";
import { nextOgStrip } from "./rules/next-og-strip";

const DEFAULT_RULES = [
  shadcnImportFix,
  lucideIconFix,
  urlAliasExpand,
  missingUseClientFix,
  tailwindClassFix,
  duplicateImportFix,
  missingExportFix,
  nextOgStrip,
];
```

### `src/lib/gen/suspense/transform.ts`

`StreamContext` behöver utökas med state per fil:

```typescript
interface StreamContext {
  urlMap?: Record<string, string>;
  // Nytt:
  currentFile?: string;
  seenImports?: Set<string>;
  lineBuffer?: string[];
  hasUseClient?: boolean;
  hasExportDefault?: boolean;
}
```

## Tester

1. Verifiera att `missing-use-client` injicerar direktivet korrekt
2. Verifiera att `tailwind-class-fix` fixar alla mappade klasser
3. Verifiera att `duplicate-import-fix` inte tar bort unika imports
4. Verifiera att `missing-export-fix` lägger till export korrekt
5. Verifiera att `next-og-strip` tar bort rätt imports utan att förstöra andra

## Acceptanskriterier

- [ ] 5 nya regler skapade och registrerade
- [ ] Befintliga regler fungerar fortfarande
- [ ] Inga false positives (korrekt kod ska inte ändras)
- [ ] Inga nya lint-fel
- [ ] TypeScript kompilerar rent
