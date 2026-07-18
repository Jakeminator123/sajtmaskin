---
id: 2026-04-27-followup-vs-autorepair-lane-collision
status: archived
created: 2026-04-27
linear: null
trigger: Användare skickade kreativ follow-up ("3D-animerad data flyger över fälten") medan föregående version fortfarande hade auto-repair pågående. Repair-LLM:n fick prompten med instruktionen `Make the smallest change that fixes the listed issues. Do NOT change layout, naming, styling, or architecture unless required by the fix.` — vilket SVEK användarens visuella intent och bara körde teknisk reparation. Sajten fixades men 3D-effekten kom aldrig.
---

> Status: Archived
> Not current architecture.
> Do not use as runtime guidance.
> Replaced by: [Init and follow-up](../../concepts/init-and-follow-up.md)

# Follow-up vs auto-repair — lane/intent-kollision

## Symptom

| Observerat | Värde |
|---|---|
| Föregående version | failing (typecheck/preview blocked, syntax + unresolved import) |
| User follow-up | "Gör en 3D-animerad data som flyger runt över alla fälten här" |
| Vad systemet körde | `AUTO-FIX REQUEST — TARGETED REPAIR` med "smallest change, do not change layout/styling" |
| Vad systemet rapporterade | "Källa: Auto-repair (server-driven). Typ: auto-repair. Orsak: Auto-repair efter typecheck/quality-gate" |
| Resultat | Preview/readiness PASS, men 3D-effekten applicerades inte |

## Rotorsak (hypotes)

User-intent och repair-intent kollar mot samma `chatId` / `versionId` men har olika prompt-systemet:

- **Repair-lane:** `runRepairLoop` (server-verify) eller `triggerBuildErrorRepair` får prompt `"smallest change to fix listed issues"`. Den vinner när versionen är `verifying`/`failing`/`repair_available`.
- **User-follow-up-lane:** ny SSE-stream på `/api/engine/chats/<chatId>/stream` borde behandla user prompt som ny generation pass (delta/redesign).

När båda lanes går mot samma version utan koordination svalls user intent av repair-prompt:en. Inget grindlås mellan dem.

## Önskat beteende

| Steg | Vad |
|---|---|
| 1 | Systemet detekterar att target version är failing/repairing när user follow-up kommer in. |
| 2 | Repair körs först (om den inte redan kör) på den failing versionen. När repair är PASS, mark:as den `repair_available`. |
| 3 | User follow-up appliceras på **reparerad version** (eller startar ny version baserad på den). Med USER-prompt (inte repair-prompt). |
| 4 | UI signalerar tydligt: `"Fixar byggfelet först → applicerar din ändring"`. |

## Telemetri som behövs

```
user_followup_deferred_for_repair { chatId, versionId, reason: "version_repairing" | "version_failing" }
user_followup_replayed_after_repair { chatId, repairedVersionId, originalUserPrompt, replayedAt }
followup_swallowed_by_autorepair { chatId, versionId, userPromptPreview, repairPromptUsed }   // detection-only, för att hitta historiska träffar
```

## Spår (när vi får tid)

| Spår | Vad |
|---|---|
| **A — diagnos** | Hitta exakt var i `src/lib/api/engine/chats/<chatId>/stream`-pipelinen user follow-up routas till repair-lane. Sannolika filer: `src/lib/hooks/chat/`, `src/lib/api/engine/chats/`, `src/lib/gen/verify/server-verify.ts` (`triggerBuildErrorRepair`). |
| **B — gate** | När user follow-up kommer in mot en `verifying`/`repair_available`-version: defer user-prompten i kö, kör repair först, replay user-prompt på reparerad version. |
| **C — UX-signal** | UI-meddelande: "Fixar byggfelet först — sen applicerar jag din ändring". |
| **D — telemetri** | Tre events ovan, så vi kan mäta hur ofta detta sker historiskt + post-fix. |

## Definition of done

- User follow-up appliceras alltid på en lyckad version (eller blockas explicit med UI-signal om repair faller).
- Auto-repair-prompt (`smallest change…`) får aldrig svälja en user prompt.
- Telemetri visar `user_followup_replayed_after_repair > 0` när repair-flow triggat.

## Status

`active` — dokumenterad 2026-04-27 medan vi jobbade på P0-protected-paths-fixen. Inte påbörjad. Ingen Linear än.

## Kontext

Bug rapporterad av extern agent under en parallell test-generation. Användarens egna ord: "Min prompt om en 3D-grej gick inte igenom" — efter att ha sett att första generation var failing och fått auto-repair triggad innan follow-up. P0-protected-paths-fixen i samma chat-session täcker INTE denna bug — den handlar om var saker persisteras, inte om vilken prompt LLM:n får.
