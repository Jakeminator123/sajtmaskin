# Track W3 — Own-engine remediation

**Källa:** `.j_to_agent/2.txt`, `src/app/api/v0/chats/**/stream`, `src/lib/providers/own-engine/**`, `src/lib/own-engine/**`  
**Parallellt med:** W4 (scripts) om du **inte** behöver röra samma stream-routes som en annan agent.  
**Verifiering:** `npm run typecheck && npx vitest run`

---

## Uppdrag för worker-agent

1. Välj **en sammanhängande** grupp `[ ]`-punkter nedan (eller de du fått explicit av orchestratorn).
2. Implementera; håll legacy v0-provider **isolera**d — flytta inte ihop own-engine och v0 i samma klass utan adapter/boundary.
3. När klart: sätt `- [x]` på varje punkt du **faktiskt** levererat i **den här filen**.
4. Om du rört stream-routes: kör befintliga route-tester + egna golden/unit om du lagt till.
5. Uppdatera `external-review-remediation-progress.md` (segment **Own-engine** + **Whole vision** om relevant).
6. Notera datum/rad i `MASTER-ROADMAP.md` → tabellen *Orchestrator / verifiering*.

---

## Levererat i repo (bocka inte av om du bara läser — ska redan vara `[x]`)

- [x] Ta bort oanvända `STREAM_RESOLVE_MAX_ATTEMPTS` / `STREAM_RESOLVE_DELAY_MS` från båda stream-routes
- [x] `createOwnEnginePlanModeResponse` utan redundant `modelId`-param (planner från `resolvePhaseModel`)
- [x] `createGenerationPipeline` i `src/lib/gen/generation-pipeline.ts`; `fallback.ts` re-export
- [x] Delad `createPreGenerationContractGateReadableStream` (`pre-generation-contract-gate.ts`)
- [x] Finalize: assistant efter merge + preflight; `deleteEngineMessage` vid misslyckad draft-version (+ Vitest)
- [x] Golden: `pre-generation-contract-gate.golden.test.ts` (eventordning, new-chat vs follow-up meta)
- [x] `buildOwnEngineGenerationStreamMeta` i `own-engine-build-session.ts` (+ `own-engine-build-session.test.ts`)

---

## Återstår (prioriterad ordning — bocka när klart)

### Session / tunna routes

- [x] **Contract-gate params:** hjälpfunktion i `src/lib/own-engine/session/` som bygger `PreGenerationContractGateReadableStream`-anrop från gemensamma fält (minska upprepning i `stream/route.ts` och `[chatId]/stream/route.ts`)
- [x] **Plan-mode gren:** `own-engine-plan-mode.ts` — `computePlanModePlannerPrompts`, `createPlanModePipelineStream`, `resolvePlanModePlannerModelId`, `logPlanModeGenerationStart`; båda `stream`-routes; `own-engine-plan-mode.test.ts`
- [x] **Generation start:** `createOwnEnginePipelineAndGenerationStream` i `own-engine-pipeline-generation.ts` — samlar `createGenerationPipeline` (med `getAgentTools`) + `createOwnEngineGenerationStream`; meta byggs med `buildOwnEngineGenerationStreamMeta` i routes; session-build-filen utan tung `generation-stream`-import för enhetstester

### Robusthet / data

- [x] **Transaktionell finalize:** `addAssistantMessageAndCreateDraftVersion` i `chat-repository-pg.ts` (en transaktion: assistant-rad + `engine_versions`); `finalizeAndSaveVersion` anropar den; `finalize-version.test.ts` (lyckad persist + avvisad transaktion utan `deleteEngineMessage`)
- [x] **Fel efter lyckad version:** dokumenterat i JSDoc på `finalizeAndSaveVersion` — efter lyckad transaktion är telemetri / generation-log / preflight-loggar best-effort; version + meddelande rullas inte tillbaka om dessa steg misslyckas

### Tester

- [x] **Fler golden / integrationstester** för **generation**-SSE (inte bara contract-gate): `generation-stream.golden.test.ts` — inspelad pipeline-SSE (`content` + `done`), mockad `finalizeAndSaveVersion` + `db`/sandbox av, låser `chatId` → `meta` → `content*` → `done` och finalize-anrop
- [ ] **Regression:** inga orphan assistant-meddelanden i nya flöden (behåll/utöka tester vid finalize-ändringar)

### Legacy / gränser

- [ ] **v0-provider path:** tydlig adapter bakom provider-resolver; own-engine session anropar inte v0-internals direkt (verifiera med grep + ev. liten refaktor)

---

## Exit-kriterium för spår W3 (för MASTER-ROADMAP Fas A)

Alla `- [ ]` under **Återstår** är `- [x]`, typecheck + vitest grönt, progress-doc uppdaterat, och orchestrator har noterat verifiering i MASTER-ROADMAP.
