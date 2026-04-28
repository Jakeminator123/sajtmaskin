## Agent 19 — LLM repair gate contract

### Entry file + behavior

- `src/lib/gen/autofix/llm-repair-gate.ts`: `runLlmRepairGate` → `runLlmFixer` med `AbortController` timeout `max(1000, timeoutMs)`, valfri `requiredFiles`.

### How home recovery uses it

- `finalize-preflight.ts` `tryRecoverMissingHomeRoute`: **endast** när home saknas; `timeoutMs` 60s; `requiredFiles: ["app/page.tsx"]`.

### Confidence (%)

**~98%** för kontrakt. Trivial home: recovery **inte** anropad — **~85%** align med agent 02.

### Improvements

- Andra recovery-pass för trivial home.  
- Dokumentera `src/app/page.tsx` vs `app/page.tsx` i recovery.

**Model:** composer-2-fast (subagent)
