# Dossier-promotion: skiss → draft → active

> **Senast uppdaterad:** 2026-04-18.
> **Vad som äger flödet:** scripts under `scripts/dossiers/` + backoffice "Kurations-kö"-flik.
> **När du läser detta:** du vill veta vad som händer när du klickar "Promote ALLA" eller liknande.

---

## Tre lager

| Lager | Var det bor | Status | Runtime-aktiv? |
|---|---|---|---|
| **Skiss** | `data/dossiers/_raw/<id>/skiss.json` | scrape-output med Vercel-metadata + GitHub-sidecar | Nej |
| **Draft** | `data/dossiers/<id>/manifest.json` (status: `draft`) | Färdig manifest-struktur, men `_status: "draft"`. Tomma `files`/`envVars` om inte extract gjorts | Nej |
| **Active** | `data/dossiers/<id>/manifest.json` (status: `active`) | Färdig manifest + `instructions.md` + `components/*` filer | **Ja** |

---

## Pipeline-stegen från skiss till active

```
SCRAPE  →  ENRICH  →  GITHUB-ENRICH  →  IMPORT  →  PROMOTE  →  CLONE  →  EXTRACT  →  CURATE  →  REBUILD
(3 min)  (14 min)    (2 min m. token)   (2 sek)    (1 sek)   (5-15 min) (10 sek)   (10 min)   (10 sek)
```

| Steg | Kommando | Vad det gör | Skriver till |
|---|---|---|---|
| 1 | `dossiers:scrape` | Playwright-skrapa Vercel-template-listan per kategori | `_raw/playwright-catalog-light.json` |
| 2 | `dossiers:enrich` | Playwright-besök varje template-detaljsida + extrahera badges/repo-URL | `_raw/_enriched/<slug>.json` |
| 3 | `dossiers:github-enrich` | GitHub API → archived/pushed_at/stars/topics per template | `_raw/_enriched/<slug>.github.json` |
| 4 | `dossiers:import` | Klassificera + filtrera + skapa skiss-filer (auto-skip archived/unreachable) | `_raw/<id>/skiss.json` |
| 5 | `dossiers:promote` | Läs `curated-promotions.txt` (eller `--all`) → skapa draft manifest | `data/dossiers/<id>/manifest.json` (status: draft) |
| 6 | `dossiers:clone-repos` | Shallow-clone varje drafts `sourceRepoUrl` | `_repo-cache/<id>/` |
| 7 | `dossiers:extract-files` | Plocka api-routes, middleware, .env.example, package.json från cache | `data/dossiers/<id>/components/` |
| 8 | `dossiers:curate` | LLM (gpt-5.4) skriver `instructions.md` + sätter `_status: active` | `data/dossiers/<id>/instructions.md` |
| 9 | `dossiers:rebuild` | Bygg `master.json` + `scaffold-recommendations.json` + embeddings | `data/dossiers/_index/*` |

**Snabbaste vägen:** `npm run dossiers:full-pipeline -- --with-promote-all --with-clone --with-extract --with-curate --with-rebuild`

---

## Vad händer när du klickar "Promote ALLA" i backoffice?

| Action | Vad som sker omedelbart | Vad du måste göra efteråt manuellt |
|---|---|---|
| Klicka "Promote ALLA" | (1) Skriver alla skiss-IDn till `curated-promotions.txt`. (2) Kör `dossiers:promote`. (3) Skapar `data/dossiers/<id>/manifest.json` (status: draft) för varje skiss. | Köra clone + extract + curate i terminal (de stegen är för långa för Streamlit) |
| Granular promotion | Samma men bara för markerade rader | Samma |

**Kritiskt:** efter promote är dossiers `draft` och **filtreras automatiskt bort vid runtime** (de visas inte för codegen-LLM:n). Först efter `auto-curate.ts` har skrivit `instructions.md` + satt `_status: "active"` är de runtime-aktiva.

---

## Storage-prognos

| Antal drafts | Repo-storlek (shallow clone, skattning) | AI-kuration kostnad (gpt-5.4) | AI-kuration tid |
|---|---|---|---|
| 30 | ~240 MB | ~$1.5-4.5 | ~6 min |
| 100 | ~800 MB | ~$5-15 | ~20 min |
| 149 (alla idag) | ~1.2 GB | ~$7-22 | ~30 min |
| 200+ | 1.5+ GB | ~$10-30 | ~40 min |

**Allt i `_repo-cache/` är `.gitignore`-täckt** — påverkar inte git-push och försvinner vid `rm -rf data/dossiers/_repo-cache/`.

---

## Källhälsa-filter (från Fas 1.0+)

`dossiers:import` läser den GitHub-sidecar som `dossiers:github-enrich` skrev och **skippar candidates med `sourceVerdict !== "ok"`**:

| sourceVerdict | Action vid import |
|---|---|
| `ok` | Skapas som skiss |
| `source-archived` | **Skippas** (loggas som `github-archived`) |
| `source-stale` | Skapas (men flaggas i sidecar) |
| `source-unreachable` | **Skippas** (loggas som `github-unreachable`) |
| `no-source` | Skapas (kanske hand-curated senare) |

Override: `npm run dossiers:import -- --allow-archived-sources` om du vill se gamla också.

---

## Backoffice-kontroller

| Flik i Dossiers-sidan | Vad du kan göra |
|---|---|
| Översikt | Se aktiva/drafts/embeddings i siffror |
| Lista | Se alla dossiers med `_deprecationReason`-kolumn |
| Källhälsa | Kör `compat`-pass + bulk-enrich + se rapport |
| AI-kurera | Triggea `auto-curate.ts` per draft eller hela batchen |
| Scaffolds & Variants | Variant-embeddings + hälsa |
| Möblera | Redigera `scaffold-recommendations.json` per scaffold |
| **Kurations-kö** | **Granulär promotion + storage-prognos + bulk-actions** |
| Pipeline | Snabb-knappar för enskilda steg |
| Filer | Status på alla _index-filer |

---

## Felsökning

| Symptom | Trolig orsak | Fix |
|---|---|---|
| `compat-test` säger 21 unreachable | Rate-limit (anonymt = 60/h) | Sätt `GITHUB_TOKEN` i `.env.local` |
| `import` skapar 0 drafts | `_enriched/` saknas | Kör `dossiers:enrich` först |
| `clone-repos` skippar dossier | `_status` är `source-*` | Compat-test eller manuell statusfix |
| Backoffice "Promote"-knapp gör inget | `curated-promotions.txt` är tom | Markera kandidater i editorn först |
| AI-kuration timeout | gpt-5.4 är långsam | Kör i terminal (`npm run dossiers:curate`) inte backoffice |
| PowerShell `&&`-fel | PS-syntax | Använd `npm run dossiers:full-pipeline` istället |

---

## Ändringslogg

| Datum | Ändring |
|---|---|
| 2026-04-18 | Skapad. Dokumenterar promotion-flödet efter Fas 1.5 + Vercel-katalog-utbyggnad. |
