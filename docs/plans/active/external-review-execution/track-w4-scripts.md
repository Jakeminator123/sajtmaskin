# Track W4 — Scripts / naming hygiene

**Källa:** `.j_to_agent/3.txt` avsnitt 5, `scripts/README.md`, `package.json` script-referenser  
**Parallellt med:** W3 own-engine (rekommenderat — separata filträd)  
**Verifiering:** `npm run typecheck && npx vitest run` (plus ev. `npm run` för script du rört om det finns dedikerat kommando)

---

## Uppdrag för worker-agent

1. Ta **en** av blocken nedan per iteration (eller exakt det orchestratorn tilldelat).
2. **Inget borttag** av fil utan `rg`/referensgrep i repo + uppdatering av README/package.json.
3. När klart: `- [x]` på relevanta rader i **den här filen**.
4. Uppdatera `external-review-remediation-progress.md` (**Scripts**-rad och **Whole vision** om du höjer ~43%-målet från progress-texten).
5. Rad i `MASTER-ROADMAP.md` → *Orchestrator / verifiering*.

---

## Levererat i repo (referens)

- [x] `scripts/README.md` + `scripts-scaffolds-inventory.md`: rättade sökvägar (`hamta_sidor*`), `template-library:verify-summary`, svenska i tabeller; recovery-skript markerade saknade

---

## Återstår

### hamta_sidor

- [x] **Beslut:** en kanonisk fil — dokumentera valet i `scripts/README.md` (**kanon:** `scripts/hamta_sidor_branch_emil.py`)
- [x] **Implementation:** `hamta_sidor_branch_emil.py` har `--legacy-wide-use-cases` (samma lista som gamla monolitiska skriptet); tidigare wrapper `scripts/hamta_sidor.py` **borttagen** — använd `python scripts/hamta_sidor_branch_emil.py --legacy-wide-use-cases …` vid behov
- [x] **Dokumentation:** alla paths i README/ kommentarer pekar på faktisk plats under `scripts/`

### Lab / debug-träd

- [x] **Struktur:** `scripts/testning_scarf/` → `scripts/labs/testning_scarf/`
- [x] **package.json:** script-paths uppdaterade (`prompt:trace`, `scaffold:suite`, `first-llm:*`, `testning:codegen-print`, `.gitignore` / `.cursorignore`)

### Övrig städning

- [x] **Drift:** grep efter fel sökvägar till scripts i `docs/`, `.cursor/`, root-README
- [x] **Ev. manuella skript:** `extract-static-core.mjs` — **avancerat, ej i package.json** i `scripts/README.md`. **`scaffold-pipeline.py`** flyttad till **`scripts/manual/scaffold-pipeline.py`** (B3-06); `scripts/README.md` + inventory uppdaterade.

---

## Exit-kriterium för spår W4 (för MASTER-ROADMAP Fas A)

Alla `- [ ]` under **Återstår** är `- [x]`, inga trasiga `npm run`-referenser, typecheck + vitest grönt, progress-doc uppdaterat.
