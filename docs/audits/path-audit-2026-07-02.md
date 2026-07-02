# Path-audit — legacy-sökvägar och ignore-drift

**Datum:** 2026-07-02  
**Metod:** Read-only `/automat`-svärm (2 rundor × 8 agenter) + spot-check mot repo  
**Scope:** Docs, config, scripts, `src/`, `data/`, backoffice, preview-host, `.gitignore` / `.cursorignore` / VS Code-excludes

---

## Åtgärdslogg 2026-07-02 (fix-pass)

Efter audit gjordes en verifierad fix-pass. Fynden nedan behölls som referens; status uppdaterad här.

### Åtgärdat

| ID | Vad gjordes |
|----|-------------|
| P1-1 / P1-8 | `.gitignore`: `templates_v0/` (täcker `downloads/` som saknade ignore). |
| P1-4 | Skapade `data/prompt-dumps/README.md` (brutet `!`-undantag). |
| P1-12 | `.gitignore`: tog bort döda `src/lib/gen/template-library/*.json`-rader. |
| P3-28 | `.gitignore`: tog bort död `_scaffold_discovery/`-rad. |
| P1-9 | `glossary.md` + `llm-flow-target-worldclass.md`: `fas{1,2,3}-*.md` → `llm-pipeline.md`. `scaffold-system.md`: `research.py` → `scaffold_performance.py`. `orchestration-contract.md`: mjukade döda `OMTAG-06`-länkar. |
| P2-13 | `config/env-policy.json` + `config/codegen-core-manifest.json`: la bort legacy `template-library` ur fri text. |

### Manuellt kvar (`.cursorignore` är skrivskyddad för agenter)

Cursor tillåter inte att en agent skriver `.cursorignore` (den styr agentens egen läsåtkomst). Följande ändringar behöver göras för hand:

```diff
# 1. Ta bort de två döda template-library-raderna (P1-12):
- src/lib/gen/template-library/template-library-embeddings.json
- src/lib/gen/template-library/template-library.generated.json

# 2. Aktivera logs-ignore så !-whitelisten får effekt (P1-7):
- #logs/**
+ logs/**

# 3. Ta bort sista raden som dödar prompt-dumps-undantagen (P1-5):
- data/prompt-dumps/**   (rad ~160, ligger efter !-undantagen)

# 4. Lägg till (P1-6 säkerhet + P1-8 index-bloat):
+ .cursor/mcp.json
+ templates_v0/
```

### Medvetet ej ändrat (flaggat, kräver beslut/eget pass)

| ID | Varför |
|----|--------|
| P1-2 | `scaffold-embeddings.json` + `scaffold-research.generated.json` är gitignored men **tracked** — build-gaten `scaffolds:embeddings:check` kräver dem i Vercel-build. Avtrackning skulle bryta build. Lämnat som-är; kommentar tillagd i `.gitignore`. Beslut: commit-by-design vs regenerera-i-CI. |
| P1-3 | `data/scaffold-eval/reports/**` är tracked men **inte** gitignorat → ingen drift. `landing-variant-latest.json` läses av `eval-blocklist.ts`. Committat med avsikt. |
| P1-11 | `templates_v0/`-runtime-paths (`local-v0-template-source.ts`, `template-image`-route) är dev-fallback med prod-blob-väg → fungerar som designat. |
| P2-15 | `tsconfig.json`-excludes för icke-existerande mappar är defensiva skydd, inte döda. |
| P2-19 / P2-22 | `data/dossiers/_raw`, VS Code orphan-excludes = forward-compat, skapas vid curation/intake. Lågt värde. |
| P3-27 | `src/lib/mcp/local-engine.ts` + `builder/runtime-library-audit.ts` ser döda ut, men `generate-site.ts` refereras av eval-harness. Radering av src-kod = eget beslut/pass. |
| naming-dictionary.json | `template-library` är en medveten kontrollerad term (term-check-tooling). Ej rörd. |
| domain-map.json | "15 projektregler" matchar sin egen kurerade lista. Lågt värde. |

---

## Sammanfattning

| Prio | Antal | Tema |
|------|-------|------|
| **P1** | 12 | Gitignore/cursorignore-drift, spårade genererade JSON, `templates_v0`-lucka |
| **P2** | 14 | Döda doc-länkar, legacy `template-library`, orphan config-excludes |
| **P3** | 6 | Orphan TS-moduler, script-gap, preview-runbook |

