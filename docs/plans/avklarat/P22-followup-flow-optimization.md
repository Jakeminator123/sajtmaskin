---
id: P22
title: Follow-up flow optimization — assert, lock, inherit, LLM safety net
status: done
created: 2026-04-20
priority: high
wave: 1
parallel_safe_with: [P21, P24, P25]
blocked_by: []
owner_files:
  - src/lib/hooks/useInitBrief.ts
  - src/lib/providers/own-engine/follow-up-clarification.ts
  - src/lib/providers/own-engine/follow-up-clarification.test.ts
  - src/lib/gen/orchestrate.ts
  - src/lib/gen/scaffold-variants/matcher.ts
  - src/lib/gen/scaffold-variants/matcher.test.ts
read_only_files:
  - src/app/builder/useBuilderPromptActions.ts
  - src/lib/api/engine/chats/chat-message-stream-post.ts
  - src/lib/gen/system-prompt.ts
validator_hooks:
  - { kind: file-contains, target: src/lib/hooks/useInitBrief.ts, expect: "if (chatId && options.forceDeepBrief)" }
  - { kind: file-contains, target: src/lib/providers/own-engine/follow-up-clarification.ts, expect: "classifyFollowUpIntentWithLlmFallback" }
  - { kind: file-contains, target: src/lib/gen/orchestrate.ts, expect: "inheritQualityTargetFromPriorVersion" }
  - { kind: file-contains, target: src/lib/gen/scaffold-variants/matcher.ts, expect: "lockedVariantForFollowUp" }
  - { kind: npm-script, target: typecheck }
  - { kind: npm-script, target: "test:ci" }
deviations_from_plan:
  - id: chatId-in-prompt-assist-types
    file: src/lib/hooks/prompt-assist-types.ts
    change: "+1 rad: optional `chatId?: string | null` på `InitBriefOptions`"
    reason: |
      Hård guard i useInitBrief.ts (steg 1) kräver att callern kan skicka in chatId
      via options. prompt-assist-types.ts är de-facto kontraktsfilen för useInitBrief.ts
      men listades inte i owner_files. Ändringen är typ-only och bakåtkompatibel
      (fältet är optional), så scope-svällning bedömdes minimal jämfört med att
      stoppa hela P22.
  - id: caller-side-wiring-deferred-to-P22b
    file: src/lib/api/engine/chats/chat-message-stream-post.ts
    change: "Inte rörd — wiring av priorQualityTarget + followUpIntent + persistedVariantId till orchestrate-callern"
    reason: |
      Filen är read-only enligt P22. Helpers (inheritQualityTargetFromPriorVersion,
      lockedVariantForFollowUp) + optional fält på OrchestrationInput är på plats
      och unit-testade, men callern levererar dem inte än. Konsekvens: stream-route-
      testet "ignores persisted scaffold lock for clear-redesign follow-ups in auto
      mode" fortsätter falla på samma sätt som på baseline. Wiring flyttas till en
      separat plan **P22b** som äger chat-message-stream-post.ts.
---

# P22 — Follow-up flow optimization

## Roll & uppgift

Du är en Cursor-agent. Stoppa fyra konkreta slöserier i follow-up-flödet som syntes i loggen från 2026-04-20:

| Observation | Bevis i logg |
|---|---|
| `promptAssistDeep:true` echoas även när klienten skippar brief | `Follow-up prompt assist + strategy (request meta)` |
| Prompt växer 1.8 kB → 71 kB vid follow-up | `promptLength: 71339, originalPromptLength: 1799` |
| `scaffoldVariant` byter `warm-local → corporate-grid` mellan v1 och v2 | `scaffoldVariant: 'corporate-grid'` (init: `warm-local`) |
| `quality_target_promoted_for_multipage` körs igen vid follow-up | `generationMode: 'followUp'` i samma logg |

## Filer

| Får ändras | Får läsas (read-only) |
|---|---|
| `src/lib/hooks/useInitBrief.ts` | `src/app/builder/useBuilderPromptActions.ts` |
| `src/lib/providers/own-engine/follow-up-clarification.ts` (+ `.test.ts`) | `src/lib/api/engine/chats/chat-message-stream-post.ts` |
| `src/lib/gen/orchestrate.ts` | `src/lib/gen/system-prompt.ts` (P23 äger denna) |
| `src/lib/gen/scaffold-variants/matcher.ts` (+ `.test.ts`) | |

## Steg

1. **Hård guard i `useInitBrief.ts`**: efter `normalizedModel`-resolve, före brief-call:
   ```ts
   if (chatId && options.forceDeepBrief) {
     throw new Error("forceDeepBrief is init-only — use shallow brief on follow-ups");
   }
   ```
2. **LLM safety net** (`follow-up-clarification.ts` + test): ny export `classifyFollowUpIntentWithLlmFallback(message, options)`. Returnerar samma `FollowUpIntentMode`. När regex-klassen är `neutral` OCH `message.split(/\s+/).length >= 80`, ring `gpt-4.1` via `createDirectModel` med 2 s timeout för double-check. Cache per chatId + messageHash så samma meddelande inte ringer två gånger.
3. **Quality-target inheritance** (`orchestrate.ts`): ny helper `inheritQualityTargetFromPriorVersion(chatId, baseSpec)`. När `generationMode === 'followUp'` och prior accepterad version finns, läs `qualityTarget` från den istället för att räkna om från scratch. Faller tillbaka till nuvarande beteende när prior saknas.
4. **Variant-lock** (`scaffold-variants/matcher.ts` + test): ny export `lockedVariantForFollowUp(chatId, intent)`. Om `intent !== 'clear-redesign'`, returnera prior versions variant. Annars kör vanlig matcher. Anropa från `orchestrate.ts` follow-up-grenen.

## Icke-scope

- Ingen ändring av prompt-storleksbegränsning eller diff-baserad systemprompt (separat framtida plan).
- Ingen ändring av `system-prompt.ts` (P23 äger).
- Ingen ändring av regex-listorna `FOLLOW_UP_*` — bara LLM-fallbacken läggs ovanpå.

## Acceptans

| # | Kommando / Kontroll | Förväntat |
|---|---|---|
| 1 | Nytt enhetstest: anrop med `chatId="x"` + `forceDeepBrief:true` | Kastar med exakt strängen `"forceDeepBrief is init-only — use shallow brief on follow-ups"` |
| 2 | Nytt test för LLM-fallback med 90-ords prompt + regex returnerar `neutral` | Mock-LLM anropas och dess returvärde används |
| 3 | Nytt test för variant-lock: två follow-ups `intent:'clear-refine'` | Samma variant båda gångerna |
| 4 | Nytt test för variant-lock: en follow-up `intent:'clear-redesign'` | Ny variant tillåts |
| 5 | Nytt enhetstest för `inheritQualityTargetFromPriorVersion` | Returnerar prior-värdet, inte recomputed |
| 6 | `npm run typecheck` + `npm run test:ci` | exit 0 |
