# Null-scaffold-kohort (mätning)

Separat från Scaffold: Av / `projekt-bas-app` (PR #940).

**Denna branch:** utöka `scripts/db/control-stats.mjs` så `(null)` inte
feltolkas — kohort × preview tri-state (ready / failed / pending).

Kör mot prod (read-only):

```powershell
$env:DOTENV_CONFIG_PATH = ".env.local"   # om nycklar ligger där
node scripts/db/control-stats.mjs --json --env=.env.vercel.production.pulled --days=14 --allow-insecure-ssl
```

Läs fälten `byScaffold` (tri-state) och `nullScaffoldCohorts`.
Template-härdning väntar tills `imported_repo.preview_failed` är synlig och
tydlig — inte på blandad ready/runs.
