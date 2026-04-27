---
id: 2026-04-27-en-rak-linje-for-llm-flodet
status: scope
created: 2026-04-27
linear: null
trigger: Eval på commit 068c98ece (med SCAFFOLD_PROTECTED_PATHS aktiv) gav 2/15 pass. Fixen finns i koden men träffar inte live-pipelinen — något åter-introducerar `app/api/placeholder/route.ts` efter merge.
---

# En rak linje för LLM-flödet

Inte fler punkt-fixar. En agent, ett scope, fyra hårda kontrakt, ett snärtigt resultat.

## Diagnos (verifierad)

| Sak | Sant? |
|---|---|
| 4 felklasser i pipeline-glapp (syntax, imports, required files, deps) | Ja |
| SCAFFOLD_PROTECTED_PATHS finns i `068c98ece` koden | Ja (verifierat med `git show`) |
| Eval kördes mot den koden | Ja |
| Fixen träffar live-pipelinen | **Nej** — något kringgår partition |
| Det är embedding/cache-fel | Nej — koden ÄR där, fixen kör bara inte |

**Slutsats:** vi har en hammare som inte träffar spiken. Spår A nedan är att hitta var spiken faktiskt sitter.

## Strategisk princip (selektiv hårdhet)

> Hårt på struktur, mjukt på innehåll. Rätt typ av determinism — inte mer.

| Sant | Falskt |
|---|---|
| LLM ska få vara kreativ med copy, design, layout | LLM ska INTE få välja vilka filer som finns |
| Brief får vara mjuk på ton | Brief ska vara hård på struktur (routes, capabilities, required files) |
| Verifier ska tolerera stilfrihet | Verifier ska vara obeveklig på syntax + imports + deps |

## Sex spår — hela arbetet, en agent

Agenten gör spår A först (10 min). Sen B-F i ordning som A avslöjar. **Inte parallellt** — denna gång kör vi sekventiellt så vi inte introducerar nya glapp medan vi fixar gamla.

| # | Spår | Förväntad effekt | Hur långt? |
|---|---|---|---|
| **A** | **Diagnos**: var i pipelinen åter-introduceras filen efter merge? Sök i `runFinalizeFastPath`, `runLlmFixer`, `validate-and-fix`, `partial-file-repair`, `applyDossierVerbatimPolicy`, `server-verify`. | Veta var spiken sitter | 1-2 h |
| **B** | **Path-allowlist** (utvidgad SCAFFOLD_PROTECTED_PATHS) — applicerad i den path A hittar. Kandidater: `app/sitemap.ts`, `app/robots.ts`, `app/opengraph-image.tsx`, `tailwind.config.ts`, `postcss.config.mjs`. | Syntax-klustret faller från 6 → 0-1 | 2-3 h |
| **C** | **Import-validator** — drop okända `@/components/*`-imports istället för att stubba. Inte cover-up. | Unresolved-imports-klustret faller från 4 → 0-1 | 3-4 h |
| **D** | **Required-files re-emission** — när `LLM_ONLY_PATHS`-fil saknas, kör ETT smalt LLM-anrop med fokuserad prompt: "Write app/page.tsx for this brief". Sen blockera om fortfarande saknas. | ecommerce + settings → page.tsx finns | 2-3 h |
| **E** | **Dependency materializer** — scanna LLM-imports → skriv saknade paket till `package.json` med pinned versions från en kuraterad catalog (next, react, lucide-react, framer-motion, mdx, @vercel/analytics, …). | Unpinned-deps-klustret faller från 1 → 0 | 2-3 h |
| **F** | **Smala evals per felklass** — fyra evals à 3 prompts (5 min vardera) i `src/lib/gen/eval/`: `eval:syntax`, `eval:imports`, `eval:required-files`, `eval:deps`. Körs PER PR. | Snabb diagnos i framtiden | 1-2 h |

**Total estimat:** 11-17 timmar. Kan paketeras i 1-3 commits per spår; helst 1 spår per commit.

## Repair-loop & brief-kvalitet (lucka från reviewer)

Spår A-E adresserar codegen-LLM:n. Två extra glapp diagnosen missade:

| Lucka | Hur fångas det? |
|---|---|
| **Repair-loop-kvalitet** — LLM-fixern är "för försiktig", droppar `shrink_below_50pct` och lämnar originalfelet | Spår C+E gör att färre fel når repair-loopen i första hand. Om symptomen kvarstår efter A-E → eget spår "Repair tightening" senare. |
| **Brief-kvalitet → codegen-kvalitet** — luddig brief = luddig codegen | Inte i denna runda. Mät först om A-E räcker. Brief-hårdhet kan vara nästa scope om eval inte når 13/15. |

## Anti-mönster (icke förhandlingsbart)

- Ingen ny scaffold-variant
- Ingen ny dossier
- Ingen prompt-omskrivning på codegen-LLM
- Inga blandade fixar i samma commit
- Inga halv-färdiga planer kvar i `active/` efter agentens session
- Ingen "modell-magi" på fel plats (t.ex. mer dossier-tuning för att kringgå syntax-fel)

