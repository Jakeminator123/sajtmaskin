# Handoff — Sajtmaskin: grandmaster-plan (stabilitet, kontrakt, städning)

**Datum:** 2026-06-18 · **Status:** orientering för extern coach + nästa agent · **Källa:** grandmaster-planeringssession · **Branch:** `feat/grandmaster-stabilitet-kontrakt`

## 1. Syfte
Samla en hel sessions planering i **en styrande plan** istället för utspridda rapporter. Målet: göra Sajtmaskin **mindre buggig genom små hårda kontrakt** — inte ett tungt styrningslager. Planen är produktens **stabilitetsplan, inte ett dokumentationsprojekt**: varje aktivitet ska förbättra kärnflödet (`prompt → företagshemsida → preview → följdprompt → ny version`) eller minska agentförvirring, annars hör den inte hemma här.

Inspireras lätt av sidoprojektet Sajtbyggaren (läses read-only, indexeras ej) men porterar **inte** dess tunga governance — se §6.

## 2. Plan-nivåmodell (det bärande greppet)
Tre nivåer, kodade i regeln [`plan-lifecycle.mdc`](../../.cursor/rules/plan-lifecycle.mdc):

| Nivå | Vad | Var |
|---|---|---|
| **1** | Målbild + index + körordning | [`grandmaster/00-master-plan.md`](../plans/avklarat/grandmaster/00-master-plan.md) |
| **2** | Ett dokument per område (syfte, ägd yta, klart-när) | `grandmaster/01..08-*.md` |
| **3** | Konkreta agentjobb med smala `owner_files`, **skapas just-in-time** när området är på tur | `grandmaster/aktiviteter/*.md` |

Just-in-time betyder: vi skapar **inte** alla nivå-3-aktiviteter i förväg — bara första paketet, så agenter inte producerar mer plan än produkt.

## 3. Områdesindex (nivå 2) + körordning
Filordning ≠ körordning. Körordning: **tester gör resten tryggare**, så stabilitet före kontrakt.

| Körordning | Område | Varför |
|---|---|---|
| 0 | branch-hygien | ren PR-bas |
| 1 | **2 Stabilitetstester** | gör resten tryggare |
| 2 | **3 Dokumentation & kartor** | mindre agentförvirring |
| 3 | **1 Kontrakt & regler** (light) | undvik mer plan än produkt |
| 4 | **6 Status & UI/UX** (event-bus-flip) | snabb bugglättnad |
| 5 | **5 Follow-up & preview-kontrakt** | produktens hjärta |
| 6 | **7 False-green-härdning** | störst kvalitet, mest beteende → sist |
| löpande | **8 Cleanup & hygien** | gemensamt, inte autonomt |

Varje område inleds/avslutas med ett **scoped städ-pass** (bara områdets owner-surface) — skilt från område 8 (global städning).

## 4. Kontraktslager
Fyra lätta pelare i [`docs/contracts/`](../contracts/README.md): **schema** = struktur · **policy** = värden · **regel** = process · **beslut (ADR)** = varför. Schema låser *dataformat* (dossier, variant, promptformat) — **inte** planering (det hör hemma i Cursor-regler). Besluten bakom planen: [`beslut/0001-kontrakt-stabilitet-och-plannivaer.md`](../contracts/beslut/0001-kontrakt-stabilitet-och-plannivaer.md).

## 5. Regeländringar (`.cursor/rules/`)
- [`plan-lifecycle.mdc`](../../.cursor/rules/plan-lifecycle.mdc) — 3-nivåmodell + scoped städ-pass.
- [`terminology.mdc`](../../.cursor/rules/terminology.mdc) — **Begrepps-stopp** (inför inte ny svår tech-engelska i stabiliseringsfasen) + **ordlista-check** (light, warn-först).
- [`svenska-tech-synonymer.mdc`](../../.cursor/rules/svenska-tech-synonymer.mdc) — skärpt: helst synonym/par ord, vid svårt begrepp max en kort mening.
- `project-phase-priorities.mdc` — omdöpt från `minimal-security-mode.mdc` med ofarligare formulering (stabiliseringsprioritering, inte "säkerhet oviktigt").
- `git.mdc` återställd (agenten committar/pushar/mergar inte utan begäran) · `env-flow-f2-mute.mdc` flyttad tillbaka till `.cursor/rules/`.

## 6. Vad som MEDVETET inte ingår (anti-Sajtbyggaren)
Ingen `governance/`-mapp, ingen ADR-stapel som merge-blocker, ingen 1500-raders allowlist, ingen dubbel Python/Next-styrning, ingen stor rewrite, **inga LLM-evals som gate just nu** (instabila → parkerade). Kod är source of truth.

## 7. Status vid handoff (gjort + pushat)
- [x] Branch-hygien: kodändringar ut ur denna branch, regler tillbaka på rätt plats, ren router i [`docs/plans/active/README.md`](../plans/active/README.md).
- [x] Nivå 1 + 8 nivå-2-stubbar + kontraktslager + plan-regel.
- [x] Nivå-3 batch 1 skapad: `S1` (stabilitets-lane), `S2` (åäö-invariant), `S3` (statusresolver-invariant), `S4` (DB-schema-drift-gate), `D2` (repo-tree/README-synk), `C1` (deprecera `plan-file.schema.json`), `C2` (ordlista-check).
- Branch pushad mot `origin/feat/grandmaster-stabilitet-kontrakt`. Innehåll = bara docs/plan/regler (ingen runtime-`src`).

## 8. Relaterat: stabilitets-gaten i PR #140 (separat PR)
Områdets 2 (stabilitetstester) **första riktiga grind** byggdes parallellt: `pydatabastest.py` + `db-blob-sync-check.yml` — ett read-only ordnings-/regressionstest som verifierar att dev/prod-Postgres + Vercel Blob är i förväntat läge. Den ligger i **egen PR (#140)**, inte i denna plan-PR (branch-hygien: plan = docs, gate = kod). #140 är granskad mot Bugbot/Codex och grön. Den **statiska** schema-regressionen (`db:schema-drift`, S4) är den deterministiska kärnan; `pydatabastest.py` är det levande komplementet.

## 9. Hur planen granskas
| Vad | Var |
|---|---|
| Branch | `feat/grandmaster-stabilitet-kontrakt` |
| Jämför mot master | `https://github.com/Jakeminator123/sajtmaskin/compare/master...feat/grandmaster-stabilitet-kontrakt` |
| Läsordning | `00-master-plan.md` → `beslut/0001-...` (varför) → `plan-lifecycle.mdc` (konventioner) → de 8 områdena |

## 10. Öppna beslut (väntar på Jake)
- Justera områdesnamn/ordning om något skaver.
- Välj första området att starta (default: 2 → 3 → 1).
- När ett område startar: skapa dess nivå-3-aktiviteter (8–10 st, smal `owner_files` var).
- Område 8-städning körs gemensamt, inte autonomt.

## 11. Denna PR
Plan/docs/regler-only → master. Ingen runtime-kod. `#140` (DB+Blob-gaten) mergas separat. Inget auto-mergas (repo-inställningen `allow_auto_merge` är av; alla senaste PR:er mergades manuellt).