**Huvudslutsats:** Runtime-koden är i stort sett ren — största problemet är **dokumentationsdrift** (döda länkar, legacy-namn) och **ignore-inkonsistens** (saker som docs säger är gitignorerade men inte är det, plus filer som är gitignorerade men fortfarande tracked).

---

## Metod (kort)

1. **Inventera** — backtick-paths och markdown-länkar i docs; `readFile`/`join`/`import` i kod; `package.json`-scripts.
2. **Klassificera** — `active` | `dead` | `stale-doc` | `runtime-local` | `generated-app`.
3. **Verifiera existens** — finns på disk, gitignored, eller historik?
4. **Kontrollera användning** — `rg` i src/scripts/config/backoffice/tests.
5. **Rapportera med konfidens** — se tabellerna nedan.

### Klassificering

| Klass | Betydelse |
|-------|-----------|
| `active` | Finns och används |
| `dead` | Finns inte; referensen formulerad som aktuell |
| `stale-doc` | Historisk referens utan tydlig historikmarkering |
| `runtime-local` | Saknas i repo men skapas lokalt / gitignored |
| `generated-app` | Gäller genererad användarsajt, inte Sajtmaskin-repot |

---

## P1 — bör fixas

### Ignore och git-drift

| ID | Klass | Fynd | Konf. | Åtgärd |
|----|-------|------|-------|--------|
| P1-1 | git-missing | `templates_v0/downloads/` **ej** i `.gitignore` — docs påstår gitignored (`scripts/README.md`, `test_förslag_templates_blob/README.md`) | 98% | Lägg `templates_v0/downloads/` (+ ev. hela `templates_v0/`) i `.gitignore` och `.cursorignore` |
| P1-2 | git-drift | `src/lib/gen/scaffolds/scaffold-embeddings.json` + `scaffold-research.generated.json` — i `.gitignore:85-86` men **fortfarande tracked** | 100% | Beslut: `git rm --cached` **eller** ta bort ignore-rader om commit avsiktlig |
| P1-3 | git-missing | `data/scaffold-eval/reports/**` — spårade JSON, beskrivs som per-maskin-runtime | 95% | Gitignore + `git rm --cached` |
| P1-4 | git-over | `!data/prompt-dumps/README.md` (`.gitignore:63`) — README **saknas** | 95% | Skapa README (spegla `data/eval-runs/README.md`) eller ta bort undantaget |
| P1-5 | cursor-drift | `.cursorignore:160` `data/prompt-dumps/**` **efter** `!`-undantag rad 57-64 → undantagen döda | 90% | Ta bort eller flytta L160 |
| P1-6 | cursor-missing | `.cursor/mcp.json` gitignored men **inte** cursorignored — risk för secret i LLM-index | 90% | Spegla i `.cursorignore` |
| P1-7 | cursor-missing | `logs/**` — `#logs/**` utkommenterad (`.cursorignore:96-97`); `!`-negationer verkningslösa utan parent-ignore | 90% | Aktivera `logs/**` + behåll `!`-whitelist |
| P1-8 | cursor-missing | `templates_v0/**` saknas i `.cursorignore` (VS Code exkluderar redan via `.vscode/settings.json`) | 90% | Lägg till efter P1-1 |
| P1-12 | orphan gitignore | `.gitignore:87-88` `src/lib/gen/template-library/*.json` — mappen **finns inte** | 90% | Rensa döda ignore-rader |

### Aktiva docs / runtime med fel path

| ID | Klass | Fynd | Konf. | Åtgärd |
|----|-------|------|-------|--------|
| P1-9 | stale-doc (aktiv) | `docs/architecture/` — döda länkar: `fas{1,2,3}-*.md` (`glossary.md:7`, `llm-flow-target-worldclass.md:6`), `OMTAG/06-*` (`orchestration-contract.md`), `llm-chain-flowchart.md` / `llm-flow-end-to-end.md` (`llm-callsite-matrix.md`), `backoffice/pages/research.py` (`scaffold-system.md:314`) | 95% | Ersätt med `llm-pipeline.md`; radera research.py-rad |
| P1-10 | stale-doc (aktiv) | `docs/plans/archived/Kvarvarande-uppgifter.md:3,7,11` — trasiga länkar, nås via `docs/plans/active/README.md` | 95% | Peka om eller radera |
| P1-11 | runtime drift | `scripts/v0-templates/*.mjs`, `src/lib/templates/local-v0-template-source.ts:9`, `src/app/api/template-image/[templateId]/route.ts:10-14` kräver `templates_v0/` som **saknas** i ren checkout | 95% | Default till blob / `test_förslag_templates_blob/out/` eller env-flagga; synka med `repository-and-platform.md:63` |

