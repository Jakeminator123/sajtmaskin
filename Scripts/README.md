# Skript (manuell research / Zone 1)

Alla kommandon körs från **projektroten** (`sajtmaskin/`) sökvägar är relativa dit.

**Python:** en gång per maskin:

```bash
pip install requests beautifulsoup4
```

---

## 1) Vercel Templates — `hamta_sidor.py`

Skrapar Vercel mallsidor (use-case-kategorier eller egna URL:er), skriver `summary.json`, `ingestion_report.json` och valfritt klonar till `…/repo/` per mall.

**Standard output-mapp:** en **syskonmapp bredvid repot**, normalt `../vercel-scrape` från `sajtmaskin/`.

På din maskin betyder det typiskt:

- `C:\Users\jakem\dev\projects\vercel-scrape`

Du kan fortfarande override:a med `--output` eller `SAJTMASKIN_VERCEL_SCRAPE_DIR`.

**Kanoniska exempel-URL:er** (ingår som konstant i skriptet och kan köras med `--canonical-urls`):

- `https://vercel.com/templates/next.js/nextjs-boilerplate`
- `https://vercel.com/templates/saas/platforms-starter-kit`
- `https://vercel.com/templates/ecommerce/nextjs-commerce`

### Interaktiv körning (rekommenderat)

```bash
python scripts/hamta_sidor.py --interactive
```

### Steg 1 — metadata utan klon (snabbt, inga GB)

```bash
python scripts/hamta_sidor.py --skip-download
```

(Använder standard `../vercel-scrape` — sätt t.ex. `--output D:\vercel-scrape` om du vill.)

Fler mallar per kategori:

```bash
python scripts/hamta_sidor.py --skip-download --per-category 15
```

Bara de tre kanoniska URL:erna:

```bash
python scripts/hamta_sidor.py --skip-download --canonical-urls
```

Specifika URL:er:

```bash
python scripts/hamta_sidor.py --skip-download --urls ^
  "https://vercel.com/templates/next.js/nextjs-boilerplate" ^
  "https://vercel.com/templates/saas/platforms-starter-kit" ^
  "https://vercel.com/templates/ecommerce/nextjs-commerce"
```

### Steg 2 — granska

Öppna `../vercel-scrape/ingestion_report.json` (eller din `--output`).

### Steg 3 — klon (valfritt)

Kör om utan `--skip-download`, eller klona enstaka repo manuellt till samma struktur som skriptet skulle skapat.

### Steg 4–7 — normalisera och bygg (i repot)

```bash
npm run research:normalize -- --input ../vercel-scrape
npm run template-library:rebuild
npm run scaffolds:build
npm run verify:generated-paths
```

`template-library:rebuild` uppdaterar **bara** referenskatalogen under `src/lib/gen/template-library/` (inte v0-galleriets `template-embeddings.json`). Vill du även bygga om v0-vektorerna: `npm run template-library:rebuild:with-v0-gallery` eller `npm run templates:embeddings` separat.

`../vercel-scrape/` ska ligga **utanför** git-roten och Cursor-index (se `docs/architecture/repo-hygiene.md`).

### Viktig skillnad: mappstruktur vs klassificering

`vercel-scrape/` behåller **Vercels egna source-kategorier** som mappar (`ai/`, `saas/`, `ecommerce/`, ...). Det är avsiktligt, eftersom det gör råskrapet spårbart tillbaka till källan.

Klassificering som **`boilerplate`**, **`starter_kit`**, **`full_app`** och liknande sker **senare** i `npm run research:normalize`, och syns då i `research/normalized-catalog.json` som `repoType` och `promotionDecision`.

---

## 2) shadcn.io — `mirror_shadcn_io_templates.py`

Listar GitHub-repon från de fyra kategorisidorna på shadcn.io, paginerar, deduplicerar och kan **shallow-klona** till `_template_refs/shadcn-io-mirror/` (eller `$SHADCN_IO_MIRROR_DIR`).

Detta är medvetet en **lokal-only cache i repot**, inte runtime-data. Den får ligga kvar där så länge den är gitignored/cursorignored. Flytta bara ut den om storleken blir störande eller om du vill ha allt researchmaterial samlat på annan disk.

Om du kör en större spegling (t.ex. 200+ shallow clones) kan `_template_refs/shadcn-io-mirror/` snabbt bli **1 GB+**. Då är det fullt rimligt att i stället sätta `SHADCN_IO_MIRROR_DIR` till en syskonmapp som `../shadcn-io-mirror/`.

### Interaktiv körning

```bash
python scripts/mirror_shadcn_io_templates.py --interactive
```

### Endast manifest (ingen clone)

```bash
python scripts/mirror_shadcn_io_templates.py --dry-run
```

Se även `GRUND/KALLOR_shadcn_io.md`.

---

## 3) Vercel — städa teamprojekt — `prune-vercel-projects.ps1`

Listar alla projekt under ett Vercel-team och raderar alla **utom** en fast lista (standard: `sajtmaskin`, `app-directory`, `flytta_nu`, `aev`, `aecv`, `blazel`, `dg-97`, samt `v0-dg-97` och `v0-bla-zel` om samma appar skapats med v0-prefix). Använder [Vercel REST API](https://vercel.com/docs/rest-api) (`GET/DELETE /v9/projects`).

**Miljö:** `VERCEL_TOKEN` och `VERCEL_TEAM_ID` (t.ex. `team_...`). Enklast: låt `_run-prune-from-envlocal.ps1` läsa dem från `.env.local`:

```powershell
pwsh .\Scripts\_run-prune-from-envlocal.ps1
pwsh .\Scripts\_run-prune-from-envlocal.ps1 -Force
```

Samma sak med manuellt satta variabler: `pwsh .\Scripts\prune-vercel-projects.ps1` (torrkörning) eller `... -Force`. Valfritt: `-Keep 'proj-a','proj-b'` för att override:a allowlisten.

---

## 4) Env-referenskommentarer — `patch-env-reference-headers.py`

Lägger till (eller återställer) dokumentationsblock överst i `.env.local` och motsvarande block i `.env.production` om det saknas: Vercel CLI (`vercel link`, `vercel env pull`), delad Upstash Redis med `REDIS_KEY_PREFIX`, samt byter `AI_GATEWAY` + kommenterad `AI_GATEWAY_API_KEY` till en ren `AI_GATEWAY_API_KEY`-rad i `.env.local` (flera API-rutter kollar bara det namnet).

```bash
python Scripts/patch-env-reference-headers.py
```

Idempotent — säkert att köra om efter att du redigerat manuellt.
