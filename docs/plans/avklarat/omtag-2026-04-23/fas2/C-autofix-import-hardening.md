---
id: omtag-fas2-C-autofix-import-hardening
title: Autofix/import-härdning — konsolidera react-fixers + prompt-preemption
phase: 2
priority: P2
parallell_med: []
blockerad_av: [02-eval-baseline, 03-wave-split-heatspots]
estimat: "1–1,5 dag"
owner_files:
  - src/lib/gen/autofix/rules/** (konsolidera 3 react-fixers)
  - src/lib/gen/system-prompt/** (E4 — imports-checklist, eller i 03:s undermapp)
  - config/ai_models/manifest.json (M4 — syntaxFixPasses)
  - scripts/dev/** (E6 — CI strict-assert)
  - tester för ovanstående
---

# Fas 2·C — Autofix/import-härdning

## Mål

Minska onödiga fixvarv genom fyra förändringar: (E4) deterministisk imports-checklist i prompten, (E5) konsolidera 3 react-import-fixers till en, (M4) sänk `syntaxFixPasses` från 4→1 *om* eval-baselinen tillåter, (E6) CI strict-assert som failar när `autofix.heavy_load` passerar en tröskel.

## Varför det här

**Guldrapporten:** *"Det här ger ofta oväntat stor kvalitetsvinst eftersom det minskar 'mekaniskt skräp' i körningarna."*

**Befintligt fynd:** `import-validator` lägger i snitt till 11 imports per run (Badge, Card, CardHeader, …). `autofix.heavy_load` triggas i nästan varje run. Codegen-LLM:en glömmer importera komponenter den *faktiskt använder*. Lösningen är att berätta för LLM:en vilka imports den måste ha, deterministiskt, istället för att städa upp efteråt.

## Scope

| In | Ut |
|---|---|
| E4: `## Required Imports Checklist` i system-prompt (deterministisk lista baserad på routePlan + capabilityHints) | Ny autofix-regel (explicit **ej** — det är motsatt riktning) |
| E5: slå ihop `react-import-fixer.ts`, `react-hook-import-fixer.ts`, `nextjs-navigation-import-fixer.ts` → en | Röra `type-only-import-fixer` / `import-alias-type-syntax-fixer` (egna problemdomäner) |
| M4: `syntaxFixPasses: 4 → 1` bakom eval-gate | L1 `runUnifiedRepair` (parkerat) |
| E6: CI strict-assert på `autofix.heavy_load`-tröskel | Ändra verifier-pass / repair-loop-struktur |

## Inputs

1. `gpt_review/filer/E-easy-medium-layer.md` — **E4** (rad ~389–420), **E5** (rad ~421–439), **E6** (rad ~440–458)
2. `gpt_review/filer/M-medium-hard-layer.md` — **M4** (rad ~959–980)
3. `gpt_review/filer/repo_assessment_2026-04-23.md` sektion "Agent C"
4. OMTAG 02:s eval-baseline (`evals/results/baseline-master/`) — M4 får endast landa om eval visar ≤ 5 % försämring på canonical prompts
5. OMTAG 07:s prompt-core-tillägg — E4 ska *harmonisera* med, inte duplicera det
6. **Dagens master:**
   - `src/lib/gen/autofix/react-import-fixer.ts`
   - `src/lib/gen/autofix/react-hook-import-fixer.ts`
   - `src/lib/gen/autofix/nextjs-navigation-import-fixer.ts`
   - `src/lib/gen/autofix/import-validator.ts` (för att förstå vilka imports som städas)
   - `config/ai_models/manifest.json` (`syntaxFixPasses`)
   - `src/lib/gen/autofix/validate-and-fix.ts` (pass-loopen)

## Exekveringssteg

### Steg 1 — E4: Required Imports Checklist i prompt

Lägg till sektion i system-prompt (koordinera med OMTAG 03:s `system-prompt/sections/` — om 03 landat ska sektionen bli en egen fil). Deterministisk builder som tar `routePlan` + `capabilityHints` och renderar:

```
## Required Imports Checklist

If your code uses these components, the import MUST be present:

| Component | Import |
|---|---|
| Button    | import { Button } from "@/components/ui/button"; |
| Card      | import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"; |
...
```

Builder-källan är shadcn-component-pool:en (samma som `import-validator` städar idag). Läs E4-planen för exakt prompt-format.

### Steg 2 — E5: konsolidera react-fixers

Nya `src/lib/gen/autofix/rules/react-import-consolidated.ts` ersätter de tre nuvarande fixerarna. Täck:
- `useState`/`useEffect`/etc från `react`
- `useRouter`/`usePathname`/etc från `next/navigation`
- Default `React`-namespace-importer

Ta bort de tre gamla filerna + uppdatera `fixer-registry.ts`. Pin med test att alla tidigare fix-scenarion fortsätter fixa.

### Steg 3 — M4: syntaxFixPasses=1 bakom eval-gate

**Kritisk villkorlighet:** kör OMTAG 02:s eval-baseline på branchen *före* flaggändringen. Sedan ändra `"syntaxFixPasses": 1` i manifest + kör eval igen. Diff-scriptet får visa:

- Inga canonical prompts hamnar > 5 % sämre på autofix-fixes eller preflight-issues.
- Total `durationMs` ska gå ner minst 10 % i median.

Om villkoren inte uppfylls → M4 avbryts, flaggan stannar på 4, dokumentera i `OMTAG/fas2-C-m4-findings.md`.

### Steg 4 — E6: CI strict-assert

Lägg till `scripts/dev/check-autofix-load.mjs` som läser senaste dev-log-mappen och failar om `autofix.heavy_load` överstiger 80 % av körningar. Koppla in i `preflight:common` eller CI-workflow. Läs E6 för exakt tröskel + logformat.

## Får INTE göras

- Ingen full L1 `runUnifiedRepair` — det är parkerat.
- Ingen ny autofix-regel utöver E5-konsolideringen (som snarare *tar bort* regler).
- Rör inte `type-only-import-fixer.ts` eller `import-alias-type-syntax-fixer.ts` — egna problemdomäner, OMTAG 07 adresserar dem via prompt istället.
- M4 får inte landa utan eval-gate — inga "det känns rätt"-bedömningar.
- Rör inte verifier-pass eller repair-loop.

## Acceptance criteria

- [ ] E4: Required Imports Checklist renderas i system-prompt för både init och follow-up. Mätbar minskning av `autofix.heavy_load`-triggers i eval-resultat (≥ 30 %).
- [ ] E5: 3 gamla filer borta, 1 ny, tester gröna. `rg "react-(hook-)?import-fixer|nextjs-navigation-import-fixer"` noll träffar utanför arkiv.
- [ ] M4: eval-baseline visar villkoren uppfyllda + `syntaxFixPasses: 1` i manifest, ELLER dokumenterat avslag i `OMTAG/fas2-C-m4-findings.md`.
- [ ] E6: script + CI-hook finns, failar vid överträdelse i test-läge.
- [ ] `npm run typecheck` + `npm run lint` + `npx vitest run` grönt.
- [ ] Eval-baseline på branchen — ingen regression (E4+E5+E6 ska om något *förbättra*, inte försämra).

## Branch

`omtag/fas2-C-autofix-import-hardening`
