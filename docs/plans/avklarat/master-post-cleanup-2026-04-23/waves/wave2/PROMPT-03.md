# Du är plan-03-agenten — followup_technical reason + verifier truth (REVISED, SHORT scope)

## Din roll och kontext

Du är en autonom kodagent i en isolerad git worktree på branchen `plan-03-followup-technical-short` i Sajtmaskin-repot. Du arbetar **parallellt** med plan-05-agenten i wave 2. Ni rör inte varandras filer (se hårda begränsningar nedan). När du är klar öppnar du PR mot `master` med `gh pr create`.

**Viktigt:** Plan 03 är **nedskalad till `short`** efter plan 01-smoke. Klassificeringen av `followup_technical` vs `followup_general` funkar redan korrekt. Den enda faktiska buggen är att **auto-repair-passen maskerar sig som user-driven follow-ups** med klen reason-text. Du ska göra en **kirurgisk fix** av det specifika spåret + tester som fastnar regression.

## Repo-state du ärver

- HEAD: `master @ <senaste plan-02-merge>` (du startas efter plan 02 är mergad)
- Plan 01 (smoke) bekräftade att `followup_technical` är **rätt klass** för riktiga tekniska follow-ups (3D-koppen via inspector klassades korrekt). Inte fel klassningssystem.
- Plan 02 har precis städat upp builder-UI och cross-file-stub-warning. Använd modal-ytan plan 02 lämnade efter sig — bygg INTE om den.
- Läs `STATUS-01-rollout-and-smoke.md` för konkreta fynd. Speciellt avsnittet "STORT FYND för plan 03" + "Specifikt för plan 03 (followup_technical)".

## Den faktiska buggen (din input)

När typecheck/quality-gate failade i Run 1 (init kaffe-landningssida), triggades server-repair-lanen automatiskt. Server-repair byggde en synthetic "AUTO-FIX REQUEST — TARGETED REPAIR…"-prompt med error-detaljer och **skickade den genom samma kodväg som en user-driven follow-up**. Det resulterade i att UI:t visade:

```
Byggprofil: Lagom
…
Typ: followup_technical
Längd: 2327 tecken
Orsak: Registry-data bevarad oförändrad
```

Användaren såg en helt ny generering "ploppa fram" utan att förstå varför.

**Fixens kärna:** Skilj **auto-repair-pass** från **user-driven follow-up** i (a) klassificering och (b) UI-presentation.

## Var du börjar leta

Du måste själv verifiera varje filplats:

- **Reason-mapping (UI-text):** `src/lib/hooks/chat/helpers.ts:873-893` — `formatPromptStrategyReason` mappar `preserve_registry_payload` → `"Registry-data bevarad oförändrad"`. Här bör en ny `auto_repair` reason läggas till med klar text.
- **Prompt-type discriminator:** `src/lib/builder/promptOrchestration.ts` — `PromptType`-union i toppen. Du behöver troligen lägga till `"auto_repair"` (eller `"server_repair"`) som ny variant, ELLER ett separat `source: "user" | "auto_repair"`-fält som flödar parallellt med `promptType`.
- **Server-repair-lanen som triggar synthetic follow-up:** `src/lib/gen/verify/repair-loop.ts` (LLM-server-repair) + `src/lib/gen/verify/server-verify.ts` + `src/lib/providers/own-engine/generation-stream-post-finalize.ts` — sök på callsites som tillverkar och submitterar repair-prompt.
- **Stream-handlers som tar emot prompten i chat-flödet:** `src/lib/hooks/chat/stream-handlers.ts`, `src/lib/api/engine/chats/chat-message-stream-post.ts`.
- **Generation log writer:** `src/lib/logging/generation-log-writer.ts` — bekräfta att event-emissionen får rätt `promptType` så observability speglar sanningen.
- **UI-rendering:** `src/components/builder/MessageList.tsx`, `src/lib/hooks/chat/helpers.ts` (`buildPromptStrategySteps`) — där "Typ: …" visas.

## Planens nya, smala mål

1. **Inför `auto_repair` som distinkt signal** (välj antingen ny `promptType` eller separat `source`-fält — välj det som ger minst churn).
2. **Mappa till klar reason-text:** "Auto-repair efter typecheck/quality-gate" istället för "Registry-data bevarad oförändrad".
3. **UI visar tydligt** när det är auto-repair (t.ex. ändrad färg/icon på bygprofil-displayen, eller en explicit rad "🔧 Auto-repair").
4. **Regressionstester:**
   - Ett test som skickar in en synthetic auto-repair-prompt och verifierar att UI-meta innehåller `auto_repair`-discriminator.
   - Ett test som verifierar att riktig user-driven `followup_technical` (t.ex. "lägg till en kontaktform med valideringsfält") fortfarande klassas som `followup_technical`, inte `auto_repair`.
   - Ett test som verifierar att `followup_general` (kontaktform-prompten från smoke) fortfarande klassas korrekt.

## Hårda begränsningar

- Rör INTE filer som plan-05-agenten äger denna våg (autofix-konsolidering): `src/lib/gen/autofix/pipeline.ts`, `src/lib/gen/autofix/fixer-registry.ts`, `src/lib/gen/autofix/llm-fixer.ts`, `src/lib/gen/autofix/validate-and-fix.ts`. Du **får** läsa repair-loop.ts (och troligen ändra hur den signalerar source/type), men **inte** röra autofix-pipeline-strukturen.
- Rör INTE filer plan 02 just landat i (du ska se dem som givna): se plan 02-PR:s diff. Speciellt `src/components/builder/ThinkingOverlay.tsx`, `src/components/builder/preview-panel/`, `src/lib/gen/stream/finalize-merge.ts` cross-file-stubbing-warning-koden.
- Maxbudget: ~10 filer rörda. Föredra för lite framför för mycket.
- Bygg INTE en stor verifier-arkitektur. Detta är en label-fix, inte en verifier-omtag.

## Acceptans

- Synthetic auto-repair-pass visas i UI med tydlig "auto-repair"-signalering, INTE som "Typ: followup_technical Orsak: Registry-data bevarad oförändrad".
- Riktiga user-driven follow-ups (`followup_general`, `followup_technical`) klassas oförändrat.
- Generation log (observability.json) speglar source-discriminatorn så observatoriet kan filtrera bort auto-repair-pass från follow-up-statistik.
- 3 regressionstester finns och passerar.

## Workflow

1. **Sätt en kort plan** (vilka filer + varför) innan du kodar.
2. **Implementera** kirurgiska ändringar.
3. **Skriv tester.**
4. **Kör `npm run lint && npm run typecheck && npm run test:ci`** (eller motsvarande). Inga regressioner.
5. **Commit** i logiska steg med prefix `plan-03:`.
6. **Skriv `STATUS-03-followup-technical.md`** i `docs/plans/active/master-post-cleanup-2026-04-23/` med:
   - vad du faktiskt ändrade (filer + kort varför)
   - före/efter-exempel på UI-text
   - bekräftelse att planen blev `short`, inte `full`
7. **Push branchen** och **öppna PR mot master** med `gh pr create`. PR-titel: `plan 03 (short): distinguish auto-repair from user-driven followup_technical`.

## Stoppregler

- Om du upptäcker att discriminator-fältet kräver migration genom flera lager (server → DB → UI) som blir > 10 filer: STOPPA, dokumentera i STATUS-03 och föreslå att bara UI-mapping fixas (lägg `auto_repair` reason-text).
- Om plan-02-koden visar sig krocka med din ändring: STOPPA, beskriv och vänta.

## Klart =

PR är öppnad mot master, STATUS-03 är committad, branchen är pushad.
