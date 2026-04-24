---
id: easy-medium-layer
title: LLM-kedjan — Easy / medel-lager (E1–E7)
status: mostly-done
created: 2026-04-21
last_updated: 2026-04-23
priority: medium
parent_plan: .cursor/plans/llm-chain-cleanup-2026-04-21.md
parallel_safe_with: [medium-hard-layer]
blocked_by: []
estimated_remaining_effort: ~2 timmar (endast E3)
---

# Easy / medel-lager (E1–E7)

> **OMTAG-uppdatering 2026-04-23:** E1 + E2 landade i OMTAG fas 2·A. E4 + E5 + E6 landade i OMTAG fas 2·C. E7 landade i OMTAG fas 2·B. **Endast E3 (`recurringQualityPatterns` in i codegen-prompten) återstår.** Se [`../avklarat/omtag-2026-04-23/`](../avklarat/omtag-2026-04-23/) för fullständig leverans.

Småplockare som var och en tar < 2 h. Inget av detta kräver telemetri-vänta. Plockordning är fri — alla är oberoende, så perfekt för en enskild session där man vill rensa skuld utan att starta något stort.

---

## E1 — Ta bort dubbletten i follow-up-prompten

**Problem (A4 i validerings-rapporten):** `system-prompt.ts` 481–497 lägger `## Generation Mode: Follow-Up` + element-preservation-prosa i system-delen. `chat-message-stream-post.ts` 438–474 upprepar liknande prosa på user-turn. ~900 tecken dubblerat per follow-up.

**Lösning:**
- Behåll regeln i system-prompten (den hör hemma där — det är en LLM-instruktion, inte ett user-uttalande).
- Korta user-turn-`elementPreservationReminder` till en enradslänk: `"(Follow-up rules: see system prompt § Generation Mode: Follow-Up.)"` — eller ta bort helt om reglerna i system räcker.

**Filer:**
- `src/lib/gen/system-prompt.ts` (rad 481–497)
- `src/lib/api/engine/chats/chat-message-stream-post.ts` (rad 438–474)

**Acceptansgränser:**
- Två existerande tester (`finalize-merge.ts` element-preservation guard) håller utan ändring.
- Token-budget per follow-up minskar med ~250 tokens (mätt via `prompt-dump`-filer).
- Ingen regression i element-preservation-fång (golden-test).

**Effort:** 1 h.

---

## E2 — Enhetlig `isFollowUp`-predicate

**Problem (A3 delvis bekräftad):** Tre platser löser frågan "är detta en follow-up?" på olika sätt:
1. `orchestrate.ts` 381: `generationMode ?? (persistedScaffoldId ? "followUp" : "init")`
2. `chat-message-stream-post.ts` 777: `previousFiles.length > 0 ? "followUp" : undefined`
3. `finalize-merge.ts` 41: `Boolean(previousFiles && previousFiles.length > 0)`

Kantfall: scaffold finns men `previousFiles.length === 0` → orchestrate säger "followUp", merge säger "init". Race vid första lyckade init.

**Lösning:** Ny modul `src/lib/gen/follow-up-predicate.ts`:

```ts
export function deriveFollowUpStateFromInputs(input: {
  persistedScaffoldId: string | null | undefined;
  previousFilesCount: number;
}): {
  hasMergeablePrevious: boolean;
  isOrchestrationFollowUp: boolean;
};
```

Båda predikat exposeras separat så semantiken är explicit. Konsumenter:
- `orchestrate.ts` → `isOrchestrationFollowUp`
- `chat-message-stream-post.ts` → samma
- `finalize-merge.ts` → `hasMergeablePrevious`

**Acceptansgränser:**
- Test som täcker kantfallet `persistedScaffoldId + previousFilesCount === 0`.
- Befintliga golden-tests passerar.

**Effort:** 1.5 h.

---

## E3 — `recurringQualityPatterns` in i nästa codegen-prompt

**Problem (från LLM-flöde-rapporten):** Verifier flaggar samma 3 fynd om och om igen i varje run (`seo-metadata-minimal`, `image-optimization`, `semantic-button-for-tooltip-only`). Codegen-LLM:n lär sig aldrig.

**Lösning:** Mönstra efter `recurringFailurePatterns` (finns redan i `fixer-prompt.ts`). Persistera 3–5 senaste verifier-fynd per chat. Injicera i nästa codegen-prompt som:

```
## Quality patterns to avoid (from prior generations in this chat)
- Don't repeat: `seo-metadata-minimal` (3 ggr, last 2 mins ago)
- Don't repeat: `image-optimization` (2 ggr)
```

**Filer:**
- `src/lib/logging/generation-log-writer.ts` (ny export `readRecurringQualityPatternsForChat`)
- `src/lib/gen/system-prompt.ts` (rendera blocket)
- `src/lib/gen/orchestrate.ts` (läs in)

