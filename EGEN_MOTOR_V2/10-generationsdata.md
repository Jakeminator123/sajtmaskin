# Plan 10: Generationsdatainsamling + felanalys

> Prioritet: HÖG — grunden för datadriven förbättring
> Beroenden: Plan 01 (retry), Plan 03 (autofix)
> Insats: 1-2 dagar

## Problemet

`generation_logs` i SQLite sparar token-användning och duration men inte:
- Om autofix/retry/fixer användes
- Vilka specifika fel som hittades
- Kvalitetspoäng
- Hashning för att identifiera unika generationer

## Befintlig infrastruktur

SQLite-databas: `data/sajtmaskin.db`
Tabell `generation_logs`: id, chat_id, model, prompt_tokens, completion_tokens, duration_ms, success, error_message
`logGeneration()` i `src/lib/db/chat-repository.ts` sparar loggar.

## Nya filer

### `src/lib/gen/telemetry/generation-tracker.ts`

Utökad loggning som wrappas runt generationer:

```typescript
interface GenerationMetrics {
  chatId: string;
  model: string;
  durationMs: number;
  tokenUsage: { prompt: number; completion: number };
  autofixApplied: boolean;
  autofixFixes: number;
  retryCount: number;
  fixerUsed: boolean;
  fixerSuccess: boolean;
  validationErrors: string[];
  evalScore: number | null;
  fileCount: number;
  contentHash: string;
  success: boolean;
}

function trackGeneration(metrics: GenerationMetrics): void
function getGenerationStats(options?: { since?: string; chatId?: string }): GenerationStats
```

### `src/lib/gen/telemetry/index.ts`

Barrel export.

## Filer att modifiera

### `src/lib/db/sqlite.ts` (schema)

Utöka `generation_logs` tabellen med nya kolumner. Lägg till i FALLBACK_SCHEMA_SQL och en ALTER TABLE migration:

```sql
ALTER TABLE generation_logs ADD COLUMN autofix_applied INTEGER DEFAULT 0;
ALTER TABLE generation_logs ADD COLUMN autofix_fixes INTEGER DEFAULT 0;
ALTER TABLE generation_logs ADD COLUMN retry_count INTEGER DEFAULT 0;
ALTER TABLE generation_logs ADD COLUMN fixer_used INTEGER DEFAULT 0;
ALTER TABLE generation_logs ADD COLUMN fixer_success INTEGER DEFAULT 0;
ALTER TABLE generation_logs ADD COLUMN validation_errors TEXT;
ALTER TABLE generation_logs ADD COLUMN eval_score REAL;
ALTER TABLE generation_logs ADD COLUMN file_count INTEGER;
ALTER TABLE generation_logs ADD COLUMN content_hash TEXT;
```

### `src/lib/db/chat-repository.ts`

Utöka `logGeneration()` med nya parametrar (bakåtkompatibelt — nya fält valfria).

### Stream-routes

Anropa `trackGeneration()` i done-hanteringen med metriker från retry/autofix.

## Acceptanskriterier

- [ ] Schema migration körs automatiskt vid startup
- [ ] `trackGeneration()` sparar utökad data
- [ ] `getGenerationStats()` returnerar aggregerad statistik
- [ ] Befintlig `logGeneration()` fungerar fortfarande
- [ ] Inga nya lint-/TSC-fel