---

## P2 — doc/config-städ

| ID | Klass | Fynd | Konf. | Åtgärd |
|----|-------|------|-------|--------|
| P2-13 | stale-doc | `config/env-policy.json:484`, `config/codegen-core-manifest.json:16`, `config/naming-dictionary.json:67` — legacy "template-library" | 85% | Uppdatera till dossier/scaffold-terminologi |
| P2-14 | stale-doc | `config/dashboard/domain-map.json:423-438` — "15 projektregler", repo har ~23 `.mdc` | 95% | Peka på `.cursor/README.md`, ta bort hårdkodad lista |
| P2-15 | dead config | `tsconfig.json:45-57` — excludes `archive`, `old/`, `src/templates/`, `ai-fal-image-generator/` m.fl. som **saknas** | 90% | Städa excludes |
| P2-16 | stale-doc | `scripts/README.md` — döda länkar till `../archive/`, `templates_v0/README.txt`; tabell saknar ~10 undermappar | 95% | Synka med `repository-and-platform.md:63` |
| P2-17 | stale-doc | `src/lib/gen/scaffolds/README.md:59` + `scaffold-research.ts:73` — pekar på borttagen `scripts/template-library/` | 90% | Uppdatera feltext + rebuild-instruktion |
| P2-18 | stale-doc | `docs/schemas/scaffold-contract.md:27` → `external-template-pipeline/` utan legacy-markering | 85% | Byt till `template-references/` + gitignored-notis |
| P2-19 | orphan config | `eslint.config.mjs:47`, `.cursorignore:143-147` → `data/dossiers/_raw/**` — mappen **saknas** | 85% | Rensa eller dokumentera legacy |
| P2-20 | stale-doc | `docs/plans/avklarat/` — trasiga länkar (`dossier-cleanup`, `dossier-brief-sync`, `_parkering/`, `src/lib/own-engine/verify/`) | 90% | Historikmarkering eller pekare till git |
| P2-21 | git-missing | `data/manifest.json`, `content.json`, `colors.json` — runtime-skriv (`template-generator.ts`), ej ignorerade | 85% | Gitignore |
| P2-22 | vscode orphan | `.vscode/settings.json` — excludes `evals/results`, `research`, `pot_buggs`, `src/templates` (saknas) | 90% | Städa orphan-rader |
| P2-23 | preview docs | `preview-host/README.md` — CSP-fel (fix redan i `src/proxy.ts`); saknar `POST /preview/session/patch` i listor | 90% | Synka docs |
| P2-24 | preview docs | `preview-white-screen-runbook.md` — `preview-diagnostics.ts` → kanonisk `src/lib/gen/preview/diagnostics.ts` | 90% | Rätta filnamn |
| P2-25 | eval drift | `eval-blocklist.ts` — blocklist från gammal `landing-variant-latest.json` (2026-04-23) | 85% | Kör om `scripts/scaffolds/eval-landing-variants.ts` |
| P2-26 | cursor-missing | `services/mpc/docs/**` — gitignored, cursorignore **kommenterad bort** (~60 MB) | 90% | Uncomment i `.cursorignore` när mappen finns |

---

## P3 — backlog / valfritt

| ID | Klass | Fynd | Konf. | Åtgärd |
|----|-------|------|-------|--------|
| P3-27 | orphan code | `src/lib/mcp/local-engine.ts`, `runtime-library-audit.ts`, `generate-site.ts` — 0 runtime-importers | 90% | Ta bort eller koppla till eval/MCP |
| P3-28 | dead ignore | `.gitignore:229` `_scaffold_discovery/` — inga refs | 85% | Ta bort eller dokumentera |
| P3-29 | script gap | `scripts/scaffolds/eval-landing-variants.ts` — inget npm-script | 90% | Lägg `scaffolds:eval-landing` |
| P3-30 | doc gap | `repository-and-platform.md:63` vs `scripts/README.md:94-107` — motsägelse om `templates_v0` aktiv/inte aktiv | 85% | En kanonisk formulering |
| P3-31 | generated-app | `scaffold-system.md:102,217` — kort path `scaffold-research.generated.json` utan full path/gitignored-notis | 85% | Full path + notis |
| P3-32 | ungit | `.cursor/commands/logg.md` + skill — ospårade, inte gitignorade | 85% | Committa om kanoniska |

