# Diff from previous zip

Det här är skillnaden mot det tidigare rework-paketet.

## Behållet

- idén om ett kort `head lock`
- fokus på verifieringsförvirring, follow-up och 3D
- senare konsolideringspass för repair/prompt-kit

## Ändrat

### Gammal 01 — canonical 3-phase flow contract
Är inte längre en egen tung tidig plan. Fasmodellen ska främst fångas i `WORLD-CLASS-LLM-FLOW.md` och sedan användas som stöd till kodplanerna.

### Gammal 04 — pre-VM gate and fidelity contract
Är omskriven till ny plan 02, eftersom F2-gaten i nuvarande state verkar ha bytt definition. Fokus nu är **runtime truth och versionsmodal**, inte att uppfinna ännu en gate-modell.

### Gammal 05 — UI event-bus flip
Lever vidare i ny plan 02, men mindre som "måste landa full flip" och mer som "gör UI-status sanningsenlig med minsta fungerande ändring".

### Gammal 08 — deep brief contract and AI-assist ripout
Lever kvar, men är smalare. Fokus nu är delta-semantik och avgränsat jobb för Deep Brief, inte stort doc-omtag.

### HMR-spåret
Har flyttats ut ur huvudkodserien. Om preview-host-fixen redan är gjord i `master` är nästa steg deploy/smoke, inte ny fixplan.

## Nytt

- en explicit plan för **manual rollout och smoke baseline**
- tydligare separering mellan **ops-problem** och **kodproblem**
- en separat doc-fil med **världsklassflödet**
- en separat **worktree-runbook** för Cursor Cloud Agents
