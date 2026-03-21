# scaffold-pipeline (legacy + aktiva skript)

Denna mapp innehåller **återställda legacy-skript** och en **arkitekturbeskrivning** av Vercels mallsidor.

**Ny kanonisk lane-modell:** se [docs/architecture/scaffold-lane-model.md](../docs/architecture/scaffold-lane-model.md).

## Filer

| Fil | Roll |
|-----|------|
| `../scripts/hamta_sidor.py` | **Kanonisk plats.** Skrapar Vercel Templates (`--interactive` eller CLI). `scaffold-pipeline/scripts/hamta_sidor.py` är tunn wrapper. Skriver till **Zone 1** (helst utanför repo, standard `../vercel-scrape`). |
| `scripts/scaffold-pipeline.py` | Legacy interaktiv meny. **Kör inte direkt** — de npm-skript den anropade har bytt namn. |
| `vercel-templates-arkitektur.md` | Beskrivning av Vercels filter-URL:er, detaljsidor och repo-vägar. |

## Ny kedja (ersätter gamla menyn)

```bash
# 1. Skrapa till extern katalog (Zone 1)
python scripts/hamta_sidor.py --skip-download

# Interaktiv meny:  python scripts/hamta_sidor.py --interactive

# 2. Normalisera till repot (Zone 1 -> Zone 2)
npm run research:normalize -- --input ../vercel-scrape

# 3. Bygg template-library + embeddings (Zone 2 -> artifacts)
npm run template-library:rebuild

# 4. Bygg scaffold-research + embeddings + validera
npm run scaffolds:build

# 5. Verifiera paths
npm run verify:generated-paths
```

Se `docs/architecture/scaffold-lane-model.md` för fullständig tre-zone-modell.
