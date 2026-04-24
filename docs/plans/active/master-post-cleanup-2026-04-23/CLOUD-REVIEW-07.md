# CLOUD-REVIEW-07 — Scenario B: variant-lock end-to-end trace

**Du är cloud-review-agent #07.** READ-ONLY. Producera audit-rapport.

## Din uppgift

Code-walk genom variant-selection-pathen och verifiera att init-versionens `scaffoldVariantId` persisteras + läses tillbaka korrekt vid follow-up.

## Förläs

- `docs/architecture/open-questions.md` #8 (variant_lock_skip-bugg)
- `src/lib/gen/scaffold-variants/registry.ts` + `matcher.ts` + `index.ts`
- `src/lib/gen/orchestrate.ts`
- `src/lib/gen/scaffold-variants/matcher.test.ts`
- `src/lib/api/engine/chats/chat-message-stream-post.ts` (där `[scaffold-variant] variant_lock_skip` log emit:tas)

## Trace att producera

### Init-flödet (chat skapas, första prompt)
1. `selectScaffoldVariant(input)` väljer en variant baserat på prompt
2. Variant-id (t.ex. `corporate-grid`) ska persistas:
   - I `OrchestrationBase`?
   - I `engine_versions`-tabellen (column eller metadata)?
   - I `engine_chats`-tabellen?
3. `version.created`-event borde inkludera variantId

### Follow-up-flödet (chat har existing version, ny prompt)
1. `resolveOrchestrationBase(chatId, baseVersionId)` läser base-version
2. Borde extrahera `priorVariantId` från base-version-data
3. `selectScaffoldVariant(input, { priorVariantId })` försöker locka till samma
4. Förväntat: `[scaffold-variant] variant_lock_succeeded` log emitteras (eller motsvarande)
5. NUVARANDE bug-state: `variant_lock_skip` med `priorVariantId: null`

## Specifika frågor

1. **Var persisteras variantId nu?** Sök efter `scaffoldVariantId` i kod. Vilka filer skriver, vilka läser?

2. **DB-schema:** Behövdes en migration för att lägga till en column? Om ja — finns migration-fil? Är schemas i `docs/schemas/` uppdaterade?

3. **Backward-compat:** För chats skapade FÖRE plan-11-merge utan persisterad variant — vad händer? Faller systemet tillbaka graceful (rolla ny variant) eller throws fel?

4. **`OrchestrationBase`-typ:** Lades fältet till? Sök på `interface OrchestrationBase` eller `type OrchestrationBase`. Vilka filer importerar denna typ — uppdaterades alla?

5. **Test-täckning:** Verifierar `matcher.test.ts` att lock fungerar end-to-end? Eller bara mockad lock-input?

## Tankeexperiment

**Scenario:** chat `b71dafb3` har init-version `c7bad76a` med variant `corporate-grid` (verifierat i logg). Användare gör follow-up.

- FÖRE plan-11: `priorVariantId: null` → variant byts till `warm-local` (random roll)
- EFTER plan-11: ?

Walk koden från `chat-message-stream-post.ts`:
- Var läses `baseVersionId`?
- Hur fetchas base-version-data?
- Var extraheras `scaffoldVariantId`?
- Hur passas det till `selectScaffoldVariant`?

Om någon LÄNK i kedjan saknar varianten → bug-fix är ofullständig.

## Output

Skriv `docs/plans/active/master-post-cleanup-2026-04-23/audit-reports/AUDIT-07-scenario-variant-lock-<agent-id>.md`.

Innehåll:
- Trace-diagram (init-persistens + follow-up-retrieve)
- Svar på 5 frågor
- Edge-cases identifierade
- Sammanfattning: variant-lock-bug ROBUST fixad eller kvar att göra?

## Klart = PR öppnad.
