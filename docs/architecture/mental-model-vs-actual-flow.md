# Mental modell vs faktiskt flöde

> **Senast uppdaterad:** 2026-04-18 efter audit av pre-send + post-VM + autofix/LLM-fixer-lager.
> **Syfte:** sluta gapet mellan användarens intuition om hur generering+repair funkar och vad koden faktiskt gör. Komplement till [`llm-flow-end-to-end.md`](./llm-flow-end-to-end.md) (= "what happens, top to bottom"); den här filen är "where reality and the gut feeling diverge".

---

## Kort sammanfattning

Användarens mentala modell:

> En system-prompt (statisk + dynamisk) går genom **Deep Brief**, **Scaffold** och **Scaffold Variant** plus hela användarprompten. Så många deterministiska tester som möjligt körs **innan** den skickas. Om något måste fixas åker det in i en **repair-kedja innan** det dyker upp i VM:en — så man inte får massor av trasiga versioner. Vissa fel går inte att hitta förrän `npm install` / `npm run dev` körts; då ska felen åka tillbaka, fixas och rättas till bakvägen.

**Vad som verkligen stämmer:** ~70% av modellen är korrekt. Tre konkreta avvikelser som tidigare gjorde flödet svårt att läsa — alla nu antingen fixade eller dokumenterade nedan.

---

## Avvikelse 1 — Pre-send: ingen assert på själva systemprompten

### Mental modell

> Systemprompten valideras innan den skickas så vi inte bränner tokens på en korrupt prompt.

### Tidigare verklighet

Inget. `composeEngineSystemPrompt(...)` är bara strängkonkatenering, `getSystemPromptLengths(...)` räknar bara tecken. JSON-dubbel-encoded innehåll, ostängda kodfences eller en saknad `SYSTEM_PROMPT_SEPARATOR` slank igenom till `streamText`.

### Nuvarande verklighet ✅

`assertSystemPromptShape(prompt)` (i [`src/lib/gen/system-prompt-assert.ts`](../../src/lib/gen/system-prompt-assert.ts)) körs nu i `engine.generateCode` precis innan `streamText`. Default = SOFT (varnar via `console.warn` med stabil prefix `[system-prompt-assert:engine.generateCode]`). Sätt `SAJTMASKIN_STRICT_SYSTEM_PROMPT_ASSERT=1` för att kasta hårt — använd i CI/eval där tyst-trasig-prompt är värst.

Vad det fångar:

