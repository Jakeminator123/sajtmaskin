---
status: active
created: 2026-04-24
spår: 2 av 5 (LLM-flöde-körplan)
prio: P5 (största potentiella vinst men störst designändring)
estimat: 3–5 dagar
---

# Spår 2 — Reducera LLM-tid (scaffold-as-delta + reasoning budget + dubbelkörd tsc)

## Symtom (observerat)

För körning `eb152443-...` (standard landing-page med scaffold + 1 dossier):

| Fas | Tid | Andel av total |
|---|---|---|
| Brief (`gpt-5.4`) | 25,2 s | 6 % |
| **LLM reasoning (`gpt-5.3-codex`, `thinking=true`)** | **248 s = 4 min 8 s** | **58 %** |
| LLM output stream | 104 s | 24 % |
| `validate_syntax` (warm-tsc i finalize) | 67,5 s | 16 % |
| Quality-gate (tsc igen på Fly-VM) | 66 s | (efter `site.done`) |
| Preview-VM cold start | 10 s | 2 % |

Total wall-clock: 7:07. Av det är **~130 s dubbel tsc-körning** och **4 min av 4:08 reasoning** sannolikt över-budgeterat för en standard landing-page som scaffolden redan ger struktur till.

Tokens: 21 434 in / 25 606 ut (33 filer regenererade från grunden).

## Rotorsak

Tre oberoende effektivitetsproblem:

### A. Scaffold injiceras som prompt-text, inte återanvänds som faktisk kod

`src/lib/gen/orchestrate.ts` rad 665-674 (`serializeScaffoldForPrompt`) dumpar scaffold-filer som markdown i system-prompten. LLM:en instrueras att "regenerera allt" snarare än att "emit only delta". Resultat: 26k output-tokens när scaffolden redan ger 5 av 33 filer.

### B. `reasoningEffort: "high"` är default för create-pro

`config/ai_models/manifest.json` rad 189: `phaseRouting.thinkingByTier.pro.generator = { reasoningEffort: "high", thinking: true }`. Resolveras i `src/lib/own-engine/session/own-engine-pipeline-generation.ts` rad 63-81. För enkla landing-pages med hög scaffold-confidence är `medium` sannolikt tillräckligt.

### C. `validate_syntax` (67 s) + quality-gate (66 s) kör tsc TVÅ gånger

- `src/lib/gen/stream/finalize-version/fast-path.ts` rad 95-128 (`validateAndFix` med warm-tsc)
- `src/app/api/engine/chats/[chatId]/quality-gate/route.ts` (skickar till preview-host `/preview/verify` lane som kör tsc igen)

Resultatet är samma typecheck-pass på samma kod, två gånger, ~130 s totalt.

### D. Inget Fly-VM pre-warm

`src/app/api/engine/chats/init/route.ts` rad 497-504 startar bara preview-session vid **importerat projekt** — inte vid normalt nytt chatId. Cold start (~10 s, ibland 60-120 s om VM:en skalat till 0) blir på kritiska pathen.

### E. Ingen prompt-caching aktiverad

`src/lib/gen/system-prompt/compose.ts` rad 42-62 mäter bara längd (88 KB total). Ingen `cache_control` / explicit prompt-cache i koden. Den stora **dynamiska** delen (~40 KB, varierar per körning) förstör automatisk prefix-cache.

## Föreslagna fixar

### Fix B (lättast) — Reasoning budget

**B1. Ändra default i manifest.** `config/ai_models/manifest.json` rad 189:

```
"generator": { "thinking": true, "reasoningEffort": "medium" }  // var: "high"
```

**Risk:** påverkar **alla** create-pro-körningar. **Kräver eval-runda** mot baseline (kvalitetsregression?). Inte glasklar — kräver dialog.

**B2. Eller: villkorlig override.** I `src/lib/own-engine/session/own-engine-pipeline-generation.ts` rad 76-81, härled `reasoningEffort` baserat på orchestration-kontext:

```
if (scaffoldSelection.confidence === "high" && dossiers.count <= 1) {
  resolvedEffort = "medium";
}
```

Kräver att `scaffoldSelection` + `dossiers.count` trådas in i `createOwnEnginePipelineAndGenerationStream` (idag finns de bara i orchestration-output, inte i pipeline-input).

**B3. Eller: feature-flag-toggle.** `SAJTMASKIN_GENERATOR_REASONING_EFFORT=medium` i `.env.local` för opt-in-test innan default-byte.

**Förslag:** Börja med **B3** (env-flag) → kör 1-2 dagar lokalt med eval-script → sedan **B2** (villkorlig) → ev. **B1** (default-byte) efter mätning.

### Fix C (medium) — Eliminera dubbel tsc

**C1. Skip `validate_syntax` warm-tsc när quality-gate är schemalagd.** I `src/lib/gen/stream/finalize-version/fast-path.ts` rad 98-111: lägg in villkor `if (postFinalizePolicy.willRunQualityGate) { skipWarmTsc = true; }`.

**Risk:** om quality-gate failar / hoppas över sent, kommer tsc-fel inte fångas i finalize. Behöver fall-back: om `quality-gate.willRun === false` → kör warm-tsc som idag.

