# Worktree runbook — hur du kör detta utan att skapa kaos

## Min rekommenderade modell

Använd **1 tunn koordinator + max 2 aktiva kodagenter samtidigt**.

Inte fyra stora agenter samtidigt i kärnflödet.

## Roller

### Koordinator
Ansvar:
- kör plan 00
- kör plan 01 eller delegerar manuella steg
- håller en enda statusrad per plan
- avgör `full / short / skip`
- släpper inte in nästa agent innan föregående green checks finns

### Kodagent A
Första användarcentrerade spåret:
- plan 02
- plan 03

### Kodagent B
Första konsolideringsspåret:
- plan 04
- plan 05

### Kodagent C
Andra användarcentrerade spåret:
- plan 06
- plan 07

### Kodagent D
Senare cleanup/spår:
- plan 08
- plan 09
- plan 10
- plan 11
- plan 12

## Säkraste körordning

### Wave 0
- Koordinator: plan 00
- Koordinator/manuellt: plan 01

### Wave 1
- Agent A: plan 02
- Agent B: plan 04

Mergeordning:
1. 02
2. 04

### Wave 2
- Agent A: plan 03
- Agent B: plan 05

Mergeordning:
1. 03
2. 05

### Wave 3
- Agent A: plan 06
- Agent B: plan 07

Mergeordning:
1. 06
2. 07

### Wave 4
- Agent A: plan 08
- Agent B: plan 09

Mergeordning:
1. 08
2. 09

### Wave 5
Kör sekventiellt:
- plan 10
- plan 11
- plan 12

## Branchnamn

- `coord/head-lock-post-cleanup`
- `plan-02-runtime-truth`
- `plan-03-followup-technical`
- `plan-04-fixer-surface`
- `plan-05-fixer-entrypoint`
- `plan-06-deep-brief-delta`
- `plan-07-3d-capability`
- `plan-08-core-simplification`
- `plan-09-legacy-pruning`
- `plan-10-latency-budgets`
- `plan-11-unified-repair`
- `plan-12-prompt-kit`

## Hårda nej

Kör inte dessa samtidigt:

- 02 och 03
- 02 och 07
- 05 och 08
- 07 och 08
- 11 och 12

## Green checks före merge

Minimikrav per plan:
- tests för berörda delar
- lint/typecheck där relevant
- kort statusfil
- tydligt beslut om planen var `full`, `short` eller `skip`

## När du ska stoppa vågen

Stoppa efter wave 3 om:
- modalen slutat ljuga
- follow-up blivit begripligare
- 3D-scenariot klarar Fidelity 2

Då är mycket av den praktiska nyttan redan hemma.
