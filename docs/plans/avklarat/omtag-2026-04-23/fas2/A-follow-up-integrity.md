---
id: omtag-fas2-A-follow-up-integrity
title: Follow-up integrity — ett predicate, ett kontrakt, synlig basversion
phase: 2
priority: P1
parallell_med: [fas2-D-dossier-contract]
blockerad_av: [03-wave-split-heatspots]
estimat: "1–1,5 dag"
owner_files:
  - src/lib/gen/follow-up-predicate.ts (ny)
  - src/lib/gen/orchestrate.ts
  - src/lib/api/engine/chats/chat-message-stream-post.ts
  - src/lib/gen/stream/finalize-merge.ts
  - src/lib/gen/system-prompt/** (en sektion — efter 03:s split)
  - src/components/builder/** (P19 Steg 3 — basversions-indikator)
  - src/lib/hooks/chat/useSendMessage.ts
  - tester för ovanstående
---

# Fas 2·A — Follow-up integrity

## Mål

Gör follow-ups semantiskt pålitliga genom att konsolidera tre separata svar på frågan *"är detta en follow-up?"* till **ett** kontrakt, stänga kvarvarande P26-buggen (`build_intent_promoted` triggar på follow-ups trots PR1-merge), och göra basversionen synlig för användaren (P19 Steg 3).

## Varför det här

Fatigue-agentens och guldrapportens samstämmiga fynd: samma beslut fattas i tre lager (`orchestrate.ts:381`, `chat-message-stream-post.ts:777`, `finalize-merge.ts:41`) och de kan drivja isär vid kantfallet `persistedScaffoldId + previousFilesCount === 0`. Resultat: race vid första lyckade init + följdbuggar i scaffold-lock.

Guldrapporten kallar detta "den mest värdefulla agenten" — det angriper både verkliga regressionskänslor (`build_intent_promoted`-bugget + stale basversion) och faktisk scaffold/build-intent-drift.

## Scope

| In | Ut |
|---|---|
| Ny `src/lib/gen/follow-up-predicate.ts` med två typade predikat | Lägga till nya guards / flaggor |
| Fixa kvarvarande P26-bugg (`build_intent_promoted` ska inte trigga på follow-ups) | Full P32-förgrening (det är parkerat) |
| P19 Steg 3 — UI-indikator "du redigerar version X, inte senaste Y" | Byta preview-arkitektur |
| E1 — ta bort duplikat-prosan i follow-up-prompten (~900 tecken sparade per call) | Större refaktor av `system-prompt`-compose (03 äger det) |

## Inputs

1. `gpt_review/filer/E-easy-medium-layer.md` — **E1** (rad 309–328) + **E2** (rad 330–361) — konkreta sub-problem, exakta rader
2. `gpt_review/filer/P26-followup-orchestration-glitch.md` — hela (om `build_intent_promoted`-buggen)
3. `gpt_review/filer/P19-old-content-ingress.md` — Steg 3 (UX-transparens, `engineBaseVersionId`)
4. `gpt_review/filer/repo_assessment_2026-04-23.md` sektion "Agent A"
5. **Dagens master:**
   - `src/lib/gen/orchestrate.ts` (rad ~381 — `generationMode`-resolution)
   - `src/lib/api/engine/chats/chat-message-stream-post.ts` (rad ~777 — `followUp`-derivation, rad ~438–474 — element-preservation-reminder)
   - `src/lib/gen/stream/finalize-merge.ts` (rad ~41 — `Boolean(previousFiles && previousFiles.length > 0)`)
   - `src/lib/gen/system-prompt.ts` eller `src/lib/gen/system-prompt/` (rad ~481–497 — "Generation Mode: Follow-Up"-sektionen, kan ha flyttats av 03)

## Exekveringssteg

### Steg 1 — E2: enhetlig predicate

Skapa `src/lib/gen/follow-up-predicate.ts`:

```ts
export function deriveFollowUpStateFromInputs(input: {
  persistedScaffoldId: string | null | undefined;
  previousFilesCount: number;
}): {
  hasMergeablePrevious: boolean;       // för finalize-merge: "finns filer att merga mot"
  isOrchestrationFollowUp: boolean;    // för orchestrate + stream: "kör follow-up-pipeline"
};
```

Båda predikat exponeras separat så semantiken är **explicit** per callsite. Ersätt tre call-sites. Lägg till test för kantfallet `persistedScaffoldId="landing-page", previousFilesCount=0` → `isOrchestrationFollowUp=false, hasMergeablePrevious=false`.

### Steg 2 — P26-rest: `build_intent_promoted` på follow-ups

Läs P26-planen för exakt diagnos. Implementera fix-patchen + regress-test som pinar att follow-ups **inte** trippar `build_intent_promoted`-SSE-eventet även när scaffold-match är tvetydig.

### Steg 3 — E1: ta bort prompt-duplikaten

`chat-message-stream-post.ts` rad ~438–474: korta `elementPreservationReminder` på user-turn till en enradslänk *"(Follow-up rules: see system prompt § Generation Mode: Follow-Up.)"* — eller ta bort helt om systempromptens regler räcker. Behåll regeln i system-prompten.

**Mät:** token-budget per follow-up ska minska med ~250 tokens (verifiera via prompt-dump-filer om sådana sparas i devlog).

### Steg 4 — P19 Steg 3: basversions-indikator

I builder-UI:n: visa tydligt vilken `engineBaseVersionId` follow-up bygger på. Om basen ≠ latest: render badge "du redigerar version X (inte senaste Y)". Säkerställ att sändflödet skickar `engineBaseVersionId` så servern kan loggföra.

**Telemetri redan på plats:** `followup_base_resolved{reason}` (P19 Steg 1, commit `d817227f6`) — UI läser samma källa.

## Får INTE göras

- Starta på L1 (`runUnifiedRepair`), L2 (PromptKit), L3 (dossier-variants), P32 Fas B-F — de är parkerade (se `OMTAG/PARKED.md`).
- Ändra ingen `system-prompt.ts`-struktur utöver den specifika duplikat-raderingen. 03 äger refaktoren; om 03 redan flyttat sektionen till `system-prompt/sections/follow-up-mode.ts` — rör den filen, inte moduler runt.
- Introducera inga nya SSE-events. P26-fixen justerar befintlig `build_intent_promoted`-trigger, inte lägger till ett nytt event.
- Ingen ny env-flagga. Cut over.

## Acceptance criteria

- [ ] `follow-up-predicate.ts` finns + test (≥ 4 scenarier inkl. kantfallet).
- [ ] De tre callsites använder predikaten — `rg "previousFiles.*length.*>" src` returnerar inga follow-up-härledningar utanför predicate-modulen.
- [ ] P26-regress-test pinar att `build_intent_promoted` inte triggar på follow-up.
- [ ] E1: token-minskning mätbar (≥ 200 tokens per follow-up).
- [ ] P19 Steg 3 UI-badge renderar korrekt vid bas ≠ latest (manuell verifiering + component-test).
- [ ] `npm run typecheck` + `npm run lint` + `npx vitest run` grönt.
- [ ] Eval-baseline (02) — inga regressions på `followup-*`-prompts om sådana finns, annars ingen regress på init-prompts.
- [ ] Linear: SAJ-22 uppdaterad eller stängd.

## Branch

`omtag/fas2-A-follow-up-integrity`
