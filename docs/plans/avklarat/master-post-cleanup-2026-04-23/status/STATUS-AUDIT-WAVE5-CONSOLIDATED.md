# STATUS — Audit wave 5 konsoliderad rapport

**Datum:** 2026-04-24  
**Konsoliderat av:** orkestrator-agent  
**Källrapporter:** AUDIT-01, AUDIT-02, AUDIT-03, AUDIT-04, AUDIT-05 — original-filerna raderades i 2026-04-28-städ (denna konsolidaten ersätter dem; full text finns i git-historik om någon detalj behövs).  
**Master-prompt-rapporter:** Opus + Codex dog utan att producera rapport (master-prompten med 9 sektioner var för stort scope för en enda agent)

## TL;DR

> **GO för plan 12.** Alla 5 specialiserade audit-agenter rekommenderar GO. Inga blocker-buggar identifierade. Wave 5 (plan 10 + plan 11) levererar avsiktliga säkerhets- och routing-beteenden korrekt. Återstående punkter är dokumentations-/test-gap, inte funktionella defekter.

---

## Per audit-rapport

| # | Topic | Verdikt | Modell |
|---|---|---|---|
| 01 | spec-coherence plan-10 | **GO** + 3 ⚠️ | composer-2 |
| 02 | spec-coherence plan-11 | **GO** + 1 känt gap | composer-2 |
| 03 | test-coverage | **GO** + 1 test-gap | composer-2-fast |
| 04 | scope-creep | ✅ **0 violations** | composer-2-fast |
| 05 | code-quality | **GO** + 1 cosmetic | composer-2-fast |

## Bekräftade fynd (rapporterat av 2+ agenter eller stark single-agent-bevisning)

### 🟢 Plan 10 — verifierat fungerande
- `chat-to-run.json`-routing fungerar (AUDIT-01)
- `mkdirSync(..., recursive: true)` på alla `_unrouted/<bucket>`-paths (AUDIT-01)
- Quality-gate skip för rena F2-init-runs implementerad (AUDIT-01)
- `autoRepairCount` separat från `followupCount` i history (AUDIT-01)
- `sajtmaskin_phase_duration_ms` histogram med `kind`-label (AUDIT-01)
- 37 tester passerar (per STATUS-10)

### 🟢 Plan 11 — verifierat fungerande
- `HOME_PAGE_REQUIRED_PATHS` + `HOME_PAGE_MIN_RENDERED_CHARS` = `200` (AUDIT-02)
- `buildMissingHomeRouteIssue` blockerar tom page.tsx (AUDIT-02)
- Count-parity-invariant i `finalize-preflight.ts:~661-696` (AUDIT-02)
- `MODIFY_REFERENCE_MARKERS` regex-only (ingen LLM-classifier) — stoppregel följd (AUDIT-02)
- `capability-modify` suppression i `chat-message-stream-post.ts:~697-707, ~921-931` (AUDIT-02)
- `renderCapabilityModifyHintBlock` i `dossiers.ts` (AUDIT-02)
- 0 OFF-LIMITS-violations (AUDIT-04 verifierar)

## Identifierade gap (icke-blocker, för plan 12 eller framtida)

### 🟡 Plan 11-spec-avvikelser (AUDIT-02)

| # | Avvikelse | Severity |
|---|---|---|
| 1 | Issue-kod `code_structure_failure` istället för spec'ade `missing_required_route` | låg (semantisk, alias räcker) |
| 2 | Parity-invariant placerad i `finalize-preflight.ts` istället för `preflight-phase.ts` | låg (beteende OK, plats avviker) |
| 3 | Saknar negativ parity-test (bara happy-path test finns) | medium |
| 4 | Saknar dedikerad preview-bootstrap-vs-preflight-set-test | medium |
| 5 | Variant-persist är **bara in-memory** via snapshot, INTE på `engine_versions`-rad | **HIGH för långsiktigt** (variant försvinner vid server-restart) |
| 6 | `MODIFY_REFERENCE_MARKERS` saknar `that thing` (engelska) | låg (svenska huvudfall täckt) |
| 7 | Saknar E2E-test "ingen ny shell-fil" på capability-modify | medium |

### 🟡 Plan 10-gap (AUDIT-01)

| # | Avvikelse | Severity |
|---|---|---|
| 1 | Ingen live-smoke verifierar `_unrouted/`-stillhet | låg |
| 2 | `npm run test:ci` ej verifierat i audit-worktree (saknad node_modules-resolution) | låg |
| 3 | `sajtmaskin_phase_duration_ms` täcker bara 5 av 12 faser från PROMPT-10:s utökade exempel | låg |

### 🟡 Test-coverage-gap (AUDIT-03)

| # | Avvikelse |
|---|---|
| 1 | Saknar test för "gör om den" (kort prompt utan capability-noun) intent-classification |

### 🟡 Code-quality-gap (AUDIT-05)

| # | Issue | Plats |
|---|---|---|
| 1 | Magic number `900` (golv för Math.max mot budget) | `system-prompt/build-dynamic-context.ts:248-250` |

## Plan-12-impact

Plan 12 (revised: #15 dossier-env-resolver + #14 slug-bounce) påverkas INTE av några audit-fynd. Det är fritt fram att fortsätta.

**Optional polish som plan 12 KAN ta** (om tiden räcker):
- Fixa #1 från AUDIT-02 (alias `missing_required_route`)
- Fixa magic-number-warning från AUDIT-05
- Lägg till "that thing" i `MODIFY_REFERENCE_MARKERS`

Inget av detta är obligatoriskt.

## Plan-13-rekommendationer (om vi gör en post-paket-uppföljning)

Större item som kvarstår:

1. **Variant-persist på `engine_versions`** (AUDIT-02 #5) — DB-migration + read/write för `scaffoldVariantId`-column. Löser "variant försvinner vid server-restart"-buggen.
2. **Negativ parity-test + preview-bootstrap-test** (AUDIT-02 #3, #4)
3. **E2E-test för capability-modify "ingen ny shell-fil"** (AUDIT-02 #7)
4. **Test för "gör om den"-intent-class** (AUDIT-03 #1)
5. **Magic number → const** (AUDIT-05 #1)

Sammanlagd effort: ~2-4 timmar för en single-agent.

## Lessons learned från audit-experimentet

**Specialiserade prompter med snäva scopes (composer-2-fast) > universell prompt med 9 sektioner (Opus/Codex).**

5 av 5 composer-agenter levererade rena rapporter på ~10-20 min. 0 av 2 master-prompt-agenter (Opus + Codex) producerade rapport efter 30+ min. Båda dog med 886 KB log-output men utan att skriva någon `AUDIT-*.md`-fil.

→ **Framtida audit-passes ska splittras i ≤5 sektion-prompter, inte en stor master-prompt.**

## Konsoliderad GO/NO-GO

```
✅ GO för plan 12
✅ Inga blocker-buggar i wave 5
✅ 0 OFF-LIMITS-scope-violations
🟡 7 mindre dokumentations-/test-gap (icke-blockerande)
🚀 Plan 13-kandidater identifierade men inte brådskande
```

Plan 12 är fri att fortsätta. När den mergat är wave 5 stängd.
