---
status: proposed (framtida — efter waves 1-8 har observerats i drift)
created: 2026-04-24
spår: 8 av 9 (komplement efter GPT-5-rapport 2026-04-24)
prio: P7 — efter spår 02 + 07 har gett oss SLO-baseline över ≥ 30 dagar
estimat: 5–7 dagar (mestadels wire-up + telemetri, inte ny logik)
parent: README.md
---

# Spår 8 — Future: single coherent recovery lane

## Varför detta spår är "framtida"

GPT-5-rapporten 2026-04-24 noterar att Plan 04+05 (fixer-surface +
single-fixer-entrypoint) bara är "halvt klar" — det finns fortfarande
3 parallella recovery-vägar:

1. `runAutoFix` (mekaniska, deterministiska)
2. `runLlmFixer` → merge → `validateGeneratedCode` (esbuild)
3. `tryServerRepairLoop` → quality-gate → `triggerBuildErrorRepair`

Wave 5 hot-fix #5 (`validateCompleteFiles`) + wave 1 (`llm_fixer_aborted`-event)
+ wave 5 (recurring-patterns + shrink-telemetri) lade grindar och telemetri
till väg 2. Men de **gjorde inte vägarna 1, 2, 3 till EN väg**.

Det här spåret är medvetet markerat **framtida** för att:

1. Vi behöver **observera Wave 1-8 i drift** under ≥ 30 dagar för att veta
   om recurring-patterns + heavy_load + abort-retry tillsammans räcker
   för "single coherent lane" eller om kollaps är nödvändig.
2. Spår 7s SLO ger oss data: om `% no_recovery_needed` är ≥ 80 % efter
   waves 1-8 så är frågan kanske ett UI/dokumentationsproblem, inte ett
   arkitekturproblem.
3. Om L1 (`L1-unified-repair-call.md`, parkerad i PARKED.md) släpps från
   parkering blir det här spåret obsolet — L1 är en STÖRRE arkitektur-omtag.

## Vad som triggar att detta spår startas

ETT av följande:

- Spår 7 SLO visar att `% no_recovery_needed` < 70 % efter 30 dagar med Wave 1-8
- L1 lyfts inte från parkering inom 90 dagar
- Telemetri visar att 3 parallella vägar har divergerat ytterligare
  (ny fix-funktion lagts till någon av dem utan rebalansering)

## Mål

Definiera **EN canonical recovery-lane** som body — alla 3 nuvarande
vägarna blir steg i den enda lanen, inte alternativ:

```
[input: failed validation/preflight/quality-gate]
        ↓
1. runAutoFix (deterministisk, < 5 s)
        ↓
2. runLlmFixer (LLM, < 60 s, validateCompleteFiles + recurring-patterns redan på)
        ↓
3. mergeFixedFiles → validateGeneratedCode (esbuild parse)
        ↓
4. quality-gate (tsc/build/lint från Fly-VM, < 90 s, F2/F3-policy enligt spår 0)
        ↓
5. tryServerRepairLoop (vid quality-gate-fail, max 2 LLM-passes)
        ↓
[output: promoted | failed-after-repair | aborted]
```

EN entry-point. EN telemetri-stream. EN policy för när lanen körs vs
skippas. Inga parallella spår.

## Konkreta åtgärder (i prioritetsordning, om/när spåret startas)

### A. Heavy_load-eskalering till LLM-fixer (vidare än wave 5)

**Var:** `src/lib/gen/autofix/runAutoFix.ts` + `runner.ts` rad ~290.

**Wave 5 status:** `autofix.heavy_load`-event emit:s med `dossierId` +
`capability` (våg 5 telemetri-fält). Ingenting eskalerar än — bara loggning.

**Detta spår:** när `heavy_load` triggas (t.ex. ≥ 20 mekaniska fixes),
**eskalera till LLM-fixer omedelbart** istället för att fortsätta med
fler mekaniska pass. Många mekaniska fixar = LLM-output är för dålig
för att rädda mekaniskt.

**Acceptance:** wall-clock för fall som idag triggar heavy_load minskar
med ≥ 30 % i 5 testfall. Mätbart via spår 7s SLO.

### B. Konsolidera repair-trigger-paths

**Var:** `src/lib/gen/verify/server-verify.ts` (`tryServerRepairLoop`,
`triggerBuildErrorRepair`).

