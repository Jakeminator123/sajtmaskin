# Templates (v0-mallar) — canonical flow

Hur "Templates" (builderns Mallar-tab / förstasidan → **Templates** → kategori) faktiskt existerar och används. Detta är en **helt annan väg** än fritext-generering: en importerad mall är ett färdigt v0-repo som körs **ordagrant (verbatim)**, medan fritext-sajter genereras av `own-engine` mot en fast scaffold-baseline.

> Kod är source of truth. Denna doc speglar runtime per 2026-07-08; verifiera mot koden vid tvekan.

## 1. Två dataset, länkade via `id`

| Dataset | Fil (incheckad) | Roll |
|---|---|---|
| Galleri/katalog | `src/lib/templates/templates.json` + `template-categories.json` | Vad som **visas/klickas** på `/templates` och `/category/[type]` |
| Körbart arkiv | `src/lib/templates/template-blob-manifest.json` | Vilken **ZIP** som hämtas vid klick (id → `archiveUrl` + SHA-256 + previewFit) |

Båda länkas via mall-`id`. Alla tre filerna **genereras** — se §5. Klientkoden läser lib-modulerna direkt (`template-data.ts` → `template-catalog.ts` → `client.ts`); det finns ingen runtime-DB för mallkatalogen.

## 2. Klick-till-preview-vägen

```text
/templates → /category/[type] → klick "Redigera"
  → skapar projekt, navigerar /builder?templateId=<id>&buildIntent=template
  → useBuilderEffects auto-POSTar POST /api/template  ({ templateId, quality })
  → getLocalV0TemplateSourceById(id)      # lokal disk-override → annars Blob
  → loadLocalV0TemplateFiles(id)          # ZIP → CodeFile[] (verbatim + Normalize, se §4b)
  → createDraftVersion(..., editKind: "imported_repo")
  → startPreviewSession(files, { skipRepair: true, skipProjectScaffold: true })
  → preview-host (Fly VM): skriv filer → npm/pnpm/yarn install → npm run dev
```

Ägare: `src/app/api/template/route.ts`, `src/app/builder/useBuilderEffects.ts`, `src/lib/templates/local-v0-template-source.ts`, `src/lib/gen/preview/preview-session.ts`.

## 3. Källordning (lokal override → Blob)

`getLocalV0TemplateSourceById` (`local-v0-template-source.ts`):

1. **Lokal disk** — `templates_v0/out/downloaded.jsonl` → arkiv på disk. `templates_v0/` är **gitignored** → finns aldrig i prod. Endast en dev-override.
2. **Blob** — `template-blob-manifest.json` → `archiveUrl` (publik Vercel Blob).

**I prod gäller därför alltid Blob.** Saknas både lokal disk och Blob-rad → `POST /api/template` svarar `409 local_template_source_missing`.

## 4. Verbatim-import vs fritext (den viktiga skillnaden)

| Aspekt | Template (denna väg) | Fritext / scaffold |
|---|---|---|
| Innehåll | Färdig ZIP från Blob | `own-engine` genererar filer |
| package.json | Mallens **egna** versioner | Fast baseline (`project-scaffold.ts`) |
| LLM vid init | Nej | Ja |
| Repair/scaffold-merge | Hoppas över (`skipRepair`, `skipProjectScaffold`) | Körs (`buildCompleteProject`) |
| Provenance | `editKind: "imported_repo"` | normal |

**Vid follow-up-redigering** av en importerad mall körs `buildCompleteProject`, som mergar mot baselinen men **bara force-pinnar** `next`, `react`, `react-dom`, `lucide-react` (`BASELINE_PINNED_DEPS`). Allt annat (inkl. `tailwindcss`) behåller mallens version, och scaffold-filer injiceras bara om de **saknas**. Project-sanity-fel nedgraderas till varningar för `imported_repo`; render-safety-gates (home-route, merged-syntax) är kvar.

### 4b. Normalize vid import (enda undantaget från verbatim)

`normalizeImportedRepoFiles` (`src/lib/templates/normalize-imported-package-json.ts`) körs på både template-importen (`loadLocalV0TemplateFiles`) och ZIP/GitHub-importen (`/api/engine/chats/init`) och gör **en** deterministisk repair på rot-`package.json`:

