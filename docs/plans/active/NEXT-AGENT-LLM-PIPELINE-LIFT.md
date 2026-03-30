# Handoff: vad nästa agent ska göra för att «lyfta» LLM-kedjan

Kopiera blocket under **«Prompt till agent»** till nästa session. Källsanning: [`LLM-PIPELINE-MILESTONE-AND-REVIEW-RUNBOOK.md`](./LLM-PIPELINE-MILESTONE-AND-REVIEW-RUNBOOK.md) + extern review (sammanfattad i den filen).

## Redan gjort (baseline + första uppföljning)

- Git-milstolpe: tag `milestone/llm-pipeline-baseline-59820639` → commit `59820639b`.
- **B1:** `_lastMaterializedUrls` uppdateras varje `materializeImages`-körning; tom `Set` vid fel (`finalize-version.ts`).
- **B4 (delvis):** `done` före `sandbox-ready` dokumenterat i `docs/architecture/builder-generation.md`.
- Pipeline-kontrakt, stream-refaktor, prompt om merge/ intention finns på `master` före/ runt milstolpen.

## Prioriterad backlog (gör i ordning)

1. **B2 — en fas-vokabulär**  
   - Canonical: `OwnEnginePostStreamPhaseId` i `src/lib/gen/stream/finalize-pipeline-contract.ts`.  
   - Mål: `finalizeAndSaveVersion` `onProgress` ska emittera **samma id:n** (eller ett tunt lager som mappar 1:1), inte parallella namn som `validation` vs `validate_syntax`.  
   - Uppdatera `src/lib/hooks/chat/stream-handlers.ts` (och ev. UI) så användartexter mappas **på ett ställe** från canonical id.  
   - Verifiering: `npm run test:ci`; manuell generering och kontroll av progress-rader.

2. **B3 — integration-SSE vs typkontrakt**  
   - Antingen: ändra emitterad form till det `BuilderIntegrationPayload` beskriver, **eller** uppdatera `src/lib/gen/stream/builder-stream-contract.ts` så typerna matchar `{ items: [...] }` och dokumentera.  
   - Minska beroendet av `coerceIntegrationSignals` som enda sanning.  
   - Verifiering: typecheck + stream-test / manuellt `suggestIntegration`.

3. **Review / produkt**  
   - Följ [`PROJECT-STATE-AND-DIRECTION.md`](./PROJECT-STATE-AND-DIRECTION.md) för preview/sandbox/K-019; uppdatera tabellen när B2/B3 är klara.  
   - Överväg: tydligare quality-gate policy (när får repair triggas) — separat planrad om scope växer.

## Obligatorisk verifiering efter ändringar

```bash
npm run typecheck
npm run test:ci
```

---

## Prompt till agent (kopiera nedan)

```
Du arbetar i Sajtmaskin (Next.js builder, own-engine codegen). Mål: lyfta LLM/stream-kedjan enligt intern + extern review.

Läs först:
- docs/plans/active/LLM-PIPELINE-MILESTONE-AND-REVIEW-RUNBOOK.md (Del B, tabell B2–B4)
- docs/architecture/builder-generation.md (SSE-livscykel)
- src/lib/gen/stream/finalize-pipeline-contract.ts

Implementera i ordning:
1) B2: Canonical fas-id:n från finalize-pipeline-contract genom finalize onProgress → stream-handlers; en central mappning till svenska etiketter.
2) B3: Aligna builder-stream-contract med faktisk integration-payload (eller ändra emission).

Efter varje steg: npm run typecheck && npm run test:ci. Håll diff fokuserad; uppdatera runbook/PROJECT-STATE när en rad stängs.
```