| Issue code | Severity | Vad det betyder |
|---|---|---|
| `empty` | error | Static core lastades inte ordentligt (`< 200` chars). |
| `missing-separator` | error | `composeEngineSystemPrompt` blev förbigången. |
| `literal-newline-runs` | warn | `\n\n\n\n+` literal — tecken på JSON-dubbel-encoded text inkonkatenerad. |
| `suspicious-double-backslash` | warn | `\\\\+` literal — escape inflation från round-trip. |
| `unbalanced-code-fences` | warn | Udda antal ``` → modellen kommer mest sannolikt emit:a malformed CodeProject-output. |

---

## Avvikelse 2 — Mekaniska fixers: såg redundanta ut, är de inte (nu dokumenterat)

### Mental modell

> Det finns 25+ fixers — många borde gå att slå ihop.

### Verklighet ✅

Tre fixer-familjer med ÖVERLÄGSEN OLIKA decision-predicates. Varje fixer är 30–80 rader och **trivialt auditabel** isolerat:

1. **"Add a missing import"** (~9 fixers) — `react-import-fixer`, `react-hook-import-fixer`, `react-type-import-fixer`, `next-image-import-fixer`, `next-og-image-response-import-fixer`, `metadata-import-fixer`, `metadata-route-import-fixer`, `cn-import-fixer`, `font-import-fixer`. Olika triggers, olika modul-väg, olika syntax-shape — sammanslagning skulle kräva en tabelldriven generisk insertor som är svårare att förstå.

2. **"Wrong source for an existing import"** (2 fixers efter mitt arbete; var 3) — `tier3-sdk-guard-fixer` (strippar backend-SDKs i F2) och `lucide-misuse-fixer` (lucide-react `Link`/`Image` re-routas till `next/link`/`next/image`). De två gamla `lucide-link-fixer.ts` + `lucide-image-fixer.ts` var nästan-duplicerade — nu konsoliderade till en enda fil med delad helper.

3. **"Cross-file import-rekonciliering"** (5 fixers) — `local-symbol-import-fixer`, `local-named-import-default-fixer`, `local-default-import-fixer`, `import-declaration-conflict-fixer`, `duplicate-import-binding-fixer`. Varje encoderar en specifik decision-predikat ("vad gör jag när två filer säger emot varandra om export-shape?") som är cheap att köra och dyr att slå ihop. **Konsolidering i framtiden bara med telemetri** — räkna `countByFixer(...)` över ett par produktionsdagar för att se om någon faktiskt aldrig fyrar.

Allt detta är nu dokumenterat överst i [`src/lib/gen/autofix/pipeline.ts`](../../src/lib/gen/autofix/pipeline.ts) som "fixer-family map" så framtida läsare inte tror det är en stor blob av redundans.

---

## Avvikelse 3 — Post-VM-loopen körs **inte automatiskt** för F2

### Mental modell

> När VM:en säger "fel" från `npm install` / `npm run dev` ska felen åka tillbaka in i repair-kedjan automatiskt, så jag inte får massor av trasiga versioner.

### Tidigare verklighet (största gapet)

Tre paralella vägar — bara en av dem triggar automatisk repair, och **inte i F2-flödet**:

1. **`triggerServerVerification`** (bakgrunds quality-gate) — kör `tsc`/`build`/`lint` på preview-host efter finalize. Om policy är `verificationPolicy: "fast"` och `previewPolicy` ≠ F3 returnerar `resolvePostFinalizeServerVerifyDecision` ofta `run: false` (`design_preview_skip_verify`). I normalt F2-flöde **körs ingen automatisk repair-loop**.

2. **Live preview-fel (`build-error` SSE)** — emitterades från preview-VM via `formatSSEEvent("build-error", ...)`. **Loopades inte automatiskt** in i `runRepairLoop` — användaren måste klicka "Repair" manuellt eller vänta på server-verify (som ofta är skippad i F2).

3. **Manuell `/api/.../repair`** — tillgänglig men kräver klick.

### Nuvarande verklighet ✅ (opt-in)

Ny exporterad funktion **`triggerBuildErrorRepair`** i [`server-verify.ts`](../../src/lib/gen/verify/server-verify.ts), gated bakom `SAJTMASKIN_AUTO_REPAIR_BUILD_ERROR=1`. Hookad i [`generation-stream-post-finalize.ts`](../../src/lib/providers/own-engine/generation-stream-post-finalize.ts) på båda `build-error`-emit-platserna. När flaggan är på:

1. `build-error` SSE skickas (samma beteende som innan — UI-banner)
2. **Samtidigt** fire-and-forget `triggerBuildErrorRepair` som:
   - Kollar dedup mot samma `inflight`-set som `triggerServerVerification` (ingen dubbel-trigger)
   - Bygger `failedOutput` med `check: "build"`, output = `[preview-vm:<stage>] <message>`
   - Kallar `tryServerRepairLoop` → mekanisk autofix → ev. LLM-fixer → repass quality-gate
3. Om repair lyckas: `version-repair-available` SSE → UI visar "Acceptera repair"-knapp (samma flow som server-verify-baserad repair)

**Default off** för säkerhet — testa i dev först, sätt `SAJTMASKIN_AUTO_REPAIR_BUILD_ERROR=1` i staging, validera att repair-loopen inte stör live-preview boot, sen rulla ut till prod.

---

## Avvikelse 4 — Versioner syns i UI **innan** verify är klar

### Mental modell

> En version dyker bara upp när den är OK.

### Verklighet (oförändrad — by design)

`done`-SSE skickas så fort `finalizeAndSaveVersion` har sparat. Quality-gate / verify körs **i bakgrunden** efter det. En version i historiken kan alltså vara i state `verifying` → `repairing` → `repair_available`/`failed`/`promoted`.

**Detta är medvetet**: blockande verify skulle göra UX:n ovanligt seg. Men det betyder du kan se en "ful" version i historiken under en kort fönster innan repair landar. UI har explicita state-badges (`verification_state` per version) — använd dem hellre än att försöka dölja versionen.

Om du vill ändra detta: blockande verify-före-`done` skulle krocka med `repairPassIndex`-logiken i `runOwnEngineStreamPostFinalize` — hör av dig innan du börjar.

---

## Avvikelse 5 — Escape/slash-läckage var en korrekt observation

### Mental modell

> Det dyker upp konstiga `\`, `\\`, `\n` ibland — vet inte varför.

### Verklighet ✅

Tre verkliga uppkomstkällor identifierade och **alla nu blockerade**:

1. **JSON-dubbel-encoded innehåll** som hamnade i fil-bodies. Hanteras nu av `escape-leakage-fixer` (steg 0 i autofix-pipelinen) — packar upp `JSON.stringify`-wrappade strängar.

2. **`parseDotenvBody` ↔ `quoteEnvValue` asymmetri** — read-pathen tog bara bort yttercitat utan att avkoda escapesarna som write-pathen lade in. Round-trip dubblade escape-nivån varje gång. Fixad med symmetrisk decode + idempotent round-trip-test, plus en generisk `parse-format-symmetry.test.ts` som framtida par måste passera.

3. **PowerShell-pipe till `vercel env add`** — substituerar literal `\n` för newlines (dokumenterat i `.cursor/rules/platform-quirks.mdc`). Kan inte fixas i koden eftersom det händer utanför processen, men `getStoredProjectEnvVarMap` warnar nu vid första läsning av en värde som ser ut att lida av detta — så du ser det i loggen istället för att jaga det blint.

---

## Sammanfattning: vad är fortfarande "live edge"?

| Område | Status | Notering |
|---|---|---|
| Pre-LLM systemprompt-assert | ✅ Klar (soft) | Slå på `SAJTMASKIN_STRICT_SYSTEM_PROMPT_ASSERT=1` i eval/CI |
| Mekaniska fixers (~25 st) | ✅ Dokumenterade | Konsolidera bara med telemetri |
| Lucide-fixers slagna ihop | ✅ Klar | `lucide-misuse-fixer.ts` ersätter två filer |
| Auto-repair på `build-error` | ✅ Klar (opt-in) | Aktivera via `SAJTMASKIN_AUTO_REPAIR_BUILD_ERROR=1` |
| Escape-leakage-källor | ✅ Tre källor stängda | Ev. fjärde källa → systemprompt-assert flaggar |
| F2 + `verificationPolicy: fast` skippar verify | ⚠️ By design | Auto-repair på `build-error` (ovan) täcker det vanligaste hålet |
| Versioner syns innan verify klar | ⚠️ By design | UI-badges (`verification_state`) är källan till sanning |
| LLM-fixer kontextbredd | ⚠️ Litet | Endast `error.file/line/message` + targeted bundle. Att lägga in build-output (`npm run dev`-stderr) i kontexten skulle hjälpa svåra fall |

Den enda återstående medvetna gråzonen är "version visas i UI innan verify klar" — det är en UX-tradeoff. Allt annat på listan är antingen åtgärdat, dokumenterat med uttalad orsak, eller spårningsbart via telemetri.

---

## Var ska jag titta för djup-detaljer?

- **Pre-LLM och prompt-komposition**: [`llm-flow-end-to-end.md`](./llm-flow-end-to-end.md), [`llm-flow-fas1-plan.md`](./llm-flow-fas1-plan.md)
- **Post-stream pipeline (autofix → verify → preview-boot)**: `src/lib/gen/stream/finalize-pipeline-contract.ts` (canonical ordering), `src/lib/gen/autofix/pipeline.ts` (fixer-family map)
- **Repair-loopen**: `src/lib/gen/verify/repair-loop.ts`, `src/lib/gen/verify/server-verify.ts`
- **Build-error auto-repair**: `triggerBuildErrorRepair` i `server-verify.ts`, hookad i `generation-stream-post-finalize.ts`
- **Escape-läckage-spår**: `src/lib/gen/autofix/rules/escape-leakage-fixer.ts`, `src/lib/gen/preview/env-local.ts` (`unescapeDoubleQuotedEnvValue`), `src/lib/project-env-vars.ts` (`warnIfSuspiciousEnvValue`)
- **Pre-LLM assert**: `src/lib/gen/system-prompt-assert.ts`
