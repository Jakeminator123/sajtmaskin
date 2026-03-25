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

- [ ] **Contract-gate params:** hjälpfunktion i `src/lib/own-engine/session/` som bygger `PreGenerationContractGateReadableStream`-anrop från gemensamma fält (minska upprepning i `stream/route.ts` och `[chatId]/stream/route.ts`)
- [ ] **Plan-mode gren:** flytta gemensam plan-mode-kedja (förbered context → planner prompt → `createOwnEnginePlanModeResponse`) till session/hjälp så routes blir tunnare — *en ägare*, ev. två PR-steg om stor diff
- [ ] **Generation start:** en funktion typ `startOwnEngineGenerationStream(...)` som tar färdig `orchestrationBase`, `engineSystemPrompt`, `pipelineStream`-inputs och returnerar `ReadableStream` + säkerställer att meta alltid byggs via `buildOwnEngineGenerationStreamMeta`

### Robusthet / data

- [ ] **Transaktionell finalize:** förbered i minnet → persistera assistant + version atomiskt (eller tydlig pending-flagga) enligt `2.txt`; enhetstest som täcker happy path + misslyckad persist
- [ ] **Fel efter lyckad version:** definiera beteende när version sparats men efterföljande steg failar (ingen “halv” user-upplevelse); dokumentera i kodkommentar eller kort arkitekturstycke

### Tester

- [ ] **Fler golden / integrationstester** för **generation**-SSE (inte bara contract-gate): minst ett scenario med fake timers eller inspelad payload enligt befintlig `generation-stream`-struktur
- [ ] **Regression:** inga orphan assistant-meddelanden i nya flöden (behåll/utöka tester vid finalize-ändringar)

### Legacy / gränser

- [ ] **v0-provider path:** tydlig adapter bakom provider-resolver; own-engine session anropar inte v0-internals direkt (verifiera med grep + ev. liten refaktor)

---

## Exit-kriterium för spår W3 (för MASTER-ROADMAP Fas A)

Alla `- [ ]` under **Återstår** är `- [x]`, typecheck + vitest grönt, progress-doc uppdaterat, och orchestrator har noterat verifiering i MASTER-ROADMAP.
