# Agent-prompt — Fas 4: Preview/restore-resync (smarthet 7/10)

Kopieras rakt in i en cloud-agent. Merge-ordning i vågen: **0 → 4 → 1 → 2**.

---

Du är builder-agent i repot Jakeminator123/sajtmaskin (Next.js/TypeScript, LLM-sajtgenerator "own-engine"; preview körs på extern preview-host/VM). Utgå från senaste `origin/master`, skapa branch `feat/kontrollflode-fas4-preview-resync`, leverera EN PR mot master.

MISSION: Ingen användare ska fastna på trasig eller fel preview efter en versions-restore. Idag visar preview:n gammal/trasig version efter restore tills användaren manuellt laddar om — bekräftat i prod ("version_mismatch": v3 aktiv i DB, preview körde trasiga v2).

LÄS FÖRST: `AGENTS.md`, `docs/architecture/code-map.md`, `docs/runbooks/preview-white-screen.md`, `src/components/builder/preview-panel/`-strukturen. Radnummer nedan är från master 2026-07-02 — lokalisera via symbolnamn. Om ett påstående inte stämmer mot koden: följ koden och notera avvikelsen i PR-beskrivningen.

NULÄGE (kodverifierat):
- Restore-API:t (`src/app/api/engine/chats/[chatId]/versions/route.ts` ~rad 303–314) kopierar `files_json` till ny draft med `editKind: "restore"` och returnerar `previewUrl: null` — ingen preview-push sker server-side.
- `VersionHistory.tsx` (~rad 476–495) postar restore och kör `onVersionSelect(newVersionId)`.
- `useBuilderVmPreview.ts` (~rad 302–308) bootstrappar preview-session asynkront när `activeVersionId` ändras.
- `usePreviewSession.ts`: `version_mismatch` (~rad 136–152) visar BARA overlay; tvingad omstart (`setForcedPreviewRestartKey`, ~rad 210–214) triggas endast för `missing`/`stopped`.

UPPGIFTER:

1. Restore ⇒ deterministisk preview-resync.
   - Efter lyckad restore ska preview:n konvergera till den återställda versionen utan manuell reload. Rekommenderad väg: klientflödet för restore triggar explicit forced restart/re-push av preview-sessionen för den nya versionen (samma mekanism som `missing`/`stopped` använder). Server-side push är OK om det är enklare/robustare — välj EN väg och motivera i PR-body.

2. `version_mismatch` ⇒ auto-resync i stället för enbart overlay.
   - När preview-sessionen rapporterar `version_mismatch` mot aktiv version: trigga resync automatiskt.
   - Loop-skydd är obligatoriskt: max ett auto-försök per (versionId, sessionId); vid fortsatt mismatch visas dagens overlay med manuell åtgärd. Ingen restart-storm.

3. DB-lås-timeouts (utredning, åtgärd endast vid tydligt fynd).
   - I samma prod-fönster sågs `SELECT … FOR UPDATE`-statement-timeouts under quality gate. Läs lease-/låsvägarna (`src/lib/db/chat-repository-pg.ts`: `acquireVersionLease` m.fl.). Om en konkret, låg-risk förbättring finns (t.ex. bounded timeout + retrybart fel i stället för hängande lås): gör den. Annars: dokumentera fynden i PR-body och rör inget. Bygg INTE om låsmodellen.

4. Runbook-synk: uppdatera `docs/runbooks/preview-white-screen.md` med det nya beteendet (mismatch → auto-resync → overlay som fallback). Ersätt gammal text, stapla inte.

STOPPREGLER:
- Ändra inte finalize-pipelinen, quality gate-policyn, promote-guard eller repair-flödet.
- Inga ändringar i preview-hostens API-kontrakt utan att båda sidor uppdateras i samma PR (`preview-host/` finns i repot); helst klient-only.
- Ingen ny polling-loop med tät frekvens — använd befintliga status-/eventvägar.

RESERVERADE FILER (parallella agenter äger dem — rör inte): `src/lib/gen/autofix/**`, `src/lib/gen/verify/repair-loop*`, `src/lib/gen/stream/finalize-version/**`, `persist-telemetry.ts`, `fixer-registry.ts`. I `chat-repository-pg.ts`: rör endast lås-/lease-relaterade rader om uppgift 3 ger fynd.

SOPA FRAMFÖR EGEN DÖRR: overlay-copy/kod som blir död när auto-resync tar över tas bort i samma PR; runbook ersätts, inte kompletteras med lager.

TESTER & VERIFIERING:
- Test för mismatch→auto-resync inkl. loop-skyddet (max 1 försök), och för restore→resync-vägen. Utöka befintliga hooks-/route-tester där de finns (`versions/route.test.ts`, preview-panel-tester).
- `npm run typecheck` → 0 fel · `npm run lint` → 0 fel · `npx vitest run` på berörda testfiler → grönt.
- OBS: 2 kända pre-existerande failures i `PreviewPanel.test.tsx` (save-flow) finns i backloggen — förväxla inte dem med regressioner.

PR-KRAV:
- Titel: `fix(preview): fas 4 kontrollflöde - restore/preview-resync + version_mismatch auto-recovery`
- Body: vald mekanism + motivering, loop-skyddets design, ev. lås-fynd, verifieringsutfall, bug-postcheck dokumenterad (bugbot-subagent readonly-pass, annars strukturerad manuell diff-review) med triage av varje fynd.
- Committa aldrig `.env*`, `.vercel/` eller secrets. Skapa inga filer under `docs/plans/`.

DEFINITION OF DONE:
- [ ] Restore leder till rätt preview utan manuell reload
- [ ] `version_mismatch` auto-resyncar (max 1 försök, sedan overlay)
- [ ] Runbook uppdaterad; död overlay-logik borttagen
- [ ] Lås-utredning dokumenterad (åtgärd endast vid tydligt fynd)
- [ ] typecheck/lint/vitest gröna; bug-postcheck dokumenterad i PR
