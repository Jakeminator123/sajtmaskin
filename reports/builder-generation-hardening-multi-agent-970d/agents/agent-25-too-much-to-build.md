## Agent 25 — Too much to build / signal overlap

### Layers that stack

`orchestrate` fanar in `routePlan` → `deriveBuildSpec` → `serializeScaffoldForPrompt` (med routePlan) + parallella dossiers; `buildDynamicContext` staplar scaffold context, scaffold research, toolkit, dossiers, route plan, imports-checklist, Lucide — **samma** generation.

### Confidence (%)

Heuristik (ej mätt): hög risk när många dossiers + många routes + `contextPolicy: heavy`; lägre med defer-extra-routes / smal follow-up.

### World-class improvements

- En sanning per dimension (scope-hierarki).  
- Trimma dossier/checklist till samma route-subset som route realization.  
- Telemetri: tokens per block efter budget-prune.

**Model:** composer-2-fast (subagent)