- **Motion lockstep-skew:** om `framer-motion` är exakt-pinnad `< 12.41.0` **utan** lockfil och utan egen `motion-dom`-deklaration injiceras `"overrides": { "motion-dom": "12.40.0" }`. Bakgrund: motion-paketen publiceras i lockstep; `motion-dom@12.41.0` tog bort interna `activeAnimations` som äldre `framer-motion` fortfarande importerar, så en färsk `npm install` ger `Export activeAnimations doesn't exist in target module` och previewn dör på boot (upstream: motiondivision/motion#3744, resend/react-email#3599).
- Mallar **med** lockfil lämnas orörda (transitiva deps frysta; `npm ci` skulle avvisa en override som lockfilen inte speglar).

Allt annat innehåll är fortfarande verbatim.

## 5. Hur katalogen genereras (kanonisk väg)

```bash
npm run templates:blob:upload -- --upload --write-catalog --source=../mallar
```

`upload-mallar-blob.mjs` läser "mallar"-intaket, laddar upp ZIP:ar **och en stillbild per mall** till Blob och (med `--write-catalog`) skriver **alla tre** filerna: `template-blob-manifest.json` + `templates.json` + `template-categories.json`. Datans egna metadata bekräftar källan (`_source: template-blob-manifest.json`, `_discoveryMode: blob-manifest`).

**Kategori härleds i prioritetsordning** (fältet `categorySource` i manifestet visar vilken som vann):

1. `v0-title` — v0:s egen primärkategori ur mallsidans `ogTitle` ("… - Components Templates - v0 by Vercel") i `out/template-metadata/<id>.json`. Auktoritativ: det är mallens egen taxonomi.
2. `source-slugs` — v0-listsidor ur `downloaded.jsonl` (`sourceSlugs`, exkl. browse-all).
3. `intake-folder` — mappnamnet i intaget (legacy-beteendet). Mappen säger bara vilken listsida skrapern råkade stå på, därför sist.

**Stillbilder:** en bild per mall (listing-bild föredras, annars första detail-skärmdump) laddas till Blob under `v0-templates/images/<id>/still.<ext>` och skrivs som `preview_still_url` + `preview_image_url` i katalogen. `/api/template-image/<id>` finns kvar enbart som lokal dev-fallback (`templates_v0/` är gitignored och når aldrig prod).

Uploadern exkluderar mallar som överskrider preview-host-taken från galleriet (`previewFits:false`) men behåller dem i Blob.

> **Legacy borttagen (2026-07-08):** v0-auto-fetch-vägen (`sync-v0-templates.mjs`, `refresh-local-v0-catalog.mjs`, npm-scripten `templates:sync/refresh/local:refresh`, `.github/workflows/weekly-template-sync.yml`, admin-routen `/api/admin/templates/sync` och `TEMPLATE_SYNC_*`-env) är raderad. **Blob-vägen via `upload-mallar-blob.mjs` är enda sättet att generera katalogen.** Den lokala `templates_v0/`-disken finns kvar enbart som dev-override för arkivkällan (§3) och thumbnail-fallback.
>
> **Legacy borttagen (2026-07-09):** den parallella skrivvägen `sync-blob-catalog.mjs` (`templates:blob:sync`, äldre colocated-intake i `test_förslag_templates_blob/`) är raderad tillsammans med intake-mappen. Den ersatte hela manifestet utan merge, med annat nyckelformat och färre kategorier — en skrivkörning kunde kollapsa katalogen (tappa thumbnails/kategorier). `upload-mallar-blob.mjs` är nu enda skrivvägen till alla tre katalogfilerna och Blob-katalogpaths.

## 6. Preview-host-guardrails (vad en mall måste klara)

Verifierat i `preview-host/`:

| Guardrail | Värde |
|---|---|
| Node | 22.x |
| Start | `npm run dev -- --hostname 127.0.0.1 --port N` → **kräver `dev`-script** |
| Install | Lockfil-drivet: `pnpm-lock.yaml`→pnpm, `yarn.lock`→yarn, `package-lock.json`→`npm ci`, annars `npm install`. Timeout 10 min. |
| Payload-tak | **500 filer · 2 MiB/fil · 12 MiB totalt** (`preview-host/src/validate.js`) |
| `next.config.*` | Patchas med `basePath` — måste tåla det |
| Paket allow/deny | Finns inte — mallens `package.json` körs som den är |
| Env | `.env.local` byggs om i lager (harmless + tier3-stub i F2 → project-preview → user → mallens egen). Nycklar utanför det setet är `undefined` i F2. |

## 7. Exkludering (att gömma en mall)

Två mekanismer, båda **utan** att radera Blob:

1. **Storlek** — uploadern sätter `previewFits:false` och utelämnar mallen ur galleriet.
2. **Manuellt** — `EXCLUDED_TEMPLATE_IDS` i `src/lib/templates/template-data.ts` filtreras bort vid `TEMPLATES`-bygget (överlever regenerering; reversibelt genom att ta bort id:t). Används för mallar som inte kan boota (saknar `package.json`/`dev`, ej Next, eller kraschar på okuvrad env på modultopp).

## 8. Granska mallarnas kompatibilitet

```bash
node scripts/v0-templates/audit-template-repos.mjs            # alla, från Blob (cachat)
node scripts/v0-templates/audit-template-repos.mjs --dir <mapp med zip:ar>
```

Skriptet läser bara `package.json` + struktur + `process.env`-referenser ur varje ZIP och aggregerar (dumpar aldrig repo-innehåll). Full per-mall-data skrivs till `--out` (default `scratch-template-audit.json`).

## 9. Termer — Template ≠ Scaffold ≠ Dossier

**"Templates" och "v0-mallar" är samma sak** (historiskt skrapade från v0.dev, numera Blob-hostade). Fyra begrepp som inte får blandas:

| Begrepp | Vad | Var | Används av |
|---|---|---|---|
| **Template (v0-mall)** | Färdig sajt-ZIP, importeras **verbatim** | Vercel Blob (`template-blob-manifest.json`) | `/templates`, Mallar-tab, `POST /api/template` |
| **Scaffold** | Runtime-startpunkt för fritext-generering | `src/lib/gen/scaffolds/` | own-engine init |
| **Dossier** | Capability-modul som injiceras i own-engine-prompten | `data/dossiers/{hard,soft}/` | dossier-pipelinen (`select.ts`) |
| **Template-referens** | Klonat upstream-repo, input till dossier-kuration | `data/template-references/` | `dossiers:curate` |

Dossiers har inga kategorier, inga thumbnails och syns aldrig i template-galleriet. Template-referenser hör till dossier-systemet trots namnet. `/api/v0/` = API-versionering, inte den externa v0-providern.
