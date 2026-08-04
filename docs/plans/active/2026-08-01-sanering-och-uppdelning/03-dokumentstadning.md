---
status: active
owner: unassigned
topic: Tio dokumentvägar — borttagning eller konsolidering med verifierade inlänkar. Säkrast först; _parkering/ och bug-swarm-arkiven kräver ägarbeslut respektive omlänkning innan något raderas.
created: 2026-08-01
source: Master-planens steg 4. Inlänkssvep grep-verifierat 2026-08-01 (docs/, src/, scripts/, .cursor/, config/).
---

# Steg 4: dokumentstädning

Regeln som styr: [`documentation-lifecycle.md`](../../../documentation-lifecycle.md)
— avslutade planer är tunna index, git bär historiken. GPT-rapportens
raderingslista var i huvudsak rätt men underskattade inlänkarna; tabellen
nedan är den verifierade versionen. **Ta vågorna i ordning** — varje våg är en
egen liten PR med `node scripts/docs/check-active-doc-links.mjs` +
`npm run hygiene` grönt.

## Våg 1 — säkra borttagningar (bara länkfix krävs)

| Väg | Innehåll | Åtgärd |
|---|---|---|
| `docs/plans/avklarat/kontrollflode/underlag/` | 3 HTML + 3 TXT, ~166 KiB | Ta bort underlagsraden i `docs/plans/avklarat/README.md:17`, radera katalogen |
| `docs/audits/path-audit-2026-07-02.md` | ~15 KiB, länkas bara från syskon-auditen | Radera direkt |
| `docs/inspiration/` | 1 fil (shadcn-spike, beslutet redan sammanfattat i avklarat-index) | Flytta 2–3 beslutsrader till shadcn-kontraktet, stryk katalograden i `plan-lifecycle.mdc:23`, radera |

## Våg 2 — flytt + omlänkning

| Väg | Inlänkar som måste uppdateras | Åtgärd |
|---|---|---|
| `docs/howto/warm-cache-setup.md` | **Runtime-strängar:** `src/lib/gen/preview/warm-typecheck.ts:221`, `validate-and-fix.ts:187` · `scripts/preview/check-warm-cache.mjs:146` · `config/.../warm-cache-scaffolds.json:2` · `docs/architecture/llm-pipeline.md:112` · `backoffice/pages/llm_flode_telemetry.py:391` | Flytta → `docs/runbooks/warm-cache-setup.md`, uppdatera alla sex referenser, radera `docs/howto/` |
| `docs/audits/documentation-audit-2026-07-13.md` (~57 KiB) | `docs/README.md:25` · `docs/plans/active/README.md:54` · exclude-listor i `check-active-doc-links.mjs`/`check-term-coverage.mjs`/`check-v0-chat-boundary.mjs` | Destillera kvarvarande öppna beslut till lifecycle-/arkitekturdocs, ta bort länkarna + exclude-raderna, radera `docs/audits/` |
| `docs/contracts/policies/` (nav-README) | `docs/contracts/README.md:10` | Inlinea navet i `contracts/README.md`, radera katalogen. **Obs:** `docs/contracts/policy/component-library.md` är en annan mapp med riktigt innehåll — behåll, men flytta/namnge tydligt och omlänka `docs/schemas/orchestration-signal-contract.md:41` om den flyttas |
| `docs/old/` + `docs/archive/` (två tombstone-README:n) | `documentation-lifecycle.md:40–41,83` · exclude-rader i tre check-scripts | Uppdatera lifecycle-texten + exclude-listorna, radera båda katalogerna |

## Våg 3 — upplösning (mest jobb, störst vinst)

| Väg | Läge | Åtgärd |
|---|---|---|
| `docs/plans/archived/` (19 filer, ~217 KiB + `parked/`) | Katalogen är en lifecycle-slot (`plan-lifecycle.mdc:22`) — **behåll rollen, töm innehållet** (avvikelse mot GPT-rapporten som ville radera katalogen) | (1) Lös upp `Kvarvarande-uppgifter.md` (~77 KiB): levande rader → backlog/restlista, resten → git. (2) Omlänka `docs/contracts/fixer-registry.md:224`, `docs/schemas/llm-role-matrix.md:67`, `docs/schemas/scaffold-contract.md:274`, `config/dashboard/domain-map.json:467`, `src/lib/gen/eval/README.md:163` (pekar dessutom på stale path). (3) Radera filerna |
| `docs/plans/avklarat/bug-swarm/backlog-arkiv-*` (6 snapshots, ~160 KiB) | Tungt inlänkade från `BUG-SWARM-BACKLOG.md` (kanonisk buggsanning) och processen **flyttar fortfarande** fixade rader dit | Konsolidera de fyra äldsta (jun–jul 22) till README-indexet + git-pekare; behåll README + de två senaste som levande arkivyta. Peka om `BUG-SWARM-BACKLOG.md`, `plan-lifecycle.mdc:47`, `post-review.md:70`, `delivery-bias.md:15` i samma PR |

## Kräver ägarbeslut — gör inte utan OK

| Väg | Varför |
|---|---|
| `_parkering/` (38 filer, ~117 KiB) | Medveten parkeringsyta (`repo-router.mdc:35`) med referenser från **runtime-kod**: `src/lib/builder/dossier-groups.ts:17`, `follow-up-capability-vocabulary.ts:71,398`, plus `docs/contracts/dossier-system.md:54`, `docs/llm/dossier-selection-flow.md:179` och exclude-poster i `tsconfig.json`/`knip.jsonc`/`.vscode/`/`.cursorindexingignore`/tre check-scripts. Radering kräver beslutet "utfasade dossiers lever enbart i git" + migrering av alla ovanstående. Föreslå det som egen fråga när våg 1–3 är klara |

## Status 2026-08-01

Våg 1 levererad i **PR #713**, våg 2 i **PR #721** (oberoende mergebara —
våg 2 probade att den är grön utan våg 1). Tre sökvägar i våg 2-tabellen ovan
låg fel och korrigerades av agenten: `validate-and-fix.ts` bor i
`src/lib/gen/autofix/`, `check-warm-cache.mjs` i `scripts/dev/`,
`warm-cache-scaffolds.json` i `scripts/`. Kvar: våg 3 (archived/ +
bug-swarm-snapshots) och `_parkering/`-ägarfrågan.

## Klart-kriterium

Våg 1–3 mergade; `_parkering/`-frågan ställd och besvarad. `npm run hygiene`
grönt utan nya exclude-rader (målet är att ta bort exclude-poster, inte
flytta dem).
