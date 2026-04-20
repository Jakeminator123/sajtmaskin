---
id: P27-validator
title: Validator — verifiera, konsolidera, arkivera P21-P26
status: done
created: 2026-04-20
done_at: 2026-04-20
priority: high
wave: 3
parallel_safe_with: []
blocked_by: [P21, P22, P23, P24, P25, P26, P21b]
owner_files:
  - docs/plans/active/Kvarvarande-uppgifter.md
  - docs/plans/active/README.md
  - docs/plans/avklarat/README.md
  - docs/architecture/glossary.md
  - docs/schemas/strict/README.md
read_only_files:
  - docs/plans/active/parallel-execution-2026-04.md
  - docs/plans/active/P21-phase-routing-and-timeouts.md
  - docs/plans/active/P22-followup-flow-optimization.md
  - docs/plans/active/P23-verifier-and-capability-hardening.md
  - docs/plans/active/P24-preview-host-robustness.md
  - docs/plans/active/P25-builder-ui-and-csp-hygiene.md
  - docs/plans/active/P26-observability-and-logging.md
  - docs/schemas/strict/plan-file.schema.json
validator_hooks: []
blocking_note: |
  2026-04-20: Sektion A failade. Verifierat via stash + körning mot HEAD 8b36a5a88:
  - `src/lib/models/phase-routing.test.ts > keeps planner/generator thinking enabled by default for fast tier`
    är NY regression från P21 (manifest `perTierBriefing.fast.planner` ändrade default till
    `thinking:false, reasoningEffort:"low"`, men testet uppdaterades inte). → kräver **P21b**.
  - 7 övriga test-fails (chats/[chatId]/route × 2, preview-status v0/engine, stream/route × 2,
    project-env-vars × 1) är **pre-existing** på master, inte regressioner från P21-P26.
    Spåras i `Kvarvarande-uppgifter.md` (öppna punkter).
  - `npm run lint`: 1 pre-existing error i `src/lib/gen/autofix/rules/font-import-fixer.ts:45`
    (`prefer-const`), 12 warnings. Inte regression från P21-P26.
  - `preview-host/README.md` ÅÄÖ-check: 35 träffar — OK, inte ASCII-stripped.
  - Owner-file-konfliktcheck (Sektion B): inga konflikter.
  - Konsolidering (Sektion D) ej körd. Plan står `blocked` tills P21b grön.
---

# P27 — Validator (kör efter P21-P26)

Detta är inte en kodändringsplan i sig — det är **checklistan + körschemat** för att validera och konsolidera arbetet från Wave 1 + Wave 2.

## Förkrav

Alla planer P21-P26 måste ha `status: done` i sin frontmatter och alla deras `validator_hooks` måste ha gröna körningar.

## Sektion A — automatisk verifiering

Kör i ordning:

| # | Kommando | Förväntat |
|---|---|---|
| 1 | `npm run typecheck` | exit 0 |
| 2 | `npm run lint` | exit 0 |
| 3 | `npm run test:ci` | exit 0, alla nya tester från P21-P26 ingår |
| 4 | `node scripts/dev/check-systemprompt.mjs` | exit 0 (system-prompt.ts efter P23-justering är fortfarande inom kontraktet) |
| 5 | `npm run scaffolds:validate` | exit 0 |
| 6 | För varje P21-P26-fil: frontmatter följer `docs/schemas/strict/plan-file.schema.json`. Manuell snabbcheck eller, om script finns, `node scripts/plans/validate-plan-files.mjs` | Inga schema-violations |

## Sektion B — owner-file-konfliktcheck

Skanna alla `P*.md` i `docs/plans/active/`. För varje par av planer i samma `wave`, säkerställ att `owner_files`-arrayerna är disjunkta.

