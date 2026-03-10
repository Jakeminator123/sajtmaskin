# Plan 13: Säkerhet/guardrails

> Prioritet: HÖG — nödvändigt för produktion
> Beroenden: Inga
> Insats: 2-3 dagar

## Problemet

Genererad kod saniteras inte. LLM:en kan producera:
- `eval()`, `document.write()`, `innerHTML` med användarinput
- `<script src="...">` med externa källor
- Filnamn med path traversal (`../../etc/passwd`)
- Prompt injection i output
- Extremt stora filer

## Nya filer

### `src/lib/gen/security/output-sanitizer.ts`

Skannar genererad kod efter farliga mönster:

```typescript
interface SanitizeResult {
  sanitized: string;
  warnings: string[];
  blocked: string[];  // filer som helt blockerades
}

function sanitizeOutput(content: string): SanitizeResult
```

Regler:
1. `eval(`, `Function(`, `document.write(` → ersätt med `/* BLOCKED: unsafe */`
2. `dangerouslySetInnerHTML` med dynamiska värden → flagga som varning
3. `<script src="http...">` → ta bort
4. Filnamn med `..` eller absoluta paths → blockera filen
5. Enskild fil > 50KB → trimma + varning

### `src/lib/gen/security/path-validator.ts`

Validerar filnamn i genererad kod:

```typescript
function validateFilePath(path: string): { valid: boolean; reason?: string }
function sanitizeFilePath(path: string): string
```

Regler:
- Inga `..` i path
- Inga absoluta paths (startande med `/` som inte är `app/`, `components/`, `lib/`, `public/`)
- Inga `node_modules/`, `.env`, `.git/` etc.
- Max 200 tecken
- Bara alfanumeriska + `-_./`

### `src/lib/gen/security/prompt-guard.ts`

Detekterar prompt injection i LLM-output:

```typescript
function checkPromptInjection(content: string): { safe: boolean; indicators: string[] }
```

Regler:
- Letar efter system-prompt-läckor: "You are sajtmaskin", "STATIC_CORE", "CodeProject format"
- Letar efter instruktioner: "Ignore previous instructions", "System:", "Assistant:"
- Letar efter data-exfiltration: URLs som inte matchar kända mönster

### `src/lib/gen/security/index.ts`

Barrel export + kombinerad `runSecurityChecks()`:

```typescript
interface SecurityCheckResult {
  safe: boolean;
  sanitizedContent: string;
  warnings: string[];
  blocked: string[];
}

function runSecurityChecks(content: string): SecurityCheckResult
```

## Filer att modifiera

### `src/lib/gen/autofix/pipeline.ts`

Lägg till `runSecurityChecks()` som SISTA steg i autofix-pipelinen (efter alla fixers).

## Acceptanskriterier

- [ ] `eval()`, `document.write()` blockeras
- [ ] Path traversal blockeras
- [ ] Prompt injection detekteras
- [ ] Stora filer trimmas
- [ ] Integrerat i autofix-pipeline
- [ ] Inga nya lint-/TSC-fel
