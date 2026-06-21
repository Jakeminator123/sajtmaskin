---
id: gm-akt-C2
status: done
implemented_by: "PR #153 (check:terms warn-only i stability-jobbet), mergad till master"
parent: gm-omrade-01-kontrakt-och-regler
blocked_by: []
owner_files:
  - config/naming-dictionary.json
  - scripts/dev/check-term-coverage.mjs
risk: låg
---

# C2 — ordlista-check (light, vid push/PR/merge)

## Mål
Glossaryn ([`docs/architecture/glossary.md`](../../../../architecture/glossary.md)) är
projektets uppslagslista. Lägg en **light** check som vid push/PR/merge varnar för
(a) förbjudna alias (förväxlingstabellen i `terminology.mdc`) och (b) nya svåra engelska
tech-begrepp som varken finns i glossaryn eller i `naming-dictionary.json`. Inspirerad av
Sajtbyggarens term-check, men **medvetet mjukare**.

## Inte scope
- Blockerande gate i början — **warn-först**; blockering är ett separat senare beslut.
- 1500-raders allowlists eller hård enforcement.
- Skriva om glossaryn (den finns; den ska bara checkas).

## Owner-yta
`config/naming-dictionary.json` (ny: förbjudna alias + canonical namn),
`scripts/dev/check-term-coverage.mjs` (ny). **CI-wiring** (push/PR-steg) samordnas i
S1-lanen (`ci.yml`) så inte flera aktiviteter äger samma workflow-fil. Samma yta som
område 1 term-check light — slå ihop, skapa inte ett parallellt term-spår.

## Verifiering
- Checken körs lokalt + i CI (warn-först) och flaggar seed-alias ur förväxlingstabellen.
- `npm run typecheck` 0 fel.

## Risk
Låg (warn-först).
