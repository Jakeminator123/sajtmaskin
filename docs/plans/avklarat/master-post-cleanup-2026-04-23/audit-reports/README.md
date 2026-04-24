# Audit reports — wave 5 review

Mapp för **alla audit-rapporter** från review-agenter (lokala + cloud).

## Konvention

Varje agent SKA skriva till en **unik fil**:

```
audit-reports/AUDIT-<topic-id>-<agent-name>.md
```

Exempel:
- `AUDIT-01-spec-plan10-opus.md`
- `AUDIT-02-spec-plan11-codex.md`
- `AUDIT-04-scope-creep-cloud-a4f9.md`

## Topic-id-lista (8 cloud-agenter)

| ID | Topic | Cloud-prompt-fil |
|---|---|---|
| 01 | Spec-coherence plan-10 (acceptance criteria) | `../CLOUD-REVIEW-01.md` |
| 02 | Spec-coherence plan-11 (acceptance criteria) | `../CLOUD-REVIEW-02.md` |
| 03 | Test-coverage audit | `../CLOUD-REVIEW-03.md` |
| 04 | Scope-creep + hård-begränsning-koll | `../CLOUD-REVIEW-04.md` |
| 05 | Code-quality scan (TODO/FIXME/console/any) | `../CLOUD-REVIEW-05.md` |
| 06 | Scenario A: page.tsx-loss code-walk | `../CLOUD-REVIEW-06.md` |
| 07 | Scenario B: variant-lock end-to-end trace | `../CLOUD-REVIEW-07.md` |
| 08 | Scenario C: capability-modify + open-questions cross-check | `../CLOUD-REVIEW-08.md` |

## Coordinering

- Cloud-agenter ser denna README via repo-clone
- Varje agent **CHECKAR först** om sin AUDIT-XX-fil redan existerar (då hoppa över för att undvika dubblett-arbete)
- Agenter SKA inte ändra varandras filer
- Varje agent committar + pushar sin egen branch + öppnar PR med audit-rapporten
- Orkestratorn (människa eller jag) konsoliderar alla audit-rapporter i ett `STATUS-AUDIT-WAVE5-CONSOLIDATED.md`

## Lokala review-agenter

Lokal körning sker via `cursor-agent` CLI mot `REVIEW-PROMPT-WAVE5.md` (master-prompten). De producerar samma format men i samma worktree.
