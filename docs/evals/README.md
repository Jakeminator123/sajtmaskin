# docs/evals

Genererade eval-rapporter (markdown) från backoffice-vyn **Eval** (`backoffice/pages/eval_page.py` → "Exportera latest summary.md till docs/evals") och manuella `npm run eval -- --codegen` / `--full`-körningar.

- Rapporterna är **datumstämplade ögonblicksbilder** — inte runtime-sanning. De skapas vid behov; mappen kan vara tom mellan körningar.
- Äldre april-2026-rapporter togs bort 2026-06-23 (inaktuella; eval-scripten konsoliderade). Historik finns i git.
- Refereras av `config/backoffice/domain-map.json` (Eval-sidan). Den här README:n håller mappen spårad så att domain-map-parity-testet (`src/lib/config/backoffice-domain-map.parity.test.ts`) hittar `docs/evals/`.

Kanonisk eval-kod: `src/lib/gen/eval/` (+ `src/lib/gen/eval/README.md`).

Scaffold-selection- och variant-eval-JSON skrivs **lokalt** till `data/scaffold-eval/reports/` (gitignorerade, per-maskin). De är eval-evidens för Backoffice/verktyg och påverkar aldrig runtime-matcherns kandidatpool. Scaffold-rapporten skrivs av `npm run eval` (canonical); variant-eval körs med `npx tsx scripts/scaffolds/eval-landing-variants.ts`. Prompt-fixtures (`prompts.json`, `landing-variant-prompts.json`) ligger kvar i git under `data/scaffold-eval/`. Kanonisk eval-docs: `src/lib/gen/eval/README.md`.
