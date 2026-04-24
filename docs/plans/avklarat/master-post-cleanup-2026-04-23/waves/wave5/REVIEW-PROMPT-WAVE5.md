# Review prompt — wave 5 (plan 10 + plan 11) coherence audit

**Roll:** Du är en READ-ONLY review-agent. Du ska INTE ändra någon kod. Du ska producera **en granskningsrapport** som identifierar buggar, inkonsekvenser eller spec-avvikelser i wave 5-leveransen.

**Worktree:** Skapa egen worktree på `master`, branch `audit-wave5-<random-suffix>`.

## Din input

Två stora PRs precis mergade:
1. **PR #96 (plan 10):** observatorie-routing-fix + ENOENT-mkdir + auto-repair-stat-exclude + init quality-gate skip + latency-metrics-infrastruktur
2. **PR #97 (plan 11):** scaffold-required-files-check (Bug 1) + variant-lock (Bug 2) + capability-modify-existing (Bug 3)

**Spec-dokument du ska granska MOT:**
- `docs/plans/active/master-post-cleanup-2026-04-23/wave5/PROMPT-10.md` — original plan-10-spec
- `docs/plans/active/master-post-cleanup-2026-04-23/wave5/PROMPT-11.md` — original plan-11-spec
- `docs/plans/active/master-post-cleanup-2026-04-23/STATUS-INVESTIGATE-PAGETSX-LOSS.md` — investigation som plan-11 byggde på
- `docs/plans/active/master-post-cleanup-2026-04-23/STATUS-10-CANDIDATES.md` — som plan-10 byggde på
- `docs/plans/active/master-post-cleanup-2026-04-23/wave5/STATUS-10-latency-budgets.md` — agent-leverans-self-report
- `docs/plans/active/master-post-cleanup-2026-04-23/STATUS-11-unified-repair.md` — agent-leverans-self-report (om finns)
- `docs/architecture/open-questions.md` — alla 17 frågor (resolved + aktiva)

## Din uppgift

Producera **`STATUS-AUDIT-WAVE5.md`** med följande sektioner:

### 1. Spec-coherence per plan
För varje plan (10 + 11):
- Lista alla ACCEPTANSKRITERIER från PROMPT-X.md
- Markera varje som ✅ verifierat / ⚠️ delvis / ❌ saknas
- Om ⚠️/❌: lista exakt fil + kod-rad där bristen finns

### 2. Spec-avvikelser
- Gjorde agenten ändringar UTANFÖR sin scope?
- Bröt agenten någon hård begränsning från PROMPT-X?
- Bröt agenten plan 02–09:s territorium oavsiktligt?

### 3. Test-coverage
- Räkna nya tester per fix
- Är test-coverage tillräcklig? (minst 1 test per acceptanskriterium)
- Saknas regression-test för någon viktig path?

### 4. Code-quality red flags
- Sök efter `// TODO`, `// FIXME`, `// XXX`, `// HACK` som plan-10/11 introducerade
- Sök efter `console.log` eller `console.warn` som inte hör hemma i prod
- Sök efter `any`-typer eller `as unknown as X`-casts
- Sök efter "magic numbers" utan kommentar

### 5. Bug-hypoteser
För varje av de 17 öppna frågorna i `open-questions.md`, kontrollera:
- Är denna nu adresserad av wave 5? (markera ✅)
- Är denna NÄSTAN adresserad men har edge-case kvar? (lista edge-case)
- Är denna OPÅVERKAD av wave 5? (markera ⏸ — kvar för plan 12 eller post-wave-5)

### 6. Specifika scenarion att verifiera
Kör mentala tankeexperiment:

**Scenario A — page.tsx-loss-buggen:** Om LLM emitterar en CodeProject UTAN `app/page.tsx`, blockerar nya `finalize-preflight.ts`-checken persist? Visa exakt kod-path från `runFinalizePreflight()` till `severity: error`-emission.

**Scenario B — variant-lock:** Vid follow-up #3 på en chat. Om base-versionen har `scaffoldVariantId: "corporate-grid"`, läses den korrekt av `resolveOrchestrationBase`? Och passas vidare till `selectScaffoldVariant`? Eller finns `priorVariantId: null` fortfarande?

**Scenario C — capability-modify:** Prompt "gör pricken till en kaffekopp som häller kaffe när jag nuddar den". Plockas `MODIFY_REFERENCE_MARKERS` upp? Får vi `intent: 'capability-modify'` istället för `'capability-add'`? Re-injicerar `dossier-system` shell-fil ÄNDÅ, eller skippar den korrekt?

**Scenario D — observatorie-routing:** Om en chat har en init-run + 2 follow-ups, sparas alla 3 events i samma per-chat-bucket via `chat-to-run.json`? Eller hamnar några i `_unrouted/orchestration-styledirection/` igen?

### 7. Backoffice/Streamlit-konsekvenser
Plan-10 introducerade `autoRepairCount` + `followupCount` i `history.ndjson`. Behöver `backoffice/pages/pipeline_health.py` eller annan page uppdateras för att läsa det nya schemat? Eller fortsätter de fungera utan ändring?

### 8. Schema-konsekvenser
- Behöver `docs/schemas/strict/*.json` uppdateras för plan-10:s nya history.ndjson-fält?
- Plan-11:s `scaffoldVariantId` på OrchestrationBase — finns det persisterat någonstans som behöver schema-uppdatering?

### 9. Sammanfattning
- Antal bekräftade buggar: N
- Antal misstänkta buggar (kräver mer test): M
- Antal scope-avvikelser: K
- Rekommendation: GO / NO-GO för plan 12

## Hårda begränsningar

- **READ-ONLY**: Du får inte ändra någon `.ts`, `.tsx`, `.json`, `.md` (utom audit-rapporten själv)
- Du får läsa, grep:a, köra `git log`, `git show`, `git diff`
- Du får INTE köra dev-server eller starta agent
- Maxbudget: 30 min wall-clock

## Klart =

PR öppnad mot master med audit-rapporten som body, branchen pushad.
