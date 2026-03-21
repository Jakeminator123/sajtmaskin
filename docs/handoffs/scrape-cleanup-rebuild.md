# Scrape, Cleanup and Rebuild Handoff

Status: Active (2026-03-21)

## What was done

### Phase 1: Scripts folder fix
- Renamed `scripts/` (lowercase, Windows alias) back to `Scripts/` (capital S) to match Git tracking and all 12+ `package.json` references
- `.cursorignore` had `Scripts/**` rules removed by user in earlier session; not restored (user's intentional unlocking for indexing)

### Phase 2: Fresh Vercel template scrape
- Ran `Scripts/hamta_sidor.py --output ../vercel-scrape --per-category 10 --skip-download`
- Result: **147 templates** across **25 use-case categories** (metadata only, no repo clones)
- Clone mode was skipped because many `repo_url` values contain `/tree/main/...` suffixes that fail `git clone`
- `summary.json` and `ingestion_report.json` are now populated

### Phase 3: Normalized catalog rebuild
- Ran `npm run research:normalize -- --input ../vercel-scrape`
- Added `cleanRepoUrl()` to strip `/tree/main/...`, `/blob/main/...`, `.git` suffixes from repo URLs
- `rawSourcePath` uses relative path (`../vercel-scrape`), no machine-specific paths
- `npm run verify:generated-paths` passes

### Phase 4: Dossier quality fix
- Updated `config/scripts/generate-dossiers-from-catalog.ts`:
  - Replaced generic 3-item checklist prefix with per-scaffold-specific checklists (5 items each)
  - Added signal-based items (AI, CMS, multi-tenant, auth) only when relevant
  - Capped at 8 items per dossier
- Generated **145 dossiers** with category-specific content

### Phase 5: Scaffold research dedup
- Updated `config/scripts/build-scaffold-research.ts`:
  - Removed stale `existingData` fallback (always rebuild fresh from dossiers)
  - Capped `qualityChecklist` to 10, `upgradeTargets` to 6, `referenceTemplates` to 3 per scaffold
- Result: `scaffold-research.generated.json` is now **21KB** (was 52KB with duplication)
- **86 total checklist items** across 10 scaffolds (avg 8.6/scaffold)

### Phase 6: Embeddings rebuilt
- `scaffolds:embeddings`: 10 scaffolds, 0.31MB, text-embedding-3-small
- `template-library:rebuild`: 147 entries, 6.53MB embeddings
- `template-library:smoke-search`: passes (semantic search works correctly)

## Catalog counts

| Catalog | Entries | Embeddings |
|---------|---------|------------|
| Scaffolds | 10 | 10 (0.31MB) |
| Template library | 147 | 147 (6.53MB) |
| Dossiers | 145 | N/A (feed scaffold-research) |
| v0 Gallery | ~245 | 9.2MB (not rebuilt this session) |

## Dossier distribution per scaffold

| Scaffold | Dossiers |
|----------|----------|
| base-nextjs | 33 |
| landing-page | 25 |
| blog | 17 |
| saas-landing | 14 |
| app-shell | 14 |
| ecommerce | 12 |
| content-site | 12 |
| portfolio | 9 |
| auth-pages | 7 |
| dashboard | 2 |

## Known remaining items
- Repo cloning skipped due to bad URL extraction in `hamta_sidor.py` -- URLs with `/tree/main/...` fail
- `GRUND/ggg/` in repo root is a user test project -- should not be committed
- `.cursorignore` is in a user-managed state with many lines commented out

## See also

- [`local-operator-guide.md`](local-operator-guide.md) — testa med `npm run dev`, dossiers vs scaffolds, sandbox, shadcn-speglade repon
