# P30 — R3F Tuple Autofix + Gate-Aware Repair Feedback

**Status:** kod levererad lokalt 2026-04-21 (commit pending)
**Owner:** Cursor agent (Claude Opus 4.7) — empirisk session
**Origin:** Live preview-debug på chat `cdc23879-f4c1-4398-b91b-5e1af020e34c`, version `e6590fc4-b9f3-435c-838b-c0a2d558a05a`

## TL;DR

Quality-gate failade två gånger i rad efter att LLMen genererat en R3F-canvas där `condensationDrops` saknade `as const` på `position`-arrayer. Server-repair-loopen kunde inte fixa det: dess `no_improvement`-policy jämför **esbuild syntax-count** före/efter, men esbuild ser inte typcheckfel. Resultat: `0 >= 0 → no_improvement`, "not promoting" — användaren satt fast med en gammal version i previewn.

Tre delfix i den här planen:

1. **Deterministisk autofix** för R3F vector-tuples
2. **LLM-fixer-prompt** utökad med R3F/three.js typing-hints
3. **`no_improvement`-policy** gjord gate-aware + content-hash-aware

## Empirisk evidens

Loggrader från `engine_version_error_logs` för `e6590fc4-b9f3-435c-838b-c0a2d558a05a`:

```
[WARNING] autofix              | Deterministic autofix applied many repairs; generation quality may be unstable upstream. (fixCount: 6, threshold: 5)
[INFO   ] preflight:summary    | Automatic preflight completed.
[ERROR  ] preflight:quality-gate | Automatic quality gate failed.
[ERROR  ] quality-gate:typecheck | typecheck failed (exit 2)
[ERROR  ] quality-gate:build   | build failed (exit 1)
[WARNING] preflight:quality-gate | Post-repair quality gate did not pass; not promoting.
[WARNING] preflight:quality-gate | Post-repair quality gate did not pass; not promoting.
[WARNING] server-repair        | Server repair incomplete (llm, 0 errors remain, no_improvement).
```

Faktiskt typcheckfel:

```
components/flying-meatball-canvas.tsx(215,61): error TS2322:
Type 'number[]' is not assignable to type 'Vector3 | [x: number, y: number, z: number] | ...'.
Type 'number[]' is not assignable to type '[x: number, y: number, z: number]'.
Target requires 3 element(s) but source may have fewer.
```

Källan:

```ts
const condensationDrops = [
  { position: [-0.28, 0.52, 0.57], scale: [0.035, 0.055, 0.028] as const },
  // ... 7 fler
];
// rad 215:
<mesh position={drop.position} scale={drop.scale}>
```

LLMen visste om `as const` för `scale` men glömde det för `position`.

## Delfix 1 — Deterministisk autofix-rule

**Fil:** [src/lib/gen/autofix/rules/r3f-vector-tuple-fixer.ts](../../../src/lib/gen/autofix/rules/r3f-vector-tuple-fixer.ts)

**Regel:** matcha `(position|scale|rotation|args)\s*:\s*[<3 numeric literals>]` som inte redan har ` as const`. Bara aktiv när filen importerar från `@react-three/fiber`, `@react-three/drei` eller `three`. JSX-prop-literals (`<mesh position={[1,2,3]}>`) matchas inte (kolon krävs).

**Wire-in:**

- [src/lib/gen/autofix/pipeline.ts](../../../src/lib/gen/autofix/pipeline.ts) per-file-loop: körs precis efter `as-const-boolean-keys` (fixer-family-mappens nya rad `4j-r3f`).
- [src/lib/gen/autofix/repair-generated-files.ts](../../../src/lib/gen/autofix/repair-generated-files.ts): mirror för preflight-paritet.

**Tester:** [src/lib/gen/autofix/rules/r3f-vector-tuple-fixer.test.ts](../../../src/lib/gen/autofix/rules/r3f-vector-tuple-fixer.test.ts) — 7 cases (idempotens, JSX-skip, no-import-skip, multi-element-args-skip).

## Delfix 2 — Lär LLM-fixern om R3F

