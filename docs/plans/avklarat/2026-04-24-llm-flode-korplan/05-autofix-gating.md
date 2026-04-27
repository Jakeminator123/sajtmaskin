---
status: active
created: 2026-04-24
spår: 5 av 5 (LLM-flöde-körplan)
prio: P2 (sparar 4 min auto-repair per problemfall + ger telemetri för spår 2)
estimat: 2 dagar
---

# Spår 5 — Autofix-gating + LLM-fixer abort + Lucide-checklist + recurring-patterns i create

## Symtom (observerat)

I körning `eb152443-...`:

1. **`autofix.heavy_load: 31 fixes`** loggades men **ingen åtgärd vidtogs**. Tröskeln (5) finns bara som observability-flagga. 8 av 31 fixar var "missing lucide icon import".
2. **`[llm-fixer] failed: This operation was aborted`** 11:25:16 — LLM-fixern timeoutade. Tystades med `console.error`. Felet (`LucideIcon refers to a value` TS2749) upptäcktes 5 min senare av server-verify, vilket triggade hela auto-repair-rundan (~4 min extra wall-clock).
3. **Auto-repair (run 2) krävde 2 LLM-pass** för att fixa samma `LucideIcon`-fel. Quality-gate failade fortfarande efter första passet pga `app/page.tsx(44,9): TS2749`.
4. **`shrink_below_50pct`-skydd kastade `app/page.tsx`** (orig=18981, fixed=2362) → kvarvarande gammal page.tsx behöll buggen.

## Rotorsak

### A. `autofix.heavy_load` är bara observability, ingen gate

**Verifierat:** `src/lib/gen/stream/finalize-version/pre-phases.ts` rad 103-128:

```
106:    autoFixHeavyLoad = autoFixFixCount > 5;
119:    if (autoFixHeavyLoad) {
120-128:      devLogAppend("in-progress", { type: "autofix.heavy_load", ... });
```

Det finns ingen kod som **stoppar** eller **regenererar** vid heavy load.

### B. LLM-fixer abort tystas med `console.error`

**Verifierat:** `src/lib/gen/autofix/llm-fixer.ts` rad 250-264 catch:ar utan att skilja `AbortError` från övriga fel. Returnerar `{ success: false, fixedContent: content }` (original oförändrat). Ingen telemetri-event, ingen retry, ingen eskalering till repair-loop.

### C. `recurring-patterns` läses bara i followup, inte create

**Verifierat:** `src/lib/gen/system-prompt/sections/route-plan.ts` rad 116-125:

```
116:  // Only on follow-ups
117:  if (isFollowUp && FEATURES.recurringPatternsInMainPrompt) {
121-125:    parts.push(...renderRecurringFailuresBlockLines(chatId));
```

Konsekvens: en ny chat med samma user som har historik av "alltid glömmer Lucide-import" får inte den lärdomen i create-promptet — bara om create misslyckas och en followup behövs.

### D. `required-imports-checklist` saknar Lucide

**Verifierat:** `src/lib/gen/system-prompt/sections/required-imports-checklist.ts` listar **endast** shadcn-komponenter (`SHADCN_COMPONENTS`/`GROUP_COMPONENTS` rad 68-100). Header-kommentar rad 3-8 säger explicit att fokus är `@/components/ui/...`. Inget för `lucide-react`.

### E. `repair-loop` har bara 2 LLM-pass per anrop

**Verifierat:** `config/ai_models/manifest.json` rad 339-345: `serverRepairPasses: 2`. `src/lib/gen/verify/repair-loop.ts` rad 468-570 har `for (let pass = 0; pass < params.maxLlmPasses; pass++)` med tidiga `break`. När båda LLM-pass failar med samma fel, ingen ytterligare runda.

## Föreslagna fixar

### Fix B (GLASKLAR) — LLM-fixer abort-event

**B1.** I `src/lib/gen/autofix/llm-fixer.ts` rad 250-264:

