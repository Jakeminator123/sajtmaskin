---
id: 2026-06-17-dev-startup-resilience
status: done
created: 2026-06-17
linear: null
parent: null
supersedes: null
---

# Dev-startup resilience (`npm run dev` hängde / dog)

**Commit:** `7fd587585` (master, pushad till origin). Föregående OpenClaw/Render-commit: `b69b13686`.

## Problem

`predev` körde blockerande DB- + nätverksjobb utan timeout vid varje dev-start. Trög/onåbar DB eller nät → hängning, och `db-init` exit 1 bröt `&&`-kedjan → dev-servern startade aldrig. Sekundärt: kvarhängande dev-server låste port 3000/3310.

## Vad som gjordes

| Fil | Ändring |
|---|---|
| `scripts/db/db-init.mjs` | Pool: `connectionTimeoutMillis: 5000`, `statement_timeout: 15000`, `query_timeout: 15000` |
| `scripts/db/add-performance-indexes.mjs` | Bara `connectionTimeoutMillis: 5000` (anti-hang). INTE statement/query-timeout — skriptet kör plain `CREATE INDEX` som kan ta >15s på stor tabell och annars kapas |
| `scripts/dev/refresh-token.mjs` | `timeout: 20000` på `execSync("npx --yes vercel env pull ...")` |
| `package.json` | `predev` → `node scripts/dev/predev.mjs`; nytt `db:init:soft`; nytt `dev:fast` |
| `scripts/dev/predev.mjs` (ny) | Wrapper: `SKIP_PREDEV=1` hoppar hela uppvärmningen; `preflight:common` är enda hårda gaten; schema-drift borttagen ur predev |
| `scripts/dev/dev-fast.mjs` (ny) | Cross-platform `dev:fast` som sätter `SKIP_PREDEV` internt (slipper skal-syntax) |
| `scripts/dev/unlock-dev.mjs` (ny, från parallell agent) | `dev:unlock` — dödar processer som lyssnar på 3000/3310 |

## Kommandon

```
npm run dev          # normal start, hänger inte längre om DB är trög/nere
npm run dev:fast     # snabb start, hoppar predev (alla skal)
npm run dev:unlock   # frigör port 3000/3310 vid EADDRINUSE
npm run dev:clean    # rensa .next-cachen (stäng dev/build först)
```

PowerShell-not: bash-syntaxen `SKIP_PREDEV=1 npm run dev` fungerar **inte** i pwsh — använd `$env:SKIP_PREDEV=1; npm run dev`, eller bara `npm run dev:fast`.

## Verifierat

`node --check` på alla skript OK · `npm run lint` 0 fel (ReadLints) · `package.json` giltig JSON · `SKIP_PREDEV`-vägen exit 0 utan att röra DB. Full baseline (typecheck/lint/test/build) var grön på basen `1456cc03` innan detta arbete.

## Kvar för nästa agent (valfritt, ej gjort)

| Fynd | Förslag |
|---|---|
| `vercel` saknas i devDependencies | `npx --yes vercel` laddar ner CLI vid behov. Lägg `vercel` som devDep → lokal/snabb, och 20s-timeouten blir mindre relevant |
| RAG-indexern `await`:as i `next-runner.mjs` (~rad 262) | Blockar upp till 5s vid varje start (tidskapad). Kan göras fire-and-forget om snabbare start önskas — men den är medvetet awaitad för färsk snapshot |
| Schema-drift borttagen ur predev | Säkerställ att `npm run db:schema-drift` körs i CI/pre-push så drift fortfarande fångas |
| Node-version | Repo pinnar Node 22 (`engines: <23`). Aktiv LTS i juni 2026 är Node 24 — ev. bump som egen isolerad ändring (rör 5 pin-ställen + Dockerfile) |

## Kontext

- Backup-tag före allt detta: `backup-2026-06-17-pre-stora-forandringar` → `1456cc03` (på origin).
- Tidigare WIP (cursorignore, node-version-rename, env-note, `deep-research-report.md`) ligger i `stash@{0}` — ej del av detta arbete.
