# Agent-prompt — Fas 0: Telemetri-hygien (smarthet 4/10)

Kopieras rakt in i en cloud-agent. Merge-ordning i vågen: **0 → 4 → 1 → 2**.

---

Du är builder-agent i repot Jakeminator123/sajtmaskin (Next.js/TypeScript, LLM-sajtgenerator "own-engine"). Utgå från senaste `origin/master`, skapa branch `feat/kontrollflode-fas0-telemetri`, leverera EN PR mot master.

MISSION: Stäng tre mätluckor i generationstelemetrin så att kommande pipeline-ändringar blir mätbara. Ingen flödeslogik ändras i denna fas.

LÄS FÖRST: `AGENTS.md`, `docs/architecture/code-map.md`, `docs/schemas/quality-gate.md`. Radnummer nedan är från master 2026-07-02 — lokalisera via symbolnamn. Om ett påstående inte stämmer mot koden: följ koden och notera avvikelsen i PR-beskrivningen.

BAKGRUND (prod-statistik 14 d, 115 genereringar): dossier-val loggas bara i Vercels runtime-logg och kan inte kvantifieras ur DB; `generation_telemetry.deploy_result` sätts aldrig (kolumnen finns, writer saknas); server-repair-utfall loggas med missvisande strängar ("incomplete: 0 errors remain" när syntax är ren men gaten aldrig verifierats — 12 av 26 händelser).

UPPGIFTER:

1. Persistera dossier-val i telemetrin.
   - `selectedDossierIds` finns redan i finalize-flödet (`src/lib/gen/stream/finalize-version/runner.ts` ~rad 139; trådning testas i `runner-dossier-threading.test.ts`).
   - `src/lib/gen/stream/finalize-version/persist-telemetry.ts` skriver `meta`-block (t.ex. `meta.autofix` ~rad 105–110). Lägg till `meta.dossiers = { selectedIds: string[] }` (tom array om inga). Ingen ny DB-kolumn, ingen migration.

2. Skriv `deploy_result`.
   - Kolumnen finns (`src/lib/db/schema.ts` ~rad 763); `UpdateTelemetryRecord` accepterar `deployResult` (`src/lib/db/services/generation-telemetry.ts` ~rad 40); ingen writer finns i `src/`.
   - Hitta deploy-flödet (`src/app/api/v0/deployments/route.ts` + `src/lib/deploy/`). Skriv `"success"` eller `"error:<kort-kategori>"` för den version som deployas, vid den punkt där utfallet faktiskt är känt (om endast async status-poll finns: skriv vid status-uppdateringen). Om versionId inte är tillgängligt i flödet: koppla via chatens promotade version och dokumentera valet i PR-body.

3. Ärlig repair-outcome-taxonomi.
   - Inventera outcome-/event-strängarna i `src/lib/gen/verify/repair-loop.ts` och `server-verify.ts` (kategori `server-repair` i `engine_version_error_logs`).
   - Ersätt med en ärlig enum som skiljer på vad som faktiskt verifierats, i stil med: `gate_verified_success`, `syntax_clean_gate_unverified`, `no_improvement`, `fixer_noop`, `superseded_by_newer_version`, `budget_exhausted`. Behåll semantiken — döp om och skärp, hitta inte på nya utfall.
   - Writers skriver ENDAST nya strängar. Läsare (grep i `backoffice/pages/*.py`, `scripts/db/control-stats.mjs`, ev. `scripts/db/dump-logs.mjs`) ska mappa historiska strängar → nya labels för visning (gamla DB-rader finns kvar). Ingen dubbelskrivning.
   - Mappningstabell gammal→ny i PR-body och i `docs/schemas/quality-gate.md` om den listar outcomes.

STOPPREGLER:
- Ändra INTE repair-flödets logik/ordning (endast strängar/telemetri) — Fas 3 äger flödet.
- Inga DB-migrationer. Behövs en: stanna och skriv det i PR:en i stället.
- F3-gate, promote-guard, `RENDER_RISK_TS_CODES` rörs inte. Inga nya `runLlmFixer`-callsites.

RESERVERADE FILER (parallella agenter äger dem — rör inte): `src/lib/gen/autofix/validate-and-fix.ts`, `src/lib/gen/autofix/fixer-registry.ts`, `src/lib/gen/stream/finalize-version/fast-path.ts`, `pre-phases.ts`, `src/lib/gen/verify/repair-loop/deterministic-import-repair.ts`, preview-/restore-ytor (`versions/route.ts`, `usePreviewSession.ts`, `useBuilderVmPreview.ts`).

SOPA FRAMFÖR EGEN DÖRR: ersatta strängar tas bort i samma PR (inga parallella namn); docs ersätter gammal text; uppdatera tester som asserterar gamla strängar.

TESTER & VERIFIERING:
- Uppdatera/utöka `repair-loop.outcome.test.ts`, `finalize-version.test.ts` (telemetri-meta), lägg writer-test för `deploy_result`.
- `npm run typecheck` → 0 fel · `npm run lint` → 0 fel · `npx vitest run` på berörda testfiler → grönt.

PR-KRAV:
- Titel: `feat(telemetry): fas 0 kontrollflöde - dossier-val + deploy_result + ärlig repair-taxonomi`
- Body: vad/varför, mappningstabell, verifieringsutfall, bug-postcheck dokumenterad (bugbot-subagent readonly-pass, annars strukturerad manuell diff-review) med triage av varje fynd (fixed/logged/dismissed).
- Committa aldrig `.env*`, `.vercel/` eller secrets. Skapa inga filer under `docs/plans/`.

DEFINITION OF DONE:
- [ ] `meta.dossiers.selectedIds` skrivs för nya genereringar
- [ ] `deploy_result` skrivs vid deploy-utfall
- [ ] Nya outcome-strängar skrivs; läsare hanterar historiska
- [ ] Mappningstabell i PR + docs synkad
- [ ] typecheck/lint/vitest gröna; bug-postcheck dokumenterad i PR