```ts
} catch (err) {
  const isAbort = err instanceof Error && (
    err.name === "AbortError" || /aborted/i.test(err.message)
  );
  console.error(
    isAbort ? "[llm-fixer] aborted (AbortSignal/timeout):" : "[llm-fixer] failed:",
    err instanceof Error ? err.message : err,
  );
  if (isAbort) {
    devLogAppend("in-progress", {
      type: "llm_fixer_aborted",
      durationMs: performance.now() - start,
      errorsCount: errors.length,
      requiredFilesCount: options?.requiredFiles?.length ?? 0,
    });
  }
  return {
    fixedContent: content,
    fixedFiles: [],
    missingFiles: [],
    incompleteFiles: [],
    partial: false,
    success: false,
    durationMs: performance.now() - start,
    aborted: isAbort,  // Nytt fält i FixerResult
  };
}
```

**Acceptkriterium:** `aborted` flag i returvärde, `llm_fixer_aborted`-event loggas.

### Fix B2 — Anroparen reagerar på `aborted`

I `src/lib/gen/verify/repair-loop.ts` rad ~509-516 där `runLlmFixer` anropas:

```ts
if (fixerResult.aborted) {
  // Eskalera direkt till nästa pass utan att vänta på server-verify
  // ELLER trigga retry med kortad prompt:
  fixerResult = await runLlmFixer(content, errors.slice(0, 3), {
    ...options,
    maxTokens: Math.floor((options?.maxTokens ?? AUTOFIX_MAX_OUTPUT_TOKENS) * 0.5),
  });
}
```

### Fix C (medium) — Recurring patterns även i create

**C1.** I `src/lib/gen/system-prompt/sections/route-plan.ts` rad 116-125:

Alternativ a (enkel): ändra villkoret från `isFollowUp` → `chatId && readRecurringPatternsForChat(chatId).length > 0`. Då injiceras lärdomen även i create om chatten har historik (sällsynt fall — first-time-chat har ingen historik).

Alternativ b (säkrare): ny feature-flag `FEATURES.recurringPatternsInCreatePrompt` bredvid den existerande, default `false`. Aktivera efter eval.

**Förslag:** Alternativ b. Lägg flaggan + sätt `false` per default. Kör eval i 1 vecka, mät om create-quality förbättras.

### Fix D (GLASKLAR) — Lucide-checklist i prompt

**D1.** Ny sektion i `src/lib/gen/system-prompt/sections/` (eller utöka `required-imports-checklist.ts`):

```
Lucide-react icons commonly needed:
- UI controls: Plus, Minus, X, Check, ChevronDown, ChevronRight, ChevronLeft, ChevronUp
- Navigation: Menu, ArrowRight, ArrowLeft, ArrowUp, ArrowDown, ExternalLink, Home
- Status: Info, AlertCircle, AlertTriangle, CheckCircle, XCircle, Loader, Clock
- Social: Github, Twitter, Linkedin, Facebook, Instagram, Mail, Phone, MapPin
- Common UI: Search, Settings, User, Users, Heart, Star, Eye, EyeOff, Download, Upload, Share, Copy, Edit, Trash
- Brands: Sparkles, Zap, Wand, Bot, Brain, Cpu

CRITICAL: Each icon used in JSX must be imported from "lucide-react". Group all lucide imports in ONE statement at top of file.
Example: import { Menu, X, ArrowRight, Sparkles } from "lucide-react";
```

**Risk:** ~500 tokens extra dynamic prompt. Acceptabelt eftersom det förväntas spara 8 autofixar per körning.

### Fix A (medium) — Heavy-load gating

**A1. Tröskel ≥10: dynamisk import-checklist till nästa pass.**

Spara strukturerad lista över "imports som tappades" från `autoFixResult.fixes` (där `fixer === "import-validator"`). Persistera i `engine_chats.metadata.recent_missing_imports` (jsonb). Konsumera i `build-dynamic-context.ts` rad 215-219 vid nästa create.

**A2. Tröskel ≥20: regenerera direkt i samma run.**

Detta är den **stora** ändringen — kräver:
- Wrapper-loop i `src/lib/providers/own-engine/generation-stream.ts` (rad ~482+ där `finalizeParams` byggs).
- Spara `accumulatedContent` från första passet, augmentera prompten med "förra genereringen krävde X mekaniska fixar för Y, Z — undvik dessa", kör `createGenerationPipeline` igen, ersätt `accumulatedContent` med nytt resultat.
- Räkna max-attempts (1 retry, inte fler).

