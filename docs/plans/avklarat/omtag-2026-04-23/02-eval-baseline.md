---
id: omtag-02-eval-baseline
title: Eval-baseline — canonical prompts + snapshot-pipeline + CI-gate
phase: 0
priority: P0
parallell_med: [01-embedding-diagnos, 04-env-flag-collapse, 07-static-core-type-imports]
blockerad_av: []
estimat: "3–4 h"
owner_files:
  - evals/**
  - scripts/evals/**
  - .github/workflows/evals.yml (ny, om tid finns)
---

# 02 — Eval-baseline

## Mål

Bygg en mätsticka. 10 canonical prompts som körs mot generations-pipelinen och sparar `preflight.summary`, autofix-stats, screenshot-URL och timing. Målet är **inte** att passa/fälla eval:en — målet är att kunna säga *"efter commit X tappade prompt Y 3 autofix-fler-fixes"* istället för *"det känns sämre senaste dygnet"*.

## Varför det här först

Alla andra diskussioner om "bättre/sämre" är intuitioner utan denna. Den ska köras på master **idag** för att etablera före-bild, och sen på varje fas 1 + 2-branch innan merge.

## Scope

| In | Ut |
|---|---|
| Ny mapp `evals/` med 10 `*.prompt.json`-filer | Röra gen-pipelinen (den konsumeras, inte ändras) |
| Script `scripts/evals/run-baseline.mjs` | Ändra `system-prompt.ts` / `build-spec.ts` |
| Output `evals/results/YYYY-MM-DD-HHMM/` (gitignorerad) | Lägga till fancy ML-metriker |
| Kort `evals/README.md` | Träna embeddings / RAG |

## Inputs

1. `src/lib/gen/stream/finalize-version.ts` — se vad `preflight.summary` innehåller
2. `src/lib/gen/autofix/validate-and-fix.ts` — autofix-statistik-struktur
3. `src/lib/gen/scaffolds/matcher.ts` — `ScaffoldSelectionMeta` (för att logga scaffold-val per eval-run)
4. Befintliga fixtures under `src/lib/gen/**/__fixtures__/` för inspiration kring prompt-form

## De 10 canonical prompts

Namn dem efter mönster (scaffold + nisch). Minst 1 per scaffold-kategori:

| # | Slug | Prompt-sammanfattning | Förväntad scaffold |
|---|---|---|---|
| 1 | `landing-pulseframe` | "Bygg en lyxig kamera-SaaS-landing för varumärket Pulseframe" | landing-page |
| 2 | `landing-ubaten-barn` | "Barnwebbplats för ubåts-museum i Karlskrona" | landing-page |
| 3 | `landing-tvspelshall` | "Retro-arkad tvspelshall i Malmö" | landing-page |
| 4 | `saas-checkout` | "SaaS för mikro-betalningar med pricing + checkout" | checkout / saas |
| 5 | `blog-minimalist` | "Minimalistisk personlig blogg för en lärare" | blog |
| 6 | `portfolio-fotograf` | "Porträttfotograf portfolio, elegant, svart-vitt" | portfolio |
| 7 | `restaurant-nordic` | "Nordisk fine-dining restaurang, bokningsbar" | restaurant |
| 8 | `ecommerce-skor` | "E-butik för handgjorda skinnskor, ~12 produkter" | ecommerce |
| 9 | `agency-b2b` | "B2B-konsultbyrå inom hållbarhet" | agency |
| 10 | `dashboard-internal` | "Internt dashboard för order-tracking (fiktivt SaaS)" | dashboard |

Format `evals/pulseframe.prompt.json`:

```json
{
  "id": "landing-pulseframe",
  "prompt": "Bygg en lyxig kamera-SaaS-landing för varumärket Pulseframe...",
  "expected": {
    "scaffold": "landing-page",
    "variant_any_of": ["saas-hero", "product-focused"],
    "min_routes": 1
  }
}
```

## Exekveringssteg

1. **Mappstruktur**: skapa `evals/`, `evals/results/.gitkeep`, `scripts/evals/`.
2. **10 prompt-filer**: fyll i enligt tabellen. Kort + realistiska, max 60 ord per prompt.
3. **Runner** `scripts/evals/run-baseline.mjs`:
   - Läs alla `evals/*.prompt.json`
   - Anropa genstream-end-point eller direkt `finalize-version`-flödet (fråga `src/app/api/engine/.../stream/route.ts` för rätt surface)
   - För varje prompt: spara i `evals/results/<timestamp>/<slug>.json`:
     - `preflight.summary`
     - autofix-stats (`fixes`, `warnings`, `rules_invoked`)
     - `scaffoldSelectionMeta`
     - `verifier.*`
     - `durationMs` per fas
     - `previewBlocked`, `verificationBlocked`
4. **Diff-script** `scripts/evals/diff-results.mjs`:
   - `node scripts/evals/diff-results.mjs <before-dir> <after-dir>` → tabell med regressions/wins per prompt
5. **README** `evals/README.md`: hur man kör + vad varje kolumn betyder.
6. **Kör på master**: committa mappen, sen kör `node scripts/evals/run-baseline.mjs` en gång och checka in **en** baseline under `evals/results/baseline-master/` (undantag från `.gitignore`).
7. **Lägg `evals/results/<timestamp>/` utom baseline i `.gitignore`**.

## Får INTE göras

- Ingen screenshot-diff ännu (kräver preview-host-koppling — det är fas 3).
- Ingen ML-scoring / LLM-as-judge (det är en ny indirection — håll det deterministiskt).
- Inga ändringar i gen-pipelinen — bara *konsumerar* dess output.

## Acceptance criteria

- [ ] 10 prompt-filer i `evals/`.
- [ ] `node scripts/evals/run-baseline.mjs` kör felfritt från ren klon.
- [ ] `evals/results/baseline-master/` checkat in med resultat från dagens master HEAD.
- [ ] `evals/README.md` beskriver hur ny agent kör eval på sin branch innan merge.
- [ ] `npm run typecheck` + `npm run lint` grönt på eventuell TS-kod.

## Branch

`omtag/02-eval-baseline`
