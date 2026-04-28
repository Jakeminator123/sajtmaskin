## Agent 11 — Merge policy vs blank home

### Behavior

- `LLM_ONLY_PATHS`: `app/page.tsx`, `src/app/page.tsx` — scaffold-default **strippas** på init; saknad emission → `missingEmittedEssentials`.  
- **Vilken som helst** emission räcker — **ingen** kvalitetskontroll i merge.  
- Follow-up: `missingEmittedEssentials` **tom**; trivial replacement möjlig.

### Link to Nordtak failure chain

Strippad scaffold-home + dålig LLM-output + trunkerad kontext → syntax/autofix-kaskad → tunn `app/page.tsx` som fortfarande “finns” → recovery **körs inte**; gate blockerar.

### Confidence (%)

Kod-beteende: **95%**. Full prod-kedja för Nordtak: **60–75%**.

### Improvements

- Kvalitets-/längd-gate kopplad till “emitted essentials satisfied” **eller** utöka recovery till trivial home (se agent 02).

**Model:** composer-2-fast (subagent)
