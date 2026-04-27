---
status: done
created: 2026-04-24
spår: 6 av 7 (LLM-flöde-körplan, NEDPRIORITERAD efter deep-prefab feedback)
prio: P6 (största potentiella vinst men kvalitetsrisk; måste bakom eval)
estimat: 5–7 dagar (eval-pipeline + designdoc + canary-rollout)
---

# Spår 6 — Latens-vinster + scaffold-as-delta (BARA SÄKRA VINSTER FÖRST)

## ⚠️ Omprioritering jämfört med v1

I första körplanen var detta P5 (störst potentiell tidsvinst, 3-5 min/run).

Deep-prefab-agent argumenterade övertygande:
> "Jag skulle inte börja med 'reasoning high → medium' som default utan eval. Kvalitet är viktigare."

Och:
> "Scaffold-as-delta är rätt riktning men ska göras bakom flagga och eval. Annars finns risk att man får snabbare men ännu mer 'tomma' sidor."

Därför **deprioriterad till P6** och uppdelad: **säkra vinster först**, **riskabla optimeringar bakom eval**.

## Säkra vinster (kan göras direkt utan eval)

### Säker A — Skip dubbel tsc

**Bevisat:** `validate_syntax` (warm-tsc i finalize) + `quality-gate` (tsc igen på Fly-VM) = ~130s dubbel typecheck.

**Verifierat i kod:** `src/lib/gen/stream/finalize-version/fast-path.ts` rad 95-128 anropar `validateAndFix` (warm-tsc). `src/lib/hooks/chat/post-checks.ts` rad 324-350 anropar `runTier2VerifyLane` som kör tsc igen.

**Fix:** I `fast-path.ts` rad 98-111, lägg villkor:
```ts
if (postFinalizePolicy.willRunQualityGate && policy.qualityGateChecks.includes("typecheck")) {
  skipWarmTsc = true;  // quality-gate kommer ändå köra det
}
```

**Risk:** Om quality-gate skippas senare (`design_preview_skip_verify`) får vi ingen tsc-validering alls i den körningen. **Mitigation:** kolla `policyDecision.run === false` och behåll warm-tsc i det fallet.

**Sparad tid:** ~60s per körning.

### Säker B — Pre-warm Fly-VM vid chat-init

**Bevisat:** `src/app/api/engine/chats/init/route.ts` rad 497-504 startar bara preview-session vid **importerat projekt**. Normalt nytt chatId får cold start (10-120s).

**Fix:** Trigga `startPreviewSession` med `precache: true` direkt vid chat-init **om** `buildIntent === "website"`. Inte vid template-clones (de har annan flow).

**Risk:** Kostar VM-resurser för chats som aldrig genererar något. Mätbar med befintlig telemetri innan default-byte.

**Sparad tid:** ~10s per körning.

### Säker C — Streaming-validation per fil-block

**Idag:** `parser.ts` är batch — parse:r hela `accumulatedContent` när stream är klar. Esbuild-syntax körs efter merge.

**Fix:** Parse:a varje ` ```lang file="path" `-fence när det är komplett (vid nästa fence eller stream-end). Kör esbuild-syntax på den filen parallellt med stream.

**Risk:** Större ändring av parser-arkitektur. Behöver streaming-handler i egen `TransformStream` innan `accumulatedContent` sparas — finns inte idag. Estimera 1-2 dagars extra arbete.

**Sparad tid:** ~30s per körning (esbuild körs medan LLM fortfarande skriver).

## Riskabla optimeringar (bakom eval)

### Risk D — Reasoning-budget `high` → `medium`

**Idag:** `config/ai_models/manifest.json` rad 189: `phaseRouting.thinkingByTier.pro.generator = { reasoningEffort: "high", thinking: true }`. Resolveras i `src/lib/own-engine/session/own-engine-pipeline-generation.ts` rad 63-81.

**Möjlig fix:** Sänk till `medium` för create när scaffold confidence ≥ medium.

**Måste bakom eval** eftersom:
- Påverkar **alla** create-pro-körningar.
- Kvalitetsregression möjlig (mer struktur-fel, sämre kreativitet).
- Mätbar via `autofix.fixCount`, `server-verify pass-rate`, `quality-gate-result` över 50+ körningar.

**Förslag eval-flöde:**
1. Aktivera env-flag `SAJTMASKIN_GENERATOR_REASONING_EFFORT=medium`.
2. Kör 50 prompt-pairs mot baseline + flag-on, jämför metriker.
3. Om ingen kvalitetsregression: villkorlig override i `own-engine-pipeline-generation.ts` baserat på `scaffoldSelection.confidence`.
4. Efter 1 vecka grön: byt manifest-default.

**Sparad tid (om grönt):** 100-150s per körning.

### Risk E — Scaffold-as-delta

**Idag:** `serializeScaffoldForPrompt` (`src/lib/gen/orchestrate.ts` rad 665-674) dumpar scaffold-filer som markdown i system-prompten. LLM regenererar allt.

**Möjlig fix:**
- **Bas:** server-side scaffold + dossier-merge **innan** prompt.
- **Prompt:** "Given baseline files (paths + hashes); emit **endast** nya/ändrade ` ```tsx file="..."`-block; allt annat oförändrat."
- **Merge:** `mergeGeneratedProjectFiles` i `finalize-merge.ts` mergar LLM-output med baseline.