**C2. Streaming-validation (större ändring).** Parsa varje `## File:`-block (egentligen ` ```lang file="..." `-fence enligt `src/lib/gen/parser.ts` rad 14-64) **när det är komplett** och kör esbuild parallellt med stream. Kräver streaming-handler i egen `TransformStream` innan `accumulatedContent` sparas — finns inte idag.

**Förslag:** Börja med **C1** (snabb vinst, ~60 s sparad). **C2** kräver designdoc.

### Fix D (lätt) — Fly-VM pre-warm

I `src/app/api/engine/chats/init/route.ts` rad 497-504, eller i ny helper anropad från builder-clientens `useEffect` när chatId skapats: trigga `startPreviewSession` med `precache: true` direkt vid chat-init, inte vid `post-finalize`.

**Risk:** kostar VM-resurser om användaren aldrig genererar något. Kompromiss: warm bara om `buildIntent === "website"` och inte vid template-clones.

### Fix E (medium) — Prompt-cache

Kräver utredning: stödjer Vercel AI SDK + OpenAI/Anthropic explicit prompt-cache? Sökning visade inga `cache_control`-anrop i koden idag. **Sub-task:**

- Verifiera AI SDK-stöd för `providerOptions.openai.cacheControl` eller motsvarande.
- Om stöd finns: separera prompt i **invariant block** (scaffold-rules, behavioral-contract, ~47 KB) + **dynamic block** (brief, route-plan, ~41 KB). Cacha invariant.
- Mätbar effekt: 47 KB × 90 % cache-hit-rate × $/token-besparing.

### Fix A (störst) — Scaffold-as-delta

**Designprincip:** istället för att dumpa scaffolden i prompten och säga "regenerera allt", **skicka scaffolden som "given baseline"** och be LLM:en bara emittera filer som ändras.

**Implementation (skiss):**

1. I `src/lib/gen/orchestrate.ts` rad 665-674 (`serializeScaffoldForPrompt`): byt format från "här är källkoden" till "här är hashar + paths".
2. I prompten: "Baseline files: [paths + hashes]. Emit only `## File:`-blocks for files you CHANGE or CREATE. Files not emitted will be kept as-is."
3. I `src/lib/gen/stream/finalize-merge.ts` (`mergeGeneratedProjectFiles`): merga LLM-output med baseline (scaffold + dossier-files) istället för att kräva fullständigt projekt.

**Effekt (uppskattad):** 50 % minskning av output-tokens (12-13k istället för 26k) + ~50 % minskning av output-stream-tid → 50 s sparat. Reasoning-tid sannolikt också kortare eftersom modellen har mindre att tänka över.

**Risk:** modell kan "glömma" att uppdatera filer den borde uppdaterat. Kräver:
- Strict prompt-formulering ("MUST emit files X, Y, Z if you reference new components")
- Validation: efter merge, verifiera att inga "broken references" uppstått (cross-file-import-checker fångar detta delvis idag).

**Förslag:** Stort designspår. Börja med en **opt-in feature-flag** (`SAJTMASKIN_SCAFFOLD_DELTA_MODE=1`), kör A/B-eval (10 körningar varje sida) på samma prompts, mät:
- Output-tokens
- Reasoning-tid
- `cross-file-import-checker` stub-frekvens
- `autofix.heavy_load`-frekvens
- Server-verify pass-rate

Om gröna siffror efter 50+ körningar: gradvis rollout via canary.

## Förväntad besparing (allt sammantaget)

| Fix | Sparad tid per run | Risk-nivå |
|---|---|---|
| B (medium reasoning) | 100-150 s | Medium (kvalitetsregression) |
| C1 (skip dubbel tsc) | 60 s | Låg |
| D (Fly pre-warm) | 10 s | Låg |
| E (prompt-cache) | 5-15 s | Låg (efter eval) |
| A (scaffold-delta) | 50-100 s | Hög (kräver eval) |
| **Total potential** | **3-5 min** | — |

Från 7:07 till ~3:00 är teknisk möjligt. Realistiskt **4:00–4:30** i ett första pass.

## Tester / mätning

- Ny eval-fil under `src/lib/gen/eval/` som mäter `streamTiming.reasoningMs` + `outputMs` per körning, jämför baseline vs flag-on.
- `vitest` for `fast-path.ts` med mock som verifierar att warm-tsc skippas när `willRunQualityGate === true`.

## Filer att läsa innan implementation

- `src/lib/gen/orchestrate.ts` (rad 665-674 + 793-800)
- `src/lib/gen/system-prompt/compose.ts`
- `src/lib/own-engine/session/own-engine-pipeline-generation.ts` (rad 63-81)
- `config/ai_models/manifest.json` (rad 182-200)
- `src/lib/gen/engine.ts` (rad 76-186 — `createGenerationPipeline`)
- `src/lib/gen/stream/finalize-version/fast-path.ts`
- `src/lib/gen/stream/finalize-merge.ts`
- `src/lib/providers/own-engine/generation-stream.ts` (rad ~482+)

## Källa

Audit-agent #2 (claude-4.6-sonnet-medium-thinking) 2026-04-24, prompt fokus: scaffold-as-delta + reasoning budget + dubbel tsc.
