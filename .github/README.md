# GitHub automation

| Fil | Syfte |
|-----|--------|
| [`workflows/ci.yml`](workflows/ci.yml) | Push/PR mot `main` eller `master`: `npm ci`, typecheck, lint, test, build. |
| [`workflows/weekly-template-sync.yml`](workflows/weekly-template-sync.yml) | Manuell sync: `templates:refresh` (v0-templates i `src/lib/templates/`), valfritt embeddings; bot committar vid ändring. Ingen schemalagd körning medan mallkällan är lokal. |
| [`dependabot.yml`](dependabot.yml) | Veckovisa uppdateringar för npm och GitHub Actions. |
