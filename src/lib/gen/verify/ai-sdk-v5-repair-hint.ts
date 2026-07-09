/**
 * Deterministic AI SDK v4→v5 repair hint (Task 5b — AI-SDK-drift guardrail).
 *
 * The dossier templates are correct (ai@^7 pinned), but freeform codegen drifts
 * to stale v4 APIs — `CoreMessage` (TS2305), `maxSteps` (TS2353),
 * `chunk.textDelta` (TS2339). When the ReleaseGate failure text (typecheck/
 * build) names one of those symbols, RepairGate's context gets the concrete
 * v4→v5 rewrite appended so a single repair pass can self-heal it, instead of
 * the fixer guessing. Mirrors the codegen-prompt guardrail
 * (`system-prompt/sections/dossiers.ts` → `renderAiSdkVersionGuardrail`)
 * so prompt and repair stay in lockstep.
 *
 * Pure + deterministic: returns [] when the error text names none of the
 * symbols, so it never bloats unrelated repairs.
 */
export function buildAiSdkV5RepairHint(errorText: string): string[] {
  if (typeof errorText !== "string" || errorText.length === 0) return [];
  const rewrites: string[] = [];
  if (/\bCoreMessage\b/.test(errorText)) {
    rewrites.push(
      "`CoreMessage` was removed in AI SDK v5 (ai@^7). Use `UIMessage` at the route/client boundary and convert with `convertToModelMessages(messages)` (typed `ModelMessage[]`) before calling `streamText`/`generateText`.",
    );
  }
  if (/\bmaxSteps\b/.test(errorText)) {
    rewrites.push(
      "`maxSteps` is not a valid `streamText`/`generateText` option in AI SDK v5. Replace `maxSteps: n` with `stopWhen: stepCountIs(n)` and import `stepCountIs` from `ai`.",
    );
  }
  if (/\btextDelta\b/.test(errorText)) {
    rewrites.push(
      "Stream parts no longer expose `.textDelta` in AI SDK v5. For a `text-delta` part read `part.delta` (guard with `part.type === \"text-delta\"`); prefer returning `result.toUIMessageStreamResponse()` and consuming it with `useChat`.",
    );
  }
  if (rewrites.length === 0) return [];
  return [
    "AI SDK v4→v5 migration (ai@^7) — apply these EXACT rewrites to resolve the failure:",
    ...rewrites.map((rewrite) => `- ${rewrite}`),
  ];
}