**Måste bakom eval** eftersom:
- Modell kan "glömma" att uppdatera filer den borde uppdaterat.
- Risk för "tommare" sidor om delta-strategi gör att modellen skriver mindre kod.
- Kräver strict prompt + cross-file-import-checker som fångar broken references.

**Förslag eval-flöde:**
1. `SAJTMASKIN_SCAFFOLD_DELTA_MODE=1` (default off).
2. A/B-eval: 50 körningar varje sida på samma prompts.
3. Mät: output-tokens, reasoning-tid, `cross-file-import-checker` stub-frekvens, `autofix.heavy_load`-frekvens, server-verify pass-rate, **subjektiv kvalitetsbedömning**.
4. Om grönt efter 50+ körningar: gradvis rollout via canary.

**Sparad tid (om grönt):** 50-100s per körning + 50% färre output-tokens.

### Risk F — Prompt-caching

**Idag:** `src/lib/gen/system-prompt/compose.ts` rad 42-62 mäter bara längd (88 KB total, 47 KB statisk + 41 KB dynamisk). **Ingen `cache_control`** i koden.

**Möjlig fix:** Aktivera explicit prompt-cache via Vercel AI SDK + OpenAI/Anthropic provider-options.

**Måste utredas** eftersom:
- Stödjer Vercel AI SDK `providerOptions.openai.cacheControl` eller motsvarande?
- Den dynamiska delen (~41 KB) varierar per körning → förstör automatisk prefix-cache.
- Måste separera invariant block (47 KB stable) + dynamic block (cachable separat eller ej).

**Sparad tid (om aktiverat):** 5-15s per körning + lägre token-kostnad.

## Acceptanskriterier (säkra vinster A+B+C)

- [ ] Skip dubbel tsc fungerar med fallback om quality-gate skippas.
- [ ] Pre-warm Fly-VM aktivt för `buildIntent: "website"` vid chat-init.
- [ ] Streaming-validation per fil-block parar med esbuild parallellt med stream.
- [ ] Total wall-clock minskning **mätt** (inte gissad): från ~7:07 till ~5:30 förväntat.

## Acceptanskriterier (riskabla D+E+F)

- [ ] Eval-script finns under `src/lib/gen/eval/` som kör 50 prompt-pairs och rapporterar metriker.
- [ ] Reasoning-budget-byte föregås av minst 50 körningar utan kvalitetsregression.
- [ ] Scaffold-as-delta föregås av A/B-eval på samma prompts.
- [ ] Prompt-cache implementeras endast om SDK stödjer det och invariant-block isoleras.

## Risker

- **Säkerhet i säkra vinster:** A+B är låg-risk. C kräver parser-refactor.
- **D, E, F kan ge falska tidsvinster om kvalitet sjunker tyst** — eval måste mäta både tid OCH kvalitet (autofix-fix-count, server-verify-pass-rate, cross-file-stub-frekvens).
- **Eval-pipeline saknas idag** — måste byggas innan D/E/F prövas. Estimera 2-3 dagar.

## Förväntad besparing

| Fix | Risk | Förväntad sparad tid | När göra |
|---|---|---|---|
| A (skip dubbel tsc) | Låg | 60s | Direkt efter P0 |
| B (Fly pre-warm) | Låg | 10s | Direkt efter P0 |
| C (streaming-validation) | Medium | 30s | Efter A+B |
| D (medium reasoning) | Hög | 100-150s | Efter eval |
| E (scaffold-delta) | Hög | 50-100s + tokens | Efter eval |
| F (prompt-cache) | Medium | 5-15s | Efter SDK-utredning |
| **Säkra vinster (A+B+C):** | — | **~100s** | **Denna runda** |
| **Med eval (alla):** | — | **3-5 min** | **Framtida runda** |

## Filer att läsa innan implementation

- `src/lib/gen/orchestrate.ts` (rad 660-680, 790-820)
- `src/lib/gen/system-prompt/compose.ts` (rad 42-62)
- `src/lib/own-engine/session/own-engine-pipeline-generation.ts` (rad 63-81)
- `config/ai_models/manifest.json` (rad 182-200)
- `src/lib/gen/engine.ts` (rad 76-186)
- `src/lib/gen/stream/finalize-version/fast-path.ts` (rad 95-128)
- `src/lib/gen/stream/finalize-merge.ts`
- `src/lib/providers/own-engine/generation-stream.ts` (rad ~482+)
- `src/lib/gen/parser.ts` (rad 14-64 — `CODE_BLOCK_RE`)
- `src/app/api/engine/chats/init/route.ts` (rad 497-510)

## Källor

- Audit-agent #2 (claude-4.6-sonnet-medium-thinking) 2026-04-24, första pass
- Deep-prefab-agentens svar i `svar_gpt`: "Latens: bara säkra vinster först" (deprioritering)
