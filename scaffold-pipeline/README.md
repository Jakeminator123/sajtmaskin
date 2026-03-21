# scaffold-pipeline (legacy + aktiva skript)

Denna mapp innehu00e5ller **u00e5terstu00e4llda legacy-skript** och en **arkitekturbeskrivning** av Vercels mallsidor.

**Ny kanonisk lane-modell:** se [docs/architecture/scaffold-lane-model.md](../docs/architecture/scaffold-lane-model.md).

## Filer

| Fil | Roll |
|-----|------|
| `scripts/hamta_sidor.py` | Skrapar Vercel Templates per use case eller `--urls`. Skriver till **Zone 1** (utanfu00f6r repo). |
| `scripts/scaffold-pipeline.py` | Legacy interaktiv meny. **Ku00f6r inte direkt** -- de npm-skript den anropade har bytt namn. |
| `vercel-templates-arkitektur.md` | Beskrivning av Vercels filter-URL:er, detaljsidor och repo-vu00e4gar. |

## Ny kedja (ersu00e4tter gamla menyn)

```bash
# 1. Skrapa till extern katalog (Zone 1)
python scaffold-pipeline/scripts/hamta_sidor.py --output ~/vercel-scrape --skip-download

# 2. Normalisera till repot (Zone 1 -> Zone 2)
npm run research:normalize -- --input ~/vercel-scrape

# 3. Bygg template-library + embeddings (Zone 2 -> artifacts)
npm run template-library:rebuild

# 4. Bygg scaffold-research + embeddings + validera
npm run scaffolds:build

# 5. Verifiera paths
npm run verify:generated-paths
```

Se `docs/architecture/scaffold-lane-model.md` fu00f6r fullstu00e4ndig tre-zone-modell.