**Fil:** [src/lib/gen/autofix/fixer-prompt.ts](../../../src/lib/gen/autofix/fixer-prompt.ts)

`FIXER_SYSTEM_PROMPT` har en ny punkt 7 ("React Three Fiber / three.js typing pitfalls") som täcker:

- `as const` på objekt/variabel-lagrade Vector3-tuples
- `import type { Group, Mesh } from "three"` för ref-typing
- `useRef<Group>(null)` istället för `useRef<Group | null>(null)`

Hålls ~3 rader för att inte svälla systemprompten.

## Delfix 3 — Gate-aware `no_improvement`-policy

**Fil:** [src/lib/gen/verify/server-repair-policy.ts](../../../src/lib/gen/verify/server-repair-policy.ts)

`resolveServerRepairEarlyStopReason` accepterar nu två nya optional-input:

- `contentChanged: boolean` — `false` → bail som `no_improvement` (inget poäng att fortsätta om LLMen returnerade identiska bytes).
- `gateFailureSignals: number` — antal quality-gate context-rader. När `errorsBefore === 0` (esbuild ser inget) men `gateFailureSignals > 0` (gate failade) och content ändrats → returnera `continue` istället för `no_improvement`.

Backwards compatible: båda defaultar till värden som ger gammalt beteende.

**Caller:** [src/lib/gen/verify/repair-loop.ts](../../../src/lib/gen/verify/repair-loop.ts) ~rad 605-665 — beräknar `contentChanged` (LLM-input vs LLM-output OR pre/post pass) och skickar `repairContextLines.length` som `gateFailureSignals`.

**Tester:** [src/lib/gen/verify/server-verify.test.ts](../../../src/lib/gen/verify/server-verify.test.ts) — 3 nya cases (byte-identical bail, gate-only continue, legacy no-improvement preserved).

**Step 4.3 (planen):** Verifierat att `failedOutputs` (inkl. typecheck/build stderr) redan feedas in via `buildRepairLogContextLines` → `buildGroupedRepairErrorContext`. Ingen kodändring behövdes.

## Hur framtida pattern-tillägg görs

1. Lägg en ny rule under `src/lib/gen/autofix/rules/<rule-name>.ts` (mönster i `as-const-boolean-keys.ts` eller `r3f-vector-tuple-fixer.ts`). Hålla regex/AST konservativ — bara matcha när du är 100% säker på intent.
2. Wira in i `pipeline.ts` per-file-loop (välj plats utifrån vilka andra fixers kan trigga på samma kod).
3. Wira in i `repair-generated-files.ts` om preflight-paritet behövs.
4. Lägg minst 3 unit-tester (positive, idempotens, false-positive-skip).
5. Om felet handlar om typcheck/build (inte syntax), fundera på om LLM-fixer-prompten också ska få kunskap (samma fil i fas 3) — autofix är cheap men icke-uttömmande.

## Vad detta INTE löser

- **`autofix_heavy_load` warning** triggades på 6 fixes; tröskeln 5 är fortfarande relevant och ska användas som leading indicator för andra LLM-instabilitetsmönster (inte just R3F-tuples).
- **P26 follow-up orchestration glitch** (`build_intent_promoted` triggar fortfarande på follow-ups). P26-paketet ligger som "kod levererad, väntar på review + push" — inte berört här.
- **Filnamn vs intent-mismatch** (`flying-meatball-canvas.tsx` renderar `CocaColaCan`). Ett separat orchestrerings-problem; inte autofix-territorium.

## Status per delfix

| Delfix | Implementerad | Testad | Wired |
|---|---|---|---|
| 1: r3f-vector-tuple-fixer | Ja | 7/7 vitest | pipeline.ts + repair-generated-files.ts |
| 2: FIXER_SYSTEM_PROMPT R3F-sektion | Ja | n/a (prompt-text) | (används vid varje LLM-fixer-anrop) |
| 3: gate-aware `no_improvement` | Ja | 3 nya cases (18 totalt i server-verify.test) | repair-loop.ts uppdaterad |