**Idag:** två separata trigger-paths för server-repair — en från
quality-gate-fail (`tryServerRepairLoop`), en från preview-VM build-error
(`triggerBuildErrorRepair`). Båda kallar samma `runRepairLoop` men har
olika dedup, olika telemetri, olika abort-villkor.

**Fix:** mergea till EN `triggerServerRepair(reason: "quality_gate" |
"preview_vm" | "preflight", ...)`. Dedup-set delas. Telemetri tagged med
`reason`. Abort-villkor unifierat (max 2 LLM-passes total per
`versionId`, oavsett trigger-source).

**Acceptance:** ett anrop, en path, en telemetri-prefix. Inga dubbletter
av repair-events i `events.ndjson`.

### C. Ny telemetri: `recovery_lane_outcome`

**Var:** ny event-kategori i `event-bus.ts` + nytt strict schema i
`docs/schemas/strict/`.

**Vad:** för varje generation, emit EN `recovery_lane_outcome` event
oavsett om någon repair triggades:

```ts
{
  type: "recovery_lane_outcome",
  versionId: string,
  outcome: "no_recovery_needed" | "autofix_only" | "llm_fixer_succeeded"
         | "server_repair_succeeded" | "all_recovery_failed",
  totalFixesApplied: number,
  llmFixerPasses: number,
  serverRepairPasses: number,
  totalRecoveryMs: number,
  abortReasons: string[],   // tom array vid success
}
```

Spår 7s F2-UX-SLO läser denna för "% generations som behövde repair" och
"% där all recovery failade".

`backoffice/pages/llm_flode_telemetry.py` (wave 8) får ny sektion för
`recovery_lane_outcome`.

**Acceptance:** alla generationer skriver exakt ett event; backoffice
visar fördelning per outcome.

### D. UI-dokumentation: en sammanhängande badge

**Var:** Versionsdiagnostik UI (det som spår 0 etablerade).

**Idag:** Versionsdiagnostik kan visa `repairing`, `repair_available`,
`failed`, `verifying`, `promoted` — som från olika källor i pipeline.

**Detta spår:** lägg en **Recovery**-badge bredvid Quality + Product
(spår 02) som visar `outcome` från senaste `recovery_lane_outcome` event.
Färg-kodning matchar SLO-fältet i spår 7.

**Acceptance:** användare ser EN badge som svarar "behövde din generation
repareras?" istället för flera mystiska statusar.

## Avgränsningar

- **Inte L1 (unified-repair-call)**. L1 är parkerad enligt PARKED.md och
  är en STÖRRE arkitektur-omtag som ersätter hela repair-modellen.
  Detta spår är *konsolidering inom befintlig modell*, inte ersättning.
- **Inte ny LLM-fixer-implementation**. Vi behåller `runLlmFixer` med
  `validateCompleteFiles` + `recurring-patterns`. Bara wire-up + escalation.
- **Inte design-prevention** ("undvik att repair behövs"). Det hör till
  spår 1 (variant) + spår 3 (bildminimum) + scaffold/dossier-arbete.

## Acceptance-criteria för hela spåret

- [ ] A: heavy_load eskalerar till LLM-fixer; 5 testfall snabbare ≥ 30 %
- [ ] B: `triggerServerRepair` unifierat; dedup delas; ett anrop per fail
- [ ] C: `recovery_lane_outcome` event emit:s för varje generation; backoffice visar
- [ ] D: Recovery-badge i Versionsdiagnostik

## Estimerad insats

5–7 dagar. Mest wire-up + telemetri, inte ny logik.

## Kopplingar

- **Spår 02 + Spår 7:** Detta spår förutsätter F2 Product Postcheck +
  SLO existerar så vi kan A/B mäta att kollaps faktiskt höjer SLO.
- **Spår 5** (autofix-gating, KLART): A från detta spår är vidareutveckling
  av wave 5s heavy_load-telemetri.
- **Plan 11** (scaffold-required-files): D ska respektera Plan 11-blocker
  (preflight-fail = repair tillåten, men inte promote).
- **L1 PARKED:** detta spår är vad vi gör om L1 inte lyfts inom 90 dagar
  ELLER om SLO-data visar att kollaps räcker utan L1.
