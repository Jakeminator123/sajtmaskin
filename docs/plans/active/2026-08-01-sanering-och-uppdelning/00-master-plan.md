---
status: active
owner: unassigned
topic: Sanering av repot i tio steg — false-green-fixar, död kod, dokumentstädning, megafilsuppdelning, repo-storlek, dependency-split och produktbenchmark. Baserad på extern GPT-granskning 2026-08-01, kodverifierad mot master `c3a9273d0` samma dag.
created: 2026-08-01
source: Extern GPT-rapport (körd i separat checkout) + egen verifiering 2026-08-01 — gh PR-lista, knip-körning, radräkning, blob-analys av git-historiken, grep-svep av redis.ts/devDeps/docs-inlänkar. Avvikelser från rapporten är markerade per område.
---

# Master-plan: sanering och uppdelning

## TL;DR

Repot fungerar men bär på fyra strukturella skulder: **false-green-risker**
(sex öppna backlog-rader), **död kod och bred exportyta** (267 exports/649
typer oanvända enligt knip), **megafiler** (nio filer > 1 100 rader i
kärnflödet + fyra i backoffice) och **tung git-historik** (624 MiB pack för en
66 MiB arbetsyta). Planen tar dem i beroendeordning: integrera öppna PR:ar
först, stäng false-green, städa, dela sedan.

## Verifierad baseline (2026-08-01, master `c3a9273d0`)