## Definition of done

- `eval:gate` ≥ 13/15 pass och ≥ 90% avg score
- Inga av de 4 felklasserna återkommer på 3 körningar i rad
- Smala evals (A-D-motsvarande) gröna
- Master ärlig — inga "tillbaka"-reverter kvar
- Aktiva planer har commit-progress senaste 14 dagar
- `.cursor/bugs/` rensad

## Eval-disciplin (sista körningen)

När alla spår är klara: kör eval **från huvud-worktreen** (inte `sajtmaskin-eval-placeholder`) på senaste master:

```powershell
cd c:\Users\jakem\dev\projects\sajtmaskin
git fetch --quiet origin master
git rev-list --left-right --count HEAD...origin/master   # måste vara 0 0
npm run eval:gate 2>&1 | Tee-Object -FilePath "docs\evals\<datum>-en-rak-linje-final.md"
```

Eval-worktrees städas direkt efter (`git worktree remove`). En källa till sanning: master.

---

## Super-prompt — klistra in till nästa agent

```
Du är systemiskagent på Sajtmaskin (Windows/PowerShell repo, master är sanning).

LÄS FÖRST i ordning:
1. docs/plans/active/2026-04-27-en-rak-linje-for-llm-flodet.md (denna scope)
2. .cursor/rules/plan-lifecycle.mdc, scaffold-rules.mdc, pipeline-rules.mdc, workflow.mdc
3. docs/architecture/scaffold-system.md § 7b (file merge policy)
4. docs/evals/ — senaste två rapporterna (baseline-after-revert, placeholder-fix-gate)

UPPGIFT: kör spår A → F sekventiellt i denna ordning. EN spår per commit.

Spår A: hitta var i pipelinen `app/api/placeholder/route.ts` åter-introduceras efter
mergeGeneratedProjectFiles. SCAFFOLD_PROTECTED_PATHS finns i koden men träffar inte live.
Sök i runFinalizeFastPath, runLlmFixer, validate-and-fix, partial-file-repair,
applyDossierVerbatimPolicy, server-verify, triggerBuildErrorRepair. Skriv en regression-test
som reproducerar problemet (test FÖRST). Sen mini-fix.

Spår B: utvidga SCAFFOLD_PROTECTED_PATHS i den path A hittade. Kandidater: app/sitemap.ts,
app/robots.ts, app/opengraph-image.tsx, tailwind.config.ts, postcss.config.mjs. Test FÖRST
per fil — assert att scaffold-versionen vinner.

Spår C: bygg import-validator som dropar okända @/components/*-imports istället för att
stubba. Test FÖRST.

Spår D: bygg required-files re-emission gate. Smal LLM-call när LLM_ONLY_PATHS-fil saknas
(en chans till). Test FÖRST.

Spår E: bygg dependency-materializer som scannar imports → skriver saknade paket till
package.json från en kuraterad catalog. Test FÖRST.

Spår F: skapa fyra smala evals (eval:syntax, eval:imports, eval:required-files, eval:deps).
Dokumentera i src/lib/gen/eval/README.md.

DISCIPLIN:
- Test FÖRST. Skriv regression-test som FAILAR innan din fix.
- En spår per commit. Inga blandade fixar.
- Smal eval per PR. Helhets-eval bara vid sista milestone.
- Origin sync `0 0` innan commit.
- Frontmatter krävs på nya planer (plan-lifecycle.mdc).
- Bug åtgärdad → radera .cursor/bugs/<fil>.

ANTI-MÖNSTER (gör INTE):
- Ny scaffold-variant
- Ny dossier
- Bredare prompt-omskrivning på codegen-LLM
- Modell-tuning (token-limits, dossier-rebalansering, brief-padding)
- Blanda två spår i en commit
- Hoppa över test FÖRST
- Lägga till komplexitet som inte är ett av A-F

VERIFIERING per spår:
- npx tsc --noEmit → 0 errors
- Riktade vitest-tester gröna
- npm run lint → 0 nya errors
- Smal eval för aktuellt spår grön

SISTA STEGET (efter F):
Kör eval:gate från huvud-worktreen (sajtmaskin, inte -eval-placeholder) på senaste master.
Verifiera origin sync `0 0` innan. Spara rapport i docs/evals/<datum>-en-rak-linje-final.md.

KLART NÄR:
- eval:gate ≥ 13/15 pass, ≥ 90% avg score
- Inga av 4 felklasserna återkommer
- Master ärlig
- Eval-worktrees städade (git worktree remove)
- Denna scope-doc flyttad till docs/plans/avklarat/

OM DU FASTNAR:
Stoppa. Skriv vad du sett, var du fastnade, vad nästa steg är. Skapa eller uppdatera planfil.
Föreslå parka eller hand-off — inte forcera.

OM DU SER ATT EN SPÅR INTE BEHÖVS (eval visar att klustret redan är borta efter tidigare spår):
Hoppa över med kort motivering i commit-message. Mindre är mer.
```
