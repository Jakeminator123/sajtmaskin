## Agent 14 — Verifier → fixer → repair chain

### Control flow summary

- `verifier-phase.ts`: blocking findings → **en** `runLlmRepairGate` → `runAutoFix` → valfri **en** verifier rerun.  
- `repairPassIndex > 0`: verifier **körs inte** (`reason: "repair_pass"`).

### Why repair might not touch `app/page.tsx`

- `requiredFiles` härleds från finding-`detail`; om home inte nämns → ingen tving.  
- En enda LLM-pass för alla blockers.  
- “Repair-1” kan vara **annan** bana (finalize repair utan verifier).

### Confidence (%)

Kedjestruktur: **90%**. Att just er körning missade home: **55–65%** utan finding-text.

### Improvements

- Explicit fil-mappning per `finding.id` (t.ex. home-relaterade blockers → alltid `app/page.tsx` i `requiredFiles`).

**Model:** composer-2-fast (subagent)