**Risk:** Wall-clock fördubblas i värsta fall (4+4 min). Bara värt om regen-resultat är signifikant bättre. Kräver A/B-eval.

**Förslag:** Implementera **A1** först (lågrisk, telemetri-vinst). **A2** efter eval-data om A1 visar att tröskeln 20+ är ovanligt och hög-värd.

### Fix E — `shrink_below_50pct`-telemetri

**E1.** I `src/lib/gen/autofix/llm-fixer.ts` rad 212-216 (där incomplete-files loggas):

```ts
if (incomplete.length > 0) {
  console.warn(
    "[llm-fixer] excluded incomplete files from merge:",
    incomplete.map((i) => `${i.path} (${i.reason})`).join(", "),
  );
  devLogAppend("in-progress", {
    type: "llm_fixer_partial_response",
    excludedFiles: incomplete,
    totalFixedFilesAttempted: fixedProject.files.length,
  });
}
```

Mätbart över tid: hur ofta exkluderas page.tsx? Vilka mönster?

### Fix F (utökning) — `repair-loop` adaptive max-pass

**F1.** I `config/ai_models/manifest.json` rad 339-345, lägg till en variabel max:

```json
"serverRepairPasses": {
  "default": 2,
  "max": 4,
  "escalateOnRecurringPattern": true  // Om samma fel kvarstår, höj max
}
```

Logik i `repair-loop.ts`: om pass 2 failar med **samma** fel som pass 1 (Levenshtein på error-message), eskalera till pass 3 med **annan modell** (`gpt-5.4` istället för `gpt-5.3-codex`) eller högre `reasoningEffort`.

**Risk:** kostsam eskalering, svårdebuggad. Behåll bakom feature-flag tills mätningar visar att 2 pass faktiskt räcker i 95% av fallen.

## Acceptanskriterier

- [ ] `llm_fixer_aborted`-event finns i timeline.
- [ ] Returvärde från `runLlmFixer` har `aborted: boolean`.
- [ ] Anroparen i `repair-loop.ts` reagerar på `aborted` (retry eller eskalering).
- [ ] Lucide-checklist finns i prompten.
- [ ] `llm_fixer_partial_response`-event loggas vid `shrink_below_50pct`.
- [ ] Mätbar minskning av `autofix.heavy_load > 5`-frekvens efter Lucide-checklist deploy (eval över 50 körningar).
- [ ] Manuell verifiering: skapa landing-page med många icons → autofix.fixCount ska sjunka till < 10.

## Risker

- **A2 (regen-loop) kan dubbla wall-clock.** Bara värt om regen-output är bättre. Eval krävs.
- **F (adaptive max-pass) kan förlänga vissa runs avsevärt** (3 × 4 min = 12 min). Måste ha hard cap.
- **D (Lucide-checklist) ökar prompt-tokens** med ~500. Marginellt men summerar över alla körningar.

## Filer att läsa innan implementation

- `src/lib/gen/stream/finalize-version/pre-phases.ts` (rad 95-156)
- `src/lib/gen/autofix/llm-fixer.ts` (hela, 222 rader)
- `src/lib/gen/verify/repair-loop.ts` (rad 468-570)
- `src/lib/gen/verify/server-verify.ts` (rad 525-540)
- `config/ai_models/manifest.json` (rad 335-355)
- `src/lib/gen/system-prompt/sections/route-plan.ts` (rad 110-130)
- `src/lib/gen/system-prompt/sections/required-imports-checklist.ts` (hela)
- `src/lib/gen/system-prompt/build-dynamic-context.ts` (rad 200-225)
- `src/lib/logging/generation-log-writer.ts` (`readRecurringPatternsForChat`)
- `src/lib/config.ts` (rad 396-405 — FEATURES)
- `src/lib/providers/own-engine/generation-stream.ts` (rad ~482+)

## Källa

Audit-agent #5 (claude-4.6-sonnet-medium-thinking) 2026-04-24, prompt fokus: autofix-heavy_load gating + LLM-fixer abort + recurring patterns + repair-loop max-pass.
