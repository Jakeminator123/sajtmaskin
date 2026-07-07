# Agent-prompt — Fas 5: Terminologi & docs-spegling (smarthet 4/10)

Kopieras rakt in i en cloud-agent efter att Fas 3 (PR #364) mergats. Kan köras
parallellt med Fas 6-agenten (inga delade filer).

---

Du är builder-agent i repot Jakeminator123/sajtmaskin (Next.js/TypeScript, LLM-sajtgenerator "own-engine"). Utgå från senaste `origin/master`, skapa branch `feat/kontrollflode-fas5-terminologi`, leverera EN PR mot master. Detta är en docs-/terminologi-fas — ingen runtime-kod ändras.

MISSION: Kontrollflödet har byggts om i fyra mergade faser (PR #361 telemetri, #362 preview-resync, #363 import-normalisering före LLM, #360 riskScore-verifier-policy, #364 en repair-port + samma-signal). Nu ska begreppen städas: EN kanonisk uppsättning kontrollbegrepp i docs, och dokumentationen ska spegla det nya runtime-flödet. Ägarens beslut (2026-07-02): kanoniska namn i glossary/docs/rules; **befintliga kod-identifierare, telemetri-kategorier, event-namn och DB-strängar behåller sina namn** — de mappas i en tabell, de döps inte om.

LÄS FÖRST: `AGENTS.md`, `docs/architecture/README.md` (docs-principer: kod vinner, ersätt — stapla inte), `docs/architecture/glossary.md`, `.cursor/rules/terminology.mdc`. Verifiera varje flödespåstående mot koden innan du skriver det (`src/lib/gen/autofix/validate-and-fix.ts`, `src/lib/gen/stream/finalize-version/`, `src/lib/gen/verify/`, `src/app/api/engine/chats/[chatId]/quality-gate/route.ts`).

KANONISKA BEGREPP (införs i docs, mappas mot kod-legacy):

| Kanoniskt | Betyder | Absorberar/mappas mot (kod-legacy, behålls i kod) |
|---|---|---|
| Normalize | mekanisk kodstädning före LLM | autofix, mekanisk autofix, url-expand, deterministisk import-repair |
| RepairGate | enda LLM-repair-porten | runLlmRepairGate/RepairLedger, LLM-fix, syntax-fixer, verifier-fixer, server-repair-LLM |
| RenderGate | F2: preview bootar/renderar; typecheck advisory utom render-risk-koder | quality gate (designPreview), preview-check |
| ReleaseGate | F3: typecheck+build+lint+env, strikt, explicit | quality gate (integrationsBuild), build gate, readiness |
| Advisory | synligt men ej blockerande | warning, soft fail, degraded/typecheck_advisory |
| Blocker | stoppar promote/preview | hard fail, blocking, preview-blocking |
| CapabilitySmoke | capability-specifik DOM/render-smoke | product postcheck |

UPPGIFTER:

1. `docs/architecture/glossary.md`: lägg in de sju kanoniska begreppen med kort definition + mappningstabellen ovan (en tabell, med explicit not: "kod-identifierare och telemetri-nycklar behåller legacy-namnen"). Ersätt/uppdatera befintliga rader som nu blivit missvisande (t.ex. verifier-/repair-relaterade) i stället för att lägga dubbletter.

2. `.cursor/rules/terminology.mdc`: utöka "Skriv hellre höger än vänster"-tabellen med de nya kanoniska orden (vänster = legacy-uttryck i löptext, höger = kanoniskt begrepp). Regeln styr hur agenter SKRIVER — inte hur kod döps.

3. `docs/architecture/llm-pipeline.md`: rätta Fas 3-avsnittet så ordningen speglar koden:
   - Verifierad mismatch: docen listar "preflight och quality gate" FÖRE persist — i verkligheten körs VM-gaten EFTER persist (klient-post-checks + server-verify), medan preflight/verifier/Normalize körs före persist.
   - Nya flödet ska framgå: codegen → Normalize (url-expand + autofix) → syntax/warm-tsc → deterministisk import-repair → RepairGate endast vid residual → verifier (riskstyrd: skippas endast vid enbart säkra fixar, aldrig vid 3D) → preflight → persist → RenderGate (F2) / ReleaseGate (F3) → promote.
   - Använd de kanoniska begreppen med kod-legacy i parentes första gången.

4. `docs/schemas/quality-gate.md`, `docs/contracts/fixer-registry.md`, `docs/architecture/runtime-contracts.md`: koherens-pass. Fas 0–3-PR:arna har redan uppdaterat sina avsnitt — din uppgift är att (a) införa kanoniska begrepp konsekvent (första förekomst: `RenderGate (kod: designPreview quality gate)`), (b) ta bort stycken/tabellrader som beskriver det GAMLA flödet (heavy-load-tröskeln, tre separata repair-lanes, "typecheck hård i F2") om någon rest finns kvar, (c) döda länkar bort. Ersätt — stapla inte.

5. Backoffice-rubriker (`backoffice/pages/*.py`): ENDAST visningstext/rubriker där gamla begrepp är missvisande (t.ex. en rubrik som säger "Heavy load" för risk-datat). Ändra ALDRIG kategori-/nyckelsträngar som används i queries (`autofix_heavy_load` som historisk query-nyckel ska vara kvar), kolumnnamn eller meta-fältnamn. Om inget är missvisande: hoppa över och notera i PR-body.

STOPPREGLER:
- Ingen rename av kod-identifierare, filnamn, telemetri-nycklar, event-typer, enum-värden eller DB-strängar. `config/ai_models/manifest.json` (`qualityGateTiers`-nycklarna) rörs inte.
- Ingen runtime-kod. Inga ändringar under `src/` (backoffice är `.py`-visningslager och undantaget ovan).
- Skapa inga filer under `docs/plans/` — orkestratorn äger plandokumenten.
- Inför inga andra nya begrepp än de sju kanoniska (glossary-regeln: inga oregistrerade termer).

SOPA FRAMFÖR EGEN DÖRR: varje avsnitt du rör lämnas utan legacy-beskrivningar av borttagen mekanik; döda länkar och obsoleta tabellrader tas bort i samma PR.

VERIFIERING (docs-only-nivå):
- Länk-koll: alla relativa länkar i ändrade filer resolvar (kolla manuellt eller med enkel skriptloop).
- Om `.py`-filer ändrats: kör backoffice-testerna (se CI-jobbet `backoffice-tests` i `.github/workflows/ci.yml` för exakt kommando — typiskt `python -m pytest backoffice/`).
- `npm run lint` behövs inte för rena markdown-ändringar; kör den om du rört något utanför docs.

PR-KRAV:
- Titel: `docs(terminology): fas 5 kontrollflöde - kanoniska kontrollbegrepp + docs-spegling av nya flödet`
- Body: begreppstabellen, lista över rättade mismatch:ar (per fil), vad som medvetet INTE rördes (kodnycklar), bug-postcheck dokumenterad (bugbot-subagent readonly-pass, annars strukturerad manuell diff-review — för docs räcker manuell genomläsning med fil:rad-referenser) med triage av varje fynd.
- Committa aldrig `.env*`, `.vercel/` eller secrets.

DEFINITION OF DONE:
- [ ] Sju kanoniska begrepp i glossary med mappningstabell + legacy-not
- [ ] terminology.mdc-tabellen utökad
- [ ] llm-pipeline.md speglar verklig ordning (gate efter persist; import-repair före LLM; riskstyrd verifier)
- [ ] quality-gate.md / fixer-registry.md / runtime-contracts.md koherenta, inga döda länkar
- [ ] Inga kod-/nyckel-renames; backoffice endast visningstext
- [ ] Bug-postcheck dokumenterad i PR