**Acceptansgränser:**
- 1 verifier-fixer-anrop sparat per follow-up (mätbart via `sajtmaskin_verifier_blocking_total` efter en vecka).
- Test: persistera mock-pattern, verifiera att nästa generation får blocket.

**Effort:** 2 h.

---

## E4 — `## Required Imports Checklist` i system-prompt

**Problem (LLM-flöde-rapporten):** `import-validator` lägger till 11 imports per run (Badge, Card, CardHeader, …). `autofix.heavy_load` triggas i nästan varje run. Codegen-LLM glömmer importera komponenter den faktiskt använder.

**Lösning:** Bygg deterministisk lista över shadcn-komponenter att importera baserat på `routePlan` + `capabilityHints`. Format:

```
## Required Imports Checklist

If your code uses these components, the import MUST be present:

| Component | Import |
|-----------|--------|
| Card, CardHeader, CardTitle, CardContent | `import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";` |
| Badge | `import { Badge } from "@/components/ui/badge";` |
…

(Keep this list focused — only what the route plan suggests.)
```

**Filer:**
- `src/lib/gen/system-prompt.ts` (ny block-renderer)
- Ev. `src/lib/gen/route-plan.ts` (utöka med komponentinventering)

**Acceptansgränser:**
- `autofix.heavy_load`-frekvens går från ~1 per run till < 0.1 per run över en veckas data.
- Test: routePlan med Card-komponent → blocket innehåller Card-importen.

**Effort:** 2 h.

---

## E5 — Konsolidera 3 react-import-fixers till en

**Problem (LLM-flöde-rapporten):** `react-import-fixer` + `react-hook-import-fixer` + `react-type-import-fixer` har överlappande logik. Telemetri (`sajtmaskin_fixer_call_total`) finns redan från Etapp I.

**Lösning:** Ny `react-import-fixer.v2.ts` som:
1. Skannar AST för react-användning (hooks + types + default React).
2. Bygger en (1) import-statement med rätt kombo.
3. Ersätter de tre gamla.

**Riskmitigation:** Behåll de gamla i 1 vecka med flagga `useV2ReactImportFixer` (default ON i dev, OFF i prod) för att jämföra utdata. Telemetri-counter på diff.

**Acceptansgränser:**
- Alla existerande tester för de tre fixarna återanvänds mot v2.
- Telemetri visar samma fix-frekvens.

**Effort:** 1 h kod + 30 min validering.

---

## E6 — Strict assert i CI

**Problem:** `SAJTMASKIN_STRICT_SYSTEM_PROMPT_ASSERT=1` är fixat lokalt, men CI/eval kör utan hård fail på prompt-korruption.

**Lösning:** I `.github/workflows/ci.yml` env-blocket för eval-jobbet (eller `test:ci`-steget):

```yaml
env:
  SAJTMASKIN_STRICT_SYSTEM_PROMPT_ASSERT: "1"
```

**Acceptansgränser:**
- CI-kör loggar `[system-prompt-assert]` events vid eventuella korruptioner.
- Inga existerande tester börjar fela (om något felar har vi just hittat en buggad prompt).

**Effort:** 10 min.

---

## E7 — Variant-default-fix för `landing-page`

**Problem (`Kvarvarande-uppgifter.md` rad 140):** `corporate-grid` är default men vinner 0/20 i 2026-04-18 eval. Embedding-pickern väljer systematiskt `bold-startup` eller `warm-local`.

**Lösningsalternativ (utredning + val):**

A. **Byt default** till `bold-startup` (eval-vinnaren).
B. **Förbättra `corporate-grid`-embedding** så den faktiskt vinner B2B-prompts.
C. **Kombinera:** Behåll `corporate-grid` som default men lägg till explicit prompt-hint för B2B/finance.

**Filer:**
- `src/lib/gen/scaffolds/landing-page/manifest.ts`
- `src/lib/gen/scaffold-variants/<variant>.json` (B om vald)

**Acceptansgränser:**
- Re-kör `npx tsx scripts/scaffolds/eval-landing-variants.ts`. Förväntat: corporate-grid vinner ≥ 3 av 20, eller default flyttas.
- Inga regressioner för andra varianters utfall.

**Effort:** 1 h utredning + 30 min implementation.

---

## Rekommenderad körordning

1. **E6** (10 min) — slå på strict assert i CI direkt, sänker risken för framtida arbete.
2. **E1** (1 h) — billigast vinst på follow-up-prompten.
3. **E2** (1.5 h) — slussar bort en kantfalls-bugg medan vi ändå rör follow-up-koden.
4. **E4** (2 h) — största kvalitets-vinst för genererad kod.
5. **E3** (2 h) — kräver tankearbete kring persistenslager.
6. **E5** (1.5 h) — kräver eftertanke + 1 vecka jämförelse.
7. **E7** (1.5 h) — separat eval-driven utredning, kan vänta.
