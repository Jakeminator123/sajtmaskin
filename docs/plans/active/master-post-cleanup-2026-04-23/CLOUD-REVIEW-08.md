# CLOUD-REVIEW-08 — Scenario C + open-questions cross-check

**Du är cloud-review-agent #08.** READ-ONLY. Producera audit-rapport.

## Din uppgift

Två delar:
1. **Scenario C:** code-walk för Bug 3 (capability-modify-existing) end-to-end
2. **Cross-check:** alla 17 open-questions — vilka adresserades av wave 5, vilka är kvar?

## Förläs

- `docs/architecture/open-questions.md` — alla 17 frågor (resolved + aktiva)
- `src/lib/builder/follow-up-capability-detection.ts` (sök på `MODIFY_REFERENCE_MARKERS`)
- `src/lib/providers/own-engine/follow-up-clarification.ts` (intent-classification)
- `src/lib/gen/system-prompt/sections/dossiers.ts` (dossier-injection-skip)
- `docs/plans/active/master-post-cleanup-2026-04-23/CHECKLIST.md`

## Del 1: Scenario C

**Test-prompt:** `"gör pricken till en 3D-kaffekopp som häller kaffe ner i en mugg när jag nuddar den med musen"`

Förväntat efter plan 11:
1. `detectFollowUpCapabilities()` matchar `MODIFY_REFERENCE_MARKERS` på `pricken` + capability `visual-3d` på `3D` → `intent: 'capability-modify'`
2. `classifyFollowUpIntent()` returnerar `capability-modify` (ny variant)
3. `selectDossiersForRequest()` med `capability-modify` flagga → INTE re-injicera dossier-shell
4. System-prompt-builder taggar existing `floating-coffee-overlay.tsx` som "modify this"
5. LLM modifierar existing fil istället för att skapa ny

### Frågor att besvara
1. Är `MODIFY_REFERENCE_MARKERS`-listan komplett? Sök i `follow-up-capability-detection.ts` rad ~163. Täcker den svenska + engelska?
2. Hur hanteras "capability-add" vs "capability-modify" disambiguation? Om prompten har BÅDE add-verb (`lägg till`) OCH modify-marker (`pricken`), vilken vinner?
3. Är `capability-modify` faktiskt ett nytt värde i `FollowUpIntentMode`-typen? Sök efter `FollowUpIntentMode` definition.
4. I `dossier-system/sections/dossiers.ts` — finns en kod-väg som SKIPPAR re-injection när intent är `capability-modify`?
5. Existing scen-filen — hur identifieras den? Per capability-id mappad till filnamn-pattern?

## Del 2: Open-questions cross-check

För varje av 17 frågor i `open-questions.md`:

| # | Resolved av wave 5? | Bevis (commit-sha eller fil + rad) |
|---|---|---|
| 1 | ❌/✅ | |
| 2 | (post-wave-5) | |
| 3 | ❌/✅ | |
| ... | ... | ... |
| 17 | ❌/✅ | |

Specialfall:
- Frågor markerade som `✅ resolved` redan — verifiera att de FAKTISKT är fixade (inte bara markerade)
- Frågor markerade `❌` — fanns en wave-5-fix som råkade adressa dem oavsiktligt?
- Frågor `🚀` (game-capability) och `💡` (UX) — de är post-wave-5; inget att verifiera

## Output

Skriv `docs/plans/active/master-post-cleanup-2026-04-23/audit-reports/AUDIT-08-capability-modify-and-open-questions-<agent-id>.md`.

Innehåll:
- **Del 1:** Scenario C code-walk + svar på 5 frågor
- **Del 2:** Tabell med 17 open-questions × wave-5-status × bevis
- Sammanfattning: vilka frågor är kvar för plan 12 vs post-wave-5?

## Klart = PR öppnad.