| Fakta | Värde | Verifierat via |
|---|---|---|
| Öppna PR:ar | [#706](https://github.com/jakeminator0/sajtmaskin/pull/706) (+3027/−188), [#707](https://github.com/jakeminator0/sajtmaskin/pull/707) (+2688/−13), [#708](https://github.com/jakeminator0/sajtmaskin/pull/708) (+3/−0) | `gh pr list` |
| Bug-backlog | 1 P1, 29 P2, 37 P3 | radräkning i `BUG-SWARM-BACKLOG.md` |
| Knip | 0 oanvända filer · 22 deps · 6 devDeps (1 falsk positiv: `nodemon`) · 267 exports · 649 exporterade typer · odeklarerade binärer: `vercel`, `nodemon` | `npm run knip` |
| Git-objekt | pack 624,23 MiB · lösa 14,5 MiB | `git count-objects -vH` |
| Största spårade binärer | `public/video/intro.mp4` 35,45 MiB · `src/lib/templates/template-embeddings.json` 8,77 MiB | `Get-Item` |
| Historik-ballast | ≥ 85 MiB embeddings-versioner, QA-zippar (`output/qa-browser-runs/`), `_template_refs`-videor, mascot-original | blob-svep (`git rev-list --objects` + `cat-file`) |
| package.json | 137 scripts · 82 deps · 32 devDeps | `ConvertFrom-Json` |

## Ordning (en rad = en eller flera små PR:ar)

| # | Steg | Planfil | Varför i denna ordning |
|---|---|---|---|
| 0 | Mergestyr #708 → #706 → #707 (serialisera/rebasea; enda direkta överlappen är `BuilderShellContent.tsx`) | — | Öppna stora PR:ar låser builder-/deploy-filerna som senare ska delas |
| 1 | Sex false-green-/tystnadsfixar | [`01-false-green.md`](01-false-green.md) | Fel som visar grönt trots trasig sajt går före all städning |
| 2 | Radera Redis-domänblocken | [`02-dod-kod.md`](02-dod-kod.md) | Verifierat död, isolerad, hundratals rader |
| 3 | Fem devDependencies + `vercel`-beslut + exportyta | [`02-dod-kod.md`](02-dod-kod.md) | Egen PR med lockfil + full CI |
| 4 | Dokumentstädning (10 vägar) | [`03-dokumentstadning.md`](03-dokumentstadning.md) | Docs-only, låg risk, men flera vägar kräver länkmigrering först |
| 5 | Dela `useBuilderPageController` + `PreviewPanel` | [`04-megafiler.md`](04-megafiler.md) | Först efter steg 0 (PR-överlapp) |
| 6 | Dela preview-host `runtime.js`, `server-verify`, `repair-loop` m.fl. | [`04-megafiler.md`](04-megafiler.md) | En fil per PR |
| 7 | Binärer → Blob/CDN, embeddings → Blob/komprimerad | [`05-repo-storlek.md`](05-repo-storlek.md) | Förutsättning för historik-omskrivningen |
| 8 | `git filter-repo`-operation (koordinerad, destruktiv — kräver ägar-OK) | [`05-repo-storlek.md`](05-repo-storlek.md) | Sist: kräver att alla PR:ar/worktrees är stängda |
| 9 | Dependency-split: app-runtime vs generator-katalog vs tooling | [`06-dependency-split.md`](06-dependency-split.md) | Kräver inventering per paket (preview-bundling!) |
| 10 | Permanent produktbenchmark 20–30 sajter | [`07-produktbenchmark.md`](07-produktbenchmark.md) | Värdemätning efter att grunden är stabil |

## Arbetsregler för alla steg

- **En fil / en sak per PR.** Ingen "refactor everything"-gren.
- Egen worktree per skriv-uppgift (`agent-worktree.mdc`), bugbot-pass på egen
  diff före PR/push (`git.mdc`).
- Pipeline-/preview-/DB-ändringar utan test är **P1** (`AGENTS.md` §
  Review guidelines) — varje false-green-fix ska binda beteendet med test.
- Beteendebevarande extraktion vid uppdelning: befintliga tester orörda och
  gröna; `npm run typecheck` + riktade vitest per PR.
- Docs-ändringar: `node scripts/docs/check-active-doc-links.mjs` +
  `npm run hygiene`.
- Pausa och fråga vid: historik-omskrivning (steg 8), radering av
  `_parkering/` (ägarbeslut), eller > 40 filer i en ändring.

## Avvikelser mot GPT-rapporten (egen verifiering)

| Rapporten sa | Verifierat läge |
|---|---|
| 5 oanvända devDeps | Stämmer; knip listar även `nodemon` men den **används** via `npx` i `lint:watch` (`package.json:42`) — behåll |
| Ta bort hela `_parkering/` | **Inte säkert utan ägarbeslut**: refereras från runtime-kod (`src/lib/builder/dossier-groups.ts:17`, `follow-up-capability-vocabulary.ts:71,398`), kontrakts-docs och tooling-excludes — se 03 |
| Radera `docs/plans/archived/` | Katalogen är en **lifecycle-slot** (`plan-lifecycle.mdc:22`) — töm innehållet, behåll rollen; `Kvarvarande-uppgifter.md` citeras av `docs/schemas/scaffold-contract.md:274` m.fl. — se 03 |
| Bug-swarm-snapshots raderas | Tungt inlänkade från `BUG-SWARM-BACKLOG.md` (kanonisk buggsanning) och processen flyttar fortfarande rader dit — gör sist, eller konsolidera i st.f. radera — se 03 |
| `docs/contracts/policies/` slås ihop, standardisera singular | `policies/` (nav-README) och `policy/` (`component-library.md`, riktigt innehåll) är **två olika mappar** — konsolidera nav, flytta innehåll medvetet — se 03 |
| Megafilslistan | Bekräftad, men rapporten missade ~13 hotspots till (bl.a. `api/audit/route.ts` 1 623 rader, `stream-handlers.ts` 1 395, `autofix/pipeline.ts` 1 372, `api/v0/deployments/route.ts` 1 352) — se 04 |
| 22 deps är generator-strängar | Bekräftat, men flera behövs sannolikt även av **F2-previewens modulkarta** (`src/lib/gen/preview/constants.ts`, `transpile.ts`) — inventering krävs innan flytt, se 06 |

## Klart-kriterium

Planen är klar när stegen 0–9 är levererade (10 är ett eget spår som kan leva
vidare). Väv då in initiativet som en rad i
[`../../avklarat/README.md`](../../avklarat/README.md) och radera katalogen.