```bash
node -e "
const fs=require('fs'); const path=require('path');
const yaml=require('js-yaml'); // dep finns redan
const dir='docs/plans/active';
const plans=fs.readdirSync(dir).filter(f=>f.match(/^P\d{2}.*\.md$/)).map(f=>{
  const txt=fs.readFileSync(path.join(dir,f),'utf8');
  const fm=txt.match(/^---\n([\s\S]+?)\n---/)[1];
  return {file:f, ...yaml.load(fm)};
});
const byWave={};
for (const p of plans) (byWave[p.wave]=byWave[p.wave]||[]).push(p);
for (const [w, ps] of Object.entries(byWave)) {
  for (let i=0;i<ps.length;i++) for (let j=i+1;j<ps.length;j++) {
    const overlap=ps[i].owner_files.filter(f=>ps[j].owner_files.includes(f));
    if (overlap.length) {console.error('CONFLICT wave',w,ps[i].id,'<>',ps[j].id,overlap); process.exit(1);}
  }
}
console.log('No owner-file conflicts.');
"
```

## Sektion C — manuell observabilitet (snabb spot-check)

> **Owner: jakem** (kräver dev-server + browser; agenten kör inte denna sektion).

| # | Vad | Var |
|---|---|---|
| 1 | Starta `npm run dev`, öppna `?modelTrace=1` i builder | Verifiera att P26:s perTierPhaseMatrix renderas |
| 2 | Skapa en testchat, gör en init + en follow-up | Verifiera att P22:s assert inte triggar och att follow-up-prompt-längden inte växer >2× input |
| 3 | Submit prompt med "3d-figur som åker omkring" | Verifiera att `needsPhysics` triggar (P23) och att verifier inte loggar "could not resolve run dir" (P26) |
| 4 | Inducerat fel: skicka prompt som kommer trigga `motion-reduce:hidden` (om det går — annars manuell PR i en testkomponent) | Verifiera att P23:s verifier-check fångar |
| 5 | Streamlit `?nav=parallel-plans` | Verifiera att alla P21-P26 visas som `done` |

## Sektion D — konsolidering

| # | Åtgärd |
|---|---|
| 1 | Flytta P21-P26 från `docs/plans/active/` till `docs/plans/avklarat/` |
| 2 | Uppdatera `docs/plans/active/README.md`: ta bort raderna för flyttade planer |
| 3 | Uppdatera `docs/plans/avklarat/README.md`: lägg till en rad per arkiverad plan med en mening om vad som levererades |
| 4 | Uppdatera `docs/plans/active/Kvarvarande-uppgifter.md`: kryssa av vad P21-P26 stängt, lägg till nya öppna punkter som identifierats under arbetet |
| 5 | Uppdatera `docs/architecture/glossary.md`: lägg till nya termer från P21-P26 (t.ex. `perTierTimeouts`, `needsPhysics`, `version_mismatch_overlay`) |
| 6 | Uppdatera `docs/schemas/strict/README.md`: lägg till `plan-file.schema.json` i tabellen |
| 7 | Lämna `parallel-execution-2026-04.md` i `active/` om någon av planerna är `blocked` eller `in-review`. Om alla `done` → flytta även den till `avklarat/`. |
| 8 | **ÅÄÖ-check `preview-host/README.md`**: kör `rg "[åäöÅÄÖ]" preview-host/README.md`. Om noll träffar → ASCII-stripped (P24-agent saknade Unicode-stöd i terminalen). Notera som blockerande follow-up; försök INTE fixa själv — ny mini-agent (eller P24-agent) restorerar via `git show HEAD:preview-host/README.md`. |

## Sektion E — git

| # | Åtgärd |
|---|---|
| 1 | Verifiera att alla diffar är scope-renliga (ingen plan rörde annan plans `owner_files`) |
| 2 | Skapa en commit per plan (eller en sammanslagen "P21-P26 wave 1+2") enligt projektets git-policy. Stor PR (>40 filer): nämn `git rev-parse HEAD` i PR-beskrivning per `session-git-docs.mdc` |
| 3 | Inga commits utan användarens explicita kör — P27-validatorn rapporterar bara, exekverar inte git |

## Status-kontrakt

P27 markeras `done` när: alla sektion A-D passerat OCH användaren godkänt commit-läget i sektion E.