---

## Verifierat OK

| Område | Status |
|--------|--------|
| `package.json`-scripts | Alla pekar på befintliga filer |
| `data/dossiers/{hard,soft,_index}` | Stämmer med `dossier-system.md` |
| `data/shadcn-examples/` | Borttagen — bara historiska doc-hänvisningar |
| `scripts/template-library/` | Borttagen avsiktligt (2026-04-17) |
| `_parkering/` | Medvetet i git + cursorignored |
| `test_förslag_templates_blob/` | Medvetet tracked (blob-intake) |
| Backoffice Python | Graceful fallback för gitignored runtime-paths |
| Preview-host runtime | Inga trasiga cross-imports repo → `preview-host/` |
| `src/**` (exkl. gen) `@/`-imports | Stickprov OK — inga trasiga moduler |
| Scaffold-struktur | 9 scaffolds / 28 varianter — registry ↔ `config/scaffold-variants` parity OK |

---

## Dunkla mappar — inventering

| Mapp | I git? | Cursorignore? | Aktiva refs? | Bedömning |
|------|--------|---------------|--------------|-----------|
| `_parkering/` | Ja (3 filer) | Ja | Docs/planer | Medveten parkeringsyta — behåll |
| `archive/` (rot) | Gitignored | Nej | Docs/scripts README | Lokal dump — ev. spegla i cursorignore |
| `templates_v0/` | Delvis (saknas ofta lokalt) | **Nej** | `scripts/v0-templates/`, valfri runtime | Valfri maintainer-workstation; **ska git/cursorignoreras** |
| `test_förslag_templates_blob/` | Ja (7 filer) | Nej | `sync-blob-catalog.mjs` default | Load-bearing — behåll tracked |
| `old/` (rot) | Gitignored | Nej | eslint/vitest exclude | Lokal scratch |
| `_scaffold_discovery/` | Gitignored | Nej | Inga | Död ignore-rad? |
| `data/external-template-pipeline/` | Gitignored, tom | Delvis | Backoffice (graceful) | Legacy pipeline — UI/docs kan markeras |
| `data/template-references/` | Gitignored, tom | Ja | `scripts/dossiers/curate-from-reference.ts` | Operator-klon on demand |

---

## Legacy-path-karta

| Path | Status 2026-07-02 | Ersättning / notis |
|------|-------------------|-------------------|
| `scripts/template-library/` | **Borttagen** 2026-04-17 | `scripts/dossiers/`, dossier-curation |
| `src/lib/gen/template-library/` | **Borttagen** | Döda rader i `.gitignore:87-88` |
| `data/shadcn-examples/` | **Borttagen** | `src/lib/gen/data/shadcn-ui-recipes.ts` |
| `templates_v0/` | Valfri lokal intake, ej i trädet | Prod: blob; dev: `test_förslag_templates_blob/` |
| `data/external-template-pipeline/` | Gitignored, pipeline borttagen | `data/template-references/` + dossiers |
| `fas{1,2,3}-*.md` | **Saknas** | `docs/architecture/llm-pipeline.md` |
| `src/lib/own-engine/verify/` | **Saknas** | `src/lib/gen/verify/` |
| `backoffice/pages/research.py` | **Saknas** | Ta bort från `scaffold-system.md` |

---

## Rekommenderad fix-ordning

1. **Ignore-pass** (P1-1–P1-8, P1-12) — en PR, inga beteendeändringar
2. **Architecture-docs** (P1-9) — döda länkar i kanoniska architecture-docs
3. **`templates_v0`-strategi** (P1-11, P3-30) — beslut: blob-primary vs lokal maintainer-workstation
4. **Config/doc legacy** (P2-13–P2-20) — `template-library`-terminologi
5. **Eval refresh** (P2-25) — om variant-blocklist ska uppdateras

---

## Audit-rundor (referens)

| Runda | Lanes |
|-------|-------|
| 1 | docs-architecture, config-package, gen-legacy, scripts-dirs, data-dossiers, docs-plans, parkering-archive, src-imports |
| 2 | git-missing, git-over, cursor-missing, cursor-over, backoffice, preview-host, scaffolds-config, vscode-eslint |

**Konfidens totalt:** ~90 %. Spot-check mot filer och ignore-regler; inte live-kört full template-sync eller backoffice.

**Nästa steg:** Triage denna lista manuellt; bekräftade defekter → `/buggrapport` → `BUG-SWARM-BACKLOG.md`.
